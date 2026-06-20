use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use regex::Regex;

pub fn cached_regex(pattern: &str) -> &'static Regex {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static Regex>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    {
        let guard = cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(regex) = guard.get(pattern) {
            return regex;
        }
    }
    let regex = Box::leak(Box::new(
        Regex::new(pattern).unwrap_or_else(|err| panic!("invalid regex {pattern:?}: {err}")),
    ));
    let mut guard = cache.lock().unwrap_or_else(|e| e.into_inner());
    guard.insert(pattern.to_string(), regex);
    regex
}