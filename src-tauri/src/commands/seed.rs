use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::models::{MenuScript, ScriptsFile};

const SEEDED_FLAG: &str = ".seeded";

pub fn seed_default_workspace(app: &AppHandle) -> anyhow::Result<bool> {
    let default_dir = crate::paths::default_workspace_dir()?;
    let flag_path = crate::paths::internals_dir()?.join(SEEDED_FLAG);
    let already_seeded = flag_path.exists();

    if !already_seeded {
        fs::create_dir_all(&default_dir)?;

        if let Some(base_files) = locate_base_files(app) {
            copy_tree(&base_files, &default_dir)?;
        }

        if let Some(parent) = flag_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&flag_path, "1")?;
    }

    let scripts_path = crate::paths::scripts_path()?;
    if !scripts_path.exists() {
        let scripts = vec![
            MenuScript {
                name: "Infinite Yield".to_string(),
                shortcut: None,
                content: "loadstring(game:HttpGet('https://raw.githubusercontent.com/EdgeIY/infiniteyield/master/source'))()".to_string(),
            },
            MenuScript {
                name: "Dex Explorer".to_string(),
                shortcut: None,
                content: "loadstring(game:HttpGet('https://raw.githubusercontent.com/infyiff/backup/main/dex.lua'))()".to_string(),
            },
        ];

        if let Some(parent) = scripts_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(
            &scripts_path,
            serde_json::to_string(&ScriptsFile { scripts })?,
        )?;
    }

    Ok(!already_seeded)
}

fn write_file_if_absent(path: &Path, content: &[u8]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if !path.exists() {
        fs::write(path, content)?;
    }
    Ok(())
}

fn copy_tree(src: &Path, dst: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_child = entry.path();
        let dst_child = dst.join(entry.file_name());
        if src_child.is_dir() {
            copy_tree(&src_child, &dst_child)?;
        } else {
            write_file_if_absent(&dst_child, &fs::read(&src_child)?)?;
        }
    }
    Ok(())
}

fn locate_base_files(app: &AppHandle) -> Option<PathBuf> {
    let candidate = app.path().resource_dir().ok()?.join("BaseFiles");
    candidate.is_dir().then_some(candidate)
}
