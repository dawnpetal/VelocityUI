use std::collections::HashMap;

use super::lua_analysis::{
    self, find_matching_paren, infer_expr_type, infer_param_type_from_name,
    local_value_types, require_vars, split_lua_args, strip_outer_parens,
    build_local_function_returns, describe_typed_arg, source_line_at, lua_param_list,
};
use super::regex_cache::cached_regex;
use super::roblox_api;
use crate::commands::datatree::types::LogicWebRemoteCall;

#[derive(Debug, Clone)]
pub struct RemoteInvocation {
    pub target_expr: String,
    pub method: String,
    pub target_start: usize,
    pub args_raw: String,
}

pub fn extract_lua_receiver_before(source: &str, delimiter_index: usize) -> Option<(String, usize)> {
    let bytes = source.as_bytes();
    let mut index = delimiter_index.min(bytes.len());
    while index > 0 && bytes[index - 1].is_ascii_whitespace() {
        index -= 1;
    }
    let end = index;
    let mut paren_depth = 0i32;
    let mut bracket_depth = 0i32;
    while index > 0 {
        let b = bytes[index - 1];
        match b {
            b')' => paren_depth += 1,
            b'(' => { if paren_depth == 0 { break } paren_depth -= 1 }
            b']' => bracket_depth += 1,
            b'[' => { if bracket_depth == 0 { break } bracket_depth -= 1 }
            b'\n' | b'\r' | b'\t' | b' ' if paren_depth == 0 && bracket_depth == 0 => break,
            b'=' | b',' | b';' | b'{' if paren_depth == 0 && bracket_depth == 0 => break,
            _ => {}
        }
        index -= 1;
    }
    let receiver = source.get(index..end)?.trim();
    if receiver.is_empty() { None } else { Some((receiver.to_string(), index)) }
}

fn listener_callback_params(connect_args: &str) -> Vec<String> {
    cached_regex(r#"\bfunction\s*\(([^)]*)\)"#)
        .captures(connect_args)
        .and_then(|cap| cap.get(1))
        .map(|m| lua_param_list(m.as_str()))
        .unwrap_or_default()
}

pub fn remote_fire_invocations(source: &str) -> Vec<RemoteInvocation> {
    let mut out = Vec::new();
    for cap in cached_regex(
        r#":\s*(FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient)\s*\("#,
    )
    .captures_iter(source)
    {
        let Some(full) = cap.get(0) else { continue };
        let Some((target_expr, target_start)) = extract_lua_receiver_before(source, full.start()) else { continue };
        let method = cap.get(1).map(|m| m.as_str()).unwrap_or("Remote");
        let Some(open_index) = full.as_str().rfind('(').map(|offset| full.start() + offset) else { continue };
        let Some(close_index) = find_matching_paren(source, open_index) else { continue };
        out.push(RemoteInvocation {
            target_expr,
            method: method.to_string(),
            target_start,
            args_raw: source[open_index + 1..close_index].to_string(),
        });
    }
    out
}

pub fn remote_listener_invocations(source: &str) -> Vec<RemoteInvocation> {
    let mut out = Vec::new();

    for cap in cached_regex(
        r#"\.\s*(OnServerEvent|OnClientEvent|OnServerInvoke|OnClientInvoke|OnInvoke)\s*:\s*(?:Connect|Once)\s*\("#,
    )
    .captures_iter(source)
    {
        let Some(full) = cap.get(0) else { continue };
        let Some((target_expr, target_start)) = extract_lua_receiver_before(source, full.start()) else { continue };
        let method = cap.get(1).map(|m| m.as_str()).unwrap_or("OnClientEvent");
        let Some(open_index) = full.as_str().rfind('(').map(|offset| full.start() + offset) else { continue };
        let Some(close_index) = find_matching_paren(source, open_index) else { continue };
        let connect_args = &source[open_index + 1..close_index];
        out.push(RemoteInvocation {
            target_expr,
            method: method.to_string(),
            target_start,
            args_raw: listener_callback_params(connect_args).join(", "),
        });
    }

    for cap in cached_regex(
        r#"\.\s*(OnServerInvoke|OnClientInvoke|OnInvoke)\s*=\s*function\s*\(([^)]*)\)"#,
    )
    .captures_iter(source)
    {
        let Some(full) = cap.get(0) else { continue };
        let Some((target_expr, target_start)) = extract_lua_receiver_before(source, full.start()) else { continue };
        let method = cap.get(1).map(|m| m.as_str()).unwrap_or("OnInvoke");
        let params = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        out.push(RemoteInvocation {
            target_expr,
            method: method.to_string(),
            target_start,
            args_raw: lua_param_list(params).join(", "),
        });
    }

    out
}

pub fn resolve_remote_target_path(
    target_expr: &str,
    script_path: &str,
    vars: &HashMap<String, String>,
    remote_paths_by_name: &HashMap<String, String>,
) -> Option<String> {
    if let Some(path) = lua_analysis::resolve_require_path(target_expr, script_path, vars) {
        return Some(path);
    }
    let normalized = lua_analysis::normalize_lua_instance_expr(target_expr);
    let key = normalized.to_ascii_lowercase();
    if let Some(path) = remote_paths_by_name.get(&key) {
        return Some(path.clone());
    }
    let leaf = normalized.rsplit('.').next().unwrap_or(&normalized).to_ascii_lowercase();
    remote_paths_by_name.get(&leaf).cloned()
}

pub fn build_listener_param_index<F>(
    script_records: &[(String, String, String, Vec<String>)],
    module_fn_returns: &HashMap<String, String>,
    remote_paths_by_name: &HashMap<String, String>,
    mut on_progress: F,
) -> HashMap<String, Vec<String>>
where
    F: FnMut(usize, usize),
{
    let mut votes: HashMap<String, Vec<Vec<String>>> = HashMap::new();
    let total = script_records.len().max(1);

    for (index, (_id, script_path, source, _services)) in script_records.iter().enumerate() {
        if index == 0 || index + 1 == total || (index + 1) % 10 == 0 {
            on_progress(index + 1, total);
        }
        let base_vars = lua_analysis::service_vars(source);
        let inst_vars = lua_analysis::instance_vars(source, script_path, &base_vars);
        let local_types = local_value_types(source, script_path, &base_vars, module_fn_returns);

        for listener in remote_listener_invocations(source) {
            let params: Vec<String> = split_lua_args(&listener.args_raw);
            if params.is_empty() { continue }

            let remote_path = resolve_remote_target_path(
                &listener.target_expr,
                script_path,
                &inst_vars,
                remote_paths_by_name,
            )
            .unwrap_or_else(|| listener.target_expr.clone());
            let path_key = remote_path.to_ascii_lowercase();
            let name_key = remote_path.rsplit('.').next().unwrap_or(&listener.target_expr).to_ascii_lowercase();

            let typed_params: Vec<String> = params
                .iter()
                .map(|param| {
                    infer_param_type_from_name(param)
                        .map(|t| t.to_string())
                        .unwrap_or_else(|| {
                            local_types.get(param.as_str()).cloned().unwrap_or_else(|| "unknown".to_string())
                        })
                })
                .collect();

            for key in [path_key, name_key] {
                let position_votes = votes.entry(key).or_default();
                for (i, ty) in typed_params.iter().enumerate() {
                    while position_votes.len() <= i {
                        position_votes.push(Vec::new());
                    }
                    if ty != "unknown" {
                        position_votes[i].push(ty.clone());
                    }
                }
            }
        }
    }

    votes
        .into_iter()
        .map(|(key, positions)| {
            let resolved: Vec<String> = positions
                .iter()
                .map(|v| {
                    if v.is_empty() { return "unknown".to_string(); }
                    let mut counts: HashMap<&str, usize> = HashMap::new();
                    for t in v { *counts.entry(t.as_str()).or_insert(0) += 1; }
                    counts.into_iter().max_by_key(|(_, c)| *c).map(|(t, _)| t.to_string()).unwrap_or_else(|| "unknown".to_string())
                })
                .collect();
            (key, resolved)
        })
        .collect()
}

pub fn remote_calls_in_source(
    source: &str,
    script_id: &str,
    script_path: &str,
    vars: &HashMap<String, String>,
    remote_classes: &HashMap<String, String>,
    remote_paths_by_name: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
    listener_param_index: &HashMap<String, Vec<String>>,
) -> Vec<LogicWebRemoteCall> {
    let mut calls = Vec::new();
    let local_types = local_value_types(source, script_path, vars, module_fn_returns);
    let require_map = require_vars(source, script_path, vars);

    let mut push_call = |target_expr: &str, method: &str, target_start: usize, args_raw: &str| {
        let raw_args = split_lua_args(args_raw);
        let resolved = resolve_remote_target_path(target_expr, script_path, vars, remote_paths_by_name);
        let remote_path = resolved.clone().unwrap_or_else(|| target_expr.to_string());
        let remote_name = remote_path.rsplit('.').next().unwrap_or(target_expr).to_string();

        let local_fn_returns = build_local_function_returns(source, &local_types, &require_map, module_fn_returns);

        let mut args: Vec<String> = raw_args
            .iter()
            .map(|arg| {
                let a = strip_outer_parens(arg.trim());
                if let Some(cap) = cached_regex(r#"^([A-Za-z_][A-Za-z0-9_]*)\s*\("#).captures(a) {
                    let fn_name = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    if let Some(ret) = local_fn_returns.get(fn_name) {
                        return ret.clone();
                    }
                }
                infer_expr_type(a, &local_types, &require_map, module_fn_returns)
            })
            .collect();

        let remote_path_key = remote_path.to_ascii_lowercase();
        let remote_name_key = remote_name.to_ascii_lowercase();

        if let Some(listener_types) = listener_param_index
            .get(&remote_path_key)
            .or_else(|| listener_param_index.get(&remote_name_key))
        {
            let offset = if method == "FireServer" || method == "InvokeServer" { 1 } else { 0 };
            for (i, arg_ty) in args.iter_mut().enumerate() {
                if arg_ty == "unknown" {
                    if let Some(lt) = listener_types.get(i + offset).filter(|t| t.as_str() != "unknown") {
                        *arg_ty = lt.clone();
                    }
                }
            }
        }

        let arg_signature = format!("{{{}}}", args.join(", "));

        let described_args: Vec<String> = raw_args
            .iter()
            .zip(args.iter())
            .map(|(raw, ty)| describe_typed_arg(raw, ty, &local_types, &require_map, module_fn_returns))
            .collect();

        let evidence = if described_args.is_empty() {
            format!("{}:{}", remote_name, method)
        } else {
            format!("{}:{}({})", remote_name, method, described_args.join(", "))
        };

        let remote_class_name = remote_classes
            .get(&remote_path_key)
            .cloned()
            .unwrap_or_else(|| "RemoteRef".to_string());

        let base_confidence = if remote_class_name == "RemoteRef" { 0.22 } else { 0.40 };
        let line = source_line_at(source, target_start);

        calls.push(LogicWebRemoteCall {
            id: String::new(),
            remote_key: remote_path_key,
            remote_name,
            remote_path,
            remote_class_name,
            caller_id: script_id.to_string(),
            caller_path: script_path.to_string(),
            method: method.to_string(),
            direction: roblox_api::remote_direction(method).to_string(),
            args,
            arg_signature,
            evidence,
            line,
            confidence: base_confidence,
        });
    };

    for inv in remote_fire_invocations(source) {
        push_call(&inv.target_expr, &inv.method, inv.target_start, &inv.args_raw);
    }
    for inv in remote_listener_invocations(source) {
        push_call(&inv.target_expr, &inv.method, inv.target_start, &inv.args_raw);
    }

    calls
}