use std::path::{Path, PathBuf};

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::FileNode;

pub struct FileTreeManager;

impl FileTreeManager {
    pub fn new() -> Self {
        Self
    }

    pub fn build(&self, dir_path: &str) -> VelocityUIResult<FileNode> {
        build_shallow_root(Path::new(dir_path))
    }

    pub fn children(&self, dir_path: &str) -> VelocityUIResult<Vec<FileNode>> {
        build_children(Path::new(dir_path))
    }

    pub fn generate_unique_path(
        &self,
        dir_path: &str,
        name: &str,
        is_folder: bool,
    ) -> VelocityUIResult<String> {
        let base = PathBuf::from(dir_path);

        let (stem, ext) = if is_folder {
            (name, "")
        } else {
            match name.rfind('.') {
                Some(i) => (&name[..i], &name[i..]),
                None => (name, ""),
            }
        };

        let mut candidate = name.to_string();
        for counter in 1..=9999 {
            if !base.join(&candidate).exists() {
                return Ok(candidate);
            }
            candidate = format!("{}_{}{}", stem, counter, ext);
        }

        Ok(format!(
            "{}_{}{}",
            stem,
            &uuid::Uuid::new_v4().to_string()[..8],
            ext
        ))
    }

    pub async fn copy_recursive(&self, src: &str, dest: &str) -> VelocityUIResult<()> {
        let src = src.to_string();
        let dest = dest.to_string();
        tauri::async_runtime::spawn_blocking(move || copy_sync(&src, &dest))
            .await
            .map_err(|e| VelocityUIError::Other(format!("copy task join error: {e}")))?
    }
}

fn folder_identity(path: &Path) -> VelocityUIResult<(String, String)> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| VelocityUIError::InvalidData("invalid path component".into()))?
        .to_string();

    let path_str = path
        .to_str()
        .ok_or_else(|| VelocityUIError::InvalidData("non-UTF-8 path".into()))?
        .to_string();
    Ok((name, path_str))
}

fn build_shallow_root(path: &Path) -> VelocityUIResult<FileNode> {
    let (name, path_str) = folder_identity(path)?;
    Ok(FileNode::folder(
        uuid::Uuid::new_v4().to_string(),
        name,
        path_str,
        build_children(path)?,
    ))
}

fn build_children(path: &Path) -> VelocityUIResult<Vec<FileNode>> {
    let mut children: Vec<FileNode> = std::fs::read_dir(path)
        .map_err(VelocityUIError::Io)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let entry_name = entry.file_name();
            let entry_name_str = entry_name.to_str()?;

            if entry_name_str.starts_with('.') {
                return None;
            }

            let entry_path = entry.path();
            let entry_path_str = entry_path.to_str()?.to_string();
            let meta = entry.metadata().ok()?;

            if meta.is_dir() {
                Some(FileNode::lazy_folder(
                    uuid::Uuid::new_v4().to_string(),
                    entry_name_str.to_string(),
                    entry_path_str,
                ))
            } else {
                Some(FileNode::file(
                    uuid::Uuid::new_v4().to_string(),
                    entry_name_str.to_string(),
                    entry_path_str,
                    meta.len(),
                ))
            }
        })
        .collect();

    children.sort_by(|a, b| match (a.is_folder(), b.is_folder()) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(children)
}

fn copy_sync(src: &str, dest: &str) -> VelocityUIResult<()> {
    let src_path = Path::new(src);
    let dest_path = Path::new(dest);

    if !src_path.exists() {
        return Err(VelocityUIError::NotFound(format!(
            "source not found: {}",
            src
        )));
    }

    if src_path.is_dir() {
        std::fs::create_dir_all(dest_path).map_err(VelocityUIError::Io)?;

        for entry in std::fs::read_dir(src_path).map_err(VelocityUIError::Io)? {
            let entry = entry.map_err(VelocityUIError::Io)?;
            let name = entry.file_name();
            let name_str = name
                .to_str()
                .ok_or_else(|| VelocityUIError::InvalidData("non-UTF-8 filename".into()))?;

            let child_src = src_path.join(name_str).to_string_lossy().into_owned();
            let child_dest = dest_path.join(name_str).to_string_lossy().into_owned();
            copy_sync(&child_src, &child_dest)?;
        }
    } else {
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(VelocityUIError::Io)?;
        }
        std::fs::copy(src_path, dest_path).map_err(VelocityUIError::Io)?;
    }

    Ok(())
}
