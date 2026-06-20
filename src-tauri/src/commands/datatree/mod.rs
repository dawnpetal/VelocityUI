pub mod logic;
pub mod snapshot;
pub mod types;

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use uuid::Uuid;

use snapshot::{
    decode_terrain_grid, explorer_sidecar_is_fresh, explorer_snapshot_path,
    make_explorer_snapshot, make_render_snapshot, parse_rbxlx, read_explorer_sidecar,
    read_snapshot_cached, roblox_node_path, script_source, write_json_file,
};
use types::{
    DataTreeExplorerSnapshot, DataTreeNode, DataTreeSnapshot, ScriptScanHit, TerrainCell,
};

#[tauri::command]
pub async fn datatree_build_logic_web(
    app: AppHandle,
    path: String,
    progress_id: Option<String>,
) -> Result<types::LogicWeb, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let (source_len, source_modified_ms) = snapshot::snapshot_file_stamp(&path)?;
        if let Some(cached) = logic::logic_web_read_cached(&path) {
            return Ok((*cached).clone());
        }
        let cached = snapshot::read_snapshot_cached(&path)?;
        let web = logic::graph::build(
            &app,
            &progress_id,
            &path,
            &cached.snapshot,
            &cached.node_index,
            source_len,
            source_modified_ms,
        );
        logic::logic_web_write_cached(&path, &web);
        Ok(web)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn datatree_clear_logic_cache(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&path);
    let key = logic::logic_web_cache_key(&path);
    if let Ok(mut cache) = logic::logic_web_cache().lock() {
        cache.remove(&key);
    }
    let logic_sidecar = logic::logic_web_sidecar_path(&path);
    let explorer_sidecar = snapshot::explorer_snapshot_path(&path);
    if logic_sidecar.exists() {
        std::fs::remove_file(&logic_sidecar).map_err(|e| e.to_string())?;
    }
    if explorer_sidecar.exists() {
        std::fs::remove_file(&explorer_sidecar).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn snapshot_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map(|d| d.join("snapshots"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn datatree_load_snapshot(
    _app: AppHandle,
    path: String,
) -> Result<DataTreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let mut snapshot = (*cached.snapshot).clone();
        snapshot::make_snapshot_light(&mut snapshot);
        Ok(snapshot)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_load_explorer_snapshot(
    _app: AppHandle,
    path: String,
) -> Result<DataTreeExplorerSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let sidecar_path = explorer_snapshot_path(&path);
        if sidecar_path.exists() && explorer_sidecar_is_fresh(&path, &sidecar_path) {
            if let Ok(explorer) = read_explorer_sidecar(&sidecar_path) {
                return Ok(explorer);
            }
        }
        let cached = read_snapshot_cached(&path)?;
        let explorer = make_explorer_snapshot(&cached.snapshot);
        let _ = write_json_file(&sidecar_path, &explorer);
        Ok(explorer)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_render_snapshot(
    path: String,
    root_id: u32,
) -> Result<DataTreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        Ok(make_render_snapshot((*cached.snapshot).clone(), root_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_node_value(
    path: String,
    node_id: u32,
    property: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let idx = *cached.node_index.get(&node_id).ok_or("node not found")?;
        let node = &cached.snapshot.nodes[idx];
        node.properties
            .get(&property)
            .cloned()
            .ok_or_else(|| format!("property {property:?} not found"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_node_detail(path: String, node_id: u32) -> Result<DataTreeNode, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let idx = *cached.node_index.get(&node_id).ok_or("node not found")?;
        Ok(cached.snapshot.nodes[idx].clone())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_scan_scripts(
    path: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ScriptScanHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&path);
        let cached = read_snapshot_cached(&path)?;
        let snapshot = &cached.snapshot;
        let q = query.to_ascii_lowercase();
        let max = limit.unwrap_or(200).min(1000);
        let mut hits = Vec::new();
        for (index, node) in snapshot.nodes.iter().enumerate() {
            if !logic::roblox_api::is_script_class(&node.class_name) { continue }
            let source = script_source(node);
            if source.is_empty() { continue }
            let matches = count_plain_occurrences(&source.to_ascii_lowercase(), &q);
            if !q.is_empty() && matches == 0 { continue }
            let node_path = roblox_node_path(snapshot, index, &cached.node_index);
            hits.push(ScriptScanHit {
                id: node.id,
                name: node.name.clone(),
                class_name: node.class_name.clone(),
                path: node_path,
                matches,
                source_len: source.len(),
            });
        }
        hits.sort_by(|a, b| b.matches.cmp(&a.matches));
        hits.truncate(max);
        Ok(hits)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn count_plain_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() { return 0 }
    let mut count = 0;
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(needle) {
        count += 1;
        start += pos + needle.len();
    }
    count
}

#[tauri::command]
pub async fn datatree_decode_terrain_grid(raw: String) -> Result<Vec<TerrainCell>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(decode_terrain_grid(&raw)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_import_file(
    app: AppHandle,
    path: String,
    import_id: Option<String>,
) -> Result<DataTreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source_path = PathBuf::from(&path);
        let snapshot_id = Uuid::new_v4().to_string();
        let snapshot_dir = snapshot_dir(&app)?;
        std::fs::create_dir_all(&snapshot_dir).map_err(|e| e.to_string())?;
        let storage_path = snapshot_dir.join(format!("{snapshot_id}.json"));
        let storage_path_str = storage_path.to_string_lossy().into_owned();
        let mut snapshot = parse_rbxlx(Some(&app), &source_path, snapshot_id, storage_path_str, import_id)?;
        snapshot.storage_path = storage_path.to_string_lossy().into_owned();
        write_json_file(&storage_path, &snapshot)?;
        snapshot::remember_and_cache(&storage_path, snapshot.clone())?;
        Ok(snapshot)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_import_dialog(app: AppHandle) -> Result<Option<DataTreeSnapshot>, String> {
    use tauri_plugin_dialog::DialogExt;
    let handle = app.clone();
    let file = app.dialog()
        .file()
        .add_filter("Roblox Place", &["rbxlx", "rbxl"])
        .blocking_pick_file();
    let Some(file_path) = file else { return Ok(None) };
    let path = file_path.to_string();
    let result = datatree_import_file(handle, path, None).await?;
    Ok(Some(result))
}

#[tauri::command]
pub fn datatree_find_saved_game_file(file_name: String) -> Result<Option<String>, String> {
    let names = saved_game_names(&file_name);
    if names.is_empty() { return Ok(None) }
    let direct = PathBuf::from(file_name.trim());
    if direct.is_absolute() && direct.is_file() {
        let path = direct.canonicalize().unwrap_or(direct);
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    let mut best = None;
    for (dir, depth) in saved_game_dirs() {
        newest_matching_file(&dir, &names, depth, &mut best);
    }
    Ok(best.map(|(_, path)| path.to_string_lossy().into_owned()))
}

fn saved_game_names(input: &str) -> Vec<String> {
    let base = PathBuf::from(input.trim());
    let stem = base.file_stem().unwrap_or_default().to_string_lossy().to_string();
    if stem.is_empty() { return Vec::new() }
    vec![
        format!("{stem}.rbxlx"),
        format!("{stem}.rbxl"),
        stem.clone(),
    ]
}

fn saved_game_dirs() -> Vec<(PathBuf, u32)> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "macos")]
        {
            dirs.push((home.join("Documents/Roblox/AutoSaves"), 1));
            dirs.push((home.join("Documents/Roblox"), 1));
        }
        #[cfg(target_os = "windows")]
        {
            dirs.push((home.join("Documents\\Roblox\\AutoSaves"), 1));
            dirs.push((home.join("Documents\\Roblox"), 1));
        }
        #[cfg(target_os = "linux")]
        {
            dirs.push((home.join(".local/share/roblox"), 2));
        }
    }
    dirs
}

fn newest_matching_file(dir: &Path, names: &[String], max_depth: u32, best: &mut Option<(std::time::SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && max_depth > 0 {
            newest_matching_file(&path, names, max_depth - 1, best);
        }
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if !names.iter().any(|n| n.eq_ignore_ascii_case(&file_name)) { continue }
        if let Ok(meta) = std::fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
                    *best = Some((modified, path));
                }
            }
        }
    }
}