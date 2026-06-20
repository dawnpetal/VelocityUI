use std::path::PathBuf;

use serde_json::Value;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{TimelineEntry, TimelineHistories, TreeState};
use crate::paths;

use super::{read_json, write_json};

pub struct WorkspaceStateManager;

impl WorkspaceStateManager {
    pub fn new() -> Self {
        Self
    }

    pub fn save_tree_state(&self, work_dir: &str, state: &TreeState) -> VelocityUIResult<()> {
        write_json(&Self::tree_path(work_dir)?, state)
    }

    pub fn load_tree_state(&self, work_dir: &str) -> Option<TreeState> {
        let new_path = Self::tree_path(work_dir).ok()?;
        if new_path.exists() {
            return read_json(&new_path).ok();
        }
        let legacy = Self::legacy_tree_path(work_dir).ok()?;
        if !legacy.exists() {
            return None;
        }
        let data: TreeState = read_json(&legacy).ok()?;
        if write_json(&new_path, &data).is_ok() {
            let _ = std::fs::remove_file(&legacy);
        }
        Some(data)
    }

    pub fn save_timeline(
        &self,
        work_dir: &str,
        histories: &TimelineHistories,
    ) -> VelocityUIResult<()> {
        write_json(&Self::timelines_path(work_dir)?, histories)
    }

    pub fn load_timeline(&self, work_dir: &str) -> Option<TimelineHistories> {
        let new_path = Self::timelines_path(work_dir).ok()?;

        let raw_path = if new_path.exists() {
            new_path.clone()
        } else {
            let legacy = Self::legacy_timeline_path(work_dir).ok()?;
            if !legacy.exists() {
                return None;
            }
            legacy
        };

        let data = Self::load_and_migrate(&raw_path)?;

        if raw_path != new_path {
            if write_json(&new_path, &data).is_ok() {
                let _ = std::fs::remove_file(&raw_path);
            }
        }

        Some(data)
    }

    fn load_and_migrate(path: &PathBuf) -> Option<TimelineHistories> {
        let content = std::fs::read_to_string(path).ok()?;
        let raw: Value = serde_json::from_str(&content).ok()?;
        let obj = raw.as_object()?;

        let mut result = TimelineHistories::new();
        for (file_path, entries) in obj {
            let arr = entries.as_array()?;
            let converted: Vec<TimelineEntry> = arr
                .iter()
                .filter_map(|v| {
                    if v.is_object() {
                        serde_json::from_value(v.clone()).ok()
                    } else if let Some(s) = v.as_str() {
                        Some(TimelineEntry {
                            at: 0.0,
                            content: s.to_owned(),
                            name: String::new(),
                        })
                    } else {
                        None
                    }
                })
                .collect();
            if !converted.is_empty() {
                result.insert(file_path.clone(), converted);
            }
        }

        Some(result)
    }

    fn sanitize_key(work_dir: &str) -> String {
        work_dir
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }

    fn tree_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let dir = paths::internals_dir()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?
            .join("workspace");
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir.join(format!("{}.json", key)))
    }

    fn legacy_tree_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let internals =
            paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        Ok(internals.join(format!("tree_{}.json", key)))
    }

    fn timelines_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let dir = paths::internals_dir()
            .map_err(|e| VelocityUIError::Other(e.to_string()))?
            .join("timelines");
        std::fs::create_dir_all(&dir).map_err(VelocityUIError::Io)?;
        Ok(dir.join(format!("{}.json", key)))
    }

    fn legacy_timeline_path(work_dir: &str) -> VelocityUIResult<PathBuf> {
        let key = Self::sanitize_key(work_dir);
        let internals =
            paths::internals_dir().map_err(|e| VelocityUIError::Other(e.to_string()))?;
        Ok(internals.join(format!("timeline_{}.json", key)))
    }
}
