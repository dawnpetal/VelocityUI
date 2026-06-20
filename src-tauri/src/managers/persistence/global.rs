use std::path::PathBuf;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{ExecHistoryEntry, SessionData, UiState};
use crate::paths;

use super::{read_json, write_json};

const MAX_HISTORY: usize = 50;

pub struct GlobalStateManager;

impl GlobalStateManager {
    pub fn new() -> Self {
        Self
    }

    pub fn save_session(&self, data: &SessionData) -> VelocityUIResult<()> {
        write_json(&Self::session_path()?, data)
    }

    pub fn load_session(&self) -> Option<SessionData> {
        let new = Self::session_path().ok()?;
        if new.exists() {
            return read_json(&new).ok();
        }
        let legacy = Self::legacy_path("session.json").ok()?;
        if !legacy.exists() {
            return None;
        }
        let data: SessionData = read_json(&legacy).ok()?;
        if write_json(&new, &data).is_ok() {
            let _ = std::fs::remove_file(&legacy);
        }
        Some(data)
    }

    pub fn save_ui_state(&self, state: &UiState) -> VelocityUIResult<()> {
        write_json(&Self::ui_path()?, state)
    }

    pub fn load_ui_state(&self) -> Option<UiState> {
        Self::load_ui_state_from_disk()
    }

    pub fn push_exec_history(
        &self,
        script: String,
        filename: String,
    ) -> VelocityUIResult<ExecHistoryEntry> {
        let mut entries = self.get_exec_history();

        let preview: String = script
            .chars()
            .take(120)
            .collect::<String>()
            .replace('\n', " ");

        let entry = ExecHistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            at: chrono::Utc::now().timestamp_millis() as f64,
            filename,
            script,
            preview,
        };

        entries.insert(0, entry.clone());
        entries.truncate(MAX_HISTORY);

        write_json(&Self::history_path()?, &entries)?;

        Ok(entry)
    }

    pub fn get_exec_history(&self) -> Vec<ExecHistoryEntry> {
        let new = Self::history_path().ok();
        let legacy = Self::legacy_path("exec_history.json").ok();
        if let Some(ref p) = new {
            if p.exists() {
                if let Ok(v) = read_json(p) {
                    return v;
                }
            }
        }
        if let Some(ref p) = legacy {
            if p.exists() {
                if let Ok(v) = read_json::<Vec<ExecHistoryEntry>>(p) {
                    if let Some(ref np) = new {
                        if write_json(np, &v).is_ok() {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                    return v;
                }
            }
        }
        vec![]
    }

    pub fn load_ui_state_from_disk() -> Option<UiState> {
        let new = Self::ui_path().ok()?;
        if new.exists() {
            if let Ok(v) = read_json::<UiState>(&new) {
                return Some(v);
            }
        }
        for name in &["settings.json", "ui.json"] {
            let legacy = Self::legacy_path(name).ok()?;
            if legacy.exists() {
                if let Ok(v) = read_json::<UiState>(&legacy) {
                    if write_json(&new, &v).is_ok() {
                        let _ = std::fs::remove_file(&legacy);
                    }
                    return Some(v);
                }
            }
        }
        None
    }

    fn state_dir() -> VelocityUIResult<PathBuf> {
        let dir = paths::internals_dir()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?
            .join("state");
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir)
    }

    fn legacy_path(name: &str) -> VelocityUIResult<PathBuf> {
        let dir = paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        Ok(dir.join(name))
    }

    fn session_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::state_dir()?.join("session.json"))
    }

    fn ui_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::state_dir()?.join("settings.json"))
    }

    fn history_path() -> VelocityUIResult<PathBuf> {
        Ok(Self::state_dir()?.join("exec_history.json"))
    }
}
