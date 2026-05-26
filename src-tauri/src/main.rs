#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod commands;
mod cookies;
mod error;
mod managers;
mod models;
mod paths;
mod services;
mod viewport;

use std::sync::Arc;

use anyhow::Result;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, Manager, Runtime,
};

use app::AppContext;

fn build_app_menu<R: Runtime>(app: &tauri::App<R>) -> Result<Menu<R>> {
    let quit = MenuItem::with_id(
        app,
        "app:quit",
        "Quit VelocityUI",
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    let velocityui_menu = Submenu::with_items(
        app,
        "VelocityUI",
        true,
        &[
            &MenuItem::with_id(
                app,
                "app:website",
                "Velocity Website",
                true,
                Some("CmdOrCtrl+Shift+?"),
            )?,
            &MenuItem::with_id(
                app,
                "app:updates",
                "Check for Updates...",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "file:new", "New File", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(
                app,
                "file:open-folder",
                "Open Folder...",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "file:save", "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(
                app,
                "file:close-tab",
                "Close Tab",
                true,
                Some("CmdOrCtrl+W"),
            )?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "edit:format-document",
                "Format Document",
                true,
                Some("Shift+Alt+F"),
            )?,
            &MenuItem::with_id(
                app,
                "edit:toggle-comment",
                "Toggle Line Comment",
                true,
                Some("CmdOrCtrl+/"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let activity_visibility = Submenu::with_items(
        app,
        "Activity Bar Tabs",
        true,
        &[
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:explorer",
                "Explorer",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:search",
                "Search",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:datatree",
                "DataTree",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:accounts",
                "Accounts",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:pinboard",
                "Pinboard",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:cloud",
                "Cloud Scripts",
                true,
                true,
                None::<&str>,
            )?,
            &CheckMenuItem::with_id(
                app,
                "activity:toggle:settings",
                "Settings",
                true,
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(
                app,
                "view:command-palette",
                "Command Palette...",
                true,
                Some("CmdOrCtrl+P"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "view:explorer",
                "Explorer",
                true,
                Some("CmdOrCtrl+Shift+E"),
            )?,
            &MenuItem::with_id(
                app,
                "view:search",
                "Search",
                true,
                Some("CmdOrCtrl+Shift+F"),
            )?,
            &MenuItem::with_id(
                app,
                "view:datatree",
                "DataTree",
                true,
                Some("CmdOrCtrl+Shift+D"),
            )?,
            &MenuItem::with_id(app, "view:accounts", "Accounts", true, None::<&str>)?,
            &MenuItem::with_id(app, "view:pinboard", "Pinboard", true, None::<&str>)?,
            &MenuItem::with_id(app, "view:cloud", "Cloud Scripts", true, None::<&str>)?,
            &MenuItem::with_id(app, "view:settings", "Settings", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                "view:toggle-sidebar",
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+B"),
            )?,
            &MenuItem::with_id(
                app,
                "view:toggle-panel",
                "Toggle Panel",
                true,
                Some("CmdOrCtrl+J"),
            )?,
            &activity_visibility,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "view:zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?,
            &MenuItem::with_id(app, "view:zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &MenuItem::with_id(
                app,
                "view:zoom-reset",
                "Reset Zoom",
                true,
                Some("CmdOrCtrl+0"),
            )?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &MenuItem::with_id(
                app,
                "window:minimize",
                "Minimize",
                true,
                Some("CmdOrCtrl+M"),
            )?,
            &MenuItem::with_id(app, "window:toggle-zoom", "Zoom", true, None::<&str>)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &MenuItem::with_id(app, "help:website", "Velocity Website", true, None::<&str>)?,
            &MenuItem::with_id(app, "help:discord", "Join Discord", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "help:updates",
                "Check for Updates...",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    Ok(Menu::with_items(
        app,
        &[
            &velocityui_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )?)
}

fn position_popover_below_tray(app: &AppHandle, tray_pos: tauri::PhysicalPosition<f64>) {
    let Some(popover) = app.get_webview_window("popover") else {
        return;
    };
    let scale = popover.scale_factor().unwrap_or(2.0);
    let _ = popover.set_position(LogicalPosition::new(
        tray_pos.x / scale - 130.0,
        tray_pos.y / scale + 8.0,
    ));
    commands::window::show_popover_without_focus(app);
}

fn setup_tray(app: &tauri::App) -> Result<()> {
    let tray_icon_path = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("icons/tray.png");

    let icon = if tray_icon_path.exists() {
        let img = image::open(&tray_icon_path).map(|i| i.into_rgba8()).ok();
        if let Some(rgba) = img {
            let (w, h) = rgba.dimensions();
            tauri::image::Image::new_owned(rgba.into_raw(), w, h)
        } else {
            app.default_window_icon().cloned().unwrap()
        }
    } else {
        app.default_window_icon().cloned().unwrap()
    };

    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip("VelocityUI")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                let Some(popover) = app.get_webview_window("popover") else {
                    return;
                };
                match popover.is_visible() {
                    Ok(true) => {
                        let _ = popover.hide();
                    }
                    _ => position_popover_below_tray(app, position),
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    let ctx = AppContext::build();
    let executor_for_watcher = Arc::clone(&ctx.Executor);

    tauri::Builder::default()
        .manage(ctx)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            use commands::executor::is_roblox_focused;
            use tauri_plugin_global_shortcut::ShortcutState;

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        if event.state != ShortcutState::Pressed || !is_roblox_focused() {
                            return;
                        }
                        let ctx = app.state::<AppContext>();
                        let Some(code) = ctx.Script.lookup_shortcut(shortcut.id()) else {
                            return;
                        };
                        let exec = Arc::clone(&ctx.Executor);
                        tokio::spawn(async move {
                            let _ = exec.inject(&code).await;
                        });
                    })
                    .build(),
            )?;

            let menu = build_app_menu(app)?;
            app.set_menu(menu)?;
            commands::window::restore_main_window_state(app.handle());
            app.on_menu_event(|app, event| {
                let id = event.id().0.clone();
                if id == "app:quit" {
                    app.exit(0);
                    return;
                }
                let _ = app.emit("app-menu-command", id);
            });

            if let Err(e) = commands::seed::seed_default_workspace(app.handle()) {
                eprintln!("first-run seed warning: {e}");
            }

            setup_tray(app)?;

            let ctx = app.state::<AppContext>();
            if let Ok(scripts) = ctx.Script.get() {
                let _ = ctx.Script.register_shortcuts(app.handle(), &scripts);
            }
            let app_handle = app.handle().clone();
            let client_bridge = Arc::clone(&ctx.ClientBridge);
            let multi_instance = Arc::clone(&ctx.MultiInstance);
            tauri::async_runtime::spawn(async move {
                let emit_handle = app_handle.clone();
                match client_bridge.ensure_started(app_handle).await {
                    Ok(port) => {
                        let _ = multi_instance.install_autoexec_script(port);
                    }
                    Err(err) => {
                        let message = err.to_string();
                        let _ = emit_handle.emit(
                            "client-bridge:error",
                            serde_json::json!({
                                "port": managers::client_bridge::CLIENT_BRIDGE_PORT,
                                "message": message,
                            }),
                        );
                        eprintln!("client bridge warning: {message}");
                    }
                }
            });

            commands::console::ensure_console_monitor(app.handle().clone());
            commands::executor::start_autoexec_watcher(app.handle().clone(), executor_for_watcher);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::accounts::accounts_add,
            commands::accounts::accounts_list,
            commands::accounts::accounts_remove,
            commands::accounts::accounts_refresh,
            commands::accounts::accounts_get_cookie,
            commands::accounts::accounts_get_running,
            commands::accounts::accounts_launch,
            commands::accounts::accounts_kill,
            commands::accounts::accounts_kill_all,
            commands::accounts::accounts_set_default,
            commands::accounts::accounts_is_launching,
            commands::ai::ai_get_config,
            commands::ai::ai_save_config,
            commands::ai::ai_generate,
            commands::ai::ai_cancel_request,
            commands::console::console_monitor_set_streaming,
            commands::console::console_monitor_watch_errors,
            commands::io::get_app_paths,
            commands::io::read_text_file,
            commands::io::read_binary_file,
            commands::io::read_text_file_preview,
            commands::io::write_text_file,
            commands::io::write_binary_file,
            commands::io::read_dir,
            commands::io::create_dir,
            commands::io::stat_path,
            commands::io::remove_path,
            commands::io::trash_path,
            commands::io::rename_path,
            commands::io::copy_file,
            commands::io::watch_path,
            commands::io::unwatch_path,
            commands::io::show_folder_dialog,
            commands::io::open_external,
            commands::io::write_clipboard,
            commands::io::exit_app,
            commands::window::close_window,
            commands::window::minimize_window,
            commands::window::toggle_maximize_window,
            commands::window::set_app_zoom,
            commands::executor::inject_script,
            commands::executor::inject_script_with_client_bridge,
            commands::executor::get_active_port,
            commands::executor::get_client_bridge_port,
            commands::executor::queue_client_bridge_task,
            commands::executor::clear_port_cache,
            commands::executor::switch_executor,
            commands::executor::focus_roblox,
            commands::executor::get_executor_status,
            commands::executor::get_executor_autoexec_dir,
            commands::scripts::get_scripts,
            commands::scripts::save_scripts,
            commands::scripts::reload_tray_scripts,
            commands::auth::validate_key,
            commands::auth::get_key_cache,
            commands::auth::record_inject_cmd,
            commands::datatree::datatree_load_snapshot,
            commands::datatree::datatree_load_explorer_snapshot,
            commands::datatree::datatree_node_detail,
            commands::datatree::datatree_node_value,
            commands::datatree::datatree_scan_scripts,
            commands::datatree::datatree_build_logic_web,
            commands::datatree::datatree_render_snapshot,
            commands::datatree::datatree_decode_terrain_grid,
            commands::datatree::datatree_import_dialog,
            commands::datatree::datatree_import_file,
            commands::datatree::datatree_find_saved_game_file,
            commands::viewport::viewport_summary,
            commands::network::http_fetch,
            commands::network::http_fetch_binary,
            commands::search::search_with_highlights,
            commands::icon_theme::icon_theme_load,
            commands::icon_theme::icon_theme_get_active,
            commands::icon_theme::icon_theme_get_installed,
            commands::icon_theme::icon_theme_get_registry,
            commands::icon_theme::icon_theme_is_installed,
            commands::icon_theme::icon_theme_is_active,
            commands::icon_theme::icon_theme_activate,
            commands::icon_theme::icon_theme_install,
            commands::icon_theme::icon_theme_uninstall,
            commands::icon_theme::icon_theme_load_installed_icons,
            commands::file_system::build_file_tree,
            commands::file_system::load_folder_children,
            commands::file_system::generate_unique_filename,
            commands::file_system::copy_path_recursive,
            commands::persistence::save_tree_state_cmd,
            commands::persistence::load_tree_state_cmd,
            commands::persistence::save_timeline_cmd,
            commands::persistence::load_timeline_cmd,
            commands::persistence::save_session_cmd,
            commands::persistence::load_session_cmd,
            commands::persistence::save_ui_state_cmd,
            commands::persistence::load_ui_state_cmd,
            commands::persistence::push_exec_history_cmd,
            commands::persistence::get_exec_history_cmd,
            commands::update::get_app_version,
            commands::update::check_for_update,
            commands::update::get_last_update_result,
            commands::update::download_update,
            commands::update::install_update_and_restart,
            commands::multi_instance::multiinstance_get_clients,
            commands::multi_instance::multiinstance_send_script,
            commands::multi_instance::multiinstance_send_script_many,
            commands::multi_instance::multiinstance_install_autoexec,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
