pub mod tree;
pub mod watcher;

pub use tree::FileTreeManager;
pub use watcher::WatcherManager;

use tauri::AppHandle;

use crate::error::VelocityUIResult;
use crate::models::FileNode;

pub struct FileSystemManager {
    tree: FileTreeManager,
    watcher: WatcherManager,
}

impl FileSystemManager {
    pub fn new() -> Self {
        Self {
            tree: FileTreeManager::new(),
            watcher: WatcherManager::new(),
        }
    }

    pub fn build_tree(&self, dir_path: &str) -> VelocityUIResult<FileNode> {
        self.tree.build(dir_path)
    }

    pub fn load_tree_children(&self, dir_path: &str) -> VelocityUIResult<Vec<FileNode>> {
        self.tree.children(dir_path)
    }

    pub fn generate_unique_path(
        &self,
        dir_path: &str,
        name: &str,
        is_folder: bool,
    ) -> VelocityUIResult<String> {
        self.tree.generate_unique_path(dir_path, name, is_folder)
    }

    pub async fn copy_recursive(&self, src: &str, dest: &str) -> VelocityUIResult<()> {
        self.tree.copy_recursive(src, dest).await
    }

    pub fn watch(&self, app: &AppHandle, path: &str) -> VelocityUIResult<u32> {
        self.watcher.watch(app, path)
    }

    pub fn unwatch(&self, id: u32) {
        self.watcher.unwatch(id);
    }
}
