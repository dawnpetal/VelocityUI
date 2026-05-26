const workspaceHistory = (() => {
  const LIMIT = 100;
  const _undo = [];
  const _redo = [];
  let _applying = false;

  function _parent(path) {
    const idx = path.lastIndexOf('/');
    return idx > 0 ? path.slice(0, idx) : '';
  }

  function _name(path) {
    return helpers.basename(path);
  }

  async function _ensureParent(path) {
    const parent = _parent(path);
    if (parent) await window.__TAURI__.core.invoke('create_dir', { path: parent });
  }

  function _push(op) {
    if (_applying || !op?.type) return;
    _undo.push({ ...op, label: op.label || _label(op) });
    while (_undo.length > LIMIT) _undo.shift();
    _redo.length = 0;
    syncButtons();
  }

  function _label(op) {
    if (op.type === 'move') return `Move ${_name(op.to)}`;
    if (op.type === 'trash') return `Move ${_name(op.path)} to Trash`;
    if (op.type === 'tabOpen') return `Open ${_name(op.path)}`;
    if (op.type === 'tabClose') return `Close ${_name(op.path)}`;
    return `Create ${_name(op.path)}`;
  }

  function _fileForPath(path) {
    return state.findByPath(path) || state.findPreviewByPath?.(path) || null;
  }

  async function _openTab(path) {
    const file = _fileForPath(path);
    if (!file) throw new Error(`File is not available: ${_name(path)}`);
    editorController.openFile(file.id);
  }

  async function _closeTab(path) {
    const file = _fileForPath(path);
    if (!file || !state.openTabIds.includes(file.id)) return;
    await tabs.closeTab(file.id);
  }

  async function _apply(op, direction) {
    _applying = true;
    workspaceController.suppressWatcher?.(1400);
    try {
      if (op.type === 'create') {
        if (direction === 'undo') {
          const result = await fileManager.moveToTrash(op.path);
          op.trashPath = result?.trashPath || op.trashPath;
        } else if (op.isFolder) {
          await window.__TAURI__.core.invoke('create_dir', { path: op.path });
        } else {
          await _ensureParent(op.path);
          await window.__TAURI__.core.invoke('write_text_file', {
            path: op.path,
            content: op.content ?? '',
          });
        }
      } else if (op.type === 'move') {
        const src = direction === 'undo' ? op.to : op.from;
        const dest = direction === 'undo' ? op.from : op.to;
        await _ensureParent(dest);
        await fileManager.rename(src, dest);
      } else if (op.type === 'trash') {
        if (direction === 'undo') {
          if (!op.trashPath) throw new Error('Trash location is unavailable');
          await _ensureParent(op.path);
          await fileManager.rename(op.trashPath, op.path);
          if (op.wasRoot && !state.roots.some((root) => root.path === op.path)) {
            await fileManager.loadFolder(op.path);
            if (!state.workDir) state.workDir = op.path;
            await workspaceController.syncWatchers?.();
          }
        } else {
          const result = await fileManager.moveToTrash(op.path);
          op.trashPath = result?.trashPath || op.trashPath;
        }
      } else if (op.type === 'tabOpen') {
        if (direction === 'undo') await _closeTab(op.path);
        else await _openTab(op.path);
      } else if (op.type === 'tabClose') {
        if (direction === 'undo') await _openTab(op.path);
        else await _closeTab(op.path);
      }
      if (!op.type?.startsWith('tab')) await workspaceController.refreshTree?.();
      return true;
    } finally {
      _applying = false;
      syncButtons();
    }
  }

  async function undo() {
    const op = _undo.pop();
    if (!op) return false;
    try {
      await _apply(op, 'undo');
      _redo.push(op);
      toast.show(`Undid ${op.label}`, 'info', 1200);
      return true;
    } catch (err) {
      _undo.push(op);
      toast.show(err?.message || 'Could not undo workspace change', 'warn', 2600);
      return false;
    } finally {
      syncButtons();
    }
  }

  async function redo() {
    const op = _redo.pop();
    if (!op) return false;
    try {
      await _apply(op, 'redo');
      _undo.push(op);
      toast.show(`Redid ${op.label}`, 'info', 1200);
      return true;
    } catch (err) {
      _redo.push(op);
      toast.show(err?.message || 'Could not redo workspace change', 'warn', 2600);
      return false;
    } finally {
      syncButtons();
    }
  }

  function syncButtons() {
    document.getElementById('btnUndo')?.classList.toggle('has-workspace-history', _undo.length > 0);
    document.getElementById('btnRedo')?.classList.toggle('has-workspace-history', _redo.length > 0);
  }

  return {
    get applying() {
      return _applying;
    },
    canUndo: () => _undo.length > 0,
    canRedo: () => _redo.length > 0,
    recordCreate: (path, isFolder = false, content = '') =>
      _push({ type: 'create', path, isFolder, content }),
    recordMove: (from, to, isFolder = false) => _push({ type: 'move', from, to, isFolder }),
    recordTrash: (path, trashPath, isFolder = false, wasRoot = false) =>
      _push({ type: 'trash', path, trashPath, isFolder, wasRoot }),
    recordTabOpen: (path) => _push({ type: 'tabOpen', path }),
    recordTabClose: (path) => _push({ type: 'tabClose', path }),
    undo,
    redo,
    syncButtons,
  };
})();
