use tauri::{AppHandle, Manager};

use crate::app::AppContext;

pub fn show_popover_without_focus(app: &AppHandle) {
    if let Some(ctx) = app.try_state::<AppContext>() {
        ctx.Window.show_popover_without_focus(app);
    }
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?
        .close()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?
        .minimize()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn toggle_maximize_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    if window.is_maximized().map_err(|err| err.to_string())? {
        window.unmaximize().map_err(|err| err.to_string())
    } else {
        window.maximize().map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub fn set_app_zoom(app: AppHandle, scale_factor: f64) -> Result<(), String> {
    let zoom = scale_factor.clamp(0.7, 1.5);
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?
        .set_zoom(zoom)
        .map_err(|err| err.to_string())
}
