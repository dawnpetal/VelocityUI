use std::{
    borrow::Cow,
    collections::HashMap,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use quick_xml::{
    escape::unescape,
    events::{BytesStart, Event},
    Reader,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeExplorerNode {
    id: u32,
    parent_id: Option<u32>,
    name: String,
    class_name: String,
    depth: u16,
    child_count: u32,
}

#[derive(Debug, Serialize)]
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

fn is_heavy_snapshot_value(key: &str, value: &Value) -> bool {
    matches!(value, Value::String(text) if (is_asset_property(key) && text.len() > 512) || text.len() > 2048)
}

fn make_snapshot_light(snapshot: &mut DataTreeSnapshot) {
    for node in snapshot.nodes.iter_mut() {
        for (key, value) in node.properties.iter_mut() {
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
        for (key, value) in node.attributes.iter_mut() {
            if matches!(value, Value::String(text) if text.len() > 512) {
                if let Value::String(text) = value {
                    let marker = format!(
                        "__dt_heavy__:{} bytes preserved in native snapshot",
                        text.len()
                    );
                    *value = Value::String(marker);
                }
            } else if is_heavy_snapshot_value(key, value) {
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
    for (key, value) in node.properties.iter_mut() {
        if is_heavy_snapshot_value(key, value) {
            if let Value::String(text) = value {
                let marker = format!("__dt_heavy__:{} bytes preserved in native snapshot", text.len());
                *value = Value::String(marker);
            }
        }
    }
    for (key, value) in node.attributes.iter_mut() {
        if matches!(value, Value::String(text) if text.len() > 512) || is_heavy_snapshot_value(key, value)
        {
            if let Value::String(text) = value {
                let marker = format!("__dt_heavy__:{} bytes preserved in native snapshot", text.len());
                *value = Value::String(marker);
            }
        }
    }
}

fn make_explorer_snapshot(snapshot: DataTreeSnapshot) -> DataTreeExplorerSnapshot {
    let mut material_variant_nodes: Vec<DataTreeNode> = snapshot
        .nodes
        .iter()
        .filter(|node| node.class_name.eq_ignore_ascii_case("MaterialVariant"))
        .map(|node| DataTreeNode {
            id: node.id,
            parent_id: node.parent_id,
            name: node.name.clone(),
            class_name: node.class_name.clone(),
            depth: node.depth,
            search_text: node.search_text.clone(),
            child_count: node.child_count,
            item_attributes: node.item_attributes.clone(),
            properties: node.properties.clone(),
            property_types: node.property_types.clone(),
            attributes: node.attributes.clone(),
            attribute_types: node.attribute_types.clone(),
            tags: node.tags.clone(),
        })
        .collect();
    for node in material_variant_nodes.iter_mut() {
        make_node_light(node);
    }
    DataTreeExplorerSnapshot {
        id: snapshot.id,
        name: snapshot.name,
        source: snapshot.source,
        captured_at: snapshot.captured_at,
        completed_at: snapshot.completed_at,
        status: snapshot.status,
        nodes: snapshot
            .nodes
            .into_iter()
            .map(|node| DataTreeExplorerNode {
                id: node.id,
                parent_id: node.parent_id,
                name: node.name,
                class_name: node.class_name,
                depth: node.depth,
                child_count: node.child_count,
            })
            .collect(),
        material_variant_nodes,
        node_count: snapshot.node_count,
        expanded_ids: snapshot.expanded_ids,
        active_node_id: snapshot.active_node_id,
        storage_path: snapshot.storage_path,
        source_path: snapshot.source_path,
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
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    } else {
        let _ = snapshot_dir(app)?;
    }
    let file = File::create(&path).map_err(|e| e.to_string())?;
    serde_json::to_writer(file, snapshot).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn datatree_load_snapshot(
    path: String,
    light: Option<bool>,
) -> Result<DataTreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let mut snapshot: DataTreeSnapshot =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
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
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let snapshot: DataTreeSnapshot =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        Ok(make_explorer_snapshot(snapshot))
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
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let snapshot: DataTreeSnapshot =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        Ok(make_render_snapshot(snapshot, root_id))
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
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let snapshot: DataTreeSnapshot =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        let node = snapshot
            .nodes
            .into_iter()
            .find(|node| node.id == node_id)
            .ok_or_else(|| "DataTree node no longer exists".to_string())?;
        let section = section.to_ascii_lowercase();
        let value = if section == "attributes" {
            node.attributes.get(&key).cloned()
        } else if section == "itemattributes" {
            node.item_attributes.get(&key).cloned()
        } else if section == "tags" {
            Some(Value::Array(
                node.tags.into_iter().map(Value::String).collect(),
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
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let snapshot: DataTreeSnapshot =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        let mut node = snapshot
            .nodes
            .into_iter()
            .find(|node| node.id == node_id)
            .ok_or_else(|| "DataTree node no longer exists".to_string())?;
        make_node_light(&mut node);
        Ok(node)
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
    let mut reader = Reader::from_reader(BufReader::with_capacity(256 * 1024, file));
    reader.config_mut().trim_text(true);

    let captured_at = now_ms();
    let mut nodes: Vec<DataTreeNode> = Vec::with_capacity(16_384);
    let mut stack: Vec<StackItem> = Vec::new();
    let mut buf = Vec::with_capacity(64 * 1024);
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
        0.03,
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
                                let value = if finished.tag.eq_ignore_ascii_case("BinaryString") {
                                    trim_value(
                                        &finished.name,
                                        Value::String(format!(
                                            "Roblox AttributesSerialize BinaryString (raw, undecoded): {}",
                                            finished.text
                                        )),
                                    )
                                } else {
                                    trim_value(
                                        &finished.name,
                                        normalize_scalar(&finished.tag, &finished.text),
                                    )
                                };
                                let key = if finished.tag.eq_ignore_ascii_case("BinaryString") {
                                    format!("__raw_{}", finished.name)
                                } else {
                                    finished.name
                                };
                                nodes[item.node_index]
                                    .attribute_types
                                    .insert(key.clone(), Value::String(finished.tag));
                                nodes[item.node_index].attributes.insert(key, value);
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
                                let value = trim_value(
                                    &finished.name,
                                    normalize_scalar(&finished.tag, &finished.text),
                                );
                                if finished.name.eq_ignore_ascii_case("Name") {
                                    if let Some(s) = value.as_str() {
                                        name_props.insert(nodes[item.node_index].id, s.to_string());
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
        if bytes_read.saturating_sub(last_progress_emit) >= 1_500_000 || bytes_read >= source_size {
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
                0.03 + ratio * 0.78,
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
        0.84,
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
        0.94,
        snapshot.source_size,
        snapshot.source_size,
        snapshot.node_count,
    );
    write_snapshot(&app, &snapshot)?;
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
    app.dialog()
        .file()
        .set_title("Import RBXLX or RBXMX")
        .add_filter("Roblox XML model", &["rbxlx", "rbxmx", "xml"])
        .pick_file(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });

    let Some(path) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };

    datatree_import_file(app, path, import_id).map(Some)
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
