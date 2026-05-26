const autoexec = (() => {
  const FOLDER_NAME = 'Autoexecute';
  const META_FILE = 'autoexec_meta.json';
  const MULTIEXEC_FILE = 'VelocityUI_multiexec.lua';

  let _enabled = false;
  let _inited = false;
  let _loadingTree = false;
  let _syncedFiles = new Set();
  let _workspaceMigrated = false;
  let _selection = new Set();
  let _lastClickedId = null;

  function _legacyDir() {
    return `${paths.internals}/autoexec_scripts`;
  }

  function _metaPath() {
    return `${paths.internals}/${META_FILE}`;
  }

  function _workspaceDir(baseDir = state.workDir) {
    return baseDir ? `${baseDir}/${FOLDER_NAME}` : null;
  }

  function _managedDir(baseDir = state.workDir) {
    return _workspaceDir(baseDir) ?? _legacyDir();
  }

  async function _executorDir() {
    return window.__TAURI__.core.invoke('get_executor_autoexec_dir');
  }

  async function _ensureDir(path) {
    try {
      await window.__TAURI__.core.invoke('create_dir', { path });
    } catch {}
  }

  async function _stat(path) {
    try {
      return await window.__TAURI__.core.invoke('stat_path', { path });
    } catch {
      return { exists: false };
    }
  }

  async function _listLuaFiles(dir) {
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: dir });
      return entries
        .filter(
          (entry) =>
            entry.type === 'FILE' &&
            !entry.entry.startsWith('.') &&
            entry.entry.endsWith('.lua') &&
            entry.entry !== MULTIEXEC_FILE,
        )
        .sort((a, b) => a.entry.localeCompare(b.entry));
    } catch {
      return [];
    }
  }

  async function _read(path) {
    return window.__TAURI__.core.invoke('read_text_file', { path });
  }

  async function _write(path, content) {
    return window.__TAURI__.core.invoke('write_text_file', { path, content });
  }

  async function _remove(path) {
    try {
      await window.__TAURI__.core.invoke('remove_path', { path });
    } catch {}
  }

  async function _copyMissingLuaFiles(srcDir, destDir) {
    const files = await _listLuaFiles(srcDir);
    for (const file of files) {
      const dest = `${destDir}/${file.entry}`;
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: dest });
        if (stat.exists) continue;
        await _write(dest, await _read(`${srcDir}/${file.entry}`));
      } catch {}
    }
  }

  async function ensureWorkspaceFolder(baseDir = state.workDir, options = {}) {
    await init();
    const dir = _workspaceDir(baseDir);
    if (!dir) return null;
    const before = await _stat(dir);
    await _ensureDir(dir);
    const shouldMigrate = options.migrate !== false && !_workspaceMigrated && !before.exists;
    if (shouldMigrate) {
      await _copyMissingLuaFiles(_legacyDir(), dir);
      try {
        await _copyMissingLuaFiles(await _executorDir(), dir);
      } catch {}
      _workspaceMigrated = true;
      await _saveMeta();
    }
    return dir;
  }

  async function _sourceDir(baseDir = state.workDir, options = {}) {
    const workspaceDir = _workspaceDir(baseDir);
    if (!workspaceDir) {
      const legacy = _legacyDir();
      await _ensureDir(legacy);
      return legacy;
    }
    const stat = await _stat(workspaceDir);
    if (!stat.exists) {
      if (options.create === false) return null;
      return ensureWorkspaceFolder(baseDir, options);
    }
    const dir = _managedDir(baseDir);
    return dir;
  }

  async function _loadMeta() {
    try {
      const meta = JSON.parse(await _read(_metaPath()));
      _enabled = !!meta.enabled;
      _syncedFiles = new Set(Array.isArray(meta.files) ? meta.files : []);
      _workspaceMigrated = !!meta.workspaceMigrated;
    } catch {
      _enabled = false;
      _syncedFiles = new Set();
      _workspaceMigrated = false;
    }
  }

  async function _saveMeta() {
    try {
      await _write(
        _metaPath(),
        JSON.stringify({
          enabled: _enabled,
          files: [..._syncedFiles].sort(),
          workspaceMigrated: _workspaceMigrated,
        }),
      );
    } catch {}
    eventBus.emit('autoexec:changed', { enabled: _enabled });
  }

  async function sync(options = {}) {
    await init();
    const sourceDir = await _sourceDir(state.workDir, { create: options.createSource !== false });
    const executorDir = await _executorDir();
    if (!sourceDir) {
      for (const name of _syncedFiles) await _remove(`${executorDir}/${name}`);
      _syncedFiles = new Set();
      await _saveMeta();
      return;
    }
    const files = await _listLuaFiles(sourceDir);
    const currentNames = new Set(files.map((file) => file.entry));

    if (_enabled) {
      for (const file of files) {
        try {
          await _write(`${executorDir}/${file.entry}`, await _read(`${sourceDir}/${file.entry}`));
        } catch {}
      }
      for (const name of _syncedFiles) {
        if (!currentNames.has(name)) await _remove(`${executorDir}/${name}`);
      }
      _syncedFiles = currentNames;
      await _saveMeta();
      return;
    }

    for (const name of new Set([..._syncedFiles, ...currentNames])) {
      await _remove(`${executorDir}/${name}`);
    }
    _syncedFiles = new Set();
    await _saveMeta();
  }

  async function init() {
    if (_inited) return;
    await _loadMeta();
    _inited = true;
  }

  function _logStatus(message, type = 'info') {
    if (typeof console_ !== 'undefined') console_.log('[Autoexecute] ' + message, type);
  }

  async function toggleEnabled() {
    await init();
    _enabled = !_enabled;
    await _saveMeta();
    try {
      await sync();
      _logStatus(_enabled ? 'Enabled and synced.' : 'Disabled and cleaned executor copies.');
      toast.show(
        _enabled ? 'Autoexecute enabled' : 'Autoexecute disabled',
        _enabled ? 'ok' : 'info',
        1600,
      );
    } catch (err) {
      const message = err?.message ?? String(err ?? 'Unknown error');
      _logStatus('Sync failed: ' + message, 'fail');
      toast.show('Autoexecute sync failed', 'warn', 2500);
    } finally {
      ExplorerTree.render();
    }
  }

  async function onExecutorChanged() {
    if (!_inited) return;
    await sync().catch(() => {});
  }

  function isEnabled() {
    return _enabled;
  }

  function isProtectedPath(path) {
    const dir = _workspaceDir();
    return !!dir && path === dir;
  }

  function isInsideProtectedArea(path) {
    const dir = _workspaceDir();
    return !!dir && (path === dir || path.startsWith(dir + '/'));
  }

  function containsScript(path) {
    return isInsideProtectedArea(path) && path.endsWith('.lua');
  }

  function isProtectedRootNode(node) {
    return !!node && node.type === 'folder' && isProtectedPath(node.path);
  }

  function rootNode() {
    for (const root of state.roots ?? []) {
      const match = (root.children ?? []).find((child) => isProtectedRootNode(child));
      if (match) return match;
    }
    return null;
  }

  function _scriptCount(node) {
    return (node?.children ?? []).filter((child) => child.type === 'file').length;
  }

  function _visibleNodes(node, out = []) {
    for (const child of node?.children ?? []) {
      out.push(child);
      if (child.type === 'folder' && child.open) _visibleNodes(child, out);
    }
    return out;
  }

  function _findNode(id, node = rootNode()) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = _findNode(id, child);
      if (found) return found;
    }
    return null;
  }

  function _selectedNodes() {
    return [..._selection].map((id) => _findNode(id)).filter(Boolean);
  }

  function _setSelection(ids = []) {
    _selection = new Set(ids);
    document
      .getElementById('autoexecTree')
      ?.querySelectorAll('.tree-row')
      .forEach((row) => row.classList.toggle('selected', _selection.has(row.dataset.id)));
  }

  function syncChrome() {
    const header = document.getElementById('autoexecHeader');
    const body = document.getElementById('autoexecBody');
    const arrow = document.getElementById('autoexecArrow');
    const section = document.getElementById('autoexecSection');
    const expanded = !uiState.autoexecCollapsed;
    if (!header || !body) return;
    body.hidden = !expanded;
    section?.classList.toggle('is-collapsed', !expanded);
    arrow?.classList.toggle('open', expanded);
    header.setAttribute('aria-expanded', String(expanded));
  }

  function _row(node, depth = 0) {
    if (node?.creating) return _creatingRow(node, depth);
    const svgs = ExplorerTree.getSvgs?.() ?? {};
    const row = document.createElement('div');
    row.className = 'tree-row autoexec-script-row';
    row.dataset.id = node.id;
    row.dataset.type = node.type;
    row.classList.toggle('active', node.id === state.activeFileId);
    row.classList.toggle('selected', _selection.has(node.id));
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.paddingLeft = depth * 14 + 6 + 'px';
    const arrowEl = document.createElement('span');
    arrowEl.className =
      'tree-arrow' + (node.type === 'folder' ? (node.open ? ' open' : '') : ' leaf');
    arrowEl.innerHTML = svgs.arrow ?? '';
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.appendChild(helpers.fileIconEl(node.name, node.type === 'folder', !!node.open));
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;
    const meta = document.createElement('span');
    meta.className = 'tree-meta';
    if (state.isUnsaved(node.id)) {
      const dot = document.createElement('span');
      dot.className = 'tree-unsaved-dot';
      meta.appendChild(dot);
    }
    indent.append(arrowEl, iconEl, label, meta);
    row.appendChild(indent);
    row.addEventListener('click', async (event) => {
      event.stopPropagation();
      const visible = _visibleNodes(rootNode());
      if (event.ctrlKey || event.metaKey) {
        if (_selection.has(node.id)) _selection.delete(node.id);
        else _selection.add(node.id);
        _lastClickedId = node.id;
        _setSelection([..._selection]);
        return;
      }
      if (event.shiftKey && _lastClickedId && _lastClickedId !== node.id) {
        const a = visible.findIndex((item) => item.id === _lastClickedId);
        const b = visible.findIndex((item) => item.id === node.id);
        if (a !== -1 && b !== -1) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          _setSelection(visible.slice(lo, hi + 1).map((item) => item.id));
          return;
        }
      }
      _setSelection([node.id]);
      _lastClickedId = node.id;
      if (node.type === 'folder') {
        if (node.open) node.open = false;
        else {
          await fileManager.ensureChildren?.(node);
          node.open = true;
        }
        renderSection();
        return;
      }
      eventBus.emit('ui:open-file', { id: node.id });
    });
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!_selection.has(node.id)) {
        _setSelection([node.id]);
        _lastClickedId = node.id;
      }
      ctxMenu.showForNodes(event, _selectedNodes());
    });
    ExplorerDnd.attachRowDrop(row, node);
    if (node.type === 'file') ExplorerDnd.attachFileDrag(row, node);
    if (node.type === 'folder') ExplorerDnd.attachFolderDrag(row, node);
    return row;
  }

  function _creatingRow(node, depth = 0) {
    const svgs = ExplorerTree.getSvgs?.() ?? {};
    const row = document.createElement('div');
    row.className = 'tree-row tree-row--creating autoexec-script-row';
    row.dataset.id = node.id;
    row.dataset.type = node.type;
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.paddingLeft = depth * 14 + 6 + 'px';
    const arrowEl = document.createElement('span');
    arrowEl.className = 'tree-arrow leaf';
    arrowEl.innerHTML = svgs.arrow ?? '';
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.appendChild(helpers.fileIconEl('untitled.lua', false, false));
    const input = document.createElement('input');
    input.className = 'tree-rename-input tree-rename-input--creating';
    input.placeholder = 'filename.lua';
    let done = false;
    const finish = async (success) => {
      if (done) return;
      done = true;
      await node.creating.finish(input.value.trim(), success);
    };
    input.addEventListener('input', () => {
      node.pendingName = input.value;
      helpers.updateIconEl(iconEl.querySelector('span'), input.value.trim() || '.', false, false);
    });
    input.addEventListener('blur', () => finish(true), { once: true });
    input.addEventListener('keydown', (event) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key))
        event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    indent.append(arrowEl, iconEl, input);
    row.appendChild(indent);
    requestAnimationFrame(() => {
      if (!document.body.contains(input)) return;
      input.focus();
      input.select();
    });
    return row;
  }

  function _appendChildren(container, node, depth = 0) {
    for (const child of node.children ?? []) {
      container.appendChild(_row(child, depth));
      if (child.type === 'folder' && child.open) _appendChildren(container, child, depth + 1);
    }
  }

  function renderSection() {
    const section = document.getElementById('autoexecSection');
    const tree = document.getElementById('autoexecTree');
    const count = document.getElementById('autoexecCount');
    const toggle = document.getElementById('btnAutoexecToggle');
    if (!section || !tree) return;
    const node = rootNode();
    section.hidden = !state.workDir || !node;
    if (!state.workDir || !node) return;
    const visibleIds = new Set(_visibleNodes(node).map((item) => item.id));
    _selection = new Set([..._selection].filter((id) => visibleIds.has(id)));
    if (node.childrenLoaded === false && !_loadingTree) {
      _loadingTree = true;
      fileManager.ensureChildren?.(node).finally(() => {
        _loadingTree = false;
        renderSection();
      });
    }
    tree.innerHTML = '';
    tree.tabIndex = 0;
    if (count) count.textContent = `${_scriptCount(node)} ${_enabled ? 'on' : 'off'}`;
    toggle?.classList.toggle('active', _enabled);
    _appendChildren(tree, node, 0);
    if (!tree.children.length) {
      tree.innerHTML = '<div class="autoexec-empty">No scripts</div>';
    }
    syncChrome();
  }

  function initSection() {
    const header = document.getElementById('autoexecHeader');
    if (!header || header.dataset.autoexecBound) return;
    header.dataset.autoexecBound = 'true';
    const toggle = () => {
      uiState.setAutoexecCollapsed?.(!uiState.autoexecCollapsed);
      syncChrome();
    };
    header.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      toggle();
    });
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle();
    });
    document.getElementById('btnAutoexecNew')?.addEventListener('click', async (event) => {
      event.stopPropagation();
      let node = rootNode();
      if (!node) {
        await ensureWorkspaceFolder();
        await workspaceController.refreshTree?.();
        node = rootNode();
      }
      if (node) ExplorerOps.startCreate(node, 'file');
    });
    document.getElementById('btnAutoexecToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleEnabled();
    });
    document.getElementById('autoexecTree')?.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.tree-row')) return;
      const node = rootNode();
      if (!node) return;
      event.preventDefault();
      ctxMenu.showEmpty(event, node);
    });
    document.getElementById('autoexecTree')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const nodes = _selectedNodes();
      if (!nodes.length) return;
      event.preventDefault();
      ExplorerTree.confirmDeleteMulti?.(nodes);
    });
    eventBus.on('autoexec:changed', renderSection);
    eventBus.on('file:activated', renderSection);
    eventBus.on('file:changed', renderSection);
    eventBus.on('file:closed', renderSection);
    syncChrome();
  }

  return {
    init,
    sync,
    toggleEnabled,
    onExecutorChanged,
    isEnabled,
    isProtectedPath,
    isInsideProtectedArea,
    containsScript,
    isProtectedRootNode,
    ensureWorkspaceFolder,
    rootNode,
    renderSection,
    syncChrome,
    initSection,
  };
})();
