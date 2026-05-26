use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size};

use crate::app::AppContext;

pub fn show_popover_without_focus(app: &AppHandle) {
    if let Some(ctx) = app.try_state::<AppContext>() {
        ctx.Window.show_popover_without_focus(app);
    }
}

pub fn restore_main_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(ui) = crate::managers::GlobalStateManager::load_ui_state_from_disk() else {
        return;
    };
    let Some(state) = ui.window_state else {
        return;
    };
    if let (Some(width), Some(height)) = (state.width, state.height) {
        let width = width.clamp(960.0, 4096.0);
        let height = height.clamp(600.0, 4096.0);
        let _ = window.set_size(Size::Logical(LogicalSize { width, height }));
    }
    if let (Some(x), Some(y)) = (state.x, state.y) {
        let x = x.clamp(-8192.0, 8192.0);
        let y = y.clamp(-8192.0, 8192.0);
        let _ = window.set_position(Position::Logical(LogicalPosition { x, y }));
    }
    if state.maximized {
        let _ = window.maximize();
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
