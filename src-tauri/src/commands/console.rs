use std::{
    fs::{self, File},
    io::{self, BufRead, BufReader, Seek},
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const MAX_BATCH_LINES: usize = 80;
const FLUSH_INTERVAL_MS: u64 = 75;
const POLL_INTERVAL_MS: u64 = 50;
const LOG_CHECK_INTERVAL_MS: u64 = 1000;
const ERROR_IDLE_FLUSH_MS: u64 = 250;

static MONITOR_STARTED: AtomicBool = AtomicBool::new(false);
static STREAMING: AtomicBool = AtomicBool::new(false);
static SHOW_RAW_LOGS: AtomicBool = AtomicBool::new(false);
static FORCE_LATEST_LOG: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct ConsoleLogLine {
    time: String,
    #[serde(rename = "type")]
    kind: String,
    channel: String,
    message: String,
}

#[derive(Clone, Serialize)]
pub struct ConsoleMonitorStatus {
    pub path: Option<String>,
}

#[derive(Clone, Serialize)]
struct ConsoleScriptError {
    header: String,
    stack: Vec<String>,
}

struct PendingError {
    header: String,
    stack: Vec<String>,
    updated_ms: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn find_latest_log_file() -> Option<PathBuf> {
    let home = crate::paths::home_dir().ok()?;
    [
        home.join("Library").join("Logs").join("Roblox"),
        home.join("Library").join("Logs").join("Roblox Player"),
    ]
    .into_iter()
    .filter(|dir| dir.exists())
    .flat_map(|dir| fs::read_dir(dir).into_iter().flatten().flatten())
    .filter(|entry| {
        entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
            && entry
                .path()
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.ends_with(".log") || name.contains("Log"))
                .unwrap_or(false)
    })
    .max_by_key(|entry| {
        let modified = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
            .unwrap_or(0);
        let name = entry
            .file_name()
            .to_str()
            .map(str::to_owned)
            .unwrap_or_default();
        (modified, name)
    })
    .map(|entry| entry.path())
}

fn open_reader(path: &PathBuf, position: io::SeekFrom) -> io::Result<(BufReader<File>, u64)> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    reader.seek(position)?;
    let offset = reader.stream_position()?;
    Ok((reader, offset))
}

fn parse_log_line(line: &str) -> Option<ConsoleLogLine> {
    let tag_start = line.find("[FLog::")?;
    let after_tag_start = tag_start + 7;
    let tag_end = line[after_tag_start..].find(']')? + after_tag_start;
    let channel = &line[after_tag_start..tag_end];
    let message = line[tag_end + 1..].trim();
    if message.is_empty() {
        return None;
    }

    let level = match channel {
        "Output" => {
            if message.starts_with("Info:") {
                "info"
            } else {
                "rbx"
            }
        }
        "Warning" | "ClientScriptState" if contains_ascii_case_insensitive(message, "warning") => {
            "warn"
        }
        "Warning" => "warn",
        "Error" | "ScriptContext" => "fail",
        _ => return None,
    };

    Some(ConsoleLogLine {
        time: line.get(11..19).unwrap_or_default().to_string(),
        kind: level.to_string(),
        channel: channel.to_string(),
        message: message.to_string(),
    })
}

fn contains_ascii_case_insensitive(value: &str, needle: &str) -> bool {
    value
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

fn should_keep_line(line: &ConsoleLogLine) -> bool {
    if SHOW_RAW_LOGS.load(Ordering::Relaxed) {
        return true;
    }
    !is_system_message(&line.message)
}

fn is_system_message(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if lower.contains("settings date header")
        || lower.contains("settings date timestamp")
        || lower.contains("settings x-signature")
    {
        return true;
    }

    line.contains("(AppDelegate)")
        || (line.contains("Asset (Image)") && line.contains("load failed"))
        || line.contains("Warning: HTTP error url:")
        || line.contains("Warning: HTTP error body:")
        || line.contains("AnalyticsSessionId is")
        || line.contains("! Joining game")
        || line.contains("Connecting to UDMUX")
        || line.contains("Server RobloxGitHash:")
        || line.contains("Server Prefix:")
        || line.contains("Replicator created:")
        || line.contains("VoiceChatInternal")
        || line.contains("Hello world!!!")
        || line.contains("dirSizeOf(")
        || line.contains("Failed to load sound")
        || line.contains("Hidden Surface Removal")
        || line.contains("AdPortal is invalid")
        || line.contains("syncCookiesFromNativeToEngine was skipped")
        || line.contains("syncCookiesFromEngineToNative was skipped")
        || line.contains("setAssetFolder")
        || line.contains("setExtraAssetFolder")
        || line.contains("Evaluating deferred inferred crashes")
        || line.contains("GetServerChannelRemote not available")
        || line.contains("Unable to fetch completed survey ids")
        || line.contains("Wrap-deformer begin skinning-transfer context is empty")
        || line.contains("Wrap-deformer begin skinning-transfer resulted in an error")
        || line.contains("LoadClientSettingsFromLocal")
        || line.contains("Info: DataModel Loading")
        || (!line.is_empty() && line.bytes().all(|byte| byte == b'*'))
}

fn is_new_log_record(line: &str) -> bool {
    line.contains("[FLog::") || line.get(10..11) == Some("T") && line.contains("Z,")
}

fn flush_logs(app: &AppHandle, batch: &mut Vec<ConsoleLogLine>) {
    if !batch.is_empty() {
        let _ = app.emit("console-monitor:batch", batch.clone());
        batch.clear();
    }
}

fn maybe_emit_error(app: &AppHandle, pending: &mut Option<PendingError>) {
    let Some(error) = pending.take() else {
        return;
    };

    if !is_opiumware_script_error(&error.header, &error.stack) {
        return;
    }

    let _ = app.emit(
        "console-monitor:script-error",
        ConsoleScriptError {
            header: error.header,
            stack: error.stack,
        },
    );
}

fn is_opiumware_script_error(header: &str, stack: &[String]) -> bool {
    if header.contains("Opiumware:") {
        return true;
    }
    stack.iter().any(|line| is_opiumware_stack_line(line))
}

fn is_opiumware_stack_line(line: &str) -> bool {
    line.contains("Script 'Opiumware'") || line.contains("Script \"Opiumware\"")
}

fn handle_line(
    app: &AppHandle,
    line: &str,
    batch: &mut Vec<ConsoleLogLine>,
    pending_error: &mut Option<PendingError>,
) {
    if let Some(parsed) = parse_log_line(line) {
        maybe_emit_error(app, pending_error);
        if parsed.kind == "fail" || parsed.message.trim_start().starts_with("Error:") {
            let now = now_ms();
            *pending_error = Some(PendingError {
                header: parsed.message.clone(),
                stack: Vec::new(),
                updated_ms: now,
            });
        }
        if STREAMING.load(Ordering::Relaxed) && should_keep_line(&parsed) {
            batch.push(parsed);
        }
        return;
    }

    if is_new_log_record(line) {
        maybe_emit_error(app, pending_error);
        return;
    }

    if let Some(error) = pending_error.as_mut() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            maybe_emit_error(app, pending_error);
        } else if trimmed.contains("Stack End") {
            error.stack.push(trimmed.to_string());
            error.updated_ms = now_ms();
            maybe_emit_error(app, pending_error);
        } else {
            error.stack.push(trimmed.to_string());
            error.updated_ms = now_ms();
        }
    }
}

fn flush_idle_error(app: &AppHandle, pending_error: &mut Option<PendingError>) {
    let Some(error) = pending_error.as_ref() else {
        return;
    };
    if now_ms().saturating_sub(error.updated_ms) >= ERROR_IDLE_FLUSH_MS {
        maybe_emit_error(app, pending_error);
    }
}

fn monitor_logs(app: AppHandle) {
    let mut current_log_path = find_latest_log_file();
    let mut reader = current_log_path
        .as_ref()
        .and_then(|path| open_reader(path, io::SeekFrom::End(0)).ok());
    let mut last_position = reader.as_ref().map(|(_, pos)| *pos).unwrap_or(0);
    let mut last_log_check = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut line = String::new();
    let mut batch = Vec::with_capacity(MAX_BATCH_LINES);
    let mut pending_error = None;

    loop {
        if FORCE_LATEST_LOG.swap(false, Ordering::Relaxed)
            || last_log_check.elapsed() >= Duration::from_millis(LOG_CHECK_INTERVAL_MS)
        {
            if let Some(latest) = find_latest_log_file() {
                if current_log_path.as_ref() != Some(&latest) {
                    if let Ok(new_reader) = open_reader(&latest, io::SeekFrom::End(0)) {
                        current_log_path = Some(latest.clone());
                        reader = Some(new_reader);
                        last_position = reader.as_ref().map(|(_, pos)| *pos).unwrap_or(0);
                        let _ = app.emit(
                            "console-monitor:status",
                            ConsoleMonitorStatus {
                                path: Some(latest.to_string_lossy().into_owned()),
                            },
                        );
                    }
                }
            }
            last_log_check = std::time::Instant::now();
        }

        let Some(path) = current_log_path.as_ref() else {
            thread::sleep(Duration::from_millis(500));
            current_log_path = find_latest_log_file();
            reader = current_log_path
                .as_ref()
                .and_then(|path| open_reader(path, io::SeekFrom::End(0)).ok());
            last_position = reader.as_ref().map(|(_, pos)| *pos).unwrap_or(0);
            if let Some(path) = current_log_path.as_ref() {
                let _ = app.emit(
                    "console-monitor:status",
                    ConsoleMonitorStatus {
                        path: Some(path.to_string_lossy().into_owned()),
                    },
                );
            }
            continue;
        };

        let Ok(metadata) = fs::metadata(path) else {
            current_log_path = None;
            reader = None;
            thread::sleep(Duration::from_millis(500));
            continue;
        };
        let len = metadata.len();
        if len < last_position {
            reader = open_reader(path, io::SeekFrom::Start(0)).ok();
            last_position = 0;
        }

        if len > last_position {
            let Some((reader_ref, _)) = reader.as_mut() else {
                reader = open_reader(path, io::SeekFrom::Start(last_position)).ok();
                thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
                continue;
            };
            if reader_ref.seek(io::SeekFrom::Start(last_position)).is_err() {
                reader = open_reader(path, io::SeekFrom::Start(last_position)).ok();
                thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
                continue;
            }

            loop {
                let read = reader_ref.read_line(&mut line).unwrap_or(0);
                if read == 0 {
                    break;
                }
                let trimmed = line.trim_end_matches(['\r', '\n']);
                if !trimmed.trim().is_empty() {
                    handle_line(&app, trimmed, &mut batch, &mut pending_error);
                }
                line.clear();
                if batch.len() >= MAX_BATCH_LINES {
                    flush_logs(&app, &mut batch);
                    last_emit = std::time::Instant::now();
                }
            }

            if let Ok(position) = reader_ref.stream_position() {
                last_position = position;
            }
        }

        if last_emit.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS) {
            flush_logs(&app, &mut batch);
            last_emit = std::time::Instant::now();
        }
        flush_idle_error(&app, &mut pending_error);

        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

pub fn ensure_console_monitor(app: AppHandle) {
    if MONITOR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || monitor_logs(app));
}

#[tauri::command]
pub fn console_monitor_set_streaming(enabled: bool, show_raw_logs: bool) -> ConsoleMonitorStatus {
    STREAMING.store(enabled, Ordering::Relaxed);
    SHOW_RAW_LOGS.store(show_raw_logs, Ordering::Relaxed);
    FORCE_LATEST_LOG.store(true, Ordering::Relaxed);
    let path = find_latest_log_file().map(|path| path.to_string_lossy().into_owned());
    ConsoleMonitorStatus { path }
}

#[tauri::command]
pub fn console_monitor_watch_errors() {
    FORCE_LATEST_LOG.store(true, Ordering::Relaxed);
}
