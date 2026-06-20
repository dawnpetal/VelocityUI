use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{VelocityUIError, VelocityUIResult};

const BUILTIN_ID: &str = "material";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemePack {
    pub id: String,
    pub name: String,
    pub author: String,
    pub description: String,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zip_urls: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub svg_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seti_format: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct StateFile {
    active: String,
    installed: Vec<String>,
}

pub struct IconThemeManager {
    internals_dir: PathBuf,
}

#[allow(dead_code)]
impl IconThemeManager {
    pub fn new(internals_dir: PathBuf) -> Self {
        Self { internals_dir }
    }

    pub fn load(&self) -> VelocityUIResult<()> {
        self.save()
    }

    pub fn get_active(&self) -> String {
        BUILTIN_ID.to_string()
    }

    pub fn get_installed(&self) -> Vec<String> {
        vec![BUILTIN_ID.to_string()]
    }

    pub fn get_registry(&self) -> Vec<ThemePack> {
        vec![ThemePack {
            id: "material".into(),
            name: "Material Icon Theme".into(),
            author: "PKief".into(),
            description: "The original material design file icons".into(),
            builtin: true,
            zip_urls: None,
            icon_dir: None,
            manifest_path: None,
            svg_root: None,
            seti_format: None,
        }]
    }

    pub fn is_installed(&self, id: &str) -> bool {
        id == BUILTIN_ID
    }

    pub fn is_active(&self, id: &str) -> bool {
        id == BUILTIN_ID
    }

    pub fn activate(&self, _id: String) -> VelocityUIResult<bool> {
        Ok(false)
    }

    pub async fn install(&self, _pack_id: &str, _client: &reqwest::Client) -> VelocityUIResult<()> {
        Ok(())
    }

    pub fn uninstall(&self, _id: &str) -> VelocityUIResult<bool> {
        Ok(false)
    }

    pub fn load_installed_icons(
        &self,
        _theme_id: &str,
    ) -> VelocityUIResult<Option<(serde_json::Value, String)>> {
        Ok(None)
    }

    fn save(&self) -> VelocityUIResult<()> {
        let cache_dir = self.internals_dir.join("cache");
        std::fs::create_dir_all(&cache_dir).map_err(VelocityUIError::Io)?;
        let state = StateFile {
            active: BUILTIN_ID.to_string(),
            installed: vec![BUILTIN_ID.to_string()],
        };
        let content = serde_json::to_string(&state).map_err(VelocityUIError::Json)?;
        let legacy = self.internals_dir.join("icon_themes.json");
        if legacy.exists() {
            let _ = std::fs::remove_file(&legacy);
        }
        std::fs::write(cache_dir.join("icon_themes.json"), content).map_err(VelocityUIError::Io)
    }
}
