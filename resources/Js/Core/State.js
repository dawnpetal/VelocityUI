const state = (() => {
  let _files = new Map();
  let _pathIndex = new Map();
  let _previewIndex = new Map();
  let _tabs = [];
  let _activeId = null;
  let _unsaved = new Set();
  let _workDir = null;
  let _roots = [];
  let _previewId = null;
  function _emit(event, data = {}) {
    eventBus.emit(event, data);
  }
  function addFile(id, name, path, content = null, opts = {}) {
    if (_files.has(id)) return;
    if (path) (opts.preview ? _previewIndex : _pathIndex).set(path, id);
    _files.set(id, {
      id,
      name,
      path,
      content,
      _lines: null,
      size: opts.size ?? null,
      encoding: opts.encoding ?? 'UTF-8',
      eol: opts.eol ?? 'LF',
      indentSize: opts.indentSize ?? 2,
      insertSpaces: opts.insertSpaces ?? true,
      languageOverride: opts.languageOverride ?? null,
      languageOverrideLabel: opts.languageOverrideLabel ?? null,
      readonly: opts.readonly ?? false,
      largePreview: opts.largePreview ?? false,
      truncated: opts.truncated ?? false,
      preview: opts.preview ?? false,
      previewType: opts.previewType ?? null,
      binaryData: opts.binaryData ?? null,
    });
  }
  function setContent(id, content, meta = {}) {
    const f = _files.get(id);
    if (!f) return;
    f.content = content;
    f._lines = null;
    Object.assign(f, meta);
  }
  function setMeta(id, meta = {}) {
    const f = _files.get(id);
    if (!f) return;
    const pathChanged = Object.prototype.hasOwnProperty.call(meta, 'path') && meta.path !== f.path;
    const previewChanged =
      Object.prototype.hasOwnProperty.call(meta, 'preview') && !!meta.preview !== !!f.preview;
    if (pathChanged || previewChanged) {
      const oldIndex = f.preview ? _previewIndex : _pathIndex;
      if (f.path && oldIndex.get(f.path) === id) oldIndex.delete(f.path);
      const nextPath = pathChanged ? meta.path : f.path;
      const nextIndex = (previewChanged ? meta.preview : f.preview) ? _previewIndex : _pathIndex;
      if (nextPath) nextIndex.set(nextPath, id);
    }
    Object.assign(f, meta);
  }
  function getFile(id) {
    return _files.get(id) ?? null;
  }
  function findByPath(path) {
    const id = path ? _pathIndex.get(path) : null;
    return id ? (_files.get(id) ?? null) : null;
  }
  function findPreviewByPath(path) {
    const id = path ? _previewIndex.get(path) : null;
    return id ? (_files.get(id) ?? null) : null;
  }
  function getActive() {
    return _activeId ? (_files.get(_activeId) ?? null) : null;
  }
  function setActive(id, opts = {}) {
    _activeId = id;
    if (!id) {
      _emit('file:activated', {
        id: null,
        file: null,
      });
      return;
    }
    if (!_tabs.includes(id)) {
      if (_previewId && _previewId !== id && !_unsaved.has(_previewId) && !opts.keepTabs) {
        const removedId = _previewId;
        const removedFile = _files.get(removedId) ?? null;
        const idx = _tabs.indexOf(removedId);
        if (idx !== -1) _tabs.splice(idx, 1);
        _unsaved.delete(removedId);
        _emit('file:closed', {
          id: removedId,
          file: removedFile,
          wasUnsaved: false,
          transient: true,
        });
      }
      if (!opts.permanent) _previewId = id;
      _tabs.push(id);
    }
    if (opts.permanent && _previewId === id) _previewId = null;
    _emit('file:activated', {
      id,
      file: _files.get(id) ?? null,
    });
  }
  function updateContent(id, content) {
    const f = _files.get(id);
    if (!f) return;
    f.content = content;
    f._lines = null;
    f._lineCount = null;
    f.size = new Blob([content ?? '']).size;
    _unsaved.add(id);
    if (_previewId === id) _previewId = null;
    _emit('file:changed', {
      id,
    });
  }
  function getLines(id) {
    const f = _files.get(id);
    if (!f || f.content === null) return [];
    if (!f._lines) f._lines = f.content.split('\n');
    return f._lines;
  }
  function markSaved(id) {
    _unsaved.delete(id);
  }
  function isUnsaved(id) {
    return _unsaved.has(id);
  }
  function removeFile(id) {
    const f = _files.get(id);
    const index = f?.preview ? _previewIndex : _pathIndex;
    if (f?.path && index.get(f.path) === id) index.delete(f.path);
    _files.delete(id);
  }
  function releasePayload(id) {
    const f = _files.get(id);
    if (!f) return;
    if (f.preview) {
      if (f.path && _previewIndex.get(f.path) === id) _previewIndex.delete(f.path);
      _files.delete(id);
      return;
    }
    f.content = null;
    f.binaryData = null;
    f._lines = null;
    f._lineCount = null;
    f.previewType = null;
    f.largePreview = false;
    f.truncated = false;
  }
  function closeTab(id) {
    const file = _files.get(id) ?? null;
    const wasUnsaved = _unsaved.has(id);
    _tabs = _tabs.filter((t) => t !== id);
    _unsaved.delete(id);
    if (_previewId === id) _previewId = null;
    if (_activeId === id) {
      _activeId = _tabs.at(-1) ?? null;
      _emit('file:activated', {
        id: _activeId,
        file: _activeId ? (_files.get(_activeId) ?? null) : null,
      });
    }
    _emit('file:closed', {
      id,
      file,
      wasUnsaved,
    });
  }
  function addRoot(node) {
    if (!_roots.some((r) => r.path === node.path)) _roots.push(node);
    return node;
  }
  function removeRoot(path) {
    _roots = _roots.filter((r) => r.path !== path);
  }
  function clear() {
    const closedIds = [..._files.keys()];
    _files.clear();
    _pathIndex.clear();
    _previewIndex.clear();
    _tabs = [];
    _activeId = null;
    _unsaved.clear();
    _roots = [];
    _workDir = null;
    _previewId = null;
    _emit('workspace:cleared', { ids: closedIds });
  }
  return {
    get files() {
      return [..._files.values()];
    },
    get openTabIds() {
      return _tabs;
    },
    get activeFileId() {
      return _activeId;
    },
    get unsaved() {
      return _unsaved;
    },
    get workDir() {
      return _workDir;
    },
    set workDir(v) {
      _workDir = v;
    },
    get roots() {
      return _roots;
    },
    get fileTree() {
      return _roots[0] ?? null;
    },
    set fileTree(v) {
      _roots = v === null ? [] : [v];
    },
    get previewTabId() {
      return _previewId;
    },
    set previewTabId(v) {
      _previewId = v;
    },
    addFile,
    getFile,
    findByPath,
    findPreviewByPath,
    getActive,
    setActive,
    updateContent,
    setContent,
    setMeta,
    getLines,
    markSaved,
    isUnsaved,
    removeFile,
    releasePayload,
    closeTab,
    addRoot,
    removeRoot,
    clear,
  };
})();
