use tauri::State;

use crate::app::AppContext;
use crate::managers::icon_theme::ThemePack;

#[tauri::command]
pub fn icon_theme_load(ctx: State<'_, AppContext>) -> Result<(), String> {
    ctx.IconTheme.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn icon_theme_get_active(_ctx: State<'_, AppContext>) -> String {
    "material".to_string()
}

#[tauri::command]
pub fn icon_theme_get_installed(_ctx: State<'_, AppContext>) -> Vec<String> {
    vec!["material".to_string()]
}

#[tauri::command]
pub fn icon_theme_get_registry(ctx: State<'_, AppContext>) -> Vec<ThemePack> {
    ctx.IconTheme.get_registry()
}

#[tauri::command]
pub fn icon_theme_is_installed(id: String, _ctx: State<'_, AppContext>) -> bool {
    id == "material"
}

#[tauri::command]
pub fn icon_theme_is_active(id: String, _ctx: State<'_, AppContext>) -> bool {
    id == "material"
}

#[tauri::command]
pub fn icon_theme_activate(_id: String, _ctx: State<'_, AppContext>) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn icon_theme_install(_id: String, _ctx: State<'_, AppContext>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn icon_theme_uninstall(_id: String, _ctx: State<'_, AppContext>) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn icon_theme_load_installed_icons(
    _theme_id: String,
    _ctx: State<'_, AppContext>,
) -> Result<Option<(serde_json::Value, String)>, String> {
    Ok(None)
}
