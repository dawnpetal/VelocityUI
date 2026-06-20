use std::io::Write;
use std::net::TcpStream;
use std::path::PathBuf;

use async_trait::async_trait;
use flate2::write::ZlibEncoder;
use flate2::Compression;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::ExecutorKind;
use crate::paths;

use super::extension::ExecutorExtension;

const PORTS: &[u16] = &[8390, 8391, 8392, 8393, 8394, 8395, 8396, 8397, 8398, 8399, 8400, 8401, 8402, 8403, 8404, 8405, 8406, 8407, 8408, 8409, 8410, 8411, 8412, 8413, 8414, 8415, 8416, 8417, 8418, 8419, 8420];
const SCRIPT_PREFIX: &str = "OpiumwareScript ";
const NULL_SIGNAL: &str = "NULL";

pub struct OpiumwareExtension;

impl OpiumwareExtension {
    pub fn new() -> Self {
        Self
    }

    fn compress(data: &[u8]) -> VelocityUIResult<Vec<u8>> {
        let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
        enc.write_all(data).map_err(VelocityUIError::Io)?;
        enc.finish().map_err(VelocityUIError::Io)
    }

    fn build_payload(code: &str) -> String {
        let t = code.trim_start();
        if t.starts_with(SCRIPT_PREFIX) || t == NULL_SIGNAL {
            code.to_string()
        } else {
            format!("{}{}", SCRIPT_PREFIX, code)
        }
    }

    fn exec_blocking(code: String) -> VelocityUIResult<()> {
        let payload = Self::build_payload(&code);

        for &port in PORTS {
            if let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{}", port)) {
                if payload != NULL_SIGNAL {
                    let compressed = Self::compress(payload.as_bytes())?;
                    stream.write_all(&compressed).map_err(VelocityUIError::Io)?;
                }
                return Ok(());
            }
        }

        Err(VelocityUIError::NotFound(format!(
            "Opiumware not found on ports {:?}. Make sure roblox is open!",
            PORTS
        )))
    }
}

#[async_trait]
impl ExecutorExtension for OpiumwareExtension {
    fn kind(&self) -> ExecutorKind {
        ExecutorKind::Opiumware
    }

    fn display_name(&self) -> &str {
        "Opiumware"
    }

    fn autoexec_dir(&self) -> Option<PathBuf> {
        paths::home_dir()
            .ok()
            .map(|h| h.join("Opiumware").join("autoexec"))
    }

    async fn is_alive(&self) -> bool {
        PORTS
            .iter()
            .any(|&port| TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok())
    }

    async fn inject(&self, code: &str) -> VelocityUIResult<()> {
        let owned = code.to_string();
        tauri::async_runtime::spawn_blocking(move || Self::exec_blocking(owned))
            .await
            .map_err(|e| VelocityUIError::Other(format!("Opiumware task join error: {e}")))?
    }
}
