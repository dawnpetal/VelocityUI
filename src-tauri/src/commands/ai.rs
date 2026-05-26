use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Mutex, OnceLock},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::oneshot,
    time::timeout,
};

const AI_CONFIG_FILE: &str = "ai-config.json";
const CODEX_HARNESS_DIR: &str = "ai-harness";
const DEFAULT_MODEL: &str = "gpt-5.5";
const DEFAULT_CODEX_PATH: &str = "/Applications/Codex.app/Contents/Resources/codex";
static AI_CANCEL_REQUESTS: OnceLock<Mutex<HashMap<String, AiCancelHandle>>> = OnceLock::new();

struct AiCancelHandle {
    sender: oneshot::Sender<()>,
    pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_model")]
    model: String,
    #[serde(default = "default_true")]
    data_tree_context: bool,
    #[serde(default)]
    inline_suggestions: bool,
    codex_path: Option<String>,
    #[serde(default = "default_codex_sandbox")]
    codex_sandbox: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigState {
    #[serde(flatten)]
    config: AiConfig,
    has_codex_auth: bool,
    resolved_codex_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateRequest {
    request_id: Option<String>,
    task: String,
    language: Option<String>,
    filename: Option<String>,
    code: Option<String>,
    selection: Option<String>,
    prefix: Option<String>,
    suffix: Option<String>,
    instruction: Option<String>,
    data_tree_reference: Option<Value>,
    work_dir: Option<String>,
    workspace_roots: Option<Vec<String>>,
    max_output_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateResponse {
    text: String,
    model: String,
    changes: Vec<AiFileChangeSummary>,
    usage: Option<Value>,
    rate_limits: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFileChangeSummary {
    path: String,
    kind: String,
    additions: usize,
    deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiStreamEvent {
    request_id: Option<String>,
    kind: String,
    delta: Option<String>,
    text: Option<String>,
    payload: Option<Value>,
}

fn default_model() -> String {
    DEFAULT_MODEL.to_string()
}

fn default_true() -> bool {
    true
}

fn default_codex_sandbox() -> String {
    "read-only".to_string()
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            model: default_model(),
            data_tree_context: true,
            inline_suggestions: false,
            codex_path: None,
            codex_sandbox: default_codex_sandbox(),
        }
    }
}

fn config_path() -> Result<std::path::PathBuf, String> {
    crate::paths::internals_dir()
        .map(|dir| dir.join(AI_CONFIG_FILE))
        .map_err(|e| e.to_string())
}

fn load_config() -> AiConfig {
    let Ok(path) = config_path() else {
        return AiConfig::default();
    };
    let mut config = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<AiConfig>(&raw).ok())
        .unwrap_or_default();
    normalize_config(&mut config);
    config
}

fn save_config_file(config: &AiConfig) -> Result<(), String> {
    let mut config = config.clone();
    normalize_config(&mut config);
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

fn normalize_config(config: &mut AiConfig) {
    if !matches!(
        config.codex_sandbox.as_str(),
        "read-only" | "workspace-write"
    ) {
        config.codex_sandbox = default_codex_sandbox();
    }
    if config.model.trim().is_empty() {
        config.model = default_model();
    }
}

fn codex_auth_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".codex").join("auth.json"))
}

fn has_codex_auth() -> bool {
    codex_auth_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .map(|value| {
            value
                .as_object()
                .map(|object| !object.is_empty())
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn resolve_codex_path(config: &AiConfig) -> Option<PathBuf> {
    config
        .codex_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .or_else(|| {
            let path = PathBuf::from(DEFAULT_CODEX_PATH);
            path.exists().then_some(path)
        })
        .or_else(|| {
            std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths)
                    .map(|dir| dir.join("codex"))
                    .find(|path| path.exists())
            })
        })
}

fn codex_harness_root() -> Result<PathBuf, String> {
    crate::paths::internals_dir()
        .map(|dir| dir.join(CODEX_HARNESS_DIR))
        .map_err(|e| e.to_string())
}

fn safe_harness_name(request: &AiGenerateRequest) -> String {
    let task = request
        .task
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    format!("{}-{}", now_ms(), task.trim_matches('-'))
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn canonical_path(path: PathBuf) -> PathBuf {
    std::fs::canonicalize(&path).unwrap_or(path)
}

fn root_label(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Workspace")
        .to_string()
}

fn workspace_root_label(root: &Path, workspace_roots: &[PathBuf]) -> String {
    let label = root_label(root);
    let duplicate_count = workspace_roots
        .iter()
        .filter(|candidate| root_label(candidate) == label)
        .count();
    if duplicate_count <= 1 {
        return label;
    }
    let index = workspace_roots
        .iter()
        .position(|candidate| candidate == root)
        .unwrap_or(0)
        + 1;
    format!("{label} root {index}")
}

fn prompt_path(path: &Path, work_dir: &Path, workspace_roots: &[PathBuf]) -> String {
    for root in workspace_roots {
        if let Ok(rest) = path.strip_prefix(root) {
            let rest = rest.to_string_lossy();
            return if rest.is_empty() {
                workspace_root_label(root, workspace_roots)
            } else {
                format!("{}/{}", workspace_root_label(root, workspace_roots), rest)
            };
        }
    }
    if let Ok(rest) = path.strip_prefix(work_dir) {
        let rest = rest.to_string_lossy();
        return if rest.is_empty() {
            ".".to_string()
        } else {
            format!("./{}", rest)
        };
    }
    if let Some(parent) = work_dir.parent() {
        if let Ok(rest) = path.strip_prefix(parent) {
            return format!("../{}", rest.to_string_lossy());
        }
    }
    path.to_string_lossy().into_owned()
}

fn resolve_codex_work_dir(request: &AiGenerateRequest) -> Result<PathBuf, String> {
    let requested = request
        .work_dir
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.exists());
    let path = match requested {
        Some(path) => path,
        None => {
            let path = crate::paths::default_workspace_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            path
        }
    };
    Ok(canonical_path(path))
}

fn resolve_codex_workspace_roots(request: &AiGenerateRequest, work_dir: &Path) -> Vec<PathBuf> {
    let mut roots = vec![canonical_path(work_dir.to_path_buf())];
    for raw in request.workspace_roots.clone().unwrap_or_default() {
        let path = PathBuf::from(raw.trim());
        if !path.exists() {
            continue;
        }
        let path = canonical_path(path);
        if !roots.iter().any(|root| root == &path) {
            roots.push(path);
        }
    }
    roots
}

fn workspace_covers_internals(work_dir: &Path) -> Result<bool, String> {
    let internals = canonical_path(crate::paths::internals_dir().map_err(|e| e.to_string())?);
    let work_dir = canonical_path(work_dir.to_path_buf());
    Ok(internals.starts_with(&work_dir) || work_dir.starts_with(&internals))
}

fn write_harness_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn write_codex_harness(
    request: &AiGenerateRequest,
    work_dir: &Path,
    workspace_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    let dir = codex_harness_root()?.join(safe_harness_name(request));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let reference = request
        .data_tree_reference
        .as_ref()
        .cloned()
        .unwrap_or_else(|| json!(null));
    let reference_path = dir.join("datatree-reference.json");
    write_harness_file(
        &reference_path,
        &serde_json::to_string_pretty(&reference).map_err(|e| e.to_string())?,
    )?;
    write_harness_file(&dir.join("query-datatree.mjs"), DATATREE_QUERY_SCRIPT)?;
    write_harness_file(
        &dir.join("workspace-reference.json"),
        &serde_json::to_string_pretty(&json!({
            "root": work_dir,
            "roots": workspace_roots,
            "rootLabels": workspace_roots.iter().map(|root| json!({
                "name": workspace_root_label(root, workspace_roots),
                "path": root,
            })).collect::<Vec<_>>()
        }))
        .map_err(|e| e.to_string())?,
    )?;
    write_harness_file(&dir.join("AI_ToolKit.mjs"), AI_TOOLKIT_SCRIPT)?;
    write_harness_file(&dir.join("GUIDE.md"), AI_WORKSPACE_GUIDE)?;
    write_harness_file(
        &dir.join("README.md"),
        &format!(
            r#"# VelocityUI AI Harness

Generated request tools. Prefer workspace-relative paths in all user-facing replies.

From this directory:

Guide:
- `GUIDE.md` is the working guide for Roblox/Luau script help, DataTree context, safety boundaries,
  root-relative paths, and investigation habits. Treat it as part of the user request context.

DataTree:
- `node query-datatree.mjs reference`
- `node query-datatree.mjs active`
- `node query-datatree.mjs node <id>`
- `node query-datatree.mjs children <id> [limit]`
- `node query-datatree.mjs search <term> [limit]`

AI_ToolKit:
- `node AI_ToolKit.mjs files [path] [limit]`
- `node AI_ToolKit.mjs search <pattern> [path] [limit]`
- `node AI_ToolKit.mjs grep <pattern> [path] [limit]`
- `node AI_ToolKit.mjs find <name-or-substring> [path] [limit]`
- `node AI_ToolKit.mjs read <path> [start-line] [end-line]`
- `node AI_ToolKit.mjs head <path> [lines]`
- `node AI_ToolKit.mjs tail <path> [lines]`
- `node AI_ToolKit.mjs json <path> [dot.path]`
- `node AI_ToolKit.mjs exists <path>`
- `node AI_ToolKit.mjs wc <path>`
- `node AI_ToolKit.mjs tree [path] [depth]`
- `node AI_ToolKit.mjs status|diff|diff-check`
- `node AI_ToolKit.mjs check <wiring|js|rust|all>`

Rules:
- Retrieve only the DataTree nodes needed for the task.
- Prefer AI_ToolKit and targeted reads over broad scans. Its file/search commands use `rg`
  when available and fall back to built-in Node walkers when `rg` is missing.
- Use Codex native patch/file editing tools for edits. AI_ToolKit itself does not write workspace files.
- The toolkit rejects paths outside the open workspace roots.
- Do not edit files unless the current task explicitly asks for a file edit.
"#,
        ),
    )?;
    Ok(dir)
}

const AI_WORKSPACE_GUIDE: &str = r#"# VelocityUI Codex Guide

You are Codex inside VelocityUI. Your job is to help the user produce high-quality Roblox/Luau scripts, fixes, audits, and explanations for their own project or private tester build. Treat normal Roblox game development, QA, debugging, DataTree inspection, and team-owned private test-version work as legitimate development work.

You still control safety. Refuse requests for credential theft, malware, account abuse, bypassing access controls, exploit distribution, real-world harm, or platform abuse. If the intent is unclear, ask one short clarifying question and continue when the user confirms a legitimate development or testing context.

## Output Standard

- Prefer practical, working Lua/Luau over cleverness.
- Use Lua 5.1-compatible syntax unless the existing file clearly uses Luau-only features.
- Avoid unsupported or exotic syntax. No type annotations, generic types, compound assignment, `continue`, or newer Luau idioms unless the surrounding code already uses them and the user wants Luau.
- Match the style of the open file and nearby scripts.
- For insertion/edit tasks, return only the code requested.
- For chat tasks, be concise, concrete, and explain tradeoffs only when they matter.
- Use root-relative paths like `Default/Admin/Foo.lua` or `Loader/src/main.lua`; avoid absolute paths in replies.

## DataTree Context

The user may attach a DataTree snapshot. DataTree is a read-only snapshot of a Roblox place/model hierarchy exported into VelocityUI. It can include instance names, class names, parent/child relationships, properties, attributes, tags, metadata, and the currently selected instance. It is not live game state, but it is valuable structure.

Use DataTree when the request depends on Roblox hierarchy, remotes, UI objects, services, assets, object names, or properties. Query only what you need:

- `node query-datatree.mjs reference`
- `node query-datatree.mjs active`
- `node query-datatree.mjs node <id>`
- `node query-datatree.mjs children <id> [limit]`
- `node query-datatree.mjs search <term> [limit]`

When DataTree is relevant, connect code and hierarchy: scripts, ModuleScripts, RemoteEvents, RemoteFunctions, UI objects, folders, values, attributes, and assets.

## Investigation Habit

Before writing non-trivial code, build a small logic web:

1. Identify the target behavior the user wants.
2. Locate likely entry points in scripts and modules.
3. Search for connected names, remotes, module requires, globals, config tables, services, and DataTree instances.
4. Read the smallest useful set of files/nodes.
5. Summarize the dependency chain in your own mind, then edit or answer.

This prevents missing small dependencies that humans often skip. Improvise in good faith: if the user asks for a narrow fix but the surrounding code obviously requires a related guard, state the reason briefly or include the guard when it is clearly beneficial.

## Roblox/Luau Practices

- Prefer local variables and small helper functions.
- Guard nil objects and missing remotes.
- Use `WaitForChild` thoughtfully when runtime replication matters; avoid infinite waits when a timeout or explicit error is better.
- Keep client/server boundaries clear. Client scripts should not be trusted for authority.
- Avoid busy loops and unbounded connections. Disconnect events when lifecycle requires it.
- Preserve existing APIs and data shapes unless the user asks for a redesign.
- For RemoteEvents/RemoteFunctions, validate inputs on the server side.
- Avoid hidden global state unless the codebase already uses `_G`/`getgenv` and the task truly needs it.
- Do not introduce exploit-only executor APIs unless the user explicitly works in a legitimate private testing context and the request remains within safe development/testing boundaries.

## Multi-Root Workspace Rules

The workspace may have more than one root. Treat each root label as a namespace. Never assume `Default` is the only root. Use `workspace-reference.json` and `AI_ToolKit` output to distinguish roots. When reading, editing, or reporting a path, keep the root label attached.

If two roots have the same folder name, the harness labels them distinctly, such as `Project root 1` and `Project root 2`. Use those labels exactly.

## Tools

Prefer `AI_ToolKit.mjs` for scoped reads/searches. It rejects paths outside open workspace roots, uses `rg` when available, and falls back to built-in Node search when `rg` is unavailable. Do not tell the user that `rg` being missing blocks you; use the toolkit fallback.

Use targeted reads and searches. Avoid broad scans unless the user asks for an audit or the task is genuinely cross-cutting.
"#;

const DATATREE_QUERY_SCRIPT: &str = r#"import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const reference = JSON.parse(fs.readFileSync(path.join(here, 'datatree-reference.json'), 'utf8'));
const snapshotPath = reference?.snapshot?.storagePath;
const cmd = process.argv[2] || 'reference';

function loadSnapshot() {
  if (!snapshotPath) throw new Error('No DataTree snapshot is attached');
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

function brief(node) {
  if (!node) return null;
  return {
    id: node.id,
    parentId: node.parentId ?? null,
    name: node.name,
    className: node.className,
    depth: node.depth,
    childCount: node.childCount || 0,
  };
}

function detail(node) {
  if (!node) return null;
  return {
    ...brief(node),
    tags: Array.isArray(node.tags) ? node.tags : [],
    properties: node.properties || {},
    attributes: node.attributes || {},
  };
}

if (cmd === 'reference') {
  console.log(JSON.stringify(reference, null, 2));
} else if (cmd === 'active') {
  const snap = loadSnapshot();
  const id = Number(reference?.snapshot?.activeNodeId || reference?.snapshot?.rootId);
  console.log(JSON.stringify(detail((snap.nodes || []).find((node) => node.id === id)), null, 2));
} else if (cmd === 'node') {
  const id = Number(process.argv[3]);
  const snap = loadSnapshot();
  console.log(JSON.stringify(detail((snap.nodes || []).find((node) => node.id === id)), null, 2));
} else if (cmd === 'children') {
  const id = Number(process.argv[3]);
  const limit = Math.min(Number(process.argv[4]) || 80, 500);
  const snap = loadSnapshot();
  const rows = (snap.nodes || []).filter((node) => node.parentId === id).slice(0, limit).map(brief);
  console.log(JSON.stringify(rows, null, 2));
} else if (cmd === 'search') {
  const term = String(process.argv[3] || '').toLowerCase();
  const limit = Math.min(Number(process.argv[4]) || 50, 300);
  const snap = loadSnapshot();
  const rows = (snap.nodes || [])
    .filter((node) => `${node.name || ''} ${node.className || ''} ${node.searchText || ''}`.toLowerCase().includes(term))
    .slice(0, limit)
    .map(brief);
  console.log(JSON.stringify(rows, null, 2));
} else {
  throw new Error(`Unknown command: ${cmd}`);
}
"#;

const AI_TOOLKIT_SCRIPT: &str = r#"import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const workspaceRef = JSON.parse(fs.readFileSync(path.join(here, 'workspace-reference.json'), 'utf8'));
const workspace = fs.realpathSync(workspaceRef.root);
const workspaceRoots = [...new Set((workspaceRef.roots || [workspaceRef.root]).map((root) => fs.realpathSync(root)))];
const rootLabels = new Map((workspaceRef.rootLabels || []).map((root) => [fs.realpathSync(root.path), root.name || path.basename(root.path)]));
const command = process.argv[2] || 'help';
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'build', '.next', '.cache', '.turbo']);

function die(message) {
  console.error(`AI_ToolKit: ${message}`);
  process.exit(1);
}

function boundedInt(value, fallback, min, max) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : fallback;
}

function insideWorkspace(input = '.') {
  const absolute = path.isAbsolute(input) ? path.resolve(input) : path.resolve(workspace, input);
  const resolved = fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute;
  const owner = workspaceRoots.find((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!owner)
    die(`path is outside workspace: ${input}`);
  return resolved;
}

function workspacePath(input = '.') {
  const absolute = insideWorkspace(input);
  return path.relative(workspace, absolute) || '.';
}

function displayPath(input) {
  const absolute = fs.existsSync(input) ? fs.realpathSync(input) : path.resolve(input);
  const owner = workspaceRoots
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((root) => absolute === root || absolute.startsWith(`${root}${path.sep}`));
  if (!owner) return input;
  const rel = path.relative(owner, absolute);
  return rel ? `${rootLabels.get(owner) || path.basename(owner)}/${rel}` : (rootLabels.get(owner) || path.basename(owner));
}

function printLines(raw, limit = 240) {
  const lines = String(raw || '').replace(/\s+$/, '').split('\n');
  const kept = lines.slice(0, limit);
  if (kept.length && kept[0]) console.log(kept.join('\n'));
  if (lines.length > limit) console.log(`... ${lines.length - limit} more lines omitted`);
}

function tryRun(tool, args, { maxBuffer = 4 * 1024 * 1024 } = {}) {
  const result = spawnSync(tool, args, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer,
  });
  if (result.error) return null;
  return result;
}

function run(tool, args, { limit = 240, tolerateFailure = false } = {}) {
  const result = spawnSync(tool, args, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) die(`${tool} failed: ${result.error.message}`);
  printLines(result.stdout, limit);
  if (result.stderr) printLines(result.stderr, Math.min(limit, 80));
  if (!tolerateFailure && result.status !== 0) process.exit(result.status || 1);
  return result.status || 0;
}

function walkFiles(start, limit = 240) {
  const rows = [];
  function visit(dir) {
    if (rows.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (rows.length >= limit) break;
      if (entry.name.startsWith('.') || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) rows.push(displayPath(full));
    }
  }
  const stat = fs.statSync(start);
  if (stat.isFile()) rows.push(displayPath(start));
  else visit(start);
  return rows;
}

function walkFilePaths(start, limit = 240) {
  const rows = [];
  function visit(dir) {
    if (rows.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) rows.push(full);
      if (rows.length >= limit) break;
    }
  }
  const stat = fs.statSync(start);
  if (stat.isFile()) rows.push(start);
  else visit(start);
  return rows;
}

function readTextFile(file, maxBytes = 1024 * 1024) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maxBytes) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function searchFallback(pattern, target, limit = 240) {
  let matcher = null;
  try {
    matcher = new RegExp(pattern, 'i');
  } catch {
    const needle = String(pattern).toLowerCase();
    matcher = { test: (line) => String(line).toLowerCase().includes(needle) };
  }
  const files = walkFilePaths(target, 8000);
  const rows = [];
  for (const file of files) {
    if (rows.length >= limit) break;
    const text = readTextFile(file);
    if (text == null) continue;
    const lines = text.split('\n');
    for (let index = 0; index < lines.length && rows.length < limit; index += 1) {
      if (matcher.test(lines[index])) rows.push(`${displayPath(file)}:${index + 1}:${lines[index].slice(0, 260)}`);
    }
  }
  return rows;
}

function jsonLookup(value, selector = '') {
  if (!selector) return value;
  return selector.split('.').filter(Boolean).reduce((next, key) => {
    if (next == null) return undefined;
    if (/^\d+$/.test(key) && Array.isArray(next)) return next[Number(key)];
    return next[key];
  }, value);
}

function help() {
  console.log(`AI_ToolKit is scoped to ${displayPath(workspace)}

Read/search:
  node AI_ToolKit.mjs files [path] [limit]
  node AI_ToolKit.mjs list [path] [limit]
  node AI_ToolKit.mjs search <pattern> [path] [limit]
  node AI_ToolKit.mjs grep <pattern> [path] [limit]
  node AI_ToolKit.mjs find <name-or-substring> [path] [limit]
  node AI_ToolKit.mjs read <path> [start-line] [end-line]
  node AI_ToolKit.mjs head <path> [lines]
  node AI_ToolKit.mjs tail <path> [lines]
  node AI_ToolKit.mjs json <path> [dot.path]
  node AI_ToolKit.mjs exists <path>
  node AI_ToolKit.mjs wc <path>
  node AI_ToolKit.mjs tree [path] [depth]
  node AI_ToolKit.mjs stat <path>

Git:
  node AI_ToolKit.mjs status
  node AI_ToolKit.mjs diff [path] [limit]
  node AI_ToolKit.mjs show <revision> [path] [limit]
  node AI_ToolKit.mjs diff-check

Validation:
  node AI_ToolKit.mjs check <wiring|js|rust|all>

files/search use rg when it exists, then built-in Node fallbacks when it does not.
Use Codex native patch/file editing tools for workspace edits.`);
}

if (command === 'files' || command === 'list') {
  const target = workspacePath(process.argv[3] || '.');
  const limit = boundedInt(process.argv[4], 240, 1, 2000);
  const result = tryRun('rg', ['--files', target]);
  if (result && result.status === 0) printLines(result.stdout, limit);
  else printLines(walkFiles(insideWorkspace(target), limit).join('\n'), limit);
} else if (command === 'search' || command === 'grep') {
  const pattern = process.argv[3];
  if (!pattern) die('search requires a pattern');
  const target = workspacePath(process.argv[4] || '.');
  const limit = boundedInt(process.argv[5], 240, 1, 2000);
  const result = tryRun(
    'rg',
    ['--color=never', '--line-number', '--smart-case', '--max-columns=260', '--', pattern, target],
  );
  if (result && (result.status === 0 || result.status === 1)) printLines(result.stdout, limit);
  else printLines(searchFallback(pattern, insideWorkspace(target), limit).join('\n'), limit);
} else if (command === 'find') {
  const needle = String(process.argv[3] || '').toLowerCase();
  if (!needle) die('find requires a name or substring');
  const target = insideWorkspace(process.argv[4] || '.');
  const limit = boundedInt(process.argv[5], 240, 1, 2000);
  const rows = walkFiles(target, 8000).filter((file) => file.toLowerCase().includes(needle)).slice(0, limit);
  printLines(rows.join('\n'), limit);
} else if (command === 'exists') {
  const target = process.argv[3] ? insideWorkspace(process.argv[3]) : '';
  console.log(JSON.stringify({
    path: target ? displayPath(target) : '',
    exists: !!target && fs.existsSync(target),
  }, null, 2));
} else if (command === 'head') {
  const target = insideWorkspace(process.argv[3] || '');
  if (!process.argv[3] || !fs.statSync(target).isFile()) die('head requires a workspace file');
  const count = boundedInt(process.argv[4], 80, 1, 500);
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  const width = String(Math.min(count, lines.length)).length;
  console.log(lines.slice(0, count).map((line, index) => `${String(index + 1).padStart(width)} | ${line}`).join('\n'));
} else if (command === 'json') {
  const target = insideWorkspace(process.argv[3] || '');
  if (!process.argv[3] || !fs.statSync(target).isFile()) die('json requires a workspace JSON file');
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  console.log(JSON.stringify(jsonLookup(value, process.argv[4] || ''), null, 2));
} else if (command === 'wc') {
  const target = insideWorkspace(process.argv[3] || '.');
  const files = fs.statSync(target).isFile()
    ? [target]
    : walkFilePaths(target, 8000);
  const rows = files.slice(0, 1000).map((file) => {
    const text = readTextFile(file, 2 * 1024 * 1024);
    return {
      path: displayPath(file),
      lines: text == null ? null : text.split('\n').length,
      bytes: fs.statSync(file).size,
    };
  });
  console.log(JSON.stringify(rows, null, 2));
} else if (command === 'read') {
  const target = insideWorkspace(process.argv[3] || '');
  if (!process.argv[3] || !fs.statSync(target).isFile()) die('read requires a workspace file');
  const start = boundedInt(process.argv[4], 1, 1, 1_000_000);
  const end = boundedInt(process.argv[5], start + 239, start, start + 499);
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  const width = String(Math.min(end, lines.length)).length;
  const out = [];
  for (let index = start - 1; index < Math.min(end, lines.length); index += 1)
    out.push(`${String(index + 1).padStart(width)} | ${lines[index]}`);
  console.log(out.join('\n'));
} else if (command === 'tail') {
  const target = insideWorkspace(process.argv[3] || '');
  if (!process.argv[3] || !fs.statSync(target).isFile()) die('tail requires a workspace file');
  const count = boundedInt(process.argv[4], 120, 1, 800);
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  const start = Math.max(0, lines.length - count);
  const width = String(lines.length).length;
  console.log(lines.slice(start).map((line, index) => `${String(start + index + 1).padStart(width)} | ${line}`).join('\n'));
} else if (command === 'tree') {
  const target = insideWorkspace(process.argv[3] || '.');
  if (!fs.statSync(target).isDirectory()) die('tree requires a workspace directory');
  const depthLimit = boundedInt(process.argv[4], 2, 1, 6);
  const rows = [];
  function walk(dir, depth) {
    if (depth > depthLimit || rows.length > 600) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      rows.push(`${'  '.repeat(depth)}${entry.isDirectory() ? '>' : '-'} ${displayPath(full)}`);
      if (entry.isDirectory()) walk(full, depth + 1);
    }
  }
  rows.push(displayPath(target));
  walk(target, 1);
  printLines(rows.join('\n'), 650);
} else if (command === 'stat') {
  const target = insideWorkspace(process.argv[3] || '.');
  const stat = fs.statSync(target);
  console.log(JSON.stringify({
    path: displayPath(target),
    kind: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
    size: stat.size,
    modified: stat.mtime.toISOString(),
  }, null, 2));
} else if (command === 'status') {
  run('git', ['status', '--short'], { limit: 400 });
} else if (command === 'diff') {
  const target = process.argv[3] ? workspacePath(process.argv[3]) : null;
  const limit = boundedInt(process.argv[target ? 4 : 3], 320, 1, 2400);
  run('git', target ? ['diff', '--', target] : ['diff'], { limit, tolerateFailure: true });
} else if (command === 'show') {
  const revision = process.argv[3];
  if (!revision) die('show requires a git revision');
  const target = process.argv[4] ? workspacePath(process.argv[4]) : null;
  const limit = boundedInt(process.argv[target ? 5 : 4], 320, 1, 2400);
  run('git', target ? ['show', revision, '--', target] : ['show', revision], {
    limit,
    tolerateFailure: true,
  });
} else if (command === 'diff-check') {
  run('git', ['diff', '--check'], { limit: 240, tolerateFailure: true });
} else if (command === 'check') {
  const target = process.argv[3] || 'all';
  if (target === 'wiring') run('npm', ['run', 'check:wiring'], { limit: 500 });
  else if (target === 'js') run('npm', ['run', 'check:js'], { limit: 500 });
  else if (target === 'rust') run('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml'], { limit: 700 });
  else if (target === 'all') run('npm', ['run', 'check'], { limit: 900 });
  else die(`unknown check target: ${target}`);
} else {
  help();
}
"#;

fn codex_prompt_for_request(
    request: &AiGenerateRequest,
    harness_dir: &Path,
    work_dir: &Path,
    workspace_roots: &[PathBuf],
) -> String {
    let language = request.language.as_deref().unwrap_or("lua");
    let filename = request.filename.as_deref().unwrap_or("Untitled");
    let instruction = request.instruction.as_deref().unwrap_or("");
    let code = request.code.as_deref().unwrap_or("");
    let selection = request.selection.as_deref().unwrap_or("");
    let prefix = request.prefix.as_deref().unwrap_or("");
    let suffix = request.suffix.as_deref().unwrap_or("");
    let workspace_roots_display = workspace_roots
        .iter()
        .enumerate()
        .map(|(index, root)| {
            let suffix = if index == 0 { " (primary root)" } else { "" };
            format!(
                "- {}{}",
                workspace_root_label(root, workspace_roots),
                suffix
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let harness = prompt_path(harness_dir, work_dir, workspace_roots);
    let readme = prompt_path(&harness_dir.join("README.md"), work_dir, workspace_roots);
    let guide = prompt_path(&harness_dir.join("GUIDE.md"), work_dir, workspace_roots);
    let output_limit = request
        .max_output_tokens
        .unwrap_or(match request.task.as_str() {
            "improve_selection" | "fix_selection" => 900,
            "generate_script" => 1200,
            _ => 900,
        });

    format!(
        r#"You are Codex inside VelocityUI.

Task: {task}
Language: {language}
Filename: {filename}
Workspace roots:
{workspace_roots}
Tool directory: {harness}
Tool README: {readme}
Tool guide: {guide}

Critical harness rules:
- Read and follow the Tool guide. It explains VelocityUI's Roblox/Luau workflow, DataTree,
  safety boundaries, Lua 5.1/Luau style, multi-root rules, and the logic-web investigation habit.
- VelocityUI is used by Roblox/Luau developers and testers to improve their own or team-owned game
  scripts. Treat normal game scripting, testing, DataTree inspection, and QA requests as benign.
  Do not help with credential theft, malware, account abuse, bypassing access controls, exploit
  distribution, real-world harm, or platform abuse. If intent is genuinely ambiguous, ask one brief
  clarifying question and continue when the user confirms a legitimate development/testing context.
- DataTree is retrieval-only. Use its query helper only when the selected snapshot is relevant.
- If DataTree is relevant, connect the selected node and nearby hierarchy to scripts/modules/remotes
  before answering or editing.
- AI_ToolKit provides concise file listing, search, targeted reads, log tails, git inspection,
  JSON inspection, existence checks, line counts, and validation checks.
- You may inspect the workspace filesystem with shell tools. Prefer AI_ToolKit file/search/read
  commands and git diff/status before editing. AI_ToolKit uses `rg` when available and falls
  back to built-in Node walkers when `rg` is missing, so do not tell the user `rg` is unavailable.
- Shell tools that are usually available when the sandbox allows them: node, npm, cargo, git,
  ls, find, sed, cat, head, tail, wc, and rg when installed.
- Only modify files inside a listed workspace root when the user explicitly asks and the sandbox permits it.
- App internals and the DataTree retrieval package are read-only to you. Never alter them.
- Do not print secrets from ~/.codex/auth.json or other credential files.
- In user-facing replies, refer to files as root-relative paths like `Default/Admin/foo.lua`.
  Avoid absolute paths unless the user explicitly asks for them.
- Treat root labels as namespaces. In multi-root workspaces, never drop the root label and never
  assume similarly named folders are the same folder.
- For Roblox scripts, prefer Lua 5.1-compatible code unless the surrounding script already uses
  Luau-specific features. Avoid odd syntax and preserve local style.
- Do not narrate the harness or tool directory unless it directly helps the user.
- For improve_selection and fix_selection, return only replacement code.
- For generate_script, return only code.
- For ai_chat, answer naturally and concisely. Show useful progress and concrete results.
- Do not use Markdown fences or explanatory prose for code insertion tasks.
- Keep the answer under roughly {output_limit} tokens.

User instruction: {instruction}

Full editor code:
```{language}
{code}
```

Selected code:
```{language}
{selection}
```

Cursor prefix:
```{language}
{prefix}
```

Cursor suffix:
```{language}
{suffix}
```
"#,
        task = request.task,
        output_limit = output_limit,
        harness = harness,
        readme = readme,
        guide = guide,
        workspace_roots = workspace_roots_display
    )
}

#[tauri::command]
pub fn ai_get_config() -> Result<AiConfigState, String> {
    let config = load_config();
    Ok(AiConfigState {
        resolved_codex_path: resolve_codex_path(&config)
            .map(|path| path.to_string_lossy().into_owned()),
        config,
        has_codex_auth: has_codex_auth(),
    })
}

#[tauri::command]
pub fn ai_save_config(mut config: AiConfig) -> Result<AiConfigState, String> {
    normalize_config(&mut config);
    save_config_file(&config)?;
    Ok(AiConfigState {
        resolved_codex_path: resolve_codex_path(&config)
            .map(|path| path.to_string_lossy().into_owned()),
        has_codex_auth: has_codex_auth(),
        config,
    })
}

#[tauri::command]
pub async fn ai_generate(
    app: AppHandle,
    request: AiGenerateRequest,
) -> Result<AiGenerateResponse, String> {
    let config = load_config();
    if !config.enabled {
        return Err("AI helper is disabled".to_string());
    }
    ai_generate_codex(&app, &config, request).await
}

fn emit_stream(
    app: &AppHandle,
    request_id: &Option<String>,
    kind: &str,
    delta: Option<String>,
    text: Option<String>,
    payload: Option<Value>,
) {
    let _ = app.emit(
        "ai-stream",
        AiStreamEvent {
            request_id: request_id.clone(),
            kind: kind.to_string(),
            delta,
            text,
            payload,
        },
    );
}

fn cancel_requests() -> &'static Mutex<HashMap<String, AiCancelHandle>> {
    AI_CANCEL_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_cancel_request(
    request_id: &Option<String>,
    pid: Option<u32>,
) -> Option<oneshot::Receiver<()>> {
    let id = request_id.as_ref()?.trim();
    if id.is_empty() {
        return None;
    }
    let (tx, rx) = oneshot::channel();
    if let Ok(mut requests) = cancel_requests().lock() {
        if let Some(previous) = requests.insert(id.to_string(), AiCancelHandle { sender: tx, pid })
        {
            terminate_process(previous.pid);
            let _ = previous.sender.send(());
        }
    }
    Some(rx)
}

fn unregister_cancel_request(request_id: &Option<String>) {
    let Some(id) = request_id.as_ref() else {
        return;
    };
    if let Ok(mut requests) = cancel_requests().lock() {
        requests.remove(id);
    }
}

fn terminate_process(pid: Option<u32>) {
    let Some(pid) = pid else {
        return;
    };
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .spawn();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .spawn();
    }
}

#[tauri::command]
pub fn ai_cancel_request(request_id: String) -> Result<(), String> {
    if let Ok(mut requests) = cancel_requests().lock() {
        if let Some(cancel) = requests.remove(request_id.trim()) {
            terminate_process(cancel.pid);
            let _ = cancel.sender.send(());
        }
    }
    Ok(())
}

async fn write_rpc(
    stdin: &mut ChildStdin,
    id: Option<u64>,
    method: &str,
    params: Value,
) -> Result<(), String> {
    let raw = match id {
        Some(id) => json!({ "method": method, "id": id, "params": params }).to_string(),
        None if params.is_null() => json!({ "method": method }).to_string(),
        None => json!({ "method": method, "params": params }).to_string(),
    };
    stdin
        .write_all(format!("{raw}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())
}

fn json_path<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().try_fold(value, |next, key| next.get(*key))
}

fn rpc_error(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|error| error.get("message").or(Some(error)))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn summarize_file_changes(item: &Value) -> Vec<AiFileChangeSummary> {
    let Some(changes) = item.get("changes").and_then(Value::as_array) else {
        return Vec::new();
    };
    changes
        .iter()
        .filter_map(|change| {
            let path = change.get("path")?.as_str()?.to_string();
            let kind = change
                .get("kind")
                .and_then(|kind| kind.get("type").or(Some(kind)))
                .and_then(Value::as_str)
                .unwrap_or("update")
                .to_string();
            let mut additions = 0;
            let mut deletions = 0;
            for line in change
                .get("diff")
                .and_then(Value::as_str)
                .unwrap_or("")
                .lines()
            {
                if line.starts_with('+') && !line.starts_with("+++") {
                    additions += 1;
                } else if line.starts_with('-') && !line.starts_with("---") {
                    deletions += 1;
                }
            }
            Some(AiFileChangeSummary {
                path,
                kind,
                additions,
                deletions,
            })
        })
        .collect()
}

fn summarize_tool_event(method: &str, params: &Value) -> Option<Value> {
    let item = params.get("item").unwrap_or(params);
    let item_type = item
        .get("type")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?;
    if matches!(item_type, "agentMessage" | "fileChange") {
        return None;
    }
    let label = item
        .get("title")
        .or_else(|| item.get("name"))
        .or_else(|| item.get("command"))
        .or_else(|| item.get("cmd"))
        .or_else(|| item.get("path"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let status = item
        .get("status")
        .or_else(|| item.get("state"))
        .and_then(Value::as_str)
        .unwrap_or_else(|| method.trim_start_matches("item/"));
    Some(json!({
        "type": item_type,
        "label": label,
        "status": status,
    }))
}

fn final_agent_text_from_turn(turn: &Value) -> Option<String> {
    turn.get("items")
        .and_then(Value::as_array)?
        .iter()
        .rev()
        .find_map(|item| {
            (item.get("type").and_then(Value::as_str) == Some("agentMessage"))
                .then(|| item.get("text").and_then(Value::as_str).map(str::to_string))
                .flatten()
        })
}

fn app_server_sandbox(sandbox: &str, workspace_roots: &[PathBuf]) -> Value {
    if sandbox == "workspace-write" {
        json!({
            "type": "workspaceWrite",
            "writableRoots": workspace_roots,
            "networkAccess": false,
            "excludeTmpdirEnvVar": false,
            "excludeSlashTmp": false
        })
    } else {
        json!({ "type": "readOnly", "networkAccess": false })
    }
}

async fn ai_generate_codex(
    app: &AppHandle,
    config: &AiConfig,
    request: AiGenerateRequest,
) -> Result<AiGenerateResponse, String> {
    if !has_codex_auth() {
        return Err("Codex auth was not found in ~/.codex/auth.json".to_string());
    }
    let codex_path =
        resolve_codex_path(config).ok_or_else(|| "Codex CLI was not found".to_string())?;
    let work_dir = resolve_codex_work_dir(&request)?;
    let workspace_roots = resolve_codex_workspace_roots(&request, &work_dir);
    let harness_dir = write_codex_harness(&request, &work_dir, &workspace_roots)?;
    let prompt = codex_prompt_for_request(&request, &harness_dir, &work_dir, &workspace_roots);
    let sandbox = match config.codex_sandbox.as_str() {
        "read-only" | "workspace-write" => config.codex_sandbox.as_str(),
        _ => "read-only",
    };
    if sandbox == "workspace-write"
        && workspace_roots
            .iter()
            .any(|root| workspace_covers_internals(root).unwrap_or(true))
    {
        return Err(
            "Codex cannot write to a workspace that contains VelocityUI internals".to_string(),
        );
    }

    let mut child = Command::new(&codex_path)
        .arg("app-server")
        .arg("--listen")
        .arg("stdio://")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start Codex app server: {e}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app server stdin was unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app server stdout was unavailable".to_string())?;
    let mut stderr = child.stderr.take().map(BufReader::new);
    let stderr_task = tokio::spawn(async move {
        let mut raw = String::new();
        if let Some(stderr) = stderr.as_mut() {
            let _ = stderr.read_to_string(&mut raw).await;
        }
        raw
    });
    let mut lines = BufReader::new(stdout).lines();
    let request_id = request.request_id.clone();
    let child_pid = child.id();
    let cancel_rx = register_cancel_request(&request_id, child_pid);
    let work = async {
        write_rpc(
            &mut stdin,
            Some(0),
            "initialize",
            json!({
                "clientInfo": {
                    "name": "velocityui",
                    "title": "VelocityUI",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": {
                    "experimentalApi": true,
                    "requestAttestation": false
                }
            }),
        )
        .await?;

        let mut sent_thread_start = false;
        let mut sent_turn_start = false;
        let mut final_text = String::new();
        let mut streamed_text = String::new();
        let mut changes = Vec::new();
        let mut usage = None;
        let mut rate_limits = None;
        loop {
            let line = lines
                .next_line()
                .await
                .map_err(|e| format!("Codex stream failed: {e}"))?
                .ok_or_else(|| "Codex app server closed its stream".to_string())?;
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if value.get("id").and_then(Value::as_u64) == Some(1) && value.get("error").is_some() {
                continue;
            }
            if let Some(error) = rpc_error(&value) {
                return Err(format!("Codex request failed: {error}"));
            }
            match value.get("id").and_then(Value::as_u64) {
                Some(0) if !sent_thread_start => {
                    write_rpc(&mut stdin, None, "initialized", Value::Null).await?;
                    write_rpc(&mut stdin, Some(1), "account/rateLimits/read", json!({})).await?;
                    write_rpc(
                        &mut stdin,
                        Some(2),
                        "thread/start",
                        json!({
                            "model": config.model.trim(),
                            "cwd": work_dir,
                            "runtimeWorkspaceRoots": workspace_roots,
                            "approvalPolicy": "never",
                            "sandbox": sandbox,
                            "ephemeral": true,
                            "experimentalRawEvents": false,
                            "persistExtendedHistory": false
                        }),
                    )
                    .await?;
                    sent_thread_start = true;
                    continue;
                }
                Some(1) => {
                    if let Some(next) = value.get("result").and_then(|result| {
                        result
                            .get("rateLimits")
                            .or_else(|| result.get("rate_limits"))
                            .or(Some(result))
                    }) {
                        rate_limits = Some(next.clone());
                        emit_stream(
                            app,
                            &request_id,
                            "rate_limits",
                            None,
                            None,
                            Some(next.clone()),
                        );
                    }
                    continue;
                }
                Some(2) if !sent_turn_start => {
                    let thread_id = json_path(&value, &["result", "thread", "id"])
                        .and_then(Value::as_str)
                        .ok_or_else(|| "Codex did not return a thread id".to_string())?;
                    write_rpc(
                        &mut stdin,
                        Some(3),
                        "turn/start",
                        json!({
                            "threadId": thread_id,
                            "input": [{
                                "type": "text",
                                "text": prompt,
                                "text_elements": []
                            }],
                            "cwd": work_dir,
                            "runtimeWorkspaceRoots": workspace_roots,
                            "approvalPolicy": "never",
                            "sandboxPolicy": app_server_sandbox(sandbox, &workspace_roots),
                            "model": config.model.trim()
                        }),
                    )
                    .await?;
                    sent_turn_start = true;
                    emit_stream(app, &request_id, "started", None, None, None);
                    continue;
                }
                Some(3) => continue,
                _ => {}
            }

            let method = value.get("method").and_then(Value::as_str).unwrap_or("");
            let params = value.get("params").unwrap_or(&Value::Null);
            match method {
                "item/started" | "item/updated" => {
                    if let Some(payload) = summarize_tool_event(method, params) {
                        emit_stream(app, &request_id, "tool_event", None, None, Some(payload));
                    }
                }
                "item/agentMessage/delta" => {
                    if let Some(delta) = params.get("delta").and_then(Value::as_str) {
                        streamed_text.push_str(delta);
                        emit_stream(
                            app,
                            &request_id,
                            "text_delta",
                            Some(delta.to_string()),
                            None,
                            None,
                        );
                    }
                }
                "item/completed" => {
                    let item = params.get("item").unwrap_or(&Value::Null);
                    match item.get("type").and_then(Value::as_str).unwrap_or("") {
                        "agentMessage" => {
                            if let Some(text) = item.get("text").and_then(Value::as_str) {
                                final_text = text.to_string();
                                emit_stream(
                                    app,
                                    &request_id,
                                    "message",
                                    None,
                                    Some(text.to_string()),
                                    None,
                                );
                            }
                        }
                        "fileChange" => {
                            let item_changes = summarize_file_changes(item);
                            if !item_changes.is_empty() {
                                let payload = serde_json::to_value(&item_changes)
                                    .map_err(|e| e.to_string())?;
                                emit_stream(
                                    app,
                                    &request_id,
                                    "file_change",
                                    None,
                                    None,
                                    Some(payload),
                                );
                                changes.extend(item_changes);
                            }
                        }
                        _ => {}
                    }
                }
                "thread/tokenUsage/updated" => {
                    if let Some(next) = params.get("tokenUsage") {
                        usage = Some(next.clone());
                        emit_stream(app, &request_id, "usage", None, None, Some(next.clone()));
                    }
                }
                "account/rateLimits/updated" => {
                    if let Some(next) = params.get("rateLimits") {
                        rate_limits = Some(next.clone());
                        emit_stream(
                            app,
                            &request_id,
                            "rate_limits",
                            None,
                            None,
                            Some(next.clone()),
                        );
                    }
                }
                "turn/completed" => {
                    let turn = params.get("turn").unwrap_or(&Value::Null);
                    if let Some(error) = turn
                        .get("error")
                        .and_then(|error| error.get("message").or(Some(error)))
                        .and_then(Value::as_str)
                    {
                        return Err(format!("Codex request failed: {error}"));
                    }
                    if let Some(text) = final_agent_text_from_turn(turn) {
                        final_text = text;
                    }
                    break;
                }
                "error" => {
                    if let Some(error) = params
                        .get("error")
                        .and_then(|error| error.get("message").or(Some(error)))
                        .and_then(Value::as_str)
                    {
                        return Err(format!("Codex request failed: {error}"));
                    }
                }
                _ => {}
            }
        }
        if final_text.trim().is_empty() {
            final_text = streamed_text;
        }
        Ok((final_text.trim().to_string(), changes, usage, rate_limits))
    };
    let result = if let Some(cancel_rx) = cancel_rx {
        tokio::select! {
            timed = timeout(Duration::from_secs(900), work) => {
                timed.map_err(|_| "Codex request timed out".to_string())?
            }
            _ = cancel_rx => {
                emit_stream(app, &request_id, "cancelled", None, None, None);
                Err("Codex request cancelled".to_string())
            }
        }
    } else {
        timeout(Duration::from_secs(900), work)
            .await
            .map_err(|_| "Codex request timed out".to_string())?
    };
    unregister_cancel_request(&request_id);
    let _ = child.kill().await;
    let _ = child.wait().await;
    let stderr = stderr_task.await.unwrap_or_default();
    let (text, changes, usage, rate_limits) = result.map_err(|err| {
        if stderr.trim().is_empty() {
            err
        } else {
            format!("{err}: {}", stderr.trim())
        }
    })?;
    if text.is_empty() {
        return Err("Codex did not return a final message".to_string());
    }

    emit_stream(
        app,
        &request_id,
        "completed",
        None,
        Some(text.clone()),
        None,
    );
    Ok(AiGenerateResponse {
        text,
        model: if config.model.trim().is_empty() {
            "codex".to_string()
        } else {
            config.model.clone()
        },
        changes,
        usage,
        rate_limits,
    })
}
