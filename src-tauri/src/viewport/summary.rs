use std::{collections::HashMap, sync::OnceLock};

use regex::Regex;
use serde_json::Value;

use super::protocol::{SnapshotDocument, SnapshotNode, ViewportSummary};

pub fn compile(snapshot: &SnapshotDocument, root_id: u32) -> Result<ViewportSummary, String> {
    let mut by_id = HashMap::with_capacity(snapshot.nodes.len());
    let mut children: HashMap<u32, Vec<usize>> = HashMap::new();
    for (index, node) in snapshot.nodes.iter().enumerate() {
        by_id.insert(node.id, index);
        if let Some(parent_id) = node.parent_id {
            children.entry(parent_id).or_default().push(index);
        }
    }

    let Some(root_index) = by_id.get(&root_id).copied() else {
        return Err("Viewport root no longer exists".to_string());
    };

    let mut processed_nodes = 0usize;
    let mut renderable_parts = 0usize;
    let mut external_mesh_references = 0usize;
    let mut stack = vec![root_index];

    while let Some(index) = stack.pop() {
        processed_nodes += 1;
        let node = &snapshot.nodes[index];
        let node_children = children.get(&node.id).map(Vec::as_slice).unwrap_or(&[]);
        if is_renderable_class(&node.class_name) {
            renderable_parts += 1;
            if has_external_mesh(node, node_children, &snapshot.nodes) {
                external_mesh_references += 1;
            }
        }
        for child in node_children.iter().rev() {
            stack.push(*child);
        }
    }

    Ok(ViewportSummary {
        root_id,
        processed_nodes,
        renderable_parts,
        external_mesh_references,
    })
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

fn has_external_mesh(node: &SnapshotNode, child_indexes: &[usize], nodes: &[SnapshotNode]) -> bool {
    if embedded_mesh(&node.properties).is_some() {
        return false;
    }
    if asset_id(first_prop(
        &node.properties,
        &[
            "MeshId",
            "MeshID",
            "MeshContent",
            "MeshData",
            "ModelMeshData",
        ],
    ))
    .is_some()
    {
        return true;
    }

    let mesh_child = child_indexes
        .iter()
        .map(|index| &nodes[*index])
        .find(|child| is_mesh_child_class(&child.class_name));

    let Some(mesh_child) = mesh_child else {
        return false;
    };
    if embedded_mesh(&mesh_child.properties).is_some() {
        return false;
    }
    asset_id(first_prop(
        &mesh_child.properties,
        &[
            "MeshId",
            "MeshID",
            "MeshContent",
            "MeshData",
            "ModelMeshData",
        ],
    ))
    .is_some()
}

fn embedded_mesh(props: &serde_json::Map<String, Value>) -> Option<&str> {
    let raw = first_prop(
        props,
        &[
            "MeshData",
            "MeshContent",
            "ModelMeshData",
            "SerializedMesh",
            "PhysicsData",
        ],
    )?;
    let lower = raw.to_ascii_lowercase();
    if lower.starts_with("rbxasset")
        || lower.starts_with("http://")
        || lower.starts_with("https://")
    {
        None
    } else {
        Some(raw)
    }
}

fn first_prop<'a>(props: &'a serde_json::Map<String, Value>, keys: &[&str]) -> Option<&'a str> {
    for key in keys {
        if let Some(value) = props.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    for key in keys {
        let wanted = key.to_ascii_lowercase();
        if let Some((_, value)) = props
            .iter()
            .find(|(name, _)| name.to_ascii_lowercase() == wanted)
        {
            if let Some(value) = value.as_str() {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed);
                }
            }
        }
    }
    None
}

fn asset_id(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    static ASSET_ID_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let patterns = ASSET_ID_PATTERNS.get_or_init(|| {
        [
            r"(?i)rbxasset(?:id)?://(\d+)",
            r"(?i)[?&]id=(\d+)",
            r"(?i)/(?:asset|assetId)/(\d+)",
            r"\b(\d{5,})\b",
        ]
        .into_iter()
        .map(|pattern| Regex::new(pattern).expect("valid asset-id regex"))
        .collect()
    });
    for re in patterns {
        if let Some(captures) = re.captures(value) {
            if let Some(id) = captures.get(1) {
                return Some(id.as_str().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn node(id: u32, parent_id: Option<u32>, class_name: &str, properties: Value) -> SnapshotNode {
        SnapshotNode {
            id,
            parent_id,
            class_name: class_name.to_string(),
            properties: properties.as_object().cloned().unwrap_or_default(),
        }
    }

    #[test]
    fn counts_renderables_and_external_meshes() {
        let snapshot = SnapshotDocument {
            nodes: vec![
                node(1, None, "Model", json!({})),
                node(2, Some(1), "Part", json!({})),
                node(
                    3,
                    Some(1),
                    "MeshPart",
                    json!({ "MeshId": "rbxassetid://123456" }),
                ),
                node(4, Some(1), "Part", json!({})),
                node(
                    5,
                    Some(4),
                    "SpecialMesh",
                    json!({ "MeshId": "rbxassetid://999999" }),
                ),
                node(
                    6,
                    Some(1),
                    "MeshPart",
                    json!({ "MeshData": "embedded payload" }),
                ),
            ],
        };

        let summary = compile(&snapshot, 1).expect("summary");
        assert_eq!(summary.processed_nodes, 6);
        assert_eq!(summary.renderable_parts, 4);
        assert_eq!(summary.external_mesh_references, 2);
    }
}
