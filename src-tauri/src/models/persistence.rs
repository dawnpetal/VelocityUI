use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeState {
    #[serde(rename = "openPaths")]
    pub open_paths: Vec<String>,
    #[serde(rename = "activeFile")]
    pub active_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    #[serde(rename = "workDir")]
    pub work_dir: Option<String>,
    #[serde(rename = "lastFolder")]
    pub last_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    #[serde(rename = "sidebarWidth")]
    pub sidebar_width: Option<u32>,
    #[serde(rename = "panelVisible")]
    pub panel_visible: bool,
    #[serde(rename = "sbBottomHeight")]
    pub sb_bottom_height: Option<u32>,
    #[serde(rename = "activeView")]
    pub active_view: String,
    pub settings: UiSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    #[serde(rename = "fontSize")]
    pub font_size: Option<u32>,
    #[serde(rename = "wordWrap")]
    pub word_wrap: Option<bool>,
    pub minimap: Option<bool>,
    #[serde(rename = "lineNumbers")]
    pub line_numbers: Option<bool>,
    #[serde(rename = "appZoom", default, skip_serializing_if = "Option::is_none")]
    pub app_zoom: Option<f64>,
    #[serde(
        rename = "hiddenActivityViews",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub hidden_activity_views: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
    #[serde(
        rename = "autoUpdate",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub auto_update: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecHistoryEntry {
    pub id: String,
    pub at: f64,
    pub filename: String,
    pub script: String,
    pub preview: String,
}

pub type TimelineHistories = HashMap<String, Vec<String>>;
