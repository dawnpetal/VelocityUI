use tauri::State;

use crate::app::AppContext;
use crate::models::FileNode;

#[tauri::command]
pub fn build_file_tree(dir_path: String, ctx: State<'_, AppContext>) -> Result<FileNode, String> {
    ctx.FileSystem
        .build_tree(&dir_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_folder_children(
    dir_path: String,
    ctx: State<'_, AppContext>,
) -> Result<Vec<FileNode>, String> {
    ctx.FileSystem
        .load_tree_children(&dir_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_unique_filename(
    dir_path: String,
    name: String,
    is_folder: bool,
    ctx: State<'_, AppContext>,
) -> Result<String, String> {
    ctx.FileSystem
        .generate_unique_path(&dir_path, &name, is_folder)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_path_recursive(
    src: String,
    dest: String,
    ctx: State<'_, AppContext>,
) -> Result<(), String> {
    ctx.FileSystem
        .copy_recursive(&src, &dest)
        .await
        .map_err(|e| e.to_string())
}
