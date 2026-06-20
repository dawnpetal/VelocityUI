use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use super::lua_analysis::{
    self, capture_unique, config_keys, exported_symbols, instance_vars, module_function_returns,
    service_vars,
};
use super::remote_analysis::{build_listener_param_index, remote_calls_in_source};
use super::roblox_api;
use crate::commands::datatree::snapshot::{
    roblox_node_path, script_source,
};
use crate::commands::datatree::types::{
    DataTreeSnapshot, LogicWeb, LogicWebEdge, LogicWebNode, LogicWebRemoteCall,
    LogicWebSummary, LogicWebSystem,
};

pub const LOGIC_WEB_VERSION: u32 = 5;

fn emit_progress(
    app: &AppHandle,
    progress_id: &Option<String>,
    snapshot_path: &Path,
    phase: &str,
    message: &str,
    progress: f64,
    current: usize,
    total: usize,
) {
    if let Some(pid) = progress_id {
        let _ = app.emit(
            "datatree-logic-progress",
            serde_json::json!({
                "progressId": pid,
                "snapshotPath": snapshot_path.to_string_lossy(),
                "phase": phase,
                "message": message,
                "progress": progress.clamp(0.0, 1.0),
                "current": current,
                "total": total,
            }),
        );
    }
}

fn edge_key(from: &str, to: &str, kind: &str, label: &str) -> String {
    format!("{from}|{to}|{kind}|{label}")
}

fn parent_path(path: &str) -> String {
    path.rsplit_once('.')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_else(|| "game".to_string())
}

fn system_name_from_path(path: &str) -> String {
    let parts: Vec<&str> = path.split('.').collect();
    for part in parts.iter().rev().skip(1) {
        if !roblox_api::is_container_path_segment(part) {
            return (*part).to_string();
        }
    }
    "General".to_string()
}

fn capitalize_words(s: &str) -> String {
    s.split(|c: char| c == '-' || c == '_' || c == ' ')
        .filter(|p| !p.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            chars.next().map(|first| first.to_ascii_uppercase().to_string() + chars.as_str()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn build(
    app: &AppHandle,
    progress_id: &Option<String>,
    snapshot_path: &Path,
    snapshot: &DataTreeSnapshot,
    node_index: &HashMap<u32, usize>,
    source_len: u64,
    source_modified_ms: u64,
) -> LogicWeb {
    let mut nodes: Vec<LogicWebNode> = Vec::new();
    let mut edges: Vec<LogicWebEdge> = Vec::new();
    let mut seen_edges: HashSet<String> = HashSet::new();
    let mut path_to_node: HashMap<String, String> = HashMap::new();
    let mut remote_path_to_node: HashMap<String, String> = HashMap::new();
    let mut remote_classes: HashMap<String, String> = HashMap::new();
    let mut remote_name_candidates: HashMap<String, Option<String>> = HashMap::new();
    let mut script_records: Vec<(String, String, String, Vec<String>)> = Vec::new();
    let mut remote_calls: Vec<LogicWebRemoteCall> = Vec::new();
    let mut module_fn_return_types: HashMap<String, String> = HashMap::new();
    let mut module_count = 0usize;
    let mut local_script_count = 0usize;
    let mut server_script_count = 0usize;
    let mut config_count = 0usize;

    for (index, node) in snapshot.nodes.iter().enumerate() {
        if !roblox_api::is_script_class(&node.class_name) {
            continue;
        }
        let path = roblox_node_path(snapshot, index, node_index);
        let source = script_source(node).to_string();
        let services = capture_unique(
            &source,
            r#"game:GetService\s*\(\s*["']([^"']+)["']\s*\)"#,
            1,
        );
        let cfg_keys = config_keys(&source);
        let exports = exported_symbols(&source, &node.name);
        let system_name = system_name_from_path(&path);
        let system_id = format!("system:{}", system_name.to_ascii_lowercase().replace(' ', "-"));
        let kind = if node.class_name.eq_ignore_ascii_case("ModuleScript") && !cfg_keys.is_empty() {
            "Config"
        } else {
            node.class_name.as_str()
        };

        match node.class_name.to_ascii_lowercase().as_str() {
            "modulescript" => module_count += 1,
            "localscript" => local_script_count += 1,
            _ => server_script_count += 1,
        }
        if kind == "Config" { config_count += 1 }

        let id = format!("script:{}", node.id);
        path_to_node.insert(path.to_ascii_lowercase(), id.clone());
        script_records.push((id.clone(), path.clone(), source.clone(), services.clone()));
        nodes.push(LogicWebNode {
            id,
            node_id: Some(node.id),
            kind: kind.to_string(),
            class_name: node.class_name.clone(),
            name: node.name.clone(),
            path: path.clone(),
            parent_path: parent_path(&path),
            system_id,
            source_len: source.len(),
            exports,
            config_keys: cfg_keys,
            services,
            remote_events: Vec::new(),
            score: source.len() / 200,
        });
    }

    for (_id, script_path, source, _services) in &script_records {
        if !source.contains("function") || !source.contains("return") { continue }
        for (key, return_type) in module_function_returns(script_path, source) {
            module_fn_return_types.insert(key, return_type);
        }
    }

    for (index, node) in snapshot.nodes.iter().enumerate() {
        if !roblox_api::is_remote_class(&node.class_name) { continue }
        let path = roblox_node_path(snapshot, index, node_index);
        let system_name = system_name_from_path(&path);
        let system_id = format!("system:{}", system_name.to_ascii_lowercase().replace(' ', "-"));
        let id = format!("remote:{}", node.id);
        remote_path_to_node.insert(path.to_ascii_lowercase(), id.clone());
        remote_classes.insert(path.to_ascii_lowercase(), node.class_name.clone());
        let name_key = node.name.to_ascii_lowercase();
        remote_name_candidates
            .entry(name_key)
            .and_modify(|candidate| {
                if candidate.as_deref() != Some(path.as_str()) { *candidate = None; }
            })
            .or_insert_with(|| Some(path.clone()));
        nodes.push(LogicWebNode {
            id,
            node_id: Some(node.id),
            kind: "Remote".to_string(),
            class_name: node.class_name.clone(),
            name: node.name.clone(),
            path: path.clone(),
            parent_path: parent_path(&path),
            system_id,
            source_len: 0,
            exports: Vec::new(),
            config_keys: Vec::new(),
            services: Vec::new(),
            remote_events: Vec::new(),
            score: 4,
        });
    }

    let remote_paths_by_name: HashMap<String, String> = remote_name_candidates
        .into_iter()
        .filter_map(|(name, path)| path.map(|p| (name, p)))
        .collect();

    emit_progress(app, progress_id, snapshot_path, "listener-index", "Indexing remote listener signatures", 0.0, 0, script_records.len());
    let listener_total = script_records.len().max(1);
    let listener_param_index = build_listener_param_index(
        &script_records,
        &module_fn_return_types,
        &remote_paths_by_name,
        |current, total| {
            emit_progress(
                app,
                progress_id,
                snapshot_path,
                "listener-index",
                "Indexing remote listener signatures",
                (current as f64 / total.max(listener_total) as f64) * 0.5,
                current,
                total,
            );
        },
    );

    let mut node_remote_events: HashMap<String, Vec<String>> = HashMap::new();
    let extract_total = script_records.len().max(1);

    for (extract_index, (script_id, script_path, source, services)) in script_records.iter().enumerate() {
        if extract_index == 0 || extract_index + 1 == extract_total || (extract_index + 1) % 10 == 0 {
            emit_progress(
                app,
                progress_id,
                snapshot_path,
                "remote-extraction",
                "Extracting remote call sites",
                0.5 + (extract_index + 1) as f64 / extract_total as f64 * 0.5,
                extract_index + 1,
                extract_total,
            );
        }

        for service in services {
            let service_id = format!("service:{service}");
            if !nodes.iter().any(|n| n.id == service_id) {
                nodes.push(LogicWebNode {
                    id: service_id.clone(),
                    node_id: None,
                    kind: "Service".to_string(),
                    class_name: "Service".to_string(),
                    name: service.clone(),
                    path: format!("game.{service}"),
                    parent_path: "game".to_string(),
                    system_id: "system:services".to_string(),
                    source_len: 0,
                    exports: Vec::new(),
                    config_keys: Vec::new(),
                    services: Vec::new(),
                    remote_events: Vec::new(),
                    score: 1,
                });
            }
            let key = edge_key(script_id, &service_id, "uses_service", service);
            if seen_edges.insert(key) {
                edges.push(LogicWebEdge {
                    id: format!("edge:{}", edges.len() + 1),
                    from: script_id.clone(),
                    to: service_id,
                    kind: "uses_service".to_string(),
                    label: format!("uses {service}"),
                    evidence: format!("game:GetService(\"{service}\")"),
                    confidence: 0.98,
                });
            }
        }

        let base_vars = service_vars(source);
        let vars = instance_vars(source, script_path, &base_vars);

        for cap in super::regex_cache::cached_regex(r#"require\s*\(\s*([^)]+?)\s*\)"#).captures_iter(source) {
            let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if let Some(target_path) = lua_analysis::resolve_require_path(raw, script_path, &vars) {
                let target_id = path_to_node.get(&target_path.to_ascii_lowercase());
                let to = target_id.cloned().unwrap_or_else(|| format!("external:{target_path}"));
                if target_id.is_none() && !nodes.iter().any(|n| n.id == to) {
                    nodes.push(LogicWebNode {
                        id: to.clone(),
                        node_id: None,
                        kind: "Unresolved".to_string(),
                        class_name: "RequireTarget".to_string(),
                        name: target_path.rsplit('.').next().unwrap_or("Require").to_string(),
                        path: target_path.clone(),
                        parent_path: parent_path(&target_path),
                        system_id: "system:unresolved".to_string(),
                        source_len: 0,
                        exports: Vec::new(),
                        config_keys: Vec::new(),
                        services: Vec::new(),
                        remote_events: Vec::new(),
                        score: 1,
                    });
                }
                let key = edge_key(script_id, &to, "requires", &target_path);
                if seen_edges.insert(key) {
                    edges.push(LogicWebEdge {
                        id: format!("edge:{}", edges.len() + 1),
                        from: script_id.clone(),
                        to,
                        kind: "requires".to_string(),
                        label: "requires".to_string(),
                        evidence: raw.to_string(),
                        confidence: if target_id.is_some() { 0.92 } else { 0.55 },
                    });
                }
            }
        }

        for mut call in remote_calls_in_source(
            source,
            script_id,
            script_path,
            &vars,
            &remote_classes,
            &remote_paths_by_name,
            &module_fn_return_types,
            &listener_param_index,
        ) {
            let action = call.method.clone();
            let resolved = call.remote_path.clone();
            let to = remote_path_to_node
                .get(&resolved.to_ascii_lowercase())
                .cloned()
                .unwrap_or_else(|| format!("remote-ref:{resolved}"));

            if !nodes.iter().any(|n| n.id == to) {
                nodes.push(LogicWebNode {
                    id: to.clone(),
                    node_id: None,
                    kind: "RemoteRef".to_string(),
                    class_name: "RemoteRef".to_string(),
                    name: resolved.rsplit('.').next().unwrap_or("Remote").to_string(),
                    path: resolved.clone(),
                    parent_path: parent_path(&resolved),
                    system_id: "system:remotes".to_string(),
                    source_len: 0,
                    exports: Vec::new(),
                    config_keys: Vec::new(),
                    services: Vec::new(),
                    remote_events: Vec::new(),
                    score: 3,
                });
            }

            node_remote_events
                .entry(script_id.clone())
                .or_default()
                .push(format!(
                    "{}.{action} {}",
                    resolved.rsplit('.').next().unwrap_or(&resolved),
                    call.arg_signature
                ));

            let kind = if action.starts_with("On") { "listens_remote" } else { "fires_remote" };
            let key = edge_key(script_id, &to, kind, &format!("{}:{}", action, call.arg_signature));
            if seen_edges.insert(key) {
                edges.push(LogicWebEdge {
                    id: format!("edge:{}", edges.len() + 1),
                    from: script_id.clone(),
                    to,
                    kind: kind.to_string(),
                    label: action.clone(),
                    evidence: call.evidence.clone(),
                    confidence: 0.72,
                });
            }
            call.id = format!("remote-call:{}", remote_calls.len() + 1);
            remote_calls.push(call);
        }
    }

    let mut signature_counts: HashMap<String, HashMap<String, usize>> = HashMap::new();
    let mut remote_counts: HashMap<String, usize> = HashMap::new();
    for call in &remote_calls {
        *remote_counts.entry(call.remote_key.clone()).or_insert(0) += 1;
        *signature_counts.entry(call.remote_key.clone()).or_default()
            .entry(format!("{} {}", call.method, call.arg_signature)).or_insert(0) += 1;
    }
    for call in &mut remote_calls {
        let total = *remote_counts.get(&call.remote_key).unwrap_or(&1) as f32;
        let matching = signature_counts.get(&call.remote_key)
            .and_then(|counts| counts.get(&format!("{} {}", call.method, call.arg_signature)))
            .copied().unwrap_or(1) as f32;
        let resolved_bonus = if call.remote_path.starts_with("game.") { 0.22 } else { 0.0 };
        let class_bonus = if call.remote_class_name != "RemoteRef" { 0.18 } else { 0.0 };
        let repeat_bonus = (matching / total) * 0.30;
        let volume_bonus = (total.min(10.0) / 10.0) * 0.14;
        let sig = &call.arg_signature;
        let type_quality_bonus: f32 = if sig == "{}" || sig.is_empty() {
            0.0
        } else {
            let known = sig.matches(|c: char| c.is_ascii_uppercase()).count() as f32;
            (known / sig.len() as f32).min(0.08)
        };
        let base = if call.remote_class_name == "RemoteRef" { 0.22 } else { 0.40 };
        call.confidence = (base + resolved_bonus + class_bonus + repeat_bonus + volume_bonus + type_quality_bonus).clamp(0.05, 0.99);
    }

    for node in &mut nodes {
        if let Some(events) = node_remote_events.remove(&node.id) {
            let mut seen = HashSet::new();
            node.remote_events = events.into_iter().filter(|e| seen.insert(e.clone())).collect();
        }
        node.score += node.exports.len() * 2
            + node.config_keys.len()
            + node.remote_events.len() * 3
            + edges.iter().filter(|e| e.from == node.id || e.to == node.id).count();
    }

    let mut system_map: HashMap<String, LogicWebSystem> = HashMap::new();
    for node in &nodes {
        let system = system_map.entry(node.system_id.clone()).or_insert_with(|| LogicWebSystem {
            id: node.system_id.clone(),
            name: capitalize_words(node.system_id.strip_prefix("system:").unwrap_or(&node.system_id)),
            node_ids: Vec::new(),
            script_count: 0,
            remote_count: 0,
            edge_count: 0,
        });
        system.node_ids.push(node.id.clone());
        if roblox_api::is_script_class(&node.class_name) { system.script_count += 1; }
        if node.kind.contains("Remote") { system.remote_count += 1; }
    }
    for edge in &edges {
        if let Some(from_node) = nodes.iter().find(|n| n.id == edge.from) {
            if let Some(system) = system_map.get_mut(&from_node.system_id) {
                system.edge_count += 1;
            }
        }
    }

    let mut systems: Vec<LogicWebSystem> = system_map.into_values().collect();
    systems.sort_by(|a, b| b.script_count.cmp(&a.script_count).then_with(|| b.edge_count.cmp(&a.edge_count)).then_with(|| a.name.cmp(&b.name)));
    nodes.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.path.cmp(&b.path)));

    let generated_at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);

    emit_progress(
        app,
        progress_id,
        snapshot_path,
        "done",
        "Logic web ready",
        1.0,
        script_records.len(),
        script_records.len(),
    );

    LogicWeb {
        version: LOGIC_WEB_VERSION,
        generated_at,
        source_len,
        source_modified_ms,
        summary: LogicWebSummary {
            script_count: script_records.len(),
            module_count,
            local_script_count,
            server_script_count,
            remote_count: remote_path_to_node.len(),
            config_count,
            edge_count: edges.len(),
        },
        systems,
        nodes,
        edges,
        remote_calls,
    }
}