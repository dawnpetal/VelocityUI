use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotNode {
    pub id: u32,
    pub parent_id: Option<u32>,
    pub class_name: String,
    #[serde(default)]
    pub properties: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDocument {
    #[serde(default)]
    pub nodes: Vec<SnapshotNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportSummary {
    pub root_id: u32,
    pub processed_nodes: usize,
    pub renderable_parts: usize,
    pub external_mesh_references: usize,
}
