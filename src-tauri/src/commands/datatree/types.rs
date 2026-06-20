use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeNode {
    pub id: u32,
    pub parent_id: Option<u32>,
    pub name: String,
    pub class_name: String,
    pub depth: u16,
    pub search_text: String,
    pub child_count: u32,
    #[serde(default)]
    pub item_attributes: Map<String, Value>,
    pub properties: Map<String, Value>,
    #[serde(default)]
    pub property_types: Map<String, Value>,
    pub attributes: Map<String, Value>,
    #[serde(default)]
    pub attribute_types: Map<String, Value>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeSnapshot {
    pub id: String,
    pub name: String,
    pub source: String,
    pub captured_at: u64,
    pub completed_at: u64,
    pub status: String,
    pub nodes: Vec<DataTreeNode>,
    pub node_count: usize,
    pub expanded_ids: Vec<u32>,
    pub active_node_id: Option<u32>,
    pub storage_path: String,
    pub source_path: String,
    pub source_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeExplorerNode {
    pub id: u32,
    pub parent_id: Option<u32>,
    pub name: String,
    pub class_name: String,
    pub depth: u16,
    pub child_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTreeExplorerSnapshot {
    pub id: String,
    pub name: String,
    pub source: String,
    pub captured_at: u64,
    pub completed_at: u64,
    pub status: String,
    pub nodes: Vec<DataTreeExplorerNode>,
    pub material_variant_nodes: Vec<DataTreeNode>,
    pub node_count: usize,
    pub expanded_ids: Vec<u32>,
    pub active_node_id: Option<u32>,
    pub storage_path: String,
    pub source_path: String,
    pub source_size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptScanHit {
    pub id: u32,
    pub name: String,
    pub class_name: String,
    pub path: String,
    pub matches: usize,
    pub source_len: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWeb {
    pub version: u32,
    pub generated_at: u64,
    #[serde(default)]
    pub source_len: u64,
    #[serde(default)]
    pub source_modified_ms: u64,
    pub summary: LogicWebSummary,
    pub systems: Vec<LogicWebSystem>,
    pub nodes: Vec<LogicWebNode>,
    pub edges: Vec<LogicWebEdge>,
    pub remote_calls: Vec<LogicWebRemoteCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebSummary {
    pub script_count: usize,
    pub module_count: usize,
    pub local_script_count: usize,
    pub server_script_count: usize,
    pub remote_count: usize,
    pub config_count: usize,
    pub edge_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebSystem {
    pub id: String,
    pub name: String,
    pub node_ids: Vec<String>,
    pub script_count: usize,
    pub remote_count: usize,
    pub edge_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebNode {
    pub id: String,
    pub node_id: Option<u32>,
    pub kind: String,
    pub class_name: String,
    pub name: String,
    pub path: String,
    pub parent_path: String,
    pub system_id: String,
    pub source_len: usize,
    pub exports: Vec<String>,
    pub config_keys: Vec<String>,
    pub services: Vec<String>,
    pub remote_events: Vec<String>,
    pub score: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: String,
    pub label: String,
    pub evidence: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicWebRemoteCall {
    pub id: String,
    pub remote_key: String,
    pub remote_name: String,
    pub remote_path: String,
    pub remote_class_name: String,
    pub caller_id: String,
    pub caller_path: String,
    pub method: String,
    pub direction: String,
    pub args: Vec<String>,
    pub arg_signature: String,
    pub evidence: String,
    pub line: usize,
    pub confidence: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainCell {
    pub material: u8,
    pub occupancy: f32,
    pub x: u16,
    pub y: u16,
    pub z: u16,
}