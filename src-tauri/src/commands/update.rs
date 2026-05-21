use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};

use tauri::{AppHandle, Manager, State};

use crate::app::AppContext;
use crate::models::{UpdateDownloadInfo, UpdateInfo};

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    ctx.Update
        .check(&current, ctx.Network.client())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_last_update_result(ctx: State<'_, AppContext>) -> Option<UpdateInfo> {
    ctx.Update.last_result()
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    ctx: State<'_, AppContext>,
) -> Result<UpdateDownloadInfo, String> {
    let current = app.package_info().version.to_string();
    let updates_dir = crate::paths::internals_dir()
        .or_else(|_| app.path().app_data_dir().map_err(anyhow::Error::from))
        .map_err(|e| e.to_string())?
        .join("updates");
    ctx.Update
        .download_and_stage(&current, ctx.Network.client(), &updates_dir)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn install_update_and_restart(app: AppHandle, staged_app_path: String) -> Result<(), String> {
    let current_app = current_app_bundle()?;
    let staged_app = PathBuf::from(staged_app_path);
    if !staged_app.is_dir()
        || staged_app.file_name().and_then(|name| name.to_str()) != Some("VelocityUI.app")
    {
        return Err("Downloaded update is missing VelocityUI.app".into());
    }

    let script = write_install_script(&staged_app, &current_app)?;
    Command::new("/bin/sh")
        .arg(&script)
        .arg(std::process::id().to_string())
        .arg(&staged_app)
        .arg(&current_app)
        .spawn()
        .map_err(|e| e.to_string())?;

    app.exit(0);
    Ok(())
}

fn current_app_bundle() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    for ancestor in exe.ancestors() {
        if ancestor.extension().and_then(|ext| ext.to_str()) == Some("app") {
            return Ok(ancestor.to_path_buf());
        }
    }
    Err("VelocityUI is not running from a macOS .app bundle".into())
}

fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

fn write_install_script(staged_app: &Path, current_app: &Path) -> Result<PathBuf, String> {
    let script_dir = staged_app
        .parent()
        .ok_or_else(|| "Invalid staged update path".to_string())?;
    fs::create_dir_all(script_dir).map_err(|e| e.to_string())?;
    let script_path = script_dir.join("apply-update.sh");
    let backup = current_app.with_extension("app.velocityui-backup");
    let log = script_dir.join("apply-update.log");
    let script = format!(
        r#"#!/bin/sh
set -u
PID="$1"
SRC="$2"
DEST="$3"
BACKUP={backup}
LOG={log}

while kill -0 "$PID" >/dev/null 2>&1; do
  sleep 0.2
done

rm -rf "$BACKUP" >>"$LOG" 2>&1 || true
if [ -d "$DEST" ]; then
  mv "$DEST" "$BACKUP" >>"$LOG" 2>&1 || exit 1
fi

if cp -R "$SRC" "$DEST" >>"$LOG" 2>&1; then
  xattr -cr "$DEST" >>"$LOG" 2>&1 || true
  open "$DEST" >>"$LOG" 2>&1 || true
  rm -rf "$BACKUP" >>"$LOG" 2>&1 || true
else
  rm -rf "$DEST" >>"$LOG" 2>&1 || true
  if [ -d "$BACKUP" ]; then
    mv "$BACKUP" "$DEST" >>"$LOG" 2>&1 || true
    open "$DEST" >>"$LOG" 2>&1 || true
  fi
  exit 1
fi

rm -f "$0" >>"$LOG" 2>&1 || true
"#,
        backup = shell_quote(&backup),
        log = shell_quote(&log),
    );

    let mut file = fs::File::create(&script_path).map_err(|e| e.to_string())?;
    file.write_all(script.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(script_path)
}
