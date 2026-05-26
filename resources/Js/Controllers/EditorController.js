const editorController = (() => {
  function _syncStatus(file) {
    const fileEl = document.getElementById('statusFile');
    if (fileEl) fileEl.textContent = file?.name ?? '';
    const langEl = document.getElementById('statusLang');
    if (langEl) langEl.textContent = file ? helpers.ext(file.name).toUpperCase() || 'Plain' : '';
  }
  function renderEditor() {
    editor.render();
    const active = state.getActive();
    _syncStatus(active);
    if (!active?.preview) timeline.setFile(active ?? null);
  }
  function openFile(id) {
    let fileId = id;
    if (!state.getFile(id)) {
      const match = state.findByPath(id);
      if (match) fileId = match.id;
    }
    const file = state.getFile(fileId);
    const wasOpen = state.openTabIds.includes(fileId);
    state.setActive(fileId);
    if (file?.path && !wasOpen) workspaceHistory.recordTabOpen?.(file.path);
    tabs.render();
    renderEditor();
    ExplorerTree.render();
  }
  async function _nextUntitledName() {
    const usedNames = new Set(state.files.map((f) => (f.name ?? '').toLowerCase()));
    let index = 1;
    while (index <= 9999) {
      const name = `Untitled~${index}.lua`;
      if (!usedNames.has(name.toLowerCase())) {
        const stat = await window.__TAURI__.core
          .invoke('stat_path', { path: `${state.workDir}/${name}` })
          .catch(() => ({ exists: false }));
        if (!stat.exists) return name;
      }
      index += 1;
    }
    return `Untitled~${index}.lua`;
  }
  function _insertCreatedFileNode(result) {
    const root = state.roots.find((item) => item.path === state.workDir) ?? state.fileTree;
    if (!root?.children || root.children.some((item) => item.path === result.path)) return;
    root.children.push({
      id: result.id,
      name: result.name || helpers.basename(result.path),
      path: result.path,
      type: 'file',
      open: false,
      size: 0,
      children: [],
    });
    root.children.sort((a, b) => {
      const autoA = autoexec.isProtectedRootNode?.(a) ? 1 : 0;
      const autoB = autoexec.isProtectedRootNode?.(b) ? 1 : 0;
      if (autoA !== autoB) return autoA - autoB;
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }
  async function newUntitledFile() {
    if (!state.workDir) {
      modal.alert('No Folder Open', 'Open a folder first.');
      return;
    }
    const name = await _nextUntitledName();
    workspaceController.suppressWatcher?.(1200);
    const result = await fileManager.createFile(state.workDir, name).catch(console.error);
    if (result) {
      _insertCreatedFileNode(result);
      state.setActive(result.id, { permanent: true, keepTabs: true });
      ExplorerTree.render();
      tabs.render();
      renderEditor();
      persist.saveTreeState(state.workDir).catch(() => {});
    }
  }
  function onFileSaved(id) {
    const f = state.getFile(id);
    if (!f) return;
    const content = f.content ?? editor.getContent();
    timeline.recordSave(f.id, content, f.name);
    timeline.refreshSize();
    if (state.workDir) {
      persist.saveTimeline(state.workDir).catch(() => {});
      persist.saveTreeState(state.workDir).catch(() => {});
    }
  }
  function _setConnectionStatus(dotClass, text, connClass) {
    const dot = document.getElementById('statusDot');
    const connText = document.getElementById('statusConnText');
    const conn = document.getElementById('statusConnection');
    if (dot) dot.className = `status-dot ${dotClass}`;
    if (connText) connText.textContent = text;
    if (conn) conn.className = `status-item ${connClass}`;
  }
  async function _execScript(script, filename, options = {}) {
    const bridge = !!options.bridge;
    const sessionId = options.sessionId ?? null;
    try {
      eventBus.emit('script:executing', {
        filename,
        bridge,
        sessionId,
      });
      if (bridge) await injector.executeWithClientBridge(script);
      else await injector.execute(script);
      const executor = uiState.executor;
      let statusText = bridge ? 'Bridge' : 'ok';
      if (!bridge && executor === 'hydrogen') {
        const port = await injector.getPort();
        statusText = port ? `Port ${port}` : 'ok';
      }
      _setConnectionStatus('ok', statusText, 'ok');
      await execHistory.push(script, filename);
      eventBus.emit('script:executed', {
        filename,
        bridge,
        sessionId,
      });
    } catch (err) {
      _setConnectionStatus('fail', 'No server', 'fail');
      injector.reset();
      const msg = err?.message || String(err);
      if (msg) console_.log(msg, 'fail');
      if (msg) toast.show(msg, 'fail', 3000);
      eventBus.emit('script:failed', {
        error: msg,
        filename,
        bridge,
        sessionId,
      });
    }
  }
  async function executeScript() {
    const active = state.getActive();
    if (!active) {
      modal.alert('Nothing to Execute', 'Open a file first.');
      return;
    }
    const miTargets = multiInstanceUI.getTargetsForRun?.();
    if (miTargets && miTargets.length) {
      const script = active.content || editor.getContent();
      try {
        const userIds = miTargets.map((t) => t.user_id);
        eventBus.emit('script:executing', {
          userIds,
          filename: active.name,
        });
        await multiInstance.sendScriptToMany(userIds, script);
        const n = miTargets.length;
        const label =
          n === 1 ? miTargets[0].display_name || miTargets[0].username : `${n} instances`;
        toast.show(`Sent to ${label}`, 'ok');
        await execHistory.push(script, active.name);
        eventBus.emit('script:executed', {
          userIds,
          filename: active.name,
        });
      } catch (err) {
        toast.show(err.message, 'fail', 3000);
      }
      return;
    }
    const btn = document.getElementById('btnExecute');
    if (btn) btn.disabled = true;
    try {
      _setConnectionStatus('warn connecting', 'Scanning…', 'warn');
      if (active.content === null) await fileManager.ensureContent(active.id);
      await _execScript(active.content || editor.getContent(), active.name);
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  async function executeFile(id) {
    const file = state.getFile(id) || state.findByPath(id);
    if (!file) {
      toast.show('Could not find that script', 'fail', 2200);
      return;
    }
    if (file.content === null) await fileManager.ensureContent(file.id);
    const script = file.content ?? '';
    const miTargets = multiInstanceUI.getTargetsForRun?.();
    if (miTargets && miTargets.length) {
      try {
        const userIds = miTargets.map((t) => t.user_id);
        eventBus.emit('script:executing', {
          userIds,
          filename: file.name,
        });
        await multiInstance.sendScriptToMany(userIds, script);
        const n = miTargets.length;
        const label =
          n === 1 ? miTargets[0].display_name || miTargets[0].username : `${n} instances`;
        toast.show(`Sent to ${label}`, 'ok');
        await execHistory.push(script, file.name);
        eventBus.emit('script:executed', {
          userIds,
          filename: file.name,
        });
      } catch (err) {
        toast.show(err.message, 'fail', 3000);
      }
      return;
    }
    _setConnectionStatus('warn connecting', 'Scanning…', 'warn');
    await _execScript(script, file.name);
  }
  async function executeScriptWithBridge() {
    const active = state.getActive();
    if (!active) {
      modal.alert('Nothing to Execute', 'Open a file first.');
      return;
    }
    _setConnectionStatus('warn connecting', 'Bridge…', 'warn');
    if (active.content === null) await fileManager.ensureContent(active.id);
    await _execScript(active.content || editor.getContent(), active.name, { bridge: true });
  }
  async function rerunScript(item) {
    _setConnectionStatus('warn', 'Scanning…', 'warn');
    console_.log(`Re-running: ${item.filename}`, 'info');
    await _execScript(item.script, item.filename);
  }
  return {
    renderEditor,
    openFile,
    newUntitledFile,
    onFileSaved,
    executeScript,
    executeFile,
    executeScriptWithBridge,
    rerunScript,
  };
})();
