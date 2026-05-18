use std::{fs::File, io::BufReader};

use crate::viewport::{
    protocol::{SnapshotDocument, ViewportSummary},
    summary,
};

#[tauri::command]
pub async fn viewport_summary(path: String, root_id: u32) -> Result<ViewportSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::with_capacity(1024 * 1024, file);
        let snapshot: SnapshotDocument =
            serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        summary::compile(&snapshot, root_id)
    })
    .await
    .map_err(|e| e.to_string())?
}
