use std::collections::{HashMap, HashSet};

use regex::Regex;

use super::roblox_api;
use super::regex_cache::cached_regex;

#[derive(Debug, Clone)]
pub struct LuaFunctionRange {
    pub name: String,
    pub params: Vec<String>,
    pub body_start: usize,
    pub body_end: usize,
}

pub fn lua_param_list(params: &str) -> Vec<String> {
    params
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty() && *p != "...")
        .map(ToOwned::to_owned)
        .collect()
}

pub fn source_line_at(source: &str, byte_index: usize) -> usize {
    source[..byte_index.min(source.len())]
        .bytes()
        .filter(|b| *b == b'\n')
        .count()
        + 1
}

pub fn find_matching_paren(source: &str, open_index: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut depth = 0i32;
    let mut i = open_index;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        match b {
            b'\'' | b'"' => quote = Some(b),
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

pub fn split_lua_args(args: &str) -> Vec<String> {
    let bytes = args.as_bytes();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut paren = 0i32;
    let mut brace = 0i32;
    let mut bracket = 0i32;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    let mut i = 0usize;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = quote {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        match b {
            b'\'' | b'"' => quote = Some(b),
            b'(' => paren += 1,
            b')' => paren -= 1,
            b'{' => brace += 1,
            b'}' => brace -= 1,
            b'[' => bracket += 1,
            b']' => bracket -= 1,
            b',' if paren == 0 && brace == 0 && bracket == 0 => {
                let arg = args[start..i].trim();
                if !arg.is_empty() {
                    out.push(arg.to_string());
                }
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    let tail = args[start..].trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

fn skip_lua_quoted(source: &str, mut index: usize, quote: u8) -> usize {
    let bytes = source.as_bytes();
    let mut escaped = false;
    index += 1;
    while index < bytes.len() {
        let b = bytes[index];
        if escaped {
            escaped = false;
        } else if b == b'\\' {
            escaped = true;
        } else if b == quote {
            return index + 1;
        }
        index += 1;
    }
    bytes.len()
}

fn skip_lua_long_bracket(source: &str, index: usize) -> Option<usize> {
    let rest = source.get(index..)?;
    if !rest.starts_with("[[") {
        return None;
    }
    rest.get(2..)
        .and_then(|tail| tail.find("]]"))
        .map(|end| index + 2 + end + 2)
}

fn next_lua_code_token(source: &str, mut index: usize) -> Option<(&str, usize, usize)> {
    let bytes = source.as_bytes();
    while index < bytes.len() {
        let b = bytes[index];
        if b == b'\'' || b == b'"' {
            index = skip_lua_quoted(source, index, b);
            continue;
        }
        if b == b'[' {
            if let Some(end) = skip_lua_long_bracket(source, index) {
                index = end;
                continue;
            }
        }
        if b == b'-' && bytes.get(index + 1) == Some(&b'-') {
            if let Some(end) = skip_lua_long_bracket(source, index + 2) {
                index = end;
            } else {
                index = source[index..]
                    .find('\n')
                    .map(|offset| index + offset + 1)
                    .unwrap_or(bytes.len());
            }
            continue;
        }
        if b == b'_' || b.is_ascii_alphabetic() {
            let start = index;
            index += 1;
            while index < bytes.len()
                && (bytes[index] == b'_' || bytes[index].is_ascii_alphanumeric())
            {
                index += 1;
            }
            return source.get(start..index).map(|token| (token, start, index));
        }
        index += 1;
    }
    None
}

fn find_lua_function_body_end(source: &str, body_start: usize) -> Option<usize> {
    let mut depth = 1i32;
    let mut index = body_start;
    let mut pending_loop_do = false;
    while let Some((token, start, end)) = next_lua_code_token(source, index) {
        match token {
            "function" | "if" | "repeat" => depth += 1,
            "for" | "while" => {
                depth += 1;
                pending_loop_do = true;
            }
            "do" => {
                if pending_loop_do {
                    pending_loop_do = false;
                } else {
                    depth += 1;
                }
            }
            "end" | "until" => {
                depth -= 1;
                if depth == 0 {
                    return Some(start);
                }
            }
            _ => {}
        }
        index = end;
    }
    None
}

pub fn lua_function_ranges(source: &str) -> Vec<LuaFunctionRange> {
    let mut ranges = Vec::new();
    let mut seen_starts = HashSet::new();
    let patterns = [
        r#"(?m)\blocal\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)"#,
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\s*\(([^)]*)\)"#,
        r#"(?m)\bfunction\s+(?:[A-Za-z_][A-Za-z0-9_.]*[.:])?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)"#,
    ];
    for pattern in patterns {
        for cap in cached_regex(pattern).captures_iter(source) {
            let Some(full) = cap.get(0) else { continue };
            if !seen_starts.insert(full.start()) {
                continue;
            }
            let Some(name) = cap.get(1).map(|m| m.as_str().to_string()) else { continue };
            let params = cap.get(2).map(|m| lua_param_list(m.as_str())).unwrap_or_default();
            let body_start = full.end();
            let body_end = find_lua_function_body_end(source, body_start).unwrap_or(source.len());
            if body_end > body_start {
                ranges.push(LuaFunctionRange { name, params, body_start, body_end });
            }
        }
    }
    ranges.sort_by_key(|r| r.body_start);
    ranges
}

pub fn strip_outer_parens(expr: &str) -> &str {
    let mut value = expr.trim();
    loop {
        if !value.starts_with('(') || !value.ends_with(')') {
            return value;
        }
        let bytes = value.as_bytes();
        let mut depth = 0i32;
        let mut closes_at_end = false;
        for (i, &b) in bytes.iter().enumerate() {
            match b {
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        closes_at_end = i == bytes.len() - 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        if !closes_at_end {
            return value;
        }
        value = value[1..value.len() - 1].trim();
    }
}

pub fn service_vars(source: &str) -> HashMap<String, String> {
    let mut vars = HashMap::new();

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*game:GetService\s*\(\s*["']([^"']+)["']\s*\)"#,
    )
    .captures_iter(source)
    {
        if let (Some(var), Some(svc)) = (cap.get(1), cap.get(2)) {
            vars.insert(var.as_str().to_string(), svc.as_str().to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*game\.Players\.LocalPlayer\b"#,
    )
    .captures_iter(source)
    {
        if let Some(var) = cap.get(1) {
            vars.insert(var.as_str().to_string(), "Player".to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*game\.Players\b"#,
    )
    .captures_iter(source)
    {
        if let Some(var) = cap.get(1) {
            vars.insert(var.as_str().to_string(), "Players".to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:workspace|game\.Workspace)\.CurrentCamera\b"#,
    )
    .captures_iter(source)
    {
        if let Some(var) = cap.get(1) {
            vars.insert(var.as_str().to_string(), "Camera".to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:game\.Workspace|workspace)\b"#,
    )
    .captures_iter(source)
    {
        if let Some(var) = cap.get(1) {
            vars.insert(var.as_str().to_string(), "Workspace".to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z][A-Za-z0-9]*)\.new\s*\("#,
    )
    .captures_iter(source)
    {
        if let (Some(var), Some(class)) = (cap.get(1), cap.get(2)) {
            if let Some(ty) = roblox_api::new_call_type(class.as_str()) {
                vars.insert(var.as_str().to_string(), ty.to_string());
            }
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\.Character\b"#,
    )
    .captures_iter(source)
    {
        if let (Some(var), Some(src)) = (cap.get(1), cap.get(2)) {
            if vars.get(src.as_str()).map(|t| t == "Player").unwrap_or(false) {
                vars.insert(var.as_str().to_string(), "Model".to_string());
            }
        }
    }

    vars
}

pub fn require_vars(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*require\s*\(\s*([^\n\r]+?)\s*\)"#,
    )
    .captures_iter(source)
    {
        let Some(var) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(expr) = cap.get(2).map(|m| m.as_str()) else { continue };
        if let Some(path) = resolve_require_path(expr, current_path, base_vars) {
            out.insert(var.to_string(), path);
        }
    }
    out
}

pub fn instance_vars(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut vars = base_vars.clone();
    for _ in 0..4 {
        let mut changed = false;
        for cap in cached_regex(r#"(?m)\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#)
            .captures_iter(source)
        {
            let Some(var) = cap.get(1).map(|m| m.as_str()) else { continue };
            let Some(raw_expr) = cap.get(2).map(|m| m.as_str().trim()) else { continue };
            if matches!(var, "if" | "for" | "while" | "return" | "local") {
                continue;
            }
            if raw_expr.starts_with("require")
                || raw_expr.starts_with("function")
                || raw_expr.starts_with('{')
                || raw_expr.starts_with("nil")
                || raw_expr.starts_with("true")
                || raw_expr.starts_with("false")
            {
                continue;
            }
            let expr = raw_expr
                .split("--")
                .next()
                .unwrap_or(raw_expr)
                .trim()
                .trim_end_matches(';')
                .trim();
            if let Some(path) = resolve_require_path(expr, current_path, &vars) {
                if vars.get(var) != Some(&path) {
                    vars.insert(var.to_string(), path);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    vars
}

pub fn normalize_roblox_path(path: String) -> String {
    let mut value = path;
    while value.starts_with("game.game.") {
        value = value.replacen("game.game.", "game.", 1);
    }
    value
}

pub fn normalize_lua_instance_expr(expr: &str) -> String {
    let mut value = expr.trim().trim_end_matches(';').trim().to_string();
    for method in ["WaitForChild", "FindFirstChild", "FindFirstChildWhichIsA", "FindFirstChildOfClass"] {
        let pattern = format!(r#"[:.]{}\s*\(\s*["']([^"']+)["']\s*\)"#, method);
        value = cached_regex(&pattern).replace_all(&value, ".$1").to_string();
    }
    value = cached_regex(r#"\[\s*["']([^"']+)["']\s*\]"#)
        .replace_all(&value, ".$1")
        .to_string();
    value = value.replace(['"', '\''], "");
    value
        .split('.')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty()
                || matches!(
                    trimmed,
                    "WaitForChild" | "FindFirstChild" | "FindFirstChildWhichIsA" | "FindFirstChildOfClass"
                )
            {
                None
            } else {
                Some(trimmed)
            }
        })
        .collect::<Vec<_>>()
        .join(".")
}

pub fn resolve_require_path(
    expr: &str,
    current_path: &str,
    services: &HashMap<String, String>,
) -> Option<String> {
    let value = normalize_lua_instance_expr(expr);
    if value.starts_with("game.") {
        return Some(normalize_roblox_path(value));
    }
    if value == "script" {
        return Some(normalize_roblox_path(current_path.to_string()));
    }
    if let Some(rest) = value.strip_prefix("script.") {
        let mut base = normalize_roblox_path(current_path.to_string());
        let mut remaining = rest;
        while let Some(next) = remaining.strip_prefix("Parent") {
            base = parent_roblox_path(&base);
            remaining = next.strip_prefix('.').unwrap_or(next);
        }
        if remaining.is_empty() {
            return Some(normalize_roblox_path(base));
        }
        return Some(normalize_roblox_path(format!("{base}.{remaining}")));
    }
    if let Some((head, tail)) = value.split_once('.') {
        if let Some(service) = services.get(head) {
            return Some(normalize_roblox_path(format!("game.{service}.{tail}")));
        }
    } else if let Some(service) = services.get(&value) {
        return Some(normalize_roblox_path(format!("game.{service}")));
    }
    None
}

pub fn parent_roblox_path(path: &str) -> String {
    path.rsplit_once('.')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_else(|| "game".to_string())
}

pub fn infer_literal_type(value: &str) -> &'static str {
    let v = value.trim();
    if v.eq_ignore_ascii_case("nil") {
        return "nil";
    }
    if v == "true" || v == "false" {
        return "boolean";
    }
    if v.starts_with('"') || v.starts_with('\'') || v.starts_with("[[") {
        return "string";
    }
    if cached_regex(r#"^-?\d+(?:\.\d+)?$"#).is_match(v) {
        return "number";
    }
    if v.starts_with("function") {
        return "Function";
    }
    if v.starts_with('{') {
        return "table";
    }
    if v.contains(":GetChildren(") || v.contains(":GetDescendants(") {
        return "Instance[]";
    }
    if v.contains(":WaitForChild(")
        || v.contains(":FindFirstChild(")
        || v.contains(":FindFirstChildOfClass(")
        || v.contains(":FindFirstChildWhichIsA(")
    {
        return "Instance";
    }
    if v.contains(":GetPivot(") || v.contains(":ToWorldSpace(") || v.contains(":ToObjectSpace(") {
        return "CFrame";
    }
    if v.contains(":GetAttributes(") {
        return "table";
    }
    "unknown"
}

pub fn infer_expr_type(
    expr: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> String {
    let value = expr.trim();

    if let Some(known) = local_types.get(value) {
        return known.clone();
    }

    if cached_regex(r#"^(?:v_[a-z]_\d+|v\d+|p\d+|a\d+|l_\d+|_\d+)$"#).is_match(value) {
        return local_types.get(value).cloned().unwrap_or_else(|| "unknown".to_string());
    }

    if let Some(and_pos) = value.find(" and ") {
        let after_and = value[and_pos + 5..].trim();
        if let Some(or_pos) = after_and.find(" or ") {
            let truthy = after_and[..or_pos].trim();
            let falsy = after_and[or_pos + 4..].trim();
            let ty_t = infer_expr_type(truthy, local_types, module_vars, module_fn_returns);
            let ty_f = infer_expr_type(falsy, local_types, module_vars, module_fn_returns);
            let rank = |t: &str| match t { "unknown" => 0, "nil" => 1, "boolean" => 2, "string" | "number" => 3, _ => 4 };
            if rank(&ty_t) >= rank(&ty_f) && ty_t != "unknown" { return ty_t; }
            if ty_f != "unknown" { return ty_f; }
        }
    }

    if !value.starts_with('{') && !value.contains("and ") {
        if let Some(or_pos) = value.find(" or ") {
            let lhs = &value[..or_pos];
            let rhs = &value[or_pos + 4..];
            let ty_l = infer_expr_type(lhs, local_types, module_vars, module_fn_returns);
            let ty_r = infer_expr_type(rhs, local_types, module_vars, module_fn_returns);
            let rank = |t: &str| if t == "unknown" { 0 } else { 1 };
            if rank(&ty_l) >= rank(&ty_r) && ty_l != "unknown" { return ty_l; }
            if ty_r != "unknown" { return ty_r; }
        }
    }

    if value.starts_with('{') && value.ends_with('}') {
        return inspect_table_literal(value, local_types, module_vars, module_fn_returns);
    }

    if let Some(ty) = roblox_api::constructor_type(value) {
        return ty.to_string();
    }

    if value.contains('.') && !value.contains('(') {
        let parts: Vec<&str> = value.splitn(3, '.').collect();
        if parts.len() >= 2 {
            let obj_ty = local_types.get(parts[0]).map(|s| s.as_str()).unwrap_or("");
            if !obj_ty.is_empty() {
                let prop = parts[1];
                if parts.len() == 3 {
                    if let Some(mid) = roblox_api::property_type(obj_ty, prop) {
                        if let Some(ty) = roblox_api::property_type(mid, parts[2]) {
                            return ty.to_string();
                        }
                    }
                } else if let Some(ty) = roblox_api::property_type(obj_ty, prop) {
                    return ty.to_string();
                }
            }
        }
    }

    if let Some(colon_pos) = value.find(':') {
        let obj = &value[..colon_pos];
        let rest = &value[colon_pos + 1..];
        let method = rest.split('(').next().unwrap_or("").trim();
        let obj_type = local_types.get(obj).map(|s| s.as_str()).unwrap_or(obj);

        if matches!(
            method,
            "FindFirstAncestorOfClass" | "FindFirstAncestorWhichIsA" | "WaitForChild"
                | "FindFirstChild" | "FindFirstChildOfClass" | "FindFirstChildWhichIsA"
        ) {
            if let Some(class_name) = cached_regex(r#"["']([A-Za-z][A-Za-z0-9]*)["']"#)
                .captures(rest)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str())
            {
                return class_name.to_string();
            }
        }

        if let Some(ty) = roblox_api::method_return_type_str(method, obj_type) {
            return ty;
        }
    }

    if let Some(cap) = cached_regex(r#"^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\("#)
        .captures(value)
    {
        let mod_var = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let fn_name = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        if let Some(mod_path) = module_vars.get(mod_var) {
            let key = format!("{}.{}", mod_path.to_ascii_lowercase(), fn_name);
            if let Some(ret_ty) = module_fn_returns.get(&key) {
                return ret_ty.clone();
            }
        }
    }

    infer_literal_type(value).to_string()
}

pub fn inspect_table_literal(
    literal: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> String {
    let inner = literal.trim();
    let inner = if inner.starts_with('{') && inner.ends_with('}') {
        &inner[1..inner.len() - 1]
    } else {
        return "table".to_string();
    };
    let parts = split_lua_args(inner.trim());
    if parts.is_empty() {
        return "table{}".to_string();
    }
    if parts.iter().any(|p| {
        let t = p.trim();
        t.contains('=') && !t.starts_with('{')
    }) {
        let field_types: Vec<String> = parts
            .iter()
            .filter_map(|p| {
                let (_, rhs) = p.trim().split_once('=')?;
                let ty = infer_expr_type(rhs.trim(), local_types, module_vars, module_fn_returns);
                if ty == "unknown" { None } else { Some(ty) }
            })
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        return if field_types.is_empty() {
            "table".to_string()
        } else {
            format!("table<{}>", field_types.join("|"))
        };
    }
    let types: Vec<String> = parts
        .iter()
        .map(|p| {
            let t = infer_expr_type(p.trim(), local_types, module_vars, module_fn_returns);
            if t == "unknown" { "?".to_string() } else { t }
        })
        .collect();
    let unique: HashSet<&str> = types.iter().map(|s| s.as_str()).collect();
    if unique.len() == 1 && !unique.contains("?") {
        format!("{}[]", types[0])
    } else {
        format!("{{{}}}", types.join(", "))
    }
}

pub fn describe_typed_arg(
    raw: &str,
    resolved_type: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> String {
    let is_opaque = cached_regex(r#"^(?:v_[a-z]_\d+|v\d+|p\d+|a\d+|l_\d+|_\d+)$"#).is_match(raw.trim());
    if is_opaque {
        return resolved_type.to_string();
    }
    if resolved_type != "unknown" && resolved_type != "table" {
        let short = raw.trim().split('.').last().unwrap_or(raw.trim());
        if short.len() <= 24 {
            return format!("{}: {}", short, resolved_type);
        }
        return resolved_type.to_string();
    }
    if raw.trim().starts_with('{') {
        return inspect_table_literal(raw.trim(), local_types, module_vars, module_fn_returns);
    }
    raw.trim().to_string()
}

pub fn local_value_types(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut types: HashMap<String, String> = HashMap::new();
    let module_vars = require_vars(source, current_path, base_vars);

    for cap in cached_regex(r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#)
        .captures_iter(source)
    {
        let Some(var) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(raw) = cap.get(2).map(|m| m.as_str()) else { continue };
        if matches!(var, "if" | "for" | "while" | "return" | "local") { continue }
        let expr = raw.split("--").next().unwrap_or(raw).trim().trim_end_matches(';').trim();
        let seed = infer_literal_type(expr);
        if seed != "unknown" {
            types.insert(var.to_string(), seed.to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*game:GetService\s*\(\s*["']([^"']+)["']\s*\)"#,
    )
    .captures_iter(source)
    {
        if let (Some(var), Some(svc)) = (cap.get(1), cap.get(2)) {
            types.insert(var.as_str().to_string(), svc.as_str().to_string());
        }
    }

    for cap in cached_regex(
        r#"(?m)\.\s*(\w+)\s*:\s*(?:Connect|Once)\s*\(\s*function\s*\(([^)]*)\)"#,
    )
    .captures_iter(source)
    {
        let Some(event_name) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(params_str) = cap.get(2).map(|m| m.as_str()) else { continue };
        let is_server_event = matches!(event_name, "OnServerEvent" | "OnServerInvoke");
        let params: Vec<&str> = params_str.split(',').map(str::trim).filter(|p| !p.is_empty()).collect();
        if params.is_empty() { continue }
        let receiver_class = cap.get(0).and_then(|m| {
            let before = &source[..m.start()];
            let var = before.trim_end().rsplit('.').nth(1)
                .or_else(|| before.trim_end().rsplit_once(' ').map(|(_, r)| r))
                .unwrap_or("").trim();
            types.get(var).cloned()
        }).unwrap_or_default();

        let api_params = roblox_api::event_param_types(&receiver_class, event_name);

        for (i, param) in params.iter().enumerate() {
            if param.is_empty() || types.contains_key(*param) { continue }
            let seeded = api_params.as_ref()
                .and_then(|ap| ap.get(i).map(|t| t.as_str().to_string()))
                .or_else(|| infer_param_type_from_name(param).map(|t| t.to_string()))
                .or_else(|| if i == 0 && is_server_event { Some("Player".to_string()) } else { None });
            if let Some(ty) = seeded {
                types.insert(param.to_string(), ty);
            }
        }
    }

    apply_type_narrowing(source, &mut types);

    let func_params = named_function_params(source);
    seed_function_call_arg_types(source, &func_params, &types.clone(), &module_vars, module_fn_returns, &mut types);

    let local_fn_returns = build_local_function_returns(source, &types, &module_vars, module_fn_returns);
    for cap in cached_regex(
        r#"(?m)\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*[^)]*\s*\)\s*\)?"#,
    )
    .captures_iter(source)
    {
        let Some(var) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(fn_name) = cap.get(2).map(|m| m.as_str()) else { continue };
        if types.contains_key(var) { continue }
        if let Some(ret_ty) = local_fn_returns.get(fn_name) {
            types.insert(var.to_string(), ret_ty.clone());
        }
    }

    for _ in 0..12 {
        let mut changed = false;
        let snapshot = types.clone();

        for cap in cached_regex(r#"(?m)\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#)
            .captures_iter(source)
        {
            let Some(var) = cap.get(1).map(|m| m.as_str()) else { continue };
            let Some(raw_expr) = cap.get(2).map(|m| m.as_str()) else { continue };
            if matches!(var, "if" | "for" | "while" | "return" | "local" | "end" | "then" | "do" | "not" | "and" | "or") { continue }
            let expr = raw_expr.split("--").next().unwrap_or(raw_expr).trim().trim_end_matches(';').trim();
            if expr.is_empty() { continue }

            let inferred = if let Some(dot_pos) = expr
                .rfind('.')
                .filter(|&i| !expr[i + 1..].contains('(') && !expr[i + 1..].contains(' '))
            {
                let base = expr[..dot_pos].trim();
                let field = expr[dot_pos + 1..].trim();
                let base_ty = snapshot.get(base).map(|s| s.as_str()).unwrap_or("");
                if !base_ty.is_empty() {
                    roblox_api::property_type_str(base_ty, field)
                        .unwrap_or_else(|| infer_expr_type(expr, &snapshot, &module_vars, module_fn_returns))
                } else {
                    infer_expr_type(expr, &snapshot, &module_vars, module_fn_returns)
                }
            } else {
                infer_expr_type(expr, &snapshot, &module_vars, module_fn_returns)
            };

            if inferred != "unknown" && snapshot.get(var).map(|t| t.as_str()) != Some(inferred.as_str()) {
                types.insert(var.to_string(), inferred);
                changed = true;
            }
        }

        for (vars, rhs) in multi_assign_vars(source) {
            if rhs.contains("pcall(") || rhs.contains("xpcall(") {
                if let Some(v) = vars.first() {
                    if snapshot.get(v.as_str()).is_none() {
                        types.insert(v.clone(), "boolean".to_string());
                        changed = true;
                    }
                }
            }
            if rhs.contains(":find(") || rhs.contains("string.find(") || rhs.contains("string.match(") {
                for v in vars.iter().take(2) {
                    if snapshot.get(v.as_str()).is_none() {
                        types.insert(v.clone(), "number".to_string());
                        changed = true;
                    }
                }
            }
        }

        for var in snapshot.keys() {
            if snapshot.get(var).map(|t| t == "table" || t == "table{}").unwrap_or(false) {
                if let Some(shape) = infer_table_field_types(source, var, &snapshot, &module_vars, module_fn_returns) {
                    if snapshot.get(var).map(|t| t.as_str()) != Some(shape.as_str()) {
                        types.insert(var.clone(), shape);
                        changed = true;
                    }
                }
            }
        }

        if !changed { break }
    }
    types
}

pub fn infer_param_type_from_name(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "player" | "plr" | "plyr" => Some("Player"),
        "hit" | "part" | "basepart" | "touchedpart" => Some("BasePart"),
        "cframe" | "cf" | "cameracframe" | "targetcframe" => Some("CFrame"),
        "position" | "pos" | "origin" | "lookvector" | "targetpos" => Some("Vector3"),
        "tool" | "item" | "weapon" | "gun" => Some("Tool"),
        "character" | "char" => Some("Model"),
        "humanoid" | "hum" => Some("Humanoid"),
        "damage" | "health" | "amount" | "speed" | "distance" | "num" | "count" | "index" | "value" | "number" => Some("number"),
        "equipped" | "active" | "enabled" | "visible" | "success" | "dead" | "alive" | "bool" | "toggle" => Some("boolean"),
        "text" | "message" | "tag" | "key" | "reason" | "id" | "name" | "str" => Some("string"),
        _ => None,
    }
}

pub fn named_function_params(source: &str) -> HashMap<String, Vec<String>> {
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for function in lua_function_ranges(source) {
        if !function.params.is_empty() {
            out.insert(function.name, function.params);
        }
    }
    out
}

pub fn seed_function_call_arg_types(
    source: &str,
    func_params: &HashMap<String, Vec<String>>,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
    out: &mut HashMap<String, String>,
) {
    for (func_name, params) in func_params {
        let pattern = format!(
            r#"(?:[A-Za-z_][A-Za-z0-9_.]*[.:])?{}\s*\(([^)]*)\)"#,
            regex::escape(func_name)
        );
        let Ok(re) = Regex::new(&pattern) else { continue };
        for cap in re.captures_iter(source) {
            let Some(args_raw) = cap.get(1).map(|m| m.as_str()) else { continue };
            let args = split_lua_args(args_raw);
            for (i, param) in params.iter().enumerate() {
                if param.is_empty() || out.contains_key(param) { continue }
                let Some(arg) = args.get(i) else { continue };
                let ty = infer_expr_type(arg.trim(), local_types, module_vars, module_fn_returns);
                if ty != "unknown" {
                    out.insert(param.clone(), ty);
                }
            }
        }
    }
}

pub fn build_local_function_returns(
    source: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for function in lua_function_ranges(source) {
        if out.contains_key(&function.name) { continue }
        let body = &source[function.body_start..function.body_end];
        if let Some(ty) = infer_local_function_return(body, local_types, module_vars, module_fn_returns) {
            out.insert(function.name, ty);
        }
    }
    out
}

fn infer_local_function_return(
    body: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> Option<String> {
    let mut candidates: Vec<String> = Vec::new();
    for cap in cached_regex(r#"(?m)^\s*return\s+([^\n\r]+)"#).captures_iter(body) {
        let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
        if raw.is_empty() || raw == "nil" { continue }
        let ty = infer_expr_type(strip_outer_parens(raw), local_types, module_vars, module_fn_returns);
        if ty != "unknown" { candidates.push(ty); }
    }
    if candidates.is_empty() { return None; }
    let unique: HashSet<&str> = candidates.iter().map(|s| s.as_str()).collect();
    if unique.len() == 1 { return candidates.into_iter().next(); }
    let rank = |t: &str| -> u8 { match t { "unknown" => 0, "table" | "table{}" => 1, "nil" => 2, "string" | "number" | "boolean" => 3, _ => 4 } };
    candidates.sort_by(|a, b| rank(b).cmp(&rank(a)));
    candidates.into_iter().next()
}

pub fn module_function_returns(module_path: &str, source: &str) -> Vec<(String, String)> {
    let mut functions = Vec::new();
    for cap in cached_regex(
        r#"(?m)\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\("#,
    )
    .captures_iter(source)
    {
        let Some(start) = cap.get(0).map(|m| m.start()) else { continue };
        let Some(end) = cap.get(0).map(|m| m.end()) else { continue };
        let Some(name) = cap.get(2).map(|m| m.as_str().to_string()) else { continue };
        functions.push((start, end, name));
    }
    let mut out = Vec::new();
    for (index, (_start, body_start, name)) in functions.iter().enumerate() {
        let body_end = functions.get(index + 1).map(|(s, _, _)| *s).unwrap_or(source.len());
        let body = &source[*body_start..body_end];
        let Some(return_cap) = cached_regex(r#"(?m)^\s*return\s+([^\n\r,]+)"#).captures(body) else { continue };
        let first_return = return_cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let return_type = infer_module_return_type(body, first_return);
        if return_type != "unknown" {
            out.push((format!("{}.{}", module_path.to_ascii_lowercase(), name), return_type));
        }
    }
    out
}

fn infer_module_return_type(body: &str, first_return: &str) -> String {
    let value = strip_outer_parens(first_return.trim());
    if value.is_empty() { return "nil".to_string(); }
    if value.starts_with('"') || value.starts_with('\'') { return "string".to_string(); }
    if value == "true" || value == "false" { return "boolean".to_string(); }
    if cached_regex(r#"^-?\d+(?:\.\d+)?$"#).is_match(value) { return "number".to_string(); }
    if let Some(ty) = roblox_api::constructor_type(value) { return ty.to_string(); }
    if value.contains(":GetChildren(") || value.contains(":GetDescendants(") { return "Instance[]".to_string(); }
    if value.starts_with('{') {
        let inner = &value[1..value.len().saturating_sub(1)];
        if inner.is_empty() { return "table{}".to_string(); }
        if inner.contains("function") {
            return "Module".to_string();
        }
        return "table".to_string();
    }
    if let Some(var) = cached_regex(r#"^([A-Za-z_][A-Za-z0-9_]*)$"#)
        .captures(value)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
    {
        let table_insert_pat = format!(r#"table\.insert\s*\(\s*{}\s*,"#, regex::escape(var));
        if Regex::new(&table_insert_pat).map(|re| re.is_match(body)).unwrap_or(false) {
            return "table[]".to_string();
        }
        let assign_re = Regex::new(&format!(r#"(?m)\blocal\s+{}\s*=\s*([^\n\r]+)"#, regex::escape(var)));
        if let Ok(re) = assign_re {
            if let Some(cap) = re.captures(body) {
                let rhs = cap.get(1).map(|m| m.as_str()).unwrap_or("").split("--").next().unwrap_or("").trim().trim_end_matches(';').trim();
                let ty = infer_literal_type(rhs);
                if ty != "unknown" { return ty.to_string(); }
                if let Some(cty) = roblox_api::constructor_type(rhs) { return cty.to_string(); }
                if rhs.starts_with('{') { return "table".to_string(); }
            }
        }
    }
    infer_literal_type(value).to_string()
}

fn apply_type_narrowing(source: &str, types: &mut HashMap<String, String>) {
    for cap in cached_regex(r#"\btypeof\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*==\s*"([^"]+)""#)
        .captures_iter(source)
    {
        if let (Some(var), Some(ty)) = (cap.get(1), cap.get(2)) {
            types.entry(var.as_str().to_string()).or_insert_with(|| ty.as_str().to_string());
        }
    }
    for cap in cached_regex(r#"\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*IsA\s*\(\s*"([^"]+)"\s*\)"#)
        .captures_iter(source)
    {
        if let (Some(var), Some(ty)) = (cap.get(1), cap.get(2)) {
            types.entry(var.as_str().to_string()).or_insert_with(|| ty.as_str().to_string());
        }
    }
    for cap in cached_regex(r#"\btype\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*==\s*"([^"]+)""#)
        .captures_iter(source)
    {
        if let (Some(var), Some(ty)) = (cap.get(1), cap.get(2)) {
            types.entry(var.as_str().to_string()).or_insert_with(|| ty.as_str().to_string());
        }
    }
}

pub fn multi_assign_vars(source: &str) -> Vec<(Vec<String>, String)> {
    let mut out = Vec::new();
    for cap in cached_regex(
        r#"(?m)\blocal\s+((?:[A-Za-z_][A-Za-z0-9_]*\s*,\s*)+[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#,
    )
    .captures_iter(source)
    {
        let Some(vars_raw) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(rhs) = cap.get(2).map(|m| m.as_str().split("--").next().unwrap_or("").trim()) else { continue };
        let vars: Vec<String> = vars_raw.split(',').map(|v| v.trim().to_string()).collect();
        if vars.len() >= 2 { out.push((vars, rhs.to_string())); }
    }
    out
}

pub fn infer_table_field_types(
    source: &str,
    var: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_fn_returns: &HashMap<String, String>,
) -> Option<String> {
    let pattern = format!(r#"(?m)\b{}\s*[.]\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r;]+)"#, regex::escape(var));
    let Ok(re) = Regex::new(&pattern) else { return None };
    let mut fields: Vec<(String, String)> = Vec::new();
    for cap in re.captures_iter(source) {
        let Some(field) = cap.get(1).map(|m| m.as_str()) else { continue };
        let Some(rhs) = cap.get(2).map(|m| m.as_str().split("--").next().unwrap_or("").trim()) else { continue };
        let ty = infer_expr_type(rhs, local_types, module_vars, module_fn_returns);
        if ty != "unknown" { fields.push((field.to_string(), ty)); }
    }
    if fields.is_empty() { return None; }
    fields.dedup_by_key(|(k, _)| k.clone());
    fields.truncate(8);
    let inner = fields.iter().map(|(k, v)| format!("{k}: {v}")).collect::<Vec<_>>().join(", ");
    Some(format!("{{{{{inner}}}}}"))
}

pub fn capture_unique(source: &str, pattern: &str, group: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for cap in cached_regex(pattern).captures_iter(source) {
        let Some(value) = cap.get(group).map(|m| m.as_str().trim().to_string()) else { continue };
        if value.is_empty() || !seen.insert(value.clone()) { continue }
        out.push(value);
    }
    out
}

pub fn config_keys(source: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut seen = HashSet::new();
    for cap in cached_regex(r#"(?m)^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{"#).captures_iter(source) {
        let Some(key) = cap.get(1).map(|m| m.as_str()) else { continue };
        if matches!(key, "local" | "function" | "return") { continue }
        if seen.insert(key.to_string()) { keys.push(key.to_string()); }
        if keys.len() >= 40 { break }
    }
    keys
}

pub fn exported_symbols(source: &str, module_name: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let escaped = regex::escape(module_name);
    for pattern in [
        format!(r#"(?m)\bfunction\s+{}\s*[.:]\s*([A-Za-z_][A-Za-z0-9_]*)\s*\("#, escaped),
        format!(r#"(?m)\b{}\s*[.]\s*([A-Za-z_][A-Za-z0-9_]*)\s*="#, escaped),
    ] {
        if let Ok(re) = Regex::new(&pattern) {
            for cap in re.captures_iter(source) {
                let Some(name) = cap.get(1).map(|m| format!("{module_name}.{}", m.as_str())) else { continue };
                if seen.insert(name.clone()) { out.push(name); }
            }
        }
    }
    if out.is_empty() && cached_regex(r#"(?m)^\s*return\s+\{"#).is_match(source) {
        out.push("anonymous table".to_string());
    }
    out.truncate(48);
    out
}