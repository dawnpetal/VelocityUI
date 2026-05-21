#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    fs,
    fs::File,
    io::{self, Cursor},
    path::{Path, PathBuf},
    sync::Mutex,
};

use semver::Version;
use zip::ZipArchive;

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::{GithubRelease, GithubReleaseAsset, UpdateDownloadInfo, UpdateInfo};

const REPO_API: &str = "https://api.github.com/repos/dawnpetal/VelocityUI/releases/latest";
const RELEASE_LATEST_URL: &str = "https://github.com/dawnpetal/VelocityUI/releases/latest";
const APP_NAME: &str = "VelocityUI.app";

struct ReleaseProbe {
    latest: String,
    release_url: String,
}

pub struct UpdateManager {
    last_result: Mutex<Option<UpdateInfo>>,
}

impl UpdateManager {
    pub fn new() -> Self {
        Self {
            last_result: Mutex::new(None),
        }
    }

    pub async fn check(
        &self,
        current: &str,
        client: &reqwest::Client,
    ) -> VelocityUIResult<UpdateInfo> {
        let api_result = fetch_latest_release(client).await;
        let (latest, release_url, release_notes, asset, asset_error) = match api_result {
            Ok(release) => {
                let latest = release.tag_name.trim_start_matches('v').to_string();
                let asset = select_update_asset(&release.assets);
                (
                    latest,
                    release.html_url,
                    release.body,
                    asset.cloned(),
                    None::<String>,
                )
            }
            Err(err) => {
                let probe = fetch_latest_release_probe(client).await?;
                (
                    probe.latest,
                    probe.release_url,
                    None,
                    None,
                    Some(err.to_string()),
                )
            }
        };

        let update_available = match (Version::parse(current), Version::parse(&latest)) {
            (Ok(c), Ok(l)) => l > c,
            _ => latest != current,
        };

        let info = UpdateInfo {
            current: current.to_string(),
            latest,
            update_available,
            release_url,
            release_notes,
            asset_name: asset.as_ref().map(|asset| asset.name.clone()),
            asset_url: asset
                .as_ref()
                .map(|asset| asset.browser_download_url.clone()),
            asset_size: asset.as_ref().map(|asset| asset.size),
            asset_error,
        };

        if let Ok(mut guard) = self.last_result.lock() {
            *guard = Some(info.clone());
        }

        Ok(info)
    }

    pub async fn download_and_stage(
        &self,
        current: &str,
        client: &reqwest::Client,
        updates_dir: &Path,
    ) -> VelocityUIResult<UpdateDownloadInfo> {
        let info = self.check(current, client).await?;
        if !info.update_available {
            return Err(VelocityUIError::InvalidData(
                "VelocityUI is already up to date".into(),
            ));
        }

        let asset_url = info
            .asset_url
            .clone()
            .ok_or_else(|| match info.asset_error.clone() {
                Some(err) => VelocityUIError::Other(format!(
                    "Update download metadata is unavailable: {err}"
                )),
                None => VelocityUIError::NotFound("macOS update asset".into()),
            })?;
        let asset_name = info
            .asset_name
            .clone()
            .ok_or_else(|| VelocityUIError::NotFound("macOS update asset".into()))?;

        fs::create_dir_all(updates_dir)?;
        let version_dir = updates_dir.join(format!("v{}", sanitize_path_segment(&info.latest)));
        if version_dir.exists() {
            fs::remove_dir_all(&version_dir)?;
        }
        fs::create_dir_all(&version_dir)?;

        let archive_path = version_dir.join(&asset_name);
        let bytes = client
            .get(&asset_url)
            .header("User-Agent", "VelocityUI-App")
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        fs::write(&archive_path, &bytes)?;

        let staged_app = extract_update_archive(&archive_path, &bytes, &version_dir)?;

        Ok(UpdateDownloadInfo {
            version: info.latest,
            asset_name,
            asset_size: bytes.len() as u64,
            archive_path: archive_path.to_string_lossy().into_owned(),
            staged_app_path: staged_app.to_string_lossy().into_owned(),
        })
    }

    pub fn last_result(&self) -> Option<UpdateInfo> {
        self.last_result.lock().ok().and_then(|g| g.clone())
    }
}

async fn fetch_latest_release_probe(client: &reqwest::Client) -> VelocityUIResult<ReleaseProbe> {
    let response = client
        .get(RELEASE_LATEST_URL)
        .send()
        .await
        .map_err(|e| VelocityUIError::Other(format!("Could not reach GitHub releases: {e}")))?;
    let status = response.status();
    let release_url = response.url().to_string();

    if !status.is_success() {
        return Err(VelocityUIError::Other(format!(
            "GitHub releases page returned {status}"
        )));
    }

    let tag_marker = "/releases/tag/";
    let Some((_, tag)) = release_url.rsplit_once(tag_marker) else {
        return Err(VelocityUIError::NotFound(
            "latest VelocityUI release tag".into(),
        ));
    };

    Ok(ReleaseProbe {
        latest: tag.trim_start_matches('v').to_string(),
        release_url,
    })
}

async fn fetch_latest_release(client: &reqwest::Client) -> VelocityUIResult<GithubRelease> {
    let response = client
        .get(REPO_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| VelocityUIError::Other(format!("Could not reach GitHub updates: {e}")))?;

    let status = response.status();
    let body = response.text().await.map_err(VelocityUIError::Network)?;

    if !status.is_success() {
        let github_message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|message| message.as_str())
                    .map(str::to_owned)
            })
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| body.chars().take(180).collect());
        let message = match status.as_u16() {
            404 => "No published VelocityUI update release was found on GitHub.".to_string(),
            403 if github_message.to_ascii_lowercase().contains("rate limit") => {
                "GitHub update rate limit reached. Try again later.".to_string()
            }
            _ => format!("GitHub update check failed ({status}): {github_message}"),
        };
        return Err(VelocityUIError::Other(message));
    }

    serde_json::from_str(&body).map_err(|e| {
        VelocityUIError::InvalidData(format!("GitHub update response was not valid: {e}"))
    })
}

fn select_update_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    assets
        .iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(".zip") && name.contains("mac") && name.contains("universal")
        })
        .or_else(|| {
            assets.iter().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".zip") && name.contains("mac")
            })
        })
        .or_else(|| {
            assets.iter().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".zip") && name.contains("velocityui")
            })
        })
}

fn sanitize_path_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn extract_update_archive(
    archive_path: &Path,
    bytes: &[u8],
    version_dir: &Path,
) -> VelocityUIResult<PathBuf> {
    let name = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !name.ends_with(".zip") {
        return Err(VelocityUIError::InvalidData(
            "VelocityUI updates currently require the macOS zip asset".into(),
        ));
    }

    let extract_dir = version_dir.join("extracted");
    fs::create_dir_all(&extract_dir)?;
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| VelocityUIError::InvalidData(e.to_string()))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| VelocityUIError::InvalidData(e.to_string()))?;
        let Some(enclosed) = file.enclosed_name() else {
            continue;
        };
        let out_path = extract_dir.join(enclosed);
        if file.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = File::create(&out_path)?;
        io::copy(&mut file, &mut out)?;
        #[cfg(unix)]
        if let Some(mode) = file.unix_mode() {
            fs::set_permissions(&out_path, fs::Permissions::from_mode(mode))?;
        }
    }

    find_app_bundle(&extract_dir).ok_or_else(|| VelocityUIError::NotFound(APP_NAME.into()))
}

fn find_app_bundle(root: &Path) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if path.is_dir() && name == APP_NAME {
            return Some(path);
        }
        let Ok(entries) = fs::read_dir(&path) else {
            continue;
        };
        for entry in entries.flatten() {
            let child = entry.path();
            if child.is_dir() {
                stack.push(child);
            }
        }
    }
    None
}
