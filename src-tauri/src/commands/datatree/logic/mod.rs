pub mod graph;
pub mod lua_analysis;
pub mod regex_cache;
pub mod remote_analysis;
pub mod roblox_api;

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::commands::datatree::snapshot::snapshot_file_stamp;
use crate::commands::datatree::types::LogicWeb;

use graph::LOGIC_WEB_VERSION;

static LOGIC_WEB_CACHE: OnceLock<Mutex<HashMap<String, Arc<LogicWeb>>>> = OnceLock::new();

pub fn logic_web_cache() -> &'static Mutex<HashMap<String, Arc<LogicWeb>>> {
    LOGIC_WEB_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn logic_web_cache_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn logic_web_sidecar_path(snapshot_path: &Path) -> PathBuf {
    let mut sidecar = snapshot_path.to_path_buf();
    let stem = sidecar.file_stem().unwrap_or_default().to_string_lossy().to_string();
    sidecar.set_file_name(format!("{stem}.logic.json"));
    sidecar
}

pub fn logic_web_read_cached(snapshot_path: &Path) -> Option<Arc<LogicWeb>> {
    let (len, modified_ms) = snapshot_file_stamp(snapshot_path).ok()?;
    let key = logic_web_cache_key(snapshot_path);
    if let Ok(cache) = logic_web_cache().lock() {
        if let Some(web) = cache.get(&key) {
            if web.source_len == len && web.source_modified_ms == modified_ms && web.version >= LOGIC_WEB_VERSION {
                return Some(Arc::clone(web));
            }
        }
    }
    let sidecar = logic_web_sidecar_path(snapshot_path);
    if !sidecar.exists() { return None; }
    let file = File::open(&sidecar).ok()?;
    let web: LogicWeb = serde_json::from_reader(BufReader::new(file)).ok()?;
    if web.source_len != len || web.source_modified_ms != modified_ms || web.version < LOGIC_WEB_VERSION {
        return None;
    }
    let arc = Arc::new(web);
    if let Ok(mut cache) = logic_web_cache().lock() {
        cache.insert(key, Arc::clone(&arc));
    }
    Some(arc)
}

pub fn logic_web_write_cached(snapshot_path: &Path, web: &LogicWeb) {
    let sidecar = logic_web_sidecar_path(snapshot_path);
    let Ok(file) = File::create(&sidecar) else { return };
    let _ = serde_json::to_writer(BufWriter::new(file), web);
    let key = logic_web_cache_key(snapshot_path);
    if let Ok(mut cache) = logic_web_cache().lock() {
        cache.insert(key, Arc::new(web.clone()));
    }
}