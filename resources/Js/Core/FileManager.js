const fileManager = (() => {
  const HUGE_FILE_LIMIT = 20 * 1024 * 1024;
  const HUGE_PREVIEW_BYTES = 5 * 1024 * 1024;
  async function loadFolder(dirPath) {
    const tree = await window.__TAURI__.core.invoke('build_file_tree', { dirPath });
    _registerTree(tree);
    state.addRoot(tree);
    return tree;
  }

  async function openFolder(dirPath) {
    state.clear();
    state.workDir = dirPath;
    return loadFolder(dirPath);
  }

  function _registerTree(node) {
    if (node.type === 'file') {
      state.addFile(node.id, node.name, node.path, null, {
        size: node.size ?? null,
        ...(LangMap.inferOverride?.(node.name, node.path) || {}),
      });
    } else {
      for (const child of node.children ?? []) {
        _registerTree(child);
      }
    }
  }

  async function ensureChildren(node) {
    if (!node || node.type !== 'folder' || node.childrenLoaded !== false)
      return node?.children ?? [];
    const children = await window.__TAURI__.core.invoke('load_folder_children', {
      dirPath: node.path,
    });
    node.children = Array.isArray(children) ? children : [];
    node.childrenLoaded = true;
    node.children.forEach(_registerTree);
    return node.children;
  }

  async function ensureContent(id) {
    const file = state.getFile(id);
    if (!file || file.content !== null) return;
    try {
      let size = file.size;
      if (size == null) {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: file.path });
        size = stat?.size ?? null;
        state.setMeta(id, { size });
      }
      if (size != null && size > HUGE_FILE_LIMIT) {
        const preview = await window.__TAURI__.core.invoke('read_text_file_preview', {
          path: file.path,
          maxBytes: HUGE_PREVIEW_BYTES,
        });
        state.setContent(id, preview.content ?? '', {
          size: preview.size ?? size,
          largePreview: true,
          truncated: !!preview.truncated,
          ...(LangMap.inferOverride?.(file.name, file.path, preview.content ?? '') || {}),
        });
        return;
      }
      const content = await window.__TAURI__.core.invoke('read_text_file', { path: file.path });
      state.setContent(id, content, {
        largePreview: false,
        truncated: false,
        ...(LangMap.inferOverride?.(file.name, file.path, content) || {}),
      });
    } catch {
      state.setContent(id, '');
    }
  }

  async function save(id) {
    const file = state.getFile(id);
    if (!file) return false;
    if (file.largePreview) {
      toast.show('Huge file preview is read-only', 'warn');
      return false;
    }
    if (typeof AiHelper !== 'undefined' && AiHelper.isFileLocked?.(file)) {
      toast.show('Codex is editing this file. Save is paused until it finishes.', 'warn', 2600);
      return false;
    }
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('write_text_file', {
      path: file.path,
      content: file.content,
    });
    state.markSaved(id);
    eventBus.emit('file:saved', { id, file });
    if (autoexec.containsScript?.(file.path)) autoexec.sync().catch(() => {});
    return true;
  }

  async function _pathExists(p) {
    const stat = await window.__TAURI__.core.invoke('stat_path', { path: p });
    return stat.exists;
  }

  async function createFile(dirPath, name) {
    const safeName = await window.__TAURI__.core.invoke('generate_unique_filename', {
      dirPath,
      name,
      isFolder: false,
    });
    const path = `${dirPath}/${safeName}`;
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('write_text_file', { path, content: '' });
    const id = helpers.uid();
    state.addFile(id, safeName, path, '', { size: 0 });
    return { id, name: safeName, path };
  }

  async function createFolder(dirPath, name) {
    const safeName = await window.__TAURI__.core.invoke('generate_unique_filename', {
      dirPath,
      name,
      isFolder: true,
    });
    const path = `${dirPath}/${safeName}`;
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('create_dir', { path });
    return path;
  }

  async function rename(oldPath, newPath) {
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('rename_path', { src: oldPath, dest: newPath });
  }

  async function remove(path) {
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('remove_path', { path });
  }

  async function moveToTrash(path) {
    workspaceController.suppressWatcher?.(900);
    return window.__TAURI__.core.invoke('trash_path', { path });
  }

  async function copyRecursive(src, dest) {
    workspaceController.suppressWatcher?.(900);
    await window.__TAURI__.core.invoke('copy_path_recursive', { src, dest });
  }

  return {
    loadFolder,
    ensureChildren,
    openFolder,
    ensureContent,
    save,
    createFile,
    createFolder,
    rename,
    remove,
    moveToTrash,
    copyRecursive,
  };
})();
