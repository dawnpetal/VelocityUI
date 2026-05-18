use tauri::{AppHandle, State};

use crate::app::AppContext;
use crate::models::DirEntry;

fn path_to_string(path: std::path::PathBuf, label: &str) -> Result<String, String> {
    path.to_str()
        .map(String::from)
        .ok_or_else(|| format!("{label} path is not valid UTF-8"))
}

#[tauri::command]
pub fn get_app_paths() -> Result<serde_json::Value, String> {
    let home = crate::paths::home_dir().map_err(|e| e.to_string())?;
    let velocityui = crate::paths::velocityui_dir().map_err(|e| e.to_string())?;
    let internals = crate::paths::internals_dir().map_err(|e| e.to_string())?;
    let workspaces = velocityui.join("workspaces");
    let default_workspace = crate::paths::default_workspace_dir().map_err(|e| e.to_string())?;

    for dir in [&velocityui, &internals, &workspaces, &default_workspace] {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({
        "home": path_to_string(home, "home")?,
        "velocityui": path_to_string(velocityui, "velocityui")?,
        "internals": path_to_string(internals, "internals")?,
        "workspaces": path_to_string(workspaces, "workspaces")?,
        "defaultWorkspace": path_to_string(default_workspace, "default workspace")?,
    }))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn read_text_file_preview(path: String, max_bytes: u64) -> Result<serde_json::Value, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let limit = max_bytes.min(size) as usize;
    let mut bytes = vec![0; limit];
    if limit > 0 {
        file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    }
    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok(serde_json::json!({
        "content": content,
        "truncated": size > max_bytes,
        "size": size,
    }))
}

#[tauri::command]
pub fn read_text_file_from(
    path: String,
    offset: u64,
    max_bytes: u64,
) -> Result<serde_json::Value, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let start = offset.min(size);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let limit = max_bytes.min(size.saturating_sub(start)) as usize;
    let mut bytes = vec![0; limit];
    if limit > 0 {
        file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    }
    let next_offset = start + limit as u64;
    let content = String::from_utf8_lossy(&bytes).into_owned();
    Ok(serde_json::json!({
        "content": content,
        "offset": start,
        "nextOffset": next_offset,
        "size": size,
        "truncated": next_offset < size,
    }))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_binary_file(path: String, content_base64: String) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|e| e.to_string())?;
    std::fs::write(p, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .map(|item| {
            let item = item.map_err(|e| e.to_string())?;
            let name = item
                .file_name()
                .to_str()
                .ok_or_else(|| "filename is not valid UTF-8".to_string())?
                .to_string();
            let kind = if item.file_type().map_err(|e| e.to_string())?.is_dir() {
                "DIRECTORY"
            } else {
                "FILE"
            };
            Ok(DirEntry {
                entry: name,
                kind: kind.to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stat_path(path: String) -> Result<serde_json::Value, String> {
    match std::fs::metadata(&path) {
        Ok(m) => Ok(serde_json::json!({
            "exists": true,
            "isFile": m.is_file(),
            "isDirectory": m.is_dir(),
            "size": m.len(),
        })),
        Err(_) => Ok(serde_json::json!({ "exists": false })),
    }
}

#[tauri::command]
pub fn remove_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn rename_path(src: String, dest: String) -> Result<(), String> {
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(src: String, dest: String) -> Result<(), String> {
    let dest_path = std::path::Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dest)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn watch_path(app: AppHandle, path: String, ctx: State<'_, AppContext>) -> Result<u32, String> {
    ctx.FileSystem.watch(&app, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unwatch_path(id: u32, ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.FileSystem.unwatch(id);
    Ok(())
}

#[tauri::command]
pub async fn show_folder_dialog(app: AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(&title)
        .pick_folder(move |path| {
            let _ = tx.send(path.map(|p| p.to_string()));
        });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_clipboard(text: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
