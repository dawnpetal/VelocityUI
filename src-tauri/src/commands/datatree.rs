use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufReader, BufWriter},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use quick_xml::{
    escape::unescape,
    events::{BytesStart, Event},
    Reader,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const SNAPSHOT_CACHE_LIMIT: usize = 4;
const SNAPSHOT_READ_BUFFER_BYTES: usize = 1024 * 1024;
const XML_READ_BUFFER_BYTES: usize = 512 * 1024;
const XML_EVENT_BUFFER_BYTES: usize = 64 * 1024;
const PROGRESS_EMIT_BYTES_MIN: u64 = 1_500_000;
const IMPORT_PARSE_START: f64 = 0.03;
const IMPORT_PARSE_SPAN: f64 = 0.78;
const IMPORT_INDEX_PROGRESS: f64 = 0.84;
const IMPORT_WRITE_PROGRESS: f64 = 0.94;

static SNAPSHOT_CACHE: OnceLock<Mutex<HashMap<String, Arc<CachedSnapshot>>>> = OnceLock::new();

#[derive(Debug)]
struct CachedSnapshot {
    len: u64,
    modified_ms: u64,
    snapshot: Arc<DataTreeSnapshot>,
    node_index: HashMap<u32, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeNode {
    id: u32,
    parent_id: Option<u32>,
    name: String,
    class_name: String,
    depth: u16,
    search_text: String,
    child_count: u32,
    #[serde(default)]
    item_attributes: Map<String, Value>,
    properties: Map<String, Value>,
    #[serde(default)]
    property_types: Map<String, Value>,
    attributes: Map<String, Value>,
    #[serde(default)]
    attribute_types: Map<String, Value>,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeSnapshot {
    id: String,
    name: String,
    source: String,
    captured_at: u64,
    completed_at: u64,
    status: String,
    nodes: Vec<DataTreeNode>,
    node_count: usize,
    expanded_ids: Vec<u32>,
    active_node_id: Option<u32>,
    storage_path: String,
    source_path: String,
    source_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeExplorerNode {
    id: u32,
    parent_id: Option<u32>,
    name: String,
    class_name: String,
    depth: u16,
    child_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeExplorerSnapshot {
    id: String,
    name: String,
    source: String,
    captured_at: u64,
    completed_at: u64,
    status: String,
    nodes: Vec<DataTreeExplorerNode>,
    material_variant_nodes: Vec<DataTreeNode>,
    node_count: usize,
    expanded_ids: Vec<u32>,
    active_node_id: Option<u32>,
    storage_path: String,
    source_path: String,
    source_size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptScanHit {
    id: u32,
    name: String,
    class_name: String,
    path: String,
    matches: usize,
    source_len: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWeb {
    version: u32,
    generated_at: u64,
    summary: LogicWebSummary,
    systems: Vec<LogicWebSystem>,
    nodes: Vec<LogicWebNode>,
    edges: Vec<LogicWebEdge>,
    remote_calls: Vec<LogicWebRemoteCall>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebSummary {
    script_count: usize,
    module_count: usize,
    local_script_count: usize,
    server_script_count: usize,
    remote_count: usize,
    config_count: usize,
    edge_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebSystem {
    id: String,
    name: String,
    node_ids: Vec<String>,
    script_count: usize,
    remote_count: usize,
    edge_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebNode {
    id: String,
    node_id: Option<u32>,
    kind: String,
    class_name: String,
    name: String,
    path: String,
    parent_path: String,
    system_id: String,
    source_len: usize,
    exports: Vec<String>,
    config_keys: Vec<String>,
    services: Vec<String>,
    remote_events: Vec<String>,
    score: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebEdge {
    id: String,
    from: String,
    to: String,
    kind: String,
    label: String,
    evidence: String,
    confidence: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebRemoteCall {
    id: String,
    remote_key: String,
    remote_name: String,
    remote_path: String,
    remote_class_name: String,
    caller_id: String,
    caller_path: String,
    method: String,
    direction: String,
    args: Vec<String>,
    arg_signature: String,
    evidence: String,
    line: usize,
    confidence: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainCell {
    material: u8,
    occupancy: f32,
    x: u16,
    y: u16,
    z: u16,
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
    if text.is_empty() {
        return;
    }
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

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn file_modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn snapshot_cache() -> &'static Mutex<HashMap<String, Arc<CachedSnapshot>>> {
    SNAPSHOT_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn snapshot_cache_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn snapshot_file_stamp(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok((metadata.len(), file_modified_ms(&metadata)))
}

fn build_node_index(snapshot: &DataTreeSnapshot) -> HashMap<u32, usize> {
    snapshot
        .nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.id, index))
        .collect()
}

fn read_snapshot_from_disk(path: &Path) -> Result<DataTreeSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::with_capacity(SNAPSHOT_READ_BUFFER_BYTES, file);
    let mut snapshot: DataTreeSnapshot =
        serde_json::from_reader(reader).map_err(|e| e.to_string())?;
    normalize_snapshot(&mut snapshot);
    Ok(snapshot)
}

fn remember_snapshot(
    path: &Path,
    snapshot: DataTreeSnapshot,
) -> Result<Arc<CachedSnapshot>, String> {
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
            let Some(evict_key) = cache.keys().find(|candidate| *candidate != &key).cloned() else {
                break;
            };
            cache.remove(&evict_key);
        }
    }
    Ok(cached)
}

fn read_snapshot_cached(path: &Path) -> Result<Arc<CachedSnapshot>, String> {
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

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(path).map_err(|e| e.to_string())?;
    let writer = BufWriter::with_capacity(SNAPSHOT_READ_BUFFER_BYTES, file);
    serde_json::to_writer(writer, value).map_err(|e| e.to_string())
}

fn explorer_snapshot_path(path: &Path) -> PathBuf {
    let mut sidecar = path.to_path_buf();
    sidecar.set_extension("explorer.json");
    sidecar
}

fn explorer_sidecar_is_fresh(snapshot_path: &Path, sidecar_path: &Path) -> bool {
    let Ok(snapshot_meta) = fs::metadata(snapshot_path) else {
        return false;
    };
    let Ok(sidecar_meta) = fs::metadata(sidecar_path) else {
        return false;
    };
    file_modified_ms(&sidecar_meta) >= file_modified_ms(&snapshot_meta)
}

fn read_explorer_sidecar(path: &Path) -> Result<DataTreeExplorerSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::with_capacity(SNAPSHOT_READ_BUFFER_BYTES / 2, file);
    serde_json::from_reader(reader).map_err(|e| e.to_string())
}

fn attr_value(start: &BytesStart<'_>, key: &[u8]) -> Option<String> {
    for attr in start.attributes().flatten() {
        if attr.key.as_ref() == key {
            return attr.unescape_value().ok().map(Cow::into_owned);
        }
    }
    None
}

fn attrs_map(start: &BytesStart<'_>) -> Map<String, Value> {
    let mut attrs = Map::new();
    for attr in start.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).into_owned();
        let value = attr
            .unescape_value()
            .ok()
            .map(Cow::into_owned)
            .unwrap_or_default();
        attrs.insert(key, Value::String(value));
    }
    attrs
}

fn text_from_event_text(text: quick_xml::events::BytesText<'_>) -> String {
    match text.decode() {
        Ok(decoded) => match unescape(&decoded) {
            Ok(unescaped) => unescaped.into_owned(),
            Err(_) => decoded.into_owned(),
        },
        Err(_) => String::new(),
    }
}

fn text_from_cdata(cdata: quick_xml::events::BytesCData<'_>) -> String {
    cdata.decode().map(Cow::into_owned).unwrap_or_default()
}

fn remove_case_insensitive(map: &mut Map<String, Value>, key: &str) -> Option<(String, Value)> {
    if let Some(value) = map.remove(key) {
        return Some((key.to_string(), value));
    }
    let found = map
        .keys()
        .find(|candidate| candidate.eq_ignore_ascii_case(key))
        .cloned()?;
    let value = map.remove(&found)?;
    Some((found, value))
}

fn decode_attributes_value(value: &Value) -> Option<(Map<String, Value>, Map<String, Value>)> {
    let text = value.as_str()?;
    let raw = text
        .strip_prefix("Roblox AttributesSerialize BinaryString (raw, undecoded): ")
        .unwrap_or(text);
    let decoded = decode_attributes_serialize(raw);
    if decoded.0.is_empty() && decoded.1.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn merge_attributes_serialize(node: &mut DataTreeNode) {
    if let Some((key, value)) = remove_case_insensitive(&mut node.properties, "AttributesSerialize")
    {
        if let Some((decoded_attrs, decoded_types)) = decode_attributes_value(&value) {
            node.property_types.remove(&key);
            node.attributes.extend(decoded_attrs);
            node.attribute_types.extend(decoded_types);
        } else {
            node.properties.insert(key, value);
        }
    }

    if let Some((key, value)) =
        remove_case_insensitive(&mut node.attributes, "__raw_AttributesSerialize")
    {
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

/// Decodes the Roblox AttributesSerialize binary blob into a flat map of
/// attribute name -> value and a parallel name -> type-string map.
/// Binary layout (all little-endian):
///   u32  attribute_count
///   per attribute:
///     u32  name_len
///     [u8; name_len]  name utf-8
///     u8   type_id
///     <type-specific payload>
fn decode_attributes_serialize(base64_text: &str) -> (Map<String, Value>, Map<String, Value>) {
    let mut attrs: Map<String, Value> = Map::new();
    let mut types: Map<String, Value> = Map::new();

    let compact: String = base64_text
        .chars()
        .filter(|c| !c.is_ascii_whitespace())
        .collect();
    let Ok(bytes) = BASE64_STANDARD.decode(compact.as_bytes()) else {
        return (attrs, types);
    };
    let b = &bytes;
    let len = b.len();
    if len < 4 {
        return (attrs, types);
    }

    macro_rules! need {
        ($pos:expr, $n:expr) => {
            if $pos + $n > len {
                return (attrs, types);
            }
        };
    }
    macro_rules! u8at {
        ($pos:expr) => {
            b[$pos]
        };
    }
    macro_rules! i32le {
        ($pos:expr) => {
            i32::from_le_bytes([b[$pos], b[$pos + 1], b[$pos + 2], b[$pos + 3]])
        };
    }
    macro_rules! i64le {
        ($pos:expr) => {
            i64::from_le_bytes(b[$pos..$pos + 8].try_into().unwrap())
        };
    }
    macro_rules! f32le {
        ($pos:expr) => {
            f32::from_le_bytes([b[$pos], b[$pos + 1], b[$pos + 2], b[$pos + 3]])
        };
    }
    macro_rules! f64le {
        ($pos:expr) => {
            f64::from_le_bytes(b[$pos..$pos + 8].try_into().unwrap())
        };
    }

    let count = u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize;
    let mut pos = 4usize;

    for _ in 0..count {
        need!(pos, 4);
        let name_len = u32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]) as usize;
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
            // String
            0x02 => {
                need!(pos, 4);
                let slen =
                    u32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]) as usize;
                pos += 4;
                need!(pos, slen);
                let s = String::from_utf8_lossy(&b[pos..pos + slen]).into_owned();
                pos += slen;
                ("string", Value::String(s))
            }
            // Bool
            0x03 => {
                need!(pos, 1);
                let v = u8at!(pos) != 0;
                pos += 1;
                ("bool", Value::Bool(v))
            }
            // Float (single)
            0x05 => {
                need!(pos, 4);
                let v = f32le!(pos);
                pos += 4;
                let jnum = serde_json::Number::from_f64(v as f64)
                    .unwrap_or_else(|| serde_json::Number::from(0));
                ("float", Value::Number(jnum))
            }
            // Double
            0x06 => {
                need!(pos, 8);
                let v = f64le!(pos);
                pos += 8;
                let jnum =
                    serde_json::Number::from_f64(v).unwrap_or_else(|| serde_json::Number::from(0));
                ("double", Value::Number(jnum))
            }
            // UDim: scale(f32) offset(i32)
            0x07 => {
                need!(pos, 8);
                let scale = f32le!(pos);
                let offset = i32le!(pos + 4);
                pos += 8;
                ("UDim", Value::String(format!("{scale}, {offset}")))
            }
            // UDim2: xscale xoff yscale yoff
            0x08 => {
                need!(pos, 16);
                let xs = f32le!(pos);
                let xo = i32le!(pos + 4);
                let ys = f32le!(pos + 8);
                let yo = i32le!(pos + 12);
                pos += 16;
                (
                    "UDim2",
                    Value::String(format!("{{{xs}, {xo}}}, {{{ys}, {yo}}}")),
                )
            }
            // BrickColor (u32)
            0x09 => {
                need!(pos, 4);
                let v = u32::from_le_bytes([b[pos], b[pos + 1], b[pos + 2], b[pos + 3]]);
                pos += 4;
                ("BrickColor", Value::Number(v.into()))
            }
            // Color3 (3x f32, 0-1 range)
            0x0E => {
                need!(pos, 12);
                let r = (f32le!(pos) * 255.0).round() as u8;
                let g = (f32le!(pos + 4) * 255.0).round() as u8;
                let bv = (f32le!(pos + 8) * 255.0).round() as u8;
                pos += 12;
                ("Color3", Value::String(format!("{r} {g} {bv}")))
            }
            // Vector2 (2x f32)
            0x10 => {
                need!(pos, 8);
                let x = f32le!(pos);
                let y = f32le!(pos + 4);
                pos += 8;
                ("Vector2", Value::String(format!("{x} {y}")))
            }
            // Vector3 (3x f32)
            0x11 => {
                need!(pos, 12);
                let x = f32le!(pos);
                let y = f32le!(pos + 4);
                let z = f32le!(pos + 8);
                pos += 12;
                ("Vector3", Value::String(format!("{x} {y} {z}")))
            }
            // CFrame (3x pos f32 + 9x rot f32 = 48 bytes)
            0x13 => {
                need!(pos, 48);
                let vals: Vec<f32> = (0..12).map(|i| f32le!(pos + i * 4)).collect();
                pos += 48;
                (
                    "CFrame",
                    Value::String(
                        vals.iter()
                            .map(|v| v.to_string())
                            .collect::<Vec<_>>()
                            .join(" "),
                    ),
                )
            }
            // int32
            0x3D => {
                need!(pos, 4);
                let v = i32le!(pos);
                pos += 4;
                ("int", Value::Number(v.into()))
            }
            // int64
            0x3E => {
                need!(pos, 8);
                let v = i64le!(pos);
                pos += 8;
                ("int64", Value::Number(v.into()))
            }
            // NumberRange (min f32, max f32)
            0x24 => {
                need!(pos, 8);
                let mn = f32le!(pos);
                let mx = f32le!(pos + 4);
                pos += 8;
                ("NumberRange", Value::String(format!("{mn} {mx}")))
            }
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
            if let Ok(v) = trimmed.parse::<i64>() {
                Value::Number(v.into())
            } else if let Ok(v) = trimmed.parse::<f64>() {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .unwrap_or_else(|| Value::String(trimmed.to_string()))
            } else {
                Value::String(trimmed.to_string())
            }
        }
        _ => Value::String(trimmed.to_string()),
    }
}

fn is_asset_property(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.contains("mesh")
        || lower.contains("texture")
        || lower.contains("content")
        || lower.contains("image")
        || lower.contains("asset")
        || lower.contains("physics")
        || lower.contains("serialized")
        || lower.contains("modelmesh")
        || lower.contains("sound")
        || lower.contains("animation")
        || lower.contains("template")
}

fn trim_value(_key: &str, value: Value) -> Value {
    value
}

fn is_script_property(key: &str, types: &Map<String, Value>) -> bool {
    matches!(
        types.get(key).and_then(Value::as_str),
        Some("ProtectedString") | Some("SharedString")
    )
}

fn is_heavy_snapshot_value(key: &str, value: &Value) -> bool {
    matches!(value, Value::String(text) if (is_asset_property(key) && text.len() > 512) || text.len() > 2048)
}

fn make_snapshot_light(snapshot: &mut DataTreeSnapshot) {
    for node in snapshot.nodes.iter_mut() {
        let prop_types = node.property_types.clone();
        for (key, value) in node.properties.iter_mut() {
            if is_script_property(key, &prop_types) {
                continue;
            }
            if is_heavy_snapshot_value(key, value) {
                if let Value::String(text) = value {
                    let marker = format!(
                        "__dt_heavy__:{} bytes preserved in native snapshot",
                        text.len()
                    );
                    *value = Value::String(marker);
                }
            }
        }
        let attr_types = node.attribute_types.clone();
        for (key, value) in node.attributes.iter_mut() {
            if is_script_property(key, &attr_types) {
                continue;
            }
            if matches!(value, Value::String(text) if text.len() > 512)
                || is_heavy_snapshot_value(key, value)
            {
                if let Value::String(text) = value {
                    let marker = format!(
                        "__dt_heavy__:{} bytes preserved in native snapshot",
                        text.len()
                    );
                    *value = Value::String(marker);
                }
            }
        }
    }
}

fn make_node_light(node: &mut DataTreeNode) {
    let prop_types = node.property_types.clone();
    for (key, value) in node.properties.iter_mut() {
        if is_script_property(key, &prop_types) {
            continue;
        }
        if is_heavy_snapshot_value(key, value) {
            if let Value::String(text) = value {
                let marker = format!(
                    "__dt_heavy__:{} bytes preserved in native snapshot",
                    text.len()
                );
                *value = Value::String(marker);
            }
        }
    }
    let attr_types = node.attribute_types.clone();
    for (key, value) in node.attributes.iter_mut() {
        if is_script_property(key, &attr_types) {
            continue;
        }
        if matches!(value, Value::String(text) if text.len() > 512)
            || is_heavy_snapshot_value(key, value)
        {
            if let Value::String(text) = value {
                let marker = format!(
                    "__dt_heavy__:{} bytes preserved in native snapshot",
                    text.len()
                );
                *value = Value::String(marker);
            }
        }
    }
}

fn make_explorer_snapshot(snapshot: &DataTreeSnapshot) -> DataTreeExplorerSnapshot {
    let mut material_variant_nodes: Vec<DataTreeNode> = snapshot
        .nodes
        .iter()
        .filter(|node| node.class_name.eq_ignore_ascii_case("MaterialVariant"))
        .cloned()
        .collect();
    for node in material_variant_nodes.iter_mut() {
        make_node_light(node);
    }
    DataTreeExplorerSnapshot {
        id: snapshot.id.clone(),
        name: snapshot.name.clone(),
        source: snapshot.source.clone(),
        captured_at: snapshot.captured_at,
        completed_at: snapshot.completed_at,
        status: snapshot.status.clone(),
        nodes: snapshot
            .nodes
            .iter()
            .map(|node| DataTreeExplorerNode {
                id: node.id,
                parent_id: node.parent_id,
                name: node.name.clone(),
                class_name: node.class_name.clone(),
                depth: node.depth,
                child_count: node.child_count,
            })
            .collect(),
        material_variant_nodes,
        node_count: snapshot.node_count,
        expanded_ids: snapshot.expanded_ids.clone(),
        active_node_id: snapshot.active_node_id,
        storage_path: snapshot.storage_path.clone(),
        source_path: snapshot.source_path.clone(),
        source_size: snapshot.source_size,
    }
}

fn is_renderable_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "part"
            | "meshpart"
            | "unionoperation"
            | "intersectoperation"
            | "negateoperation"
            | "wedgepart"
            | "cornerwedgepart"
            | "trusspart"
            | "seat"
            | "vehicleseat"
            | "spawnlocation"
            | "terrain"
    )
}

fn is_mesh_child_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "specialmesh" | "filemesh" | "blockmesh" | "cylindermesh"
    )
}

fn is_light_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "pointlight" | "spotlight" | "surfacelight"
    )
}

fn is_viewport_context_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "lighting" | "atmosphere" | "sky" | "colorcorrectioneffect" | "bloomeffect"
    )
}

fn make_render_snapshot(mut snapshot: DataTreeSnapshot, root_id: u32) -> DataTreeSnapshot {
    let mut by_parent: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, node) in snapshot.nodes.iter().enumerate() {
        by_parent
            .entry(node.parent_id.unwrap_or(0))
            .or_default()
            .push(index);
    }

    let mut keep_indexes = Vec::new();
    if let Some(root_index) = snapshot.nodes.iter().position(|node| node.id == root_id) {
        let mut stack = vec![root_index];
        while let Some(index) = stack.pop() {
            keep_indexes.push(index);
            let node_id = snapshot.nodes[index].id;
            if let Some(children) = by_parent.get(&node_id) {
                for child in children.iter().rev() {
                    stack.push(*child);
                }
            }
        }
    }

    for (index, node) in snapshot.nodes.iter().enumerate() {
        if is_viewport_context_class(&node.class_name) {
            keep_indexes.push(index);
        }
    }

    keep_indexes.sort_unstable();
    keep_indexes.dedup();

    let mut nodes = Vec::with_capacity(keep_indexes.len());
    for index in keep_indexes {
        let mut node = std::mem::replace(
            &mut snapshot.nodes[index],
            DataTreeNode {
                id: 0,
                parent_id: None,
                name: String::new(),
                class_name: String::new(),
                depth: 0,
                search_text: String::new(),
                child_count: 0,
                item_attributes: Map::new(),
                properties: Map::new(),
                property_types: Map::new(),
                attributes: Map::new(),
                attribute_types: Map::new(),
                tags: Vec::new(),
            },
        );
        if !is_renderable_class(&node.class_name)
            && !is_mesh_child_class(&node.class_name)
            && !is_light_class(&node.class_name)
            && !is_viewport_context_class(&node.class_name)
        {
            node.item_attributes.clear();
            node.properties.clear();
            node.property_types.clear();
            node.attributes.clear();
            node.attribute_types.clear();
            node.tags.clear();
        }
        if node.id == root_id {
            node.parent_id = None;
            node.depth = 0;
        }
        nodes.push(node);
    }

    snapshot.nodes = nodes;
    snapshot.node_count = snapshot.nodes.len();
    snapshot
}

fn snapshot_name(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Imported DataTree");
    stem.to_string()
}

fn snapshot_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = crate::paths::internals_dir()
        .or_else(|_| app.path().app_data_dir().map_err(anyhow::Error::from))
        .map_err(|e| e.to_string())?;
    let dir = base.join("datatree-snapshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn write_snapshot(app: &AppHandle, snapshot: &DataTreeSnapshot) -> Result<(), String> {
    let path = PathBuf::from(&snapshot.storage_path);
    if path.parent().is_none() {
        let _ = snapshot_dir(app)?;
    }
    write_json_file(&path, snapshot)?;
    let explorer = make_explorer_snapshot(snapshot);
    let _ = write_json_file(&explorer_snapshot_path(&path), &explorer);
    Ok(())
}

#[tauri::command]
pub async fn datatree_load_snapshot(
    path: String,
    light: Option<bool>,
) -> Result<DataTreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let mut snapshot = (*cached.snapshot).clone();
        if light.unwrap_or(true) {
            make_snapshot_light(&mut snapshot);
        }
        Ok(snapshot)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_load_explorer_snapshot(
    path: String,
) -> Result<DataTreeExplorerSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let sidecar = explorer_snapshot_path(&path);
        if explorer_sidecar_is_fresh(&path, &sidecar) {
            if let Ok(snapshot) = read_explorer_sidecar(&sidecar) {
                return Ok(snapshot);
            }
        }

        let cached = read_snapshot_cached(&path)?;
        let explorer = make_explorer_snapshot(&cached.snapshot);
        let _ = write_json_file(&sidecar, &explorer);
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
    section: String,
    key: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let node = cached
            .node_index
            .get(&node_id)
            .and_then(|index| cached.snapshot.nodes.get(*index))
            .ok_or_else(|| "DataTree node no longer exists".to_string())?;
        let section = section.to_ascii_lowercase();
        let value = if section == "attributes" {
            node.attributes.get(&key).cloned()
        } else if section == "itemattributes" {
            node.item_attributes.get(&key).cloned()
        } else if section == "tags" {
            Some(Value::Array(
                node.tags.iter().cloned().map(Value::String).collect(),
            ))
        } else {
            node.properties.get(&key).cloned()
        };
        value.ok_or_else(|| "DataTree value no longer exists".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn datatree_node_detail(path: String, node_id: u32) -> Result<DataTreeNode, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let mut node = cached
            .node_index
            .get(&node_id)
            .and_then(|index| cached.snapshot.nodes.get(*index))
            .cloned()
            .ok_or_else(|| "DataTree node no longer exists".to_string())?;
        make_node_light(&mut node);
        Ok(node)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn map_get_case_insensitive<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    map.get(key).or_else(|| {
        map.iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
            .map(|(_, value)| value)
    })
}

fn script_source(node: &DataTreeNode) -> &str {
    map_get_case_insensitive(&node.properties, "Source")
        .and_then(Value::as_str)
        .unwrap_or("")
}

fn is_script_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "script" | "localscript" | "modulescript"
    )
}

fn is_lua_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return false;
    }
    chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
}

fn roblox_path_segment(name: &str) -> String {
    if is_lua_identifier(name) {
        format!(".{name}")
    } else {
        format!(
            "[{}]",
            serde_json::to_string(name).unwrap_or_else(|_| "\"Instance\"".into())
        )
    }
}

fn roblox_node_path(
    snapshot: &DataTreeSnapshot,
    index: usize,
    node_index: &HashMap<u32, usize>,
) -> String {
    let mut chain = Vec::new();
    let mut current = Some(index);
    while let Some(idx) = current {
        let Some(node) = snapshot.nodes.get(idx) else {
            break;
        };
        chain.push(node);
        current = node
            .parent_id
            .and_then(|parent_id| node_index.get(&parent_id).copied());
        if chain.len() > 160 {
            break;
        }
    }
    chain.reverse();
    if chain.first().is_some_and(|node| {
        node.class_name.eq_ignore_ascii_case("DataModel") || node.name.eq_ignore_ascii_case("game")
    }) {
        chain.remove(0);
    }
    let mut path = String::from("game");
    for node in chain {
        path.push_str(&roblox_path_segment(&node.name));
    }
    path
}

fn count_plain_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    let mut count = 0;
    let mut pos = 0;
    while let Some(found) = haystack[pos..].find(needle) {
        count += 1;
        pos += found + needle.len();
        if pos >= haystack.len() {
            break;
        }
    }
    count
}

#[tauri::command]
pub async fn datatree_scan_scripts(
    path: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<ScriptScanHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let snapshot = &cached.snapshot;
        let terms: Vec<String> = query
            .to_lowercase()
            .split(';')
            .map(str::trim)
            .filter(|term| !term.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        let include_all = terms.is_empty();
        let max = limit.unwrap_or(500).clamp(1, 2000);
        let mut hits = Vec::new();

        for (index, node) in snapshot.nodes.iter().enumerate() {
            if !is_script_class(&node.class_name) {
                continue;
            }
            let source = script_source(node);
            let path = roblox_node_path(snapshot, index, &cached.node_index);
            let haystack = format!("{}\n{}\n{}", node.name, path, source).to_lowercase();
            let matches = terms
                .iter()
                .map(|term| count_plain_occurrences(&haystack, term))
                .sum();
            if !include_all && matches == 0 {
                continue;
            }
            hits.push(ScriptScanHit {
                id: node.id,
                name: node.name.clone(),
                class_name: node.class_name.clone(),
                path,
                matches,
                source_len: source.len(),
            });
        }

        if include_all {
            hits.sort_by(|a, b| a.path.cmp(&b.path));
        } else {
            hits.sort_by(|a, b| b.matches.cmp(&a.matches).then_with(|| a.path.cmp(&b.path)));
        }
        hits.truncate(max);
        Ok(hits)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn logic_regex(pattern: &str) -> &'static Regex {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static Regex>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache.lock().expect("logic regex cache poisoned");
    if let Some(regex) = guard.get(pattern) {
        return regex;
    }
    let regex = Box::leak(Box::new(Regex::new(pattern).expect("valid logic regex")));
    guard.insert(pattern.to_string(), regex);
    regex
}

fn parent_roblox_path(path: &str) -> String {
    path.rsplit_once('.')
        .map(|(parent, _)| parent.to_string())
        .unwrap_or_else(|| "game".to_string())
}

fn logic_system_name(path: &str, name: &str) -> String {
    let lower_name = name.to_ascii_lowercase();
    for key in [
        "combat",
        "weapon",
        "inventory",
        "shop",
        "round",
        "quest",
        "data",
        "profile",
        "pet",
        "trade",
        "ui",
        "admin",
        "remote",
        "character",
        "vehicle",
        "tool",
    ] {
        if lower_name.contains(key) || path.to_ascii_lowercase().contains(key) {
            return key
                .split('_')
                .map(|part| {
                    let mut chars = part.chars();
                    chars
                        .next()
                        .map(|first| first.to_ascii_uppercase().to_string() + chars.as_str())
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
                .join(" ");
        }
    }
    let parts: Vec<&str> = path.split('.').collect();
    for part in parts.iter().rev().skip(1) {
        if !matches!(
            *part,
            "game"
                | "ReplicatedStorage"
                | "ServerScriptService"
                | "ServerStorage"
                | "StarterPlayer"
                | "StarterGui"
                | "Workspace"
                | "Players"
                | "Modules"
                | "ModuleScripts"
                | "Scripts"
                | "LocalScripts"
                | "Config"
                | "Configs"
                | "Remotes"
        ) {
            return (*part).to_string();
        }
    }
    "General".to_string()
}

fn logic_node_kind(class_name: &str, config_keys: &[String]) -> String {
    if class_name.eq_ignore_ascii_case("ModuleScript") && !config_keys.is_empty() {
        "Config".to_string()
    } else if class_name.eq_ignore_ascii_case("ModuleScript") {
        "ModuleScript".to_string()
    } else if class_name.eq_ignore_ascii_case("LocalScript") {
        "LocalScript".to_string()
    } else if class_name.eq_ignore_ascii_case("Script") {
        "Script".to_string()
    } else if class_name.to_ascii_lowercase().contains("remote") {
        "Remote".to_string()
    } else {
        class_name.to_string()
    }
}

fn capture_unique(source: &str, pattern: &str, group: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for cap in logic_regex(pattern).captures_iter(source) {
        let Some(value) = cap.get(group).map(|m| m.as_str().trim().to_string()) else {
            continue;
        };
        if value.is_empty() || !seen.insert(value.clone()) {
            continue;
        }
        out.push(value);
    }
    out
}

fn service_vars(source: &str) -> HashMap<String, String> {
    let mut vars = HashMap::new();
    for cap in logic_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*game:GetService\s*\(\s*["']([^"']+)["']\s*\)"#,
    )
    .captures_iter(source)
    {
        if let (Some(var), Some(service)) = (cap.get(1), cap.get(2)) {
            vars.insert(var.as_str().to_string(), service.as_str().to_string());
        }
    }
    vars
}

fn require_vars(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for cap in logic_regex(
        r#"(?m)\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*require\s*\(\s*([^\n\r]+?)\s*\)"#,
    )
    .captures_iter(source)
    {
        let Some(var) = cap.get(1).map(|m| m.as_str()) else {
            continue;
        };
        let Some(expr) = cap.get(2).map(|m| m.as_str()) else {
            continue;
        };
        if let Some(path) = resolve_require_path(expr, current_path, base_vars) {
            out.insert(var.to_string(), path);
        }
    }
    out
}

fn instance_vars(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut vars = base_vars.clone();
    for _ in 0..4 {
        let mut changed = false;
        for cap in logic_regex(r#"(?m)\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#)
            .captures_iter(source)
        {
            let Some(var) = cap.get(1).map(|m| m.as_str()) else {
                continue;
            };
            let Some(raw_expr) = cap.get(2).map(|m| m.as_str().trim()) else {
                continue;
            };
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

fn normalize_roblox_path(path: String) -> String {
    let mut value = path;
    while value.starts_with("game.game.") {
        value = value.replacen("game.game.", "game.", 1);
    }
    value
}

fn normalize_lua_instance_expr(expr: &str) -> String {
    let mut value = expr.trim().trim_end_matches(';').trim().to_string();

    for method in [
        "WaitForChild",
        "FindFirstChild",
        "FindFirstChildWhichIsA",
        "FindFirstChildOfClass",
    ] {
        let pattern = format!(r#"[:.]{}\s*\(\s*["']([^"']+)["']\s*\)"#, method);
        let replacement = ".$1";
        value = logic_regex(&pattern)
            .replace_all(&value, replacement)
            .to_string();
    }

    value = logic_regex(r#"\[\s*["']([^"']+)["']\s*\]"#)
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
                    "WaitForChild"
                        | "FindFirstChild"
                        | "FindFirstChildWhichIsA"
                        | "FindFirstChildOfClass"
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

fn source_line_at(source: &str, byte_index: usize) -> usize {
    source[..byte_index.min(source.len())]
        .bytes()
        .filter(|b| *b == b'\n')
        .count()
        + 1
}

fn find_matching_paren(source: &str, open_index: usize) -> Option<usize> {
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
        if b == b'\'' || b == b'"' {
            quote = Some(b);
        } else if b == b'(' {
            depth += 1;
        } else if b == b')' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn split_lua_args(args: &str) -> Vec<String> {
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

fn infer_lua_expr_type(
    expr: &str,
    local_types: &HashMap<String, String>,
    module_vars: &HashMap<String, String>,
    module_function_returns: &HashMap<String, String>,
) -> String {
    let value = expr.trim();
    if let Some(known) = local_types.get(value) {
        return known.clone();
    }
    if let Some(cap) =
        logic_regex(r#"^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\("#).captures(value)
    {
        let module_var = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let function_name = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        if let Some(module_path) = module_vars.get(module_var) {
            let key = format!("{}.{}", module_path.to_ascii_lowercase(), function_name);
            if let Some(return_type) = module_function_returns.get(&key) {
                return return_type.clone();
            }
        }
    }
    if let Some(name) = logic_regex(r#":FindFirstAncestorWhichIsA\s*\(\s*["']([^"']+)["']"#)
        .captures(value)
        .and_then(|cap| cap.get(1))
    {
        return name.as_str().to_string();
    }
    if value.contains("RadiusHitbox(")
        || value.contains("BoxHitbox(")
        || value.contains("PartHitbox(")
        || value.contains(".Hitbox(")
    {
        return "HitboxResult[]".to_string();
    }
    if value.contains(":GetAttributes(") {
        return "table".to_string();
    }
    if value.contains(":GetChildren(") || value.contains(":GetDescendants(") {
        return "Instance[]".to_string();
    }
    if value.contains(":WaitForChild(")
        || value.contains(":FindFirstChild(")
        || value.contains(":FindFirstChildOfClass(")
        || value.contains(":FindFirstChildWhichIsA(")
    {
        return "Instance".to_string();
    }
    infer_lua_arg_type(value)
}

fn local_lua_value_types(
    source: &str,
    current_path: &str,
    base_vars: &HashMap<String, String>,
    module_function_returns: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut types = HashMap::new();
    let module_vars = require_vars(source, current_path, base_vars);
    for _ in 0..3 {
        let mut changed = false;
        for cap in logic_regex(r#"(?m)\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n\r]+)"#)
            .captures_iter(source)
        {
            let Some(var) = cap.get(1).map(|m| m.as_str()) else {
                continue;
            };
            let Some(raw_expr) = cap.get(2).map(|m| m.as_str()) else {
                continue;
            };
            if matches!(var, "if" | "for" | "while" | "return" | "local") {
                continue;
            }
            let expr = raw_expr
                .split("--")
                .next()
                .unwrap_or(raw_expr)
                .trim()
                .trim_end_matches(';')
                .trim();
            let inferred = infer_lua_expr_type(expr, &types, &module_vars, module_function_returns);
            if inferred != "unknown" && types.get(var) != Some(&inferred) {
                types.insert(var.to_string(), inferred);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    types
}

fn infer_lua_arg_type(arg: &str) -> String {
    let value = arg.trim();
    if value.eq_ignore_ascii_case("nil") {
        "nil".to_string()
    } else if value == "true" || value == "false" {
        "boolean".to_string()
    } else if value.starts_with('"') || value.starts_with('\'') {
        "string".to_string()
    } else if logic_regex(r#"^-?\d+(?:\.\d+)?$"#).is_match(value) {
        "number".to_string()
    } else if value.starts_with("function") {
        "Function".to_string()
    } else if value.starts_with('{') {
        "table".to_string()
    } else if value.contains("CFrame.") || value.contains(":ToWorldSpace(") {
        "CFrame".to_string()
    } else if value.contains("Vector3.") {
        "Vector3".to_string()
    } else if value.contains("Vector2.") {
        "Vector2".to_string()
    } else if value.contains("Color3.") {
        "Color3".to_string()
    } else if value.contains("Enum.") {
        "EnumItem".to_string()
    } else if value.contains(":GetPivot(") {
        "CFrame".to_string()
    } else {
        "unknown".to_string()
    }
}

fn infer_module_return_type(body: &str, first_return: &str) -> String {
    let value = first_return.trim();
    if value.is_empty() {
        return "nil".to_string();
    }
    if value.starts_with('{') {
        return "table".to_string();
    }
    if let Some(var) = logic_regex(r#"^([A-Za-z_][A-Za-z0-9_]*)$"#)
        .captures(value)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
    {
        let table_insert_pattern = format!(r#"table\.insert\s*\(\s*{}\s*,"#, regex::escape(var));
        if logic_regex(&table_insert_pattern).is_match(body) {
            let lower = body.to_ascii_lowercase();
            if lower.contains("findfirstchild(\"humanoid\")")
                || lower.contains("findfirstchild('humanoid')")
                || lower.contains("findfirstchild(\"mockhumanoid\")")
                || lower.contains("findfirstchild('mockhumanoid')")
            {
                return "Model[]".to_string();
            }
            if lower.contains("getpartbounds")
                || lower.contains("getpartsinpart")
                || lower.contains("basepart")
            {
                return "BasePart[]".to_string();
            }
            return "table[]".to_string();
        }
        let local_table_pattern = format!(r#"(?m)\blocal\s+{}\s*=\s*\{{"#, regex::escape(var));
        if logic_regex(&local_table_pattern).is_match(body) {
            return "table".to_string();
        }
    }
    infer_lua_arg_type(value)
}

fn module_function_returns(module_path: &str, source: &str) -> Vec<(String, String)> {
    let mut functions = Vec::new();
    for cap in
        logic_regex(r#"(?m)\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\("#)
            .captures_iter(source)
    {
        let Some(start) = cap.get(0).map(|m| m.start()) else {
            continue;
        };
        let Some(end) = cap.get(0).map(|m| m.end()) else {
            continue;
        };
        let Some(name) = cap.get(2).map(|m| m.as_str().to_string()) else {
            continue;
        };
        functions.push((start, end, name));
    }

    let mut out = Vec::new();
    for (index, (_start, body_start, name)) in functions.iter().enumerate() {
        let body_end = functions
            .get(index + 1)
            .map(|(next_start, _, _)| *next_start)
            .unwrap_or(source.len());
        let body = &source[*body_start..body_end];
        let Some(return_cap) = logic_regex(r#"(?m)^\s*return\s+([^\n\r,]+)"#).captures(body) else {
            continue;
        };
        let first_return = return_cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let return_type = infer_module_return_type(body, first_return);
        if return_type != "unknown" {
            out.push((
                format!("{}.{}", module_path.to_ascii_lowercase(), name),
                return_type,
            ));
        }
    }
    out
}

fn remote_direction(method: &str) -> &'static str {
    match method {
        "FireServer" | "InvokeServer" => "client_to_server",
        "FireClient" | "FireAllClients" | "InvokeClient" => "server_to_client",
        "OnServerEvent" | "OnServerInvoke" => "server_listener",
        "OnClientEvent" | "OnClientInvoke" => "client_listener",
        _ => "unknown",
    }
}

fn remote_calls_in_source(
    source: &str,
    script_id: &str,
    script_path: &str,
    vars: &HashMap<String, String>,
    remote_classes: &HashMap<String, String>,
    module_function_returns: &HashMap<String, String>,
) -> Vec<LogicWebRemoteCall> {
    let mut calls = Vec::new();
    let local_types = local_lua_value_types(source, script_path, vars, module_function_returns);
    let require_map = require_vars(source, script_path, vars);

    let mut push_call = |target_expr: &str, method: &str, target_start: usize, args_raw: &str| {
        let args = split_lua_args(args_raw)
            .iter()
            .map(|arg| infer_lua_expr_type(arg, &local_types, &require_map, module_function_returns))
            .collect::<Vec<_>>();
        let arg_signature = format!("{{{}}}", args.join(", "));
        let remote_path = resolve_require_path(target_expr, script_path, vars)
            .unwrap_or_else(|| target_expr.to_string());
        let remote_name = remote_path
            .rsplit('.')
            .next()
            .unwrap_or(target_expr)
            .to_string();
        let remote_class_name = remote_classes
            .get(&remote_path.to_ascii_lowercase())
            .cloned()
            .unwrap_or_else(|| "RemoteRef".to_string());
        let line = source_line_at(source, target_start);
        let evidence = format!("{target_expr}:{method}({})", args_raw.trim());
        calls.push(LogicWebRemoteCall {
            id: String::new(),
            remote_key: remote_path.to_ascii_lowercase(),
            remote_name,
            remote_path,
            remote_class_name,
            caller_id: script_id.to_string(),
            caller_path: script_path.to_string(),
            method: method.to_string(),
            direction: remote_direction(method).to_string(),
            args,
            arg_signature,
            evidence,
            line,
            confidence: 0.5,
        });
    };

    for cap in logic_regex(
        r#"([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*:\s*(FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient|OnServerEvent|OnClientEvent|OnServerInvoke|OnClientInvoke|OnInvoke)\s*\("#,
    )
    .captures_iter(source)
    {
        let Some(target_match) = cap.get(1) else { continue };
        let target_expr = target_match.as_str();
        let method = cap.get(2).map(|m| m.as_str()).unwrap_or("Remote");
        let Some(open_index) = cap.get(0).map(|m| m.end() - 1) else { continue };
        let Some(close_index) = find_matching_paren(source, open_index) else { continue };
        let args_raw = &source[open_index + 1..close_index];
        push_call(target_expr, method, target_match.start(), args_raw);
    }

    for cap in logic_regex(
        r#"([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.(OnServerEvent|OnClientEvent|OnServerInvoke|OnClientInvoke|OnInvoke)\s*:\s*(?:Connect|Once)\s*\("#,
    )
    .captures_iter(source)
    {
        let Some(target_match) = cap.get(1) else { continue };
        let method = cap.get(2).map(|m| m.as_str()).unwrap_or("OnClientEvent");
        let target_expr = target_match.as_str();
        let Some(open_index) = cap.get(0).map(|m| m.end() - 1) else { continue };
        let Some(_close_index) = find_matching_paren(source, open_index) else { continue };
        push_call(target_expr, method, target_match.start(), "");
    }

    calls
}

fn resolve_require_path(
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

fn config_keys(source: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut seen = HashSet::new();
    for cap in logic_regex(r#"(?m)^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{"#).captures_iter(source) {
        let Some(key) = cap.get(1).map(|m| m.as_str()) else {
            continue;
        };
        if matches!(key, "local" | "function" | "return") {
            continue;
        }
        if seen.insert(key.to_string()) {
            keys.push(key.to_string());
        }
        if keys.len() >= 40 {
            break;
        }
    }
    keys
}

fn exported_symbols(source: &str, module_name: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let escaped = regex::escape(module_name);
    for pattern in [
        format!(
            r#"(?m)\bfunction\s+{}\s*[.:]\s*([A-Za-z_][A-Za-z0-9_]*)\s*\("#,
            escaped
        ),
        format!(r#"(?m)\b{}\s*[.]\s*([A-Za-z_][A-Za-z0-9_]*)\s*="#, escaped),
    ] {
        if let Ok(re) = Regex::new(&pattern) {
            for cap in re.captures_iter(source) {
                let Some(name) = cap.get(1).map(|m| format!("{module_name}.{}", m.as_str())) else {
                    continue;
                };
                if seen.insert(name.clone()) {
                    out.push(name);
                }
            }
        }
    }
    if out.is_empty() && logic_regex(r#"(?m)^\s*return\s+\{"#).is_match(source) {
        out.push("anonymous table".to_string());
    }
    out.truncate(48);
    out
}

fn edge_key(from: &str, to: &str, kind: &str, label: &str) -> String {
    format!("{from}|{to}|{kind}|{label}")
}

#[tauri::command]
pub async fn datatree_build_logic_web(path: String) -> Result<LogicWeb, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let cached = read_snapshot_cached(&path)?;
        let snapshot = &cached.snapshot;
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut seen_edges = HashSet::new();
        let mut path_to_node = HashMap::<String, String>::new();
        let mut remote_path_to_node = HashMap::<String, String>::new();
        let mut remote_classes = HashMap::<String, String>::new();
        let mut script_records = Vec::new();
        let mut remote_calls = Vec::new();
        let mut module_function_return_types = HashMap::<String, String>::new();
        let mut module_count = 0;
        let mut local_script_count = 0;
        let mut server_script_count = 0;
        let mut config_count = 0;

        for (index, node) in snapshot.nodes.iter().enumerate() {
            if !is_script_class(&node.class_name) {
                continue;
            }
            let path = roblox_node_path(snapshot, index, &cached.node_index);
            let source = script_source(node).to_string();
            let services = capture_unique(
                &source,
                r#"game:GetService\s*\(\s*["']([^"']+)["']\s*\)"#,
                1,
            );
            let cfg_keys = config_keys(&source);
            let exports = exported_symbols(&source, &node.name);
            let system_name = logic_system_name(&path, &node.name);
            let system_id = format!(
                "system:{}",
                system_name.to_ascii_lowercase().replace(' ', "-")
            );
            let kind = logic_node_kind(&node.class_name, &cfg_keys);
            if node.class_name.eq_ignore_ascii_case("ModuleScript") {
                module_count += 1;
            } else if node.class_name.eq_ignore_ascii_case("LocalScript") {
                local_script_count += 1;
            } else {
                server_script_count += 1;
            }
            if kind == "Config" {
                config_count += 1;
            }
            let id = format!("script:{}", node.id);
            path_to_node.insert(path.to_ascii_lowercase(), id.clone());
            script_records.push((id.clone(), path.clone(), source.clone(), services.clone()));
            nodes.push(LogicWebNode {
                id,
                node_id: Some(node.id),
                kind,
                class_name: node.class_name.clone(),
                name: node.name.clone(),
                path: path.clone(),
                parent_path: parent_roblox_path(&path),
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
            if !source.contains("function") || !source.contains("return") {
                continue;
            }
            for (key, return_type) in module_function_returns(script_path, source) {
                module_function_return_types.insert(key, return_type);
            }
        }

        for (index, node) in snapshot.nodes.iter().enumerate() {
            let class = node.class_name.to_ascii_lowercase();
            if !matches!(
                class.as_str(),
                "remoteevent" | "remotefunction" | "bindableevent" | "bindablefunction"
            ) {
                continue;
            }
            let path = roblox_node_path(snapshot, index, &cached.node_index);
            let system_name = logic_system_name(&path, &node.name);
            let system_id = format!(
                "system:{}",
                system_name.to_ascii_lowercase().replace(' ', "-")
            );
            let id = format!("remote:{}", node.id);
            remote_path_to_node.insert(path.to_ascii_lowercase(), id.clone());
            remote_classes.insert(path.to_ascii_lowercase(), node.class_name.clone());
            nodes.push(LogicWebNode {
                id,
                node_id: Some(node.id),
                kind: "Remote".to_string(),
                class_name: node.class_name.clone(),
                name: node.name.clone(),
                path: path.clone(),
                parent_path: parent_roblox_path(&path),
                system_id,
                source_len: 0,
                exports: Vec::new(),
                config_keys: Vec::new(),
                services: Vec::new(),
                remote_events: Vec::new(),
                score: 4,
            });
        }

        let mut node_remote_events = HashMap::<String, Vec<String>>::new();
        for (script_id, script_path, source, services) in &script_records {
            for service in services {
                let service_id = format!("service:{service}");
                if !nodes.iter().any(|node| node.id == service_id) {
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
            for cap in logic_regex(r#"require\s*\(\s*([^)]+?)\s*\)"#).captures_iter(source) {
                let raw = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                if let Some(target_path) = resolve_require_path(raw, script_path, &vars) {
                    let target_id = path_to_node.get(&target_path.to_ascii_lowercase());
                    let to = target_id
                        .cloned()
                        .unwrap_or_else(|| format!("external:{}", target_path));
                    if target_id.is_none() && !nodes.iter().any(|node| node.id == to) {
                        nodes.push(LogicWebNode {
                            id: to.clone(),
                            node_id: None,
                            kind: "Unresolved".to_string(),
                            class_name: "RequireTarget".to_string(),
                            name: target_path
                                .rsplit('.')
                                .next()
                                .unwrap_or("Require")
                                .to_string(),
                            path: target_path.clone(),
                            parent_path: parent_roblox_path(&target_path),
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
                &module_function_return_types,
            ) {
                let action = call.method.clone();
                let resolved = call.remote_path.clone();
                let to = remote_path_to_node
                    .get(&resolved.to_ascii_lowercase())
                    .cloned()
                    .unwrap_or_else(|| format!("remote-ref:{resolved}"));
                if !nodes.iter().any(|node| node.id == to) {
                    nodes.push(LogicWebNode {
                        id: to.clone(),
                        node_id: None,
                        kind: "RemoteRef".to_string(),
                        class_name: "RemoteRef".to_string(),
                        name: resolved.rsplit('.').next().unwrap_or("Remote").to_string(),
                        path: resolved.clone(),
                        parent_path: parent_roblox_path(&resolved),
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
                let kind = if action.starts_with("On") {
                    "listens_remote"
                } else {
                    "fires_remote"
                };
                let key = edge_key(
                    script_id,
                    &to,
                    kind,
                    &format!("{}:{}", action, call.arg_signature),
                );
                if seen_edges.insert(key) {
                    edges.push(LogicWebEdge {
                        id: format!("edge:{}", edges.len() + 1),
                        from: script_id.clone(),
                        to,
                        kind: kind.to_string(),
                        label: action.to_string(),
                        evidence: call.evidence.clone(),
                        confidence: 0.72,
                    });
                }
                call.id = format!("remote-call:{}", remote_calls.len() + 1);
                remote_calls.push(call);
            }
        }

        let mut signature_counts = HashMap::<String, HashMap<String, usize>>::new();
        let mut remote_counts = HashMap::<String, usize>::new();
        for call in &remote_calls {
            *remote_counts.entry(call.remote_key.clone()).or_insert(0) += 1;
            *signature_counts
                .entry(call.remote_key.clone())
                .or_default()
                .entry(format!("{} {}", call.method, call.arg_signature))
                .or_insert(0) += 1;
        }
        for call in &mut remote_calls {
            let total = *remote_counts.get(&call.remote_key).unwrap_or(&1) as f32;
            let matching = signature_counts
                .get(&call.remote_key)
                .and_then(|counts| counts.get(&format!("{} {}", call.method, call.arg_signature)))
                .copied()
                .unwrap_or(1) as f32;
            let resolved_bonus = if call.remote_path.starts_with("game.") {
                0.18
            } else {
                0.0
            };
            let class_bonus = if call.remote_class_name != "RemoteRef" {
                0.14
            } else {
                0.0
            };
            let repeat_bonus = (matching / total) * 0.28;
            let volume_bonus = (total.min(8.0) / 8.0) * 0.12;
            call.confidence = (0.28 + resolved_bonus + class_bonus + repeat_bonus + volume_bonus)
                .clamp(0.05, 0.98);
        }

        for node in &mut nodes {
            if let Some(events) = node_remote_events.remove(&node.id) {
                let mut seen = HashSet::new();
                node.remote_events = events
                    .into_iter()
                    .filter(|event| seen.insert(event.clone()))
                    .collect();
            }
            node.score += node.exports.len() * 2
                + node.config_keys.len()
                + node.remote_events.len() * 3
                + edges
                    .iter()
                    .filter(|edge| edge.from == node.id || edge.to == node.id)
                    .count();
        }

        let mut system_map: HashMap<String, LogicWebSystem> = HashMap::new();
        for node in &nodes {
            let system =
                system_map
                    .entry(node.system_id.clone())
                    .or_insert_with(|| LogicWebSystem {
                        id: node.system_id.clone(),
                        name: node
                            .system_id
                            .strip_prefix("system:")
                            .unwrap_or(&node.system_id)
                            .replace('-', " ")
                            .split_whitespace()
                            .map(|part| {
                                let mut chars = part.chars();
                                chars
                                    .next()
                                    .map(|first| {
                                        first.to_ascii_uppercase().to_string() + chars.as_str()
                                    })
                                    .unwrap_or_default()
                            })
                            .collect::<Vec<_>>()
                            .join(" "),
                        node_ids: Vec::new(),
                        script_count: 0,
                        remote_count: 0,
                        edge_count: 0,
                    });
            system.node_ids.push(node.id.clone());
            if is_script_class(&node.class_name) {
                system.script_count += 1;
            }
            if node.kind.contains("Remote") {
                system.remote_count += 1;
            }
        }
        for edge in &edges {
            if let Some(from_node) = nodes.iter().find(|node| node.id == edge.from) {
                if let Some(system) = system_map.get_mut(&from_node.system_id) {
                    system.edge_count += 1;
                }
            }
        }
        let mut systems: Vec<_> = system_map.into_values().collect();
        systems.sort_by(|a, b| {
            b.script_count
                .cmp(&a.script_count)
                .then_with(|| b.edge_count.cmp(&a.edge_count))
                .then_with(|| a.name.cmp(&b.name))
        });
        nodes.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.path.cmp(&b.path)));

        Ok(LogicWeb {
            version: 1,
            generated_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or_default(),
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
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn decode_terrain_grid(raw: &str) -> Vec<TerrainCell> {
    let compact: String = raw
        .trim()
        .rsplit_once(',')
        .map(|(_, encoded)| encoded)
        .unwrap_or(raw)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect();
    if compact.len() < 10 {
        return Vec::new();
    }
    let Ok(bytes) = BASE64_STANDARD.decode(compact.as_bytes()) else {
        return Vec::new();
    };
    if bytes.len() < 6 {
        return Vec::new();
    }

    let x_size = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
    let y_size = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
    let z_size = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if x_size == 0 || y_size == 0 || z_size == 0 {
        return Vec::new();
    }

    let Some(voxel_count) = x_size
        .checked_mul(y_size)
        .and_then(|count| count.checked_mul(z_size))
    else {
        return Vec::new();
    };
    let Some(payload_len) = voxel_count.checked_mul(3) else {
        return Vec::new();
    };
    let Some(expected_len) = 6usize.checked_add(payload_len) else {
        return Vec::new();
    };
    if bytes.len() < expected_len {
        return Vec::new();
    }

    let mut cells = Vec::new();
    let mut offset = 6usize;
    for y in 0..y_size {
        for z in 0..z_size {
            for x in 0..x_size {
                let material = bytes[offset];
                let occupancy = bytes[offset + 1] as f32 / 255.0;
                offset += 3;
                if material != 0 && occupancy > 0.05 {
                    cells.push(TerrainCell {
                        material,
                        occupancy,
                        x: x as u16,
                        y: y as u16,
                        z: z as u16,
                    });
                }
            }
        }
    }
    cells
}

fn estimated_node_capacity(source_size: u64) -> usize {
    let estimate = (source_size / 768).clamp(4_096, 262_144);
    estimate as usize
}

#[tauri::command]
pub async fn datatree_decode_terrain_grid(raw: String) -> Result<Vec<TerrainCell>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(decode_terrain_grid(&raw)))
        .await
        .map_err(|e| e.to_string())?
}

fn parse_rbxlx(
    app: Option<&AppHandle>,
    path: &Path,
    id: String,
    storage_path: String,
    import_id: Option<String>,
) -> Result<DataTreeSnapshot, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let source_size = file.metadata().map_err(|e| e.to_string())?.len();
    let mut reader = Reader::from_reader(BufReader::with_capacity(XML_READ_BUFFER_BYTES, file));
    reader.config_mut().trim_text(true);

    let captured_at = now_ms();
    let mut nodes: Vec<DataTreeNode> = Vec::with_capacity(estimated_node_capacity(source_size));
    let mut stack: Vec<StackItem> = Vec::new();
    let mut buf = Vec::with_capacity(XML_EVENT_BUFFER_BYTES);
    let mut in_properties = false;
    let mut in_attributes = false;
    let mut in_tags = false;
    let mut prop: Option<PropCapture> = None;
    let mut attr_prop: Option<PropCapture> = None;
    let mut tags_text = String::new();
    let mut next_id: u32 = 1;
    let mut name_props: HashMap<u32, String> = HashMap::new();
    let mut last_progress_emit = 0u64;

    emit_import_progress(
        app,
        &import_id,
        "parsing",
        "Parsing RBXLX XML",
        IMPORT_PARSE_START,
        0,
        source_size,
        0,
    );

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(start)) => match start.name().as_ref() {
                b"Item" => {
                    let parent_id = stack.last().map(|item| nodes[item.node_index].id);
                    if let Some(parent) = stack.last() {
                        nodes[parent.node_index].child_count =
                            nodes[parent.node_index].child_count.saturating_add(1);
                    }
                    let class_name =
                        attr_value(&start, b"class").unwrap_or_else(|| "Instance".to_string());
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
                        item_attributes: attrs_map(&start),
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
                    } else if let Some(name) = attr_value(&start, b"name") {
                        attr_prop = Some(PropCapture {
                            name,
                            tag: String::from_utf8_lossy(start.name().as_ref()).into_owned(),
                            depth: 0,
                            text: String::new(),
                        });
                    }
                }
                _ if in_properties => {
                    if let Some(current) = prop.as_mut() {
                        current.depth += 1;
                    } else if let Some(name) = attr_value(&start, b"name") {
                        prop = Some(PropCapture {
                            name,
                            tag: String::from_utf8_lossy(start.name().as_ref()).into_owned(),
                            depth: 0,
                            text: String::new(),
                        });
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(start)) => {
                if in_attributes && attr_prop.is_none() {
                    if let Some(name) = attr_value(&start, b"name") {
                        if let Some(current) = stack.last() {
                            let tag = String::from_utf8_lossy(start.name().as_ref()).into_owned();
                            nodes[current.node_index]
                                .attributes
                                .insert(name.clone(), normalize_scalar(&tag, ""));
                            nodes[current.node_index]
                                .attribute_types
                                .insert(name, Value::String(tag));
                        }
                    }
                } else if in_properties && prop.is_none() {
                    if let Some(name) = attr_value(&start, b"name") {
                        if let Some(current) = stack.last() {
                            let tag = String::from_utf8_lossy(start.name().as_ref()).into_owned();
                            nodes[current.node_index]
                                .properties
                                .insert(name.clone(), normalize_scalar(&tag, ""));
                            nodes[current.node_index]
                                .property_types
                                .insert(name, Value::String(tag));
                        }
                    }
                }
            }
            Ok(Event::Text(text)) => {
                if let Some(current) = prop.as_mut() {
                    let text = text_from_event_text(text);
                    append_capture_text(current, text);
                } else if let Some(current) = attr_prop.as_mut() {
                    let text = text_from_event_text(text);
                    append_capture_text(current, text);
                } else if in_tags {
                    let text = text_from_event_text(text);
                    if !text.is_empty() {
                        tags_text.push_str(&text);
                    }
                }
            }
            Ok(Event::CData(cdata)) => {
                if let Some(current) = prop.as_mut() {
                    let text = text_from_cdata(cdata);
                    append_capture_text(current, text);
                } else if let Some(current) = attr_prop.as_mut() {
                    let text = text_from_cdata(cdata);
                    append_capture_text(current, text);
                } else if in_tags {
                    let text = text_from_cdata(cdata);
                    if !text.is_empty() {
                        tags_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(end)) => match end.name().as_ref() {
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
                            .filter(|tag| !tag.is_empty())
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
                                let is_attrs_serialize =
                                    finished.name.eq_ignore_ascii_case("AttributesSerialize")
                                        && finished.tag.eq_ignore_ascii_case("BinaryString");

                                if is_attrs_serialize {
                                    let (decoded_attrs, decoded_types) =
                                        decode_attributes_serialize(&finished.text);
                                    nodes[item.node_index].attributes.extend(decoded_attrs);
                                    nodes[item.node_index].attribute_types.extend(decoded_types);
                                } else {
                                    let value = trim_value(
                                        &finished.name,
                                        normalize_scalar(&finished.tag, &finished.text),
                                    );
                                    nodes[item.node_index]
                                        .attribute_types
                                        .insert(finished.name.clone(), Value::String(finished.tag));
                                    nodes[item.node_index]
                                        .attributes
                                        .insert(finished.name, value);
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
                                // AttributesSerialize is a BinaryString holding the
                                // binary-encoded custom attributes blob. Decode it
                                // directly into node.attributes / node.attribute_types
                                // instead of storing the raw base64 in properties.
                                let is_attrs_serialize =
                                    finished.name.eq_ignore_ascii_case("AttributesSerialize")
                                        && finished.tag.eq_ignore_ascii_case("BinaryString");

                                if is_attrs_serialize {
                                    let (decoded_attrs, decoded_types) =
                                        decode_attributes_serialize(&finished.text);
                                    nodes[item.node_index].attributes.extend(decoded_attrs);
                                    nodes[item.node_index].attribute_types.extend(decoded_types);
                                } else {
                                    let value = trim_value(
                                        &finished.name,
                                        normalize_scalar(&finished.tag, &finished.text),
                                    );
                                    if finished.name.eq_ignore_ascii_case("Name") {
                                        if let Some(s) = value.as_str() {
                                            name_props
                                                .insert(nodes[item.node_index].id, s.to_string());
                                        }
                                    }
                                    nodes[item.node_index]
                                        .property_types
                                        .insert(finished.name.clone(), Value::String(finished.tag));
                                    nodes[item.node_index]
                                        .properties
                                        .insert(finished.name, value);
                                }
                            }
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(err) => {
                return Err(format!(
                    "Invalid RBXLX XML near byte {}: {err}",
                    reader.error_position()
                ));
            }
            _ => {}
        }
        let bytes_read = reader.buffer_position();
        if bytes_read.saturating_sub(last_progress_emit) >= PROGRESS_EMIT_BYTES_MIN
            || bytes_read >= source_size
        {
            last_progress_emit = bytes_read;
            let ratio = if source_size > 0 {
                bytes_read as f64 / source_size as f64
            } else {
                1.0
            };
            emit_import_progress(
                app,
                &import_id,
                "parsing",
                "Parsing RBXLX XML",
                IMPORT_PARSE_START + ratio * IMPORT_PARSE_SPAN,
                bytes_read,
                source_size,
                nodes.len(),
            );
        }
        buf.clear();
    }

    emit_import_progress(
        app,
        &import_id,
        "indexing",
        "Indexing DataTree search data",
        IMPORT_INDEX_PROGRESS,
        source_size,
        source_size,
        nodes.len(),
    );
    let completed_at = now_ms();
    for node in nodes.iter_mut() {
        node.search_text = format!("{} {}", node.name, node.class_name).to_ascii_lowercase();
    }
    let node_count = nodes.len();
    Ok(DataTreeSnapshot {
        id,
        name: snapshot_name(path),
        source: "rbxlx".to_string(),
        captured_at,
        completed_at,
        status: "ready".to_string(),
        nodes,
        node_count,
        expanded_ids: Vec::new(),
        active_node_id: None,
        storage_path,
        source_path: path.to_string_lossy().into_owned(),
        source_size,
    })
}

#[tauri::command]
pub fn datatree_import_file(
    app: AppHandle,
    path: String,
    import_id: Option<String>,
) -> Result<DataTreeSnapshot, String> {
    let path_buf = PathBuf::from(path);
    let id = Uuid::new_v4().to_string();
    let storage_path = snapshot_dir(&app)?
        .join(format!("{id}.json"))
        .to_string_lossy()
        .into_owned();
    let mut snapshot = parse_rbxlx(Some(&app), &path_buf, id, storage_path, import_id.clone())?;
    emit_import_progress(
        Some(&app),
        &import_id,
        "writing",
        "Writing optimized DataTree snapshot",
        IMPORT_WRITE_PROGRESS,
        snapshot.source_size,
        snapshot.source_size,
        snapshot.node_count,
    );
    write_snapshot(&app, &snapshot)?;
    let _ = remember_snapshot(Path::new(&snapshot.storage_path), snapshot.clone());
    make_snapshot_light(&mut snapshot);
    emit_import_progress(
        Some(&app),
        &import_id,
        "done",
        "Import complete",
        1.0,
        snapshot.source_size,
        snapshot.source_size,
        snapshot.node_count,
    );
    Ok(snapshot)
}

#[tauri::command]
pub async fn datatree_import_dialog(
    app: AppHandle,
    import_id: Option<String>,
) -> Result<Option<DataTreeSnapshot>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    let default_dir = dirs::home_dir().map(|h| h.join("Opiumware").join("Workspace"));
    let mut dialog = app.dialog()
        .file()
        .set_title("Import RBXLX or RBXMX")
        .add_filter("Roblox XML model", &["rbxlx", "rbxmx", "xml"]);
    if let Some(dir) = default_dir {
        if dir.exists() {
            dialog = dialog.set_directory(dir);
        }
    }
    dialog.pick_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });

    let Some(path) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };

    datatree_import_file(app, path, import_id).map(Some)
}

fn saved_game_names(file_name: &str) -> Vec<String> {
    let raw = Path::new(file_name.trim())
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(file_name)
        .trim();
    if raw.is_empty() {
        return Vec::new();
    }
    let mut names = vec![raw.to_string()];
    if Path::new(raw).extension().is_none() {
        names.push(format!("{raw}.rbxlx"));
        names.push(format!("{raw}.rbxmx"));
        names.push(format!("{raw}.xml"));
    }
    names.sort();
    names.dedup();
    names
}

fn saved_game_dirs() -> Vec<(PathBuf, usize)> {
    let Ok(home) = crate::paths::home_dir() else {
        return Vec::new();
    };
    vec![
        (home.join("Opiumware").join("workspace"), 3),
        (home.join("Opiumware"), 2),
        (home.join("Hydrogen").join("workspace"), 3),
        (home.join("Hydrogen"), 2),
        (home.join("Downloads"), 1),
        (
            crate::paths::default_workspace_dir().unwrap_or_else(|_| home.join("VelocityUI")),
            1,
        ),
    ]
}

fn newest_matching_file(
    dir: &Path,
    names: &[String],
    depth: usize,
    best: &mut Option<(SystemTime, PathBuf)>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_file() {
            let matches = path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| names.iter().any(|candidate| candidate == name))
                .unwrap_or(false);
            if !matches {
                continue;
            }
            let modified = meta.modified().unwrap_or(UNIX_EPOCH);
            if best
                .as_ref()
                .map(|(best_modified, _)| modified > *best_modified)
                .unwrap_or(true)
            {
                *best = Some((modified, path));
            }
        } else if meta.is_dir() && depth > 0 {
            newest_matching_file(&path, names, depth - 1, best);
        }
    }
}

#[tauri::command]
pub fn datatree_find_saved_game_file(file_name: String) -> Result<Option<String>, String> {
    let names = saved_game_names(&file_name);
    if names.is_empty() {
        return Ok(None);
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_terrain_grid_cells() {
        let bytes = vec![
            2, 0, // x
            1, 0, // y
            1, 0, // z
            3, 255, 0, // solid rock
            0, 0, 0, // empty
        ];
        let raw = BASE64_STANDARD.encode(bytes);
        let cells = decode_terrain_grid(&raw);

        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].material, 3);
        assert!((cells[0].occupancy - 1.0).abs() < f32::EPSILON);
        assert_eq!((cells[0].x, cells[0].y, cells[0].z), (0, 0, 0));
    }

    #[test]
    fn decodes_attributes_serialize_with_u32_name_lengths() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&4u32.to_le_bytes());
        bytes.extend_from_slice(b"Flag");
        bytes.push(0x03);
        bytes.push(1);

        let raw = BASE64_STANDARD.encode(bytes);
        let (attrs, types) = decode_attributes_serialize(&raw);

        assert_eq!(attrs.get("Flag"), Some(&Value::Bool(true)));
        assert_eq!(types.get("Flag"), Some(&Value::String("bool".to_string())));
    }

    #[test]
    fn migrates_legacy_attributes_serialize_property() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&5u32.to_le_bytes());
        bytes.extend_from_slice(b"Speed");
        bytes.push(0x3D);
        bytes.extend_from_slice(&24i32.to_le_bytes());

        let mut node = DataTreeNode {
            id: 1,
            parent_id: None,
            name: "Workspace".to_string(),
            class_name: "Workspace".to_string(),
            depth: 0,
            search_text: String::new(),
            child_count: 0,
            item_attributes: Map::new(),
            properties: Map::from_iter([(
                "AttributesSerialize".to_string(),
                Value::String(BASE64_STANDARD.encode(bytes)),
            )]),
            property_types: Map::from_iter([(
                "AttributesSerialize".to_string(),
                Value::String("BinaryString".to_string()),
            )]),
            attributes: Map::new(),
            attribute_types: Map::new(),
            tags: Vec::new(),
        };

        merge_attributes_serialize(&mut node);

        assert!(!node.properties.contains_key("AttributesSerialize"));
        assert_eq!(
            node.attributes.get("Speed"),
            Some(&Value::Number(24.into()))
        );
        assert_eq!(
            node.attribute_types.get("Speed"),
            Some(&Value::String("int".to_string()))
        );
    }

    #[test]
    fn normalizes_wait_for_child_without_dropping_closing_paren() {
        let normalized = normalize_lua_instance_expr(r#"v_u_7:WaitForChild("HitTargets")"#);

        assert_eq!(normalized, "v_u_7.HitTargets");
    }

    #[test]
    fn resolves_wait_for_child_remote_call_targets() {
        let source = r#"
local v_u_7 = script.Parent
local v_u_12 = v_u_7:WaitForChild("HitTargets")
v_u_12:FireServer(v27)
"#;
        let current_path = "game.ReplicatedStorage.Tools.Melee.Sword.MeleeClient".to_string();
        let base_vars = service_vars(source);
        let vars = instance_vars(source, &current_path, &base_vars);
        let calls = remote_calls_in_source(
            source,
            "script:1",
            &current_path,
            &vars,
            &HashMap::new(),
            &HashMap::new(),
        );

        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].remote_path,
            "game.ReplicatedStorage.Tools.Melee.Sword.HitTargets"
        );
        assert_eq!(calls[0].remote_name, "HitTargets");
    }

    #[test]
    #[ignore]
    fn datatree_probe_sample() {
        let path = std::env::var("DATATREE_SAMPLE").expect("set DATATREE_SAMPLE to an rbxlx path");
        let started = std::time::Instant::now();
        let snapshot = parse_rbxlx(
            None,
            Path::new(&path),
            "probe".to_string(),
            "/tmp/velocityui-datatree-probe.json".to_string(),
            None,
        )
        .expect("sample should parse");
        eprintln!(
            "parsed {} nodes from {} bytes in {:.2?}",
            snapshot.node_count,
            snapshot.source_size,
            started.elapsed()
        );
        assert!(snapshot.node_count > 0);
    }
}