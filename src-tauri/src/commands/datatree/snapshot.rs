use std::borrow::Cow;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use quick_xml::{
    escape::unescape,
    events::{BytesStart, Event},
    Reader,
};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter};

use crate::commands::datatree::types::{
    DataTreeExplorerNode, DataTreeExplorerSnapshot, DataTreeNode, DataTreeSnapshot,
    TerrainCell,
};

const SNAPSHOT_CACHE_LIMIT: usize = 2;
const SNAPSHOT_READ_BUFFER_BYTES: usize = 1024 * 1024;
const XML_READ_BUFFER_BYTES: usize = 512 * 1024;
const XML_EVENT_BUFFER_BYTES: usize = 64 * 1024;
const PROGRESS_EMIT_BYTES_MIN: u64 = 1_500_000;
const IMPORT_PARSE_START: f64 = 0.03;
const IMPORT_PARSE_SPAN: f64 = 0.78;
const IMPORT_INDEX_PROGRESS: f64 = 0.84;
const IMPORT_WRITE_PROGRESS: f64 = 0.94;

pub struct CachedSnapshot {
    pub len: u64,
    pub modified_ms: u64,
    pub snapshot: Arc<DataTreeSnapshot>,
    pub node_index: HashMap<u32, usize>,
}

struct StackItem {
    node_index: usize,
}

struct PropCapture {
    name: String,
    tag: String,
    depth: usize,
    text: String,
}

fn capture_needs_raw_concat(capture: &PropCapture) -> bool {
    capture.tag.eq_ignore_ascii_case("BinaryString") || is_asset_property(&capture.name)
}

fn append_capture_text(capture: &mut PropCapture, text: String) {
    if text.is_empty() { return }
    if !capture.text.is_empty() && !capture_needs_raw_concat(capture) {
        capture.text.push(' ');
    }
    capture.text.push_str(&text);
}

fn emit_import_progress(
    app: Option<&AppHandle>,
    import_id: &Option<String>,
    phase: &str,
    message: &str,
    progress: f64,
    bytes_read: u64,
    total_bytes: u64,
    node_count: usize,
) {
    if let (Some(app), Some(import_id)) = (app, import_id) {
        let _ = app.emit(
            "datatree-import-progress",
            serde_json::json!({
                "importId": import_id,
                "phase": phase,
                "message": message,
                "progress": progress.clamp(0.0, 1.0),
                "bytesRead": bytes_read,
                "totalBytes": total_bytes,
                "nodeCount": node_count,
            }),
        );
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn file_modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata.modified().ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

static SNAPSHOT_CACHE: OnceLock<Mutex<HashMap<String, Arc<CachedSnapshot>>>> = OnceLock::new();

fn snapshot_cache() -> &'static Mutex<HashMap<String, Arc<CachedSnapshot>>> {
    SNAPSHOT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn snapshot_cache_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn snapshot_file_stamp(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok((metadata.len(), file_modified_ms(&metadata)))
}

fn build_node_index(snapshot: &DataTreeSnapshot) -> HashMap<u32, usize> {
    snapshot.nodes.iter().enumerate().map(|(i, n)| (n.id, i)).collect()
}

fn read_snapshot_from_disk(path: &Path) -> Result<DataTreeSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::with_capacity(SNAPSHOT_READ_BUFFER_BYTES, file);
    let mut snapshot: DataTreeSnapshot = serde_json::from_reader(reader).map_err(|e| e.to_string())?;
    normalize_snapshot(&mut snapshot);
    Ok(snapshot)
}

fn remember_snapshot(path: &Path, snapshot: DataTreeSnapshot) -> Result<Arc<CachedSnapshot>, String> {
    let (len, modified_ms) = snapshot_file_stamp(path)?;
    let snapshot = Arc::new(snapshot);
    let cached = Arc::new(CachedSnapshot {
        len,
        modified_ms,
        node_index: build_node_index(&snapshot),
        snapshot,
    });
    let key = snapshot_cache_key(path);
    if let Ok(mut cache) = snapshot_cache().lock() {
        cache.insert(key.clone(), Arc::clone(&cached));
        while cache.len() > SNAPSHOT_CACHE_LIMIT {
            let Some(evict_key) = cache.keys().find(|k| *k != &key).cloned() else { break };
            cache.remove(&evict_key);
        }
    }
    Ok(cached)
}

pub fn read_snapshot_cached(path: &Path) -> Result<Arc<CachedSnapshot>, String> {
    let (len, modified_ms) = snapshot_file_stamp(path)?;
    let key = snapshot_cache_key(path);
    if let Ok(cache) = snapshot_cache().lock() {
        if let Some(cached) = cache.get(&key) {
            if cached.len == len && cached.modified_ms == modified_ms {
                return Ok(Arc::clone(cached));
            }
        }
    }
    let snapshot = read_snapshot_from_disk(path)?;
    remember_snapshot(path, snapshot)
}

pub fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(SNAPSHOT_READ_BUFFER_BYTES, file);
    serde_json::to_writer(writer, value).map_err(|e| e.to_string())
}

pub fn explorer_snapshot_path(path: &Path) -> PathBuf {
    let mut sidecar = path.to_path_buf();
    sidecar.set_extension("explorer.json");
    sidecar
}

pub fn explorer_sidecar_is_fresh(snapshot_path: &Path, sidecar_path: &Path) -> bool {
    let Ok(snapshot_meta) = fs::metadata(snapshot_path) else { return false };
    let Ok(sidecar_meta) = fs::metadata(sidecar_path) else { return false };
    file_modified_ms(&sidecar_meta) >= file_modified_ms(&snapshot_meta)
}

pub fn read_explorer_sidecar(path: &Path) -> Result<DataTreeExplorerSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    serde_json::from_reader(BufReader::with_capacity(SNAPSHOT_READ_BUFFER_BYTES / 2, file))
        .map_err(|e| e.to_string())
}

fn attr_value(start: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    for attr in start.attributes().flatten() {
        if attr.key.as_ref() == key {
            return attr.unescape_value().ok().map(Cow::into_owned);
        }
    }
    None
}


fn text_from_event_text(text: quick_xml::events::BytesText<'_>) -> String {
    match text.decode() {
        Ok(decoded) => unescape(&decoded).map(Cow::into_owned).unwrap_or_else(|_| decoded.into_owned()),
        Err(_) => String::new(),
    }
}

fn text_from_cdata(cdata: quick_xml::events::BytesCData<'_>) -> String {
    cdata.decode().map(Cow::into_owned).unwrap_or_default()
}

fn remove_case_insensitive(map: &mut Map<String, Value>, key: &str) -> Option<(String, Value)> {
    if let Some(value) = map.remove(key) { return Some((key.to_string(), value)); }
    let found = map.keys().find(|k| k.eq_ignore_ascii_case(key)).cloned()?;
    let value = map.remove(&found)?;
    Some((found, value))
}

fn decode_attributes_value(value: &Value) -> Option<(Map<String, Value>, Map<String, Value>)> {
    let text = value.as_str()?;
    let raw = text.strip_prefix("Roblox AttributesSerialize BinaryString (raw, undecoded): ").unwrap_or(text);
    let decoded = decode_attributes_serialize(raw);
    if decoded.0.is_empty() && decoded.1.is_empty() { None } else { Some(decoded) }
}

fn merge_attributes_serialize(node: &mut DataTreeNode) {
    if let Some((key, value)) = remove_case_insensitive(&mut node.properties, "AttributesSerialize") {
        if let Some((decoded_attrs, decoded_types)) = decode_attributes_value(&value) {
            node.property_types.remove(&key);
            node.attributes.extend(decoded_attrs);
            node.attribute_types.extend(decoded_types);
        } else {
            node.properties.insert(key, value);
        }
    }
    if let Some((key, value)) = remove_case_insensitive(&mut node.attributes, "__raw_AttributesSerialize") {
        if let Some((decoded_attrs, decoded_types)) = decode_attributes_value(&value) {
            node.attribute_types.remove(&key);
            node.attributes.extend(decoded_attrs);
            node.attribute_types.extend(decoded_types);
        } else {
            node.attributes.insert(key, value);
        }
    }
}

fn normalize_snapshot(snapshot: &mut DataTreeSnapshot) {
    for node in snapshot.nodes.iter_mut() {
        merge_attributes_serialize(node);
    }
}

fn decode_attributes_serialize(base64_text: &str) -> (Map<String, Value>, Map<String, Value>) {
    let mut attrs: Map<String, Value> = Map::new();
    let mut types: Map<String, Value> = Map::new();

    let compact: String = base64_text.chars().filter(|c| !c.is_ascii_whitespace()).collect();
    let Ok(bytes) = BASE64_STANDARD.decode(compact.as_bytes()) else { return (attrs, types) };
    let b = &bytes;
    let len = b.len();
    if len < 4 { return (attrs, types) }

    macro_rules! need { ($pos:expr, $n:expr) => { if $pos + $n > len { return (attrs, types) } } }
    macro_rules! u8at  { ($pos:expr) => { b[$pos] } }
    macro_rules! i32le { ($pos:expr) => { i32::from_le_bytes([b[$pos], b[$pos+1], b[$pos+2], b[$pos+3]]) } }
    macro_rules! i64le { ($pos:expr) => { i64::from_le_bytes(b[$pos..$pos+8].try_into().unwrap()) } }
    macro_rules! f32le { ($pos:expr) => { f32::from_le_bytes([b[$pos], b[$pos+1], b[$pos+2], b[$pos+3]]) } }
    macro_rules! f64le { ($pos:expr) => { f64::from_le_bytes(b[$pos..$pos+8].try_into().unwrap()) } }

    let count = u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize;
    let mut pos = 4usize;

    for _ in 0..count {
        need!(pos, 4);
        let name_len = u32::from_le_bytes([b[pos], b[pos+1], b[pos+2], b[pos+3]]) as usize;
        pos += 4;
        need!(pos, name_len);
        let name = match std::str::from_utf8(&b[pos..pos + name_len]) {
            Ok(s) => s.to_string(),
            Err(_) => break,
        };
        pos += name_len;
        need!(pos, 1);
        let type_id = u8at!(pos);
        pos += 1;

        let (type_str, value): (&str, Value) = match type_id {
            0x02 => { need!(pos, 4); let slen = u32::from_le_bytes([b[pos], b[pos+1], b[pos+2], b[pos+3]]) as usize; pos += 4; need!(pos, slen); let s = String::from_utf8_lossy(&b[pos..pos+slen]).into_owned(); pos += slen; ("string", Value::String(s)) }
            0x03 => { need!(pos, 1); let v = u8at!(pos) != 0; pos += 1; ("bool", Value::Bool(v)) }
            0x05 => { need!(pos, 4); let v = f32le!(pos); pos += 4; let n = serde_json::Number::from_f64(v as f64).unwrap_or_else(|| serde_json::Number::from(0)); ("float", Value::Number(n)) }
            0x06 => { need!(pos, 8); let v = f64le!(pos); pos += 8; let n = serde_json::Number::from_f64(v).unwrap_or_else(|| serde_json::Number::from(0)); ("double", Value::Number(n)) }
            0x07 => { need!(pos, 8); let scale = f32le!(pos); let offset = i32le!(pos+4); pos += 8; ("UDim", Value::String(format!("{scale}, {offset}"))) }
            0x08 => { need!(pos, 16); let xs = f32le!(pos); let xo = i32le!(pos+4); let ys = f32le!(pos+8); let yo = i32le!(pos+12); pos += 16; ("UDim2", Value::String(format!("{{{xs}, {xo}}}, {{{ys}, {yo}}}"))) }
            0x09 => { need!(pos, 4); let v = u32::from_le_bytes([b[pos], b[pos+1], b[pos+2], b[pos+3]]); pos += 4; ("BrickColor", Value::Number(v.into())) }
            0x0E => { need!(pos, 12); let r = (f32le!(pos) * 255.0).round() as u8; let g = (f32le!(pos+4) * 255.0).round() as u8; let bv = (f32le!(pos+8) * 255.0).round() as u8; pos += 12; ("Color3", Value::String(format!("{r} {g} {bv}"))) }
            0x10 => { need!(pos, 8); let x = f32le!(pos); let y = f32le!(pos+4); pos += 8; ("Vector2", Value::String(format!("{x} {y}"))) }
            0x11 => { need!(pos, 12); let x = f32le!(pos); let y = f32le!(pos+4); let z = f32le!(pos+8); pos += 12; ("Vector3", Value::String(format!("{x} {y} {z}"))) }
            0x13 => { need!(pos, 48); let vals: Vec<f32> = (0..12).map(|i| f32le!(pos + i * 4)).collect(); pos += 48; ("CFrame", Value::String(vals.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" "))) }
            0x3D => { need!(pos, 4); let v = i32le!(pos); pos += 4; ("int", Value::Number(v.into())) }
            0x3E => { need!(pos, 8); let v = i64le!(pos); pos += 8; ("int64", Value::Number(v.into())) }
            0x24 => { need!(pos, 8); let mn = f32le!(pos); let mx = f32le!(pos+4); pos += 8; ("NumberRange", Value::String(format!("{mn} {mx}"))) }
            _ => break,
        };
        types.insert(name.clone(), Value::String(type_str.to_string()));
        attrs.insert(name, value);
    }
    (attrs, types)
}

fn normalize_scalar(tag: &str, text: &str) -> Value {
    let trimmed = text.trim();
    match tag {
        "bool" => Value::Bool(trimmed.eq_ignore_ascii_case("true") || trimmed == "1"),
        "int" | "int64" | "float" | "double" | "token" => {
            if let Ok(v) = trimmed.parse::<i64>() { Value::Number(v.into()) }
            else if let Ok(v) = trimmed.parse::<f64>() { serde_json::Number::from_f64(v).map(Value::Number).unwrap_or_else(|| Value::String(trimmed.to_string())) }
            else { Value::String(trimmed.to_string()) }
        }
        _ => Value::String(trimmed.to_string()),
    }
}

fn is_asset_property(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.contains("mesh") || lower.contains("texture") || lower.contains("content")
        || lower.contains("image") || lower.contains("asset") || lower.contains("physics")
        || lower.contains("serialized") || lower.contains("modelmesh")
        || lower.contains("sound") || lower.contains("animation") || lower.contains("template")
}

fn is_script_property(key: &str, types: &Map<String, Value>) -> bool {
    matches!(types.get(key).and_then(Value::as_str), Some("ProtectedString") | Some("SharedString"))
}

fn is_heavy_snapshot_value(key: &str, value: &Value) -> bool {
    matches!(value, Value::String(text) if (is_asset_property(key) && text.len() > 512) || text.len() > 2048)
}

fn heavy_marker(len: usize) -> Value {
    Value::String(format!("__dt_heavy__:{len} bytes preserved in native snapshot"))
}



fn make_node_light(node: &mut DataTreeNode) {
    for key in node.properties.keys().cloned().collect::<Vec<_>>() {
        if is_script_property(&key, &node.property_types) { continue }
        if let Some(value) = node.properties.get_mut(&key) {
            if is_heavy_snapshot_value(&key, value) {
                if let Value::String(text) = value { *value = heavy_marker(text.len()); }
            }
        }
    }
    for key in node.attributes.keys().cloned().collect::<Vec<_>>() {
        if is_script_property(&key, &node.attribute_types) { continue }
        if let Some(value) = node.attributes.get_mut(&key) {
            if matches!(value, Value::String(t) if t.len() > 512) || is_heavy_snapshot_value(&key, value) {
                if let Value::String(text) = value { *value = heavy_marker(text.len()); }
            }
        }
    }
}

pub fn make_explorer_snapshot(snapshot: &DataTreeSnapshot) -> DataTreeExplorerSnapshot {
    let mut material_variant_nodes: Vec<DataTreeNode> = snapshot.nodes.iter()
        .filter(|n| n.class_name.eq_ignore_ascii_case("MaterialVariant"))
        .cloned()
        .collect();
    for node in material_variant_nodes.iter_mut() { make_node_light(node); }
    DataTreeExplorerSnapshot {
        id: snapshot.id.clone(),
        name: snapshot.name.clone(),
        source: snapshot.source.clone(),
        captured_at: snapshot.captured_at,
        completed_at: snapshot.completed_at,
        status: snapshot.status.clone(),
        nodes: snapshot.nodes.iter().map(|n| DataTreeExplorerNode {
            id: n.id, parent_id: n.parent_id, name: n.name.clone(),
            class_name: n.class_name.clone(), depth: n.depth, child_count: n.child_count,
        }).collect(),
        material_variant_nodes,
        node_count: snapshot.node_count,
        expanded_ids: snapshot.expanded_ids.clone(),
        active_node_id: snapshot.active_node_id,
        storage_path: snapshot.storage_path.clone(),
        source_path: snapshot.source_path.clone(),
        source_size: snapshot.source_size,
    }
}

pub fn make_render_snapshot(mut snapshot: DataTreeSnapshot, root_id: u32) -> DataTreeSnapshot {
    let mut by_parent: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, node) in snapshot.nodes.iter().enumerate() {
        by_parent.entry(node.parent_id.unwrap_or(0)).or_default().push(index);
    }
    let mut keep_indexes = Vec::new();
    if let Some(root_index) = snapshot.nodes.iter().position(|n| n.id == root_id) {
        let mut stack = vec![root_index];
        while let Some(index) = stack.pop() {
            keep_indexes.push(index);
            let node_id = snapshot.nodes[index].id;
            if let Some(children) = by_parent.get(&node_id) {
                for child in children.iter().rev() { stack.push(*child); }
            }
        }
    }
    for (index, node) in snapshot.nodes.iter().enumerate() {
        if crate::commands::datatree::logic::roblox_api::is_viewport_context_class(&node.class_name) {
            keep_indexes.push(index);
        }
    }
    keep_indexes.sort_unstable();
    keep_indexes.dedup();
    let blank = DataTreeNode {
        id: 0, parent_id: None, name: String::new(), class_name: String::new(),
        depth: 0, search_text: String::new(), child_count: 0,
        item_attributes: Map::new(), properties: Map::new(), property_types: Map::new(),
        attributes: Map::new(), attribute_types: Map::new(), tags: Vec::new(),
    };
    let mut nodes = Vec::with_capacity(keep_indexes.len());
    for index in keep_indexes {
        let mut node = std::mem::replace(&mut snapshot.nodes[index], blank.clone());
        make_node_light(&mut node);
        nodes.push(node);
    }
    snapshot.nodes = nodes;
    snapshot.node_count = snapshot.nodes.len();
    snapshot
}

fn snapshot_name(path: &Path) -> String {
    path.file_stem().unwrap_or_default().to_string_lossy().into_owned()
}



pub fn is_lua_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let first = chars.next();
    matches!(first, Some(c) if c == '_' || c.is_ascii_alphabetic())
        && chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

pub fn roblox_path_segment(name: &str) -> String {
    if is_lua_identifier(name) {
        name.to_string()
    } else {
        format!(r#"["{}"]"#, name.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

pub fn roblox_node_path(
    snapshot: &DataTreeSnapshot,
    node_index_in_vec: usize,
    index_map: &HashMap<u32, usize>,
) -> String {
    let mut path_parts = Vec::new();
    let mut current_index = node_index_in_vec;
    loop {
        let node = &snapshot.nodes[current_index];
        path_parts.push(roblox_path_segment(&node.name));
        match node.parent_id {
            None => break,
            Some(parent_id) => match index_map.get(&parent_id) {
                None => break,
                Some(&parent_index) => current_index = parent_index,
            },
        }
    }
    path_parts.reverse();
    format!("game.{}", path_parts.join("."))
}

pub fn script_source(node: &DataTreeNode) -> &str {
    let source_key = node.property_types.iter()
        .find(|(_, v)| matches!(v.as_str(), Some("ProtectedString") | Some("SharedString")))
        .and_then(|(k, _)| node.properties.get(k))
        .and_then(Value::as_str);
    source_key.unwrap_or("")
}



fn estimated_node_capacity(source_size: u64) -> usize {
    (source_size / 768).clamp(4_096, 262_144) as usize
}

pub fn decode_terrain_grid(raw: &str) -> Vec<TerrainCell> {
    let compact: String = raw.trim()
        .rsplit_once(',')
        .map(|(_, encoded)| encoded)
        .unwrap_or(raw)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect();
    if compact.len() < 10 { return Vec::new() }
    let Ok(bytes) = BASE64_STANDARD.decode(compact.as_bytes()) else { return Vec::new() };
    if bytes.len() < 6 { return Vec::new() }

    let x_size = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
    let y_size = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
    let z_size = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if x_size == 0 || y_size == 0 || z_size == 0 { return Vec::new() }

    let Some(voxel_count) = x_size.checked_mul(y_size).and_then(|c| c.checked_mul(z_size)) else { return Vec::new() };
    let Some(expected_len) = 6usize.checked_add(voxel_count * 3) else { return Vec::new() };
    if bytes.len() < expected_len { return Vec::new() }

    let mut cells = Vec::new();
    let mut offset = 6usize;
    for y in 0..y_size {
        for z in 0..z_size {
            for x in 0..x_size {
                let material = bytes[offset];
                let occupancy = bytes[offset + 1] as f32 / 255.0;
                offset += 3;
                if material != 0 && occupancy > 0.05 {
                    cells.push(TerrainCell { material, occupancy, x: x as u16, y: y as u16, z: z as u16 });
                }
            }
        }
    }
    cells
}

pub fn parse_rbxlx(
    app: Option<&AppHandle>,
    source_path: &Path,
    snapshot_id: String,
    storage_path: String,
    import_id: Option<String>,
) -> Result<DataTreeSnapshot, String> {
    let metadata = fs::metadata(source_path).map_err(|e| e.to_string())?;
    let total_bytes = metadata.len();
    let source_size = total_bytes;
    let captured_at = now_ms();

    emit_import_progress(app, &import_id, "parsing", "Reading file…", IMPORT_PARSE_START, 0, total_bytes, 0);

    let file = File::open(source_path).map_err(|e| e.to_string())?;
    let buf_reader = BufReader::with_capacity(XML_READ_BUFFER_BYTES, file);
    let mut reader = Reader::from_reader(buf_reader);
    reader.config_mut().trim_text(false);

    let mut nodes: Vec<DataTreeNode> = Vec::with_capacity(estimated_node_capacity(source_size));
    let mut stack: Vec<StackItem> = Vec::new();
    let mut buf = Vec::with_capacity(XML_EVENT_BUFFER_BYTES);
    let mut prop: Option<PropCapture> = None;
    let mut attr_prop: Option<PropCapture> = None;
    let mut in_properties = false;
    let mut in_attributes = false;
    let mut in_tags = false;
    let mut tags_text = String::new();
    let mut name_props: std::collections::HashMap<u32, String> = std::collections::HashMap::new();
    let mut next_id: u32 = 1;
    let mut bytes_read: u64 = 0;
    let mut last_progress_bytes: u64 = 0;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"Item" => {
                    let parent_id = stack.last().map(|item| nodes[item.node_index].id);
                    if let Some(parent) = stack.last() {
                        nodes[parent.node_index].child_count =
                            nodes[parent.node_index].child_count.saturating_add(1);
                    }
                    let class_name = attr_value(e, b"class").unwrap_or_else(|| "Instance".to_string());
                    let id = next_id;
                    next_id = next_id.saturating_add(1);
                    let index = nodes.len();
                    nodes.push(DataTreeNode {
                        id,
                        parent_id,
                        name: class_name.clone(),
                        class_name,
                        depth: stack.len().min(u16::MAX as usize) as u16,
                        search_text: String::new(),
                        child_count: 0,
                        item_attributes: Map::new(),
                        properties: Map::new(),
                        property_types: Map::new(),
                        attributes: Map::new(),
                        attribute_types: Map::new(),
                        tags: Vec::new(),
                    });
                    stack.push(StackItem { node_index: index });
                }
                b"Properties" => in_properties = true,
                b"Attributes" => in_attributes = true,
                b"Tags" if !stack.is_empty() => {
                    in_tags = true;
                    tags_text.clear();
                }
                _ if in_attributes => {
                    if let Some(current) = attr_prop.as_mut() {
                        current.depth += 1;
                    } else if let Some(name) = attr_value(e, b"name") {
                        attr_prop = Some(PropCapture {
                            name,
                            tag: String::from_utf8_lossy(e.name().as_ref()).into_owned(),
                            depth: 0,
                            text: String::new(),
                        });
                    }
                }
                _ if in_properties => {
                    if let Some(current) = prop.as_mut() {
                        current.depth += 1;
                    } else if let Some(name) = attr_value(e, b"name") {
                        prop = Some(PropCapture {
                            name,
                            tag: String::from_utf8_lossy(e.name().as_ref()).into_owned(),
                            depth: 0,
                            text: String::new(),
                        });
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(ref e)) => {
                if in_attributes && attr_prop.is_none() {
                    if let Some(name) = attr_value(e, b"name") {
                        if let Some(current) = stack.last() {
                            let tag = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                            nodes[current.node_index].attributes.insert(name.clone(), normalize_scalar(&tag, ""));
                            nodes[current.node_index].attribute_types.insert(name, Value::String(tag));
                        }
                    }
                } else if in_properties && prop.is_none() {
                    if let Some(name) = attr_value(e, b"name") {
                        if let Some(current) = stack.last() {
                            let tag = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                            nodes[current.node_index].properties.insert(name.clone(), normalize_scalar(&tag, ""));
                            nodes[current.node_index].property_types.insert(name, Value::String(tag));
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                bytes_read += e.len() as u64;
                if bytes_read - last_progress_bytes >= PROGRESS_EMIT_BYTES_MIN {
                    last_progress_bytes = bytes_read;
                    let progress = IMPORT_PARSE_START + (bytes_read as f64 / total_bytes.max(1) as f64) * IMPORT_PARSE_SPAN;
                    emit_import_progress(app, &import_id, "parsing", "Parsing XML…", progress, bytes_read, total_bytes, nodes.len());
                }
                let text = text_from_event_text(e.clone());
                if let Some(current) = prop.as_mut() {
                    append_capture_text(current, text);
                } else if let Some(current) = attr_prop.as_mut() {
                    append_capture_text(current, text);
                } else if in_tags && !text.is_empty() {
                    tags_text.push_str(&text);
                }
            }
            Ok(Event::CData(ref e)) => {
                let text = text_from_cdata(e.clone());
                if let Some(current) = prop.as_mut() {
                    append_capture_text(current, text);
                } else if let Some(current) = attr_prop.as_mut() {
                    append_capture_text(current, text);
                } else if in_tags && !text.is_empty() {
                    tags_text.push_str(&text);
                }
            }
            Ok(Event::End(ref e)) => match e.name().as_ref() {
                b"Item" => {
                    if let Some(item) = stack.pop() {
                        let node_id = nodes[item.node_index].id;
                        if let Some(name) = name_props.remove(&node_id) {
                            nodes[item.node_index].name = name;
                        }
                    }
                }
                b"Properties" => in_properties = false,
                b"Attributes" => in_attributes = false,
                b"Tags" => {
                    if let Some(item) = stack.last() {
                        nodes[item.node_index].tags = tags_text
                            .split(',')
                            .map(str::trim)
                            .filter(|t| !t.is_empty())
                            .map(ToOwned::to_owned)
                            .collect();
                    }
                    in_tags = false;
                    tags_text.clear();
                }
                _ if in_attributes => {
                    if let Some(current) = attr_prop.as_mut() {
                        if current.depth > 0 {
                            current.depth -= 1;
                        } else {
                            let finished = attr_prop.take().unwrap();
                            if let Some(item) = stack.last() {
                                let is_attrs = finished.name.eq_ignore_ascii_case("AttributesSerialize")
                                    && finished.tag.eq_ignore_ascii_case("BinaryString");
                                if is_attrs {
                                    let (da, dt) = decode_attributes_serialize(&finished.text);
                                    nodes[item.node_index].attributes.extend(da);
                                    nodes[item.node_index].attribute_types.extend(dt);
                                } else {
                                    let value = normalize_scalar(&finished.tag, &finished.text);
                                    nodes[item.node_index].attribute_types.insert(finished.name.clone(), Value::String(finished.tag));
                                    nodes[item.node_index].attributes.insert(finished.name, value);
                                }
                            }
                        }
                    }
                }
                _ if in_properties => {
                    if let Some(current) = prop.as_mut() {
                        if current.depth > 0 {
                            current.depth -= 1;
                        } else {
                            let finished = prop.take().unwrap();
                            if let Some(item) = stack.last() {
                                let is_attrs = finished.name.eq_ignore_ascii_case("AttributesSerialize")
                                    && finished.tag.eq_ignore_ascii_case("BinaryString");
                                if is_attrs {
                                    let (da, dt) = decode_attributes_serialize(&finished.text);
                                    nodes[item.node_index].attributes.extend(da);
                                    nodes[item.node_index].attribute_types.extend(dt);
                                } else {
                                    let value = normalize_scalar(&finished.tag, &finished.text);
                                    if finished.name.eq_ignore_ascii_case("Name") {
                                        if let Some(s) = value.as_str() {
                                            name_props.insert(nodes[item.node_index].id, s.to_string());
                                        }
                                    }
                                    nodes[item.node_index].property_types.insert(finished.name.clone(), Value::String(finished.tag));
                                    nodes[item.node_index].properties.insert(finished.name, value);
                                }
                            }
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(err) => return Err(format!("Invalid RBXLX XML near byte {}: {err}", reader.error_position())),
            _ => {}
        }
        buf.clear();
    }
    emit_import_progress(app, &import_id, "indexing", "Building index…", IMPORT_INDEX_PROGRESS, total_bytes, total_bytes, nodes.len());

    let mut snapshot = DataTreeSnapshot {
        id: snapshot_id,
        name: snapshot_name(source_path),
        source: source_path.to_string_lossy().into_owned(),
        captured_at,
        completed_at: now_ms(),
        status: "ok".to_string(),
        node_count: nodes.len(),
        nodes,
        expanded_ids: Vec::new(),
        active_node_id: None,
        storage_path,
        source_path: source_path.to_string_lossy().into_owned(),
        source_size,
    };

    for node in &mut snapshot.nodes {
        let mut search_parts = vec![node.name.clone(), node.class_name.clone()];
        for tag in &node.tags { search_parts.push(tag.clone()); }
        node.search_text = search_parts.join(" ").to_ascii_lowercase();
        merge_attributes_serialize(node);
    }

    emit_import_progress(app, &import_id, "writing", "Saving snapshot…", IMPORT_WRITE_PROGRESS, total_bytes, total_bytes, snapshot.nodes.len());
    Ok(snapshot)
}

pub fn make_snapshot_light(snapshot: &mut DataTreeSnapshot) {
    for node in snapshot.nodes.iter_mut() {
        for key in node.properties.keys().cloned().collect::<Vec<_>>() {
            if is_script_property(&key, &node.property_types) { continue }
            if let Some(value) = node.properties.get_mut(&key) {
                if is_heavy_snapshot_value(&key, value) {
                    if let Value::String(text) = value { *value = heavy_marker(text.len()); }
                }
            }
        }
        for key in node.attributes.keys().cloned().collect::<Vec<_>>() {
            if is_script_property(&key, &node.attribute_types) { continue }
            if let Some(value) = node.attributes.get_mut(&key) {
                if matches!(value, Value::String(t) if t.len() > 512) || is_heavy_snapshot_value(&key, value) {
                    if let Value::String(text) = value { *value = heavy_marker(text.len()); }
                }
            }
        }
    }
}

pub fn remember_and_cache(path: &Path, snapshot: DataTreeSnapshot) -> Result<Arc<CachedSnapshot>, String> {
    remember_snapshot(path, snapshot)
}