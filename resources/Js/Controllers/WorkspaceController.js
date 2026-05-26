const workspaceController = (() => {
  const _watchers = new Map();
  let _watchSuppressUntil = 0;
  let _refreshing = false;
  let _deltaQueue = [];
  let _deltaTimer = null;
  let _snapshotSaveTimer = null;

  function suppressWatcher(ms = 1200) {
    _watchSuppressUntil = Math.max(_watchSuppressUntil, Date.now() + ms);
  }

  async function _startWatcher(dir) {
    if (!dir) return;
    if (_watchers.has(dir)) return;
    try {
      const id = await window.__TAURI__.core.invoke('watch_path', { path: dir });
      _watchers.set(dir, id);
    } catch {}
  }

  async function _stopWatcher(dir) {
    const id = _watchers.get(dir);
    if (id == null) return;
    try {
      await window.__TAURI__.core.invoke('unwatch_path', { id });
    } catch {}
    _watchers.delete(dir);
  }

  async function _syncWatchers() {
    const rootPaths = new Set(state.roots.map((root) => root.path).filter(Boolean));
    await Promise.all(
      [..._watchers.keys()].filter((path) => !rootPaths.has(path)).map(_stopWatcher),
    );
    await Promise.all([...rootPaths].map(_startWatcher));
  }

  function _nodeForPath(path) {
    let found = null;
    function walk(node) {
      if (found) return;
      if (node.path === path) {
        found = node;
        return;
      }
      for (const child of node.children ?? []) walk(child);
    }
    for (const root of state.roots) walk(root);
    return found;
  }

  async function _applyUpdate(path, options = {}) {
    const node = _nodeForPath(path);
    if (!node) return;
    const file = state.findByPath(path);
    const force = options.force || options.source === 'ai';
    if (file && file.content !== null) {
      if (state.isUnsaved?.(file.id) && !force) {
        if (state.activeFileId === file.id)
          toast.show(`${file.name} changed on disk while this tab has edits`, 'warn', 2600);
        return;
      }
      state.setContent(file.id, null);
      await fileManager.ensureContent(file.id);
      if (force) state.markSaved(file.id);
      eventBus.emit('file:externalChange', { id: file.id, path });
      if (state.activeFileId === file.id) editorController.renderEditor();
    }
  }

  async function _flushDeltaQueue() {
    _deltaTimer = null;
    if (_deltaQueue.length === 0) return;
    const batch = _deltaQueue.splice(0);
    const removedPaths = new Set(
      batch.filter(({ action }) => action === 'removed').map(({ path }) => path),
    );
    if (!workspaceHistory.applying) {
      for (const { action, path } of batch) {
        if (action !== 'created' || removedPaths.has(path)) continue;
        try {
          const stat = await window.__TAURI__.core.invoke('stat_path', { path });
          if (stat?.exists) {
            let content = '';
            if (!stat.isDirectory && Number(stat.size || 0) < 1024 * 1024) {
              try {
                content = await window.__TAURI__.core.invoke('read_text_file', { path });
              } catch {}
            }
            workspaceHistory.recordCreate?.(path, !!stat.isDirectory, content);
          }
        } catch {}
      }
    }
    if (batch.some(({ action }) => action === 'created' || action === 'removed')) {
      await refreshTree();
      return;
    }
    for (const { action, path } of batch) {
      if (action === 'updated') await _applyUpdate(path);
    }
    ExplorerTree.render();
    tabs.render();
  }

  async function onWatchEvent(evt) {
    const payload = evt.detail;
    if (!payload) return;
    if (![..._watchers.values()].includes(payload.id)) return;
    if (Date.now() < _watchSuppressUntil) return;

    const events = payload.events ?? [payload];
    for (const e of events) {
      if (!e.path) continue;
      if (autoexec.containsScript?.(e.path) || autoexec.isProtectedPath?.(e.path)) {
        autoexec.sync({ createSource: e.action !== 'removed' }).catch(() => {});
      }
      _deltaQueue.push({ action: e.action, path: e.path });
    }

    clearTimeout(_deltaTimer);
    _deltaTimer = setTimeout(_flushDeltaQueue, 80);
  }

  async function shutdown() {
    await flushSnapshotSave();
    await Promise.all([..._watchers.keys()].map(_stopWatcher));
  }

  function _updateTitlebar() {
    const folderName = state.workDir ? helpers.basename(state.workDir) : null;
    const win = window.__TAURI__?.window?.getCurrentWindow();
    if (win) win.setTitle('VelocityUI' + (folderName ? ' — ' + folderName : ''));
    const el = document.getElementById('settingsWorkDir');
    if (el) el.textContent = state.workDir ?? '—';
  }

  async function _restoreTreeState(saved) {
    if (!saved?.openPaths?.length) return;
    const openSet = new Set(saved.openPaths);
    const restore = async (node) => {
      if (node?.type !== 'folder') return;
      if (openSet.has(node.path)) {
        await fileManager.ensureChildren?.(node);
        node.open = true;
      }
      for (const child of node.children ?? []) await restore(child);
    };
    for (const root of state.roots) await restore(root);
  }

  async function _saveWorkspaceSnapshot() {
    if (!state.workDir) return;
    await persist.saveTreeState(state.workDir);
    await persist.saveSession(state.workDir);
  }

  function saveSnapshotSoon(delay = 120) {
    clearTimeout(_snapshotSaveTimer);
    _snapshotSaveTimer = setTimeout(() => {
      _snapshotSaveTimer = null;
      _saveWorkspaceSnapshot().catch(() => {});
    }, delay);
  }

  async function flushSnapshotSave() {
    clearTimeout(_snapshotSaveTimer);
    _snapshotSaveTimer = null;
    await _saveWorkspaceSnapshot();
  }

  function _restoreActiveFile(saved, { fallback = true, session = null } = {}) {
    const activePath = saved?.activeFile || session?.activeFile || null;
    const activeMatch = activePath && state.findByPath(activePath);
    const nextId = activeMatch?.id ?? (fallback ? state.files[0]?.id : null) ?? null;
    state.setActive(nextId);
    return nextId;
  }

  async function openFolder(folderPath, options = {}) {
    state.clear();
    state.workDir = folderPath;
    try {
      await fileManager.loadFolder(folderPath);
    } catch {
      toast.show(`Could not open folder: ${helpers.basename(folderPath)}`, 'warn', 3000);
      state.workDir = null;
      ExplorerTree.render();
      return;
    }
    _watchSuppressUntil = Date.now() + 2000;
    await _syncWatchers();
    const saved = await persist.loadTreeState(folderPath);
    await _restoreTreeState(saved);
    if (!options.deferActive) _restoreActiveFile(saved);
    ExplorerTree.render();
    tabs.render();
    editorController.renderEditor();
    await persist.loadTimeline(folderPath);
    timeline.setFile(state.getActive() ?? null);
    await persist.saveSession(folderPath);
    _updateTitlebar();
    eventBus.emit('workspace:loaded', { folderPath });
  }

  async function boot() {
    const session = await persist.loadSession();
    const lastFolder = session?.workDir ?? session?.lastFolder;
    if (lastFolder) {
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: lastFolder });
        if (stat.exists) {
          await openFolder(lastFolder, { deferActive: true });
          const saved = await persist.loadTreeState(lastFolder);
          const extraRoots = [...new Set(session?.rootPaths ?? [])].filter(
            (path) => path && path !== lastFolder,
          );
          for (const path of extraRoots) {
            try {
              const extraStat = await window.__TAURI__.core.invoke('stat_path', { path });
              if (extraStat.exists) await fileManager.loadFolder(path);
            } catch {}
          }
          if (extraRoots.length) {
            await _restoreTreeState(saved);
            await _syncWatchers();
            await _saveWorkspaceSnapshot();
          }
          _restoreActiveFile(saved, { session });
          ExplorerTree.render();
          tabs.render();
          editorController.renderEditor();
          timeline.setFile(state.getActive() ?? null);
          return;
        }
      } catch {}
    }
    await resetDefault();
  }

  async function resetDefault() {
    await openFolder(paths.defaultWorkspace);
  }

  async function openFolderDialog() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke('show_folder_dialog', {
        title: 'Open Folder',
      });
      if (!folderPath) return;
    } catch {
      return;
    }
    const name = helpers.basename(folderPath);
    if (!state.workDir) {
      await openFolder(folderPath);
      return;
    }
    const choice = await modal.ask(
      'Open Folder',
      `Open <strong>${helpers.escapeHtml(name)}</strong>`,
      ['Open', 'Add to workspace', 'Cancel'],
    );
    if (!choice || choice === 'Cancel') return;
    if (choice === 'Add to workspace') {
      try {
        await fileManager.loadFolder(folderPath);
        await _syncWatchers();
        ExplorerTree.render();
        tabs.render();
        await _saveWorkspaceSnapshot();
        toast.show(`Added "${name}"`, 'ok', 2000);
      } catch (err) {
        toast.show(`Could not add folder: ${err.message ?? err}`, 'fail', 3000);
      }
    } else {
      await openFolder(folderPath);
    }
  }

  async function addFolderToWorkspace() {
    let folderPath;
    try {
      folderPath = await window.__TAURI__.core.invoke('show_folder_dialog', {
        title: 'Add Folder to Workspace',
      });
      if (!folderPath) return;
    } catch {
      return;
    }
    try {
      await fileManager.loadFolder(folderPath);
      if (!state.workDir) state.workDir = folderPath;
      await _syncWatchers();
      ExplorerTree.render();
      tabs.render();
      await _saveWorkspaceSnapshot();
      toast.show(`Added "${helpers.basename(folderPath)}"`, 'ok', 2000);
    } catch (err) {
      toast.show(`Could not add folder: ${err.message ?? err}`, 'fail', 3000);
    }
  }

  async function addFoldersToWorkspace(folderPaths = [], progress = null) {
    const unique = [...new Set(folderPaths)].filter(
      (path) => path && !state.roots.some((root) => root.path === path),
    );
    let added = 0;
    for (const path of unique) {
      progress?.update?.(`Adding ${helpers.basename(path)}...`, added / Math.max(unique.length, 1));
      try {
        await fileManager.loadFolder(path);
        if (!state.workDir) state.workDir = path;
        await _startWatcher(path);
        added++;
      } catch (err) {
        console.error('Could not add dropped folder:', path, err);
      }
    }
    if (added) {
      ExplorerTree.render();
      tabs.render();
      await _saveWorkspaceSnapshot();
    }
    return added;
  }

  async function refreshTree() {
    if (_refreshing || !state.workDir) return;
    _refreshing = true;
    try {
      await persist.saveTreeState(state.workDir);
      const activePath = state.getActive()?.path ?? null;
      const previewPath = state.previewTabId
        ? (state.getFile(state.previewTabId)?.path ?? null)
        : null;
      const openTabPaths = state.openTabIds.map((id) => state.getFile(id)?.path).filter(Boolean);
      const openPaths = new Set();
      const collectOpen = (node) => {
        if (node?.type === 'folder' && node.open) {
          openPaths.add(node.path);
          node.children?.forEach(collectOpen);
        }
      };
      state.roots.forEach((r) => collectOpen(r));
      const rootPaths = state.roots.map((r) => r.path);
      const primaryRootPath = rootPaths[0] ?? null;
      const timelineSnapshot = timeline.snapshotByPath();
      state.clear();
      for (const p of rootPaths) {
        try {
          await fileManager.loadFolder(p);
        } catch {}
      }
      state.workDir = state.roots[0]?.path ?? null;
      await _syncWatchers();
      timeline.restoreFromSnapshot(timelineSnapshot);
      const restoreOpen = async (node) => {
        if (node?.type === 'folder') {
          if (openPaths.has(node.path)) {
            await fileManager.ensureChildren?.(node);
            node.open = true;
          }
          for (const child of node.children ?? []) await restoreOpen(child);
        }
      };
      for (const root of state.roots) await restoreOpen(root);
      const restoredTabPaths = new Set(openTabPaths);
      if (activePath) restoredTabPaths.add(activePath);
      for (const path of restoredTabPaths) {
        const match = state.findByPath(path);
        if (match) {
          state.setActive(match.id, {
            keepTabs: true,
            permanent: path !== previewPath,
          });
        }
      }
      if (activePath) {
        const match = state.findByPath(activePath);
        if (match) {
          state.setActive(match.id, {
            keepTabs: true,
            permanent: activePath !== previewPath,
          });
        }
      }
      ExplorerTree.render();
      tabs.render();
      editorController.renderEditor();
      timeline.setFile(activePath ? state.findByPath(activePath) : null);
      eventBus.emit('tree:refreshed', {});
    } finally {
      _refreshing = false;
    }
  }

  async function refreshChangedPaths(paths = [], options = {}) {
    let treeChanged = false;
    for (const path of [...new Set(paths)].filter(Boolean)) {
      if (_nodeForPath(path)) await _applyUpdate(path, options);
      else treeChanged = true;
    }
    if (treeChanged) await refreshTree();
    ExplorerTree.render();
    tabs.render();
  }

  return {
    boot,
    openFolder,
    openFolderDialog,
    addFolderToWorkspace,
    addFoldersToWorkspace,
    resetDefault,
    refreshTree,
    refreshChangedPaths,
    saveSnapshotSoon,
    flushSnapshotSave,
    syncWatchers: _syncWatchers,
    suppressWatcher,
    onWatchEvent,
    shutdown,
  };
})();
