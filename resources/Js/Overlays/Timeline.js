const timeline = (() => {
  const MAX = 50;
  const _histories = new Map();
  let _pendingByPath = null;
  let _activeId = null;
  let _expanded = true;
  function _history(id) {
    if (!_histories.has(id)) _histories.set(id, []);
    return _histories.get(id);
  }
  function getHistory(id) {
    return _histories.get(id) ?? [];
  }
  function restoreHistory(id, items) {
    _histories.set(id, items);
    _render();
  }
  function setPendingHistories(byPath) {
    _pendingByPath = byPath;
    _histories.clear();
    state.files.forEach((f) => {
      const norm = _normPath(f.path);
      const match = byPath[f.path] ?? byPath[norm];
      if (match?.length) _histories.set(f.id, match);
    });
    _render();
  }
  function _normPath(p) {
    return p ? p.replace(/\\/g, '/').replace(/\/$/, '') : p;
  }
  function recordSave(fileId, content, filename) {
    const h = _history(fileId);
    if (h.length && h[0].content === content) return;
    h.unshift({ at: Date.now(), content, name: filename });
    if (h.length > MAX) h.length = MAX;
    _render();
  }
  function setFile(file) {
    _activeId = file && !file.preview ? file.id : null;
    if (_activeId && _pendingByPath && !_histories.has(_activeId)) {
      const norm = _normPath(file.path);
      const pending = _pendingByPath[file.path] ?? _pendingByPath[norm];
      if (pending?.length) _histories.set(_activeId, pending);
    }
    _render();
    _syncSize(file);
  }
  function _syncSize(file) {
    const sizeEl = document.getElementById('statusFileSize');
    const sepEl = document.getElementById('statusFileSizeSep');
    if (!file || file.preview) {
      if (sizeEl) sizeEl.style.display = 'none';
      if (sepEl) sepEl.style.display = 'none';
      return;
    }
    const bytes = file.content != null ? new Blob([file.content]).size : 0;
    if (sizeEl) {
      sizeEl.textContent = FormatHelpers.fmtBytes(bytes);
      sizeEl.style.display = '';
    }
    if (sepEl) sepEl.style.display = '';
  }
  function refreshSize() {
    _syncSize(_activeId ? state.getFile(_activeId) : null);
  }
  function clearActive() {
    document
      .querySelectorAll('.tl-entry-active')
      .forEach((r) => r.classList.remove('tl-entry-active'));
  }
  function _render() {
    const list = document.getElementById('tlList');
    if (!list) return;
    list.innerHTML = '';
    const file = _activeId ? state.getFile(_activeId) : null;
    if (!file) {
      list.innerHTML = '<div class="tl-empty">No file open</div>';
      return;
    }
    const h = _histories.get(_activeId);
    if (!h?.length) {
      list.innerHTML = '<div class="tl-empty">Save a file to start tracking</div>';
      return;
    }
    h.forEach((entry, idx) => {
      const row = DomHelpers.el('div', 'tl-entry' + (idx === 0 ? ' tl-entry-latest' : ''));
      const spine = DomHelpers.el('span', 'tl-spine');
      const dot = DomHelpers.el('span', 'tl-dot' + (idx === 0 ? ' tl-dot-latest' : ''));
      const info = DomHelpers.el('div', 'tl-entry-info');
      const label = DomHelpers.el(
        'span',
        'tl-label',
        idx === 0 ? 'Latest save' : `Version ${h.length - idx}`,
      );
      const time = DomHelpers.el('span', 'tl-time', FormatHelpers.relTimeSecs(entry.at));
      const restoreBtn = DomHelpers.el('button', 'tl-restore', 'Restore');
      restoreBtn.title = 'Restore this version';
      restoreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await modal.ask(
          'Restore Version',
          `Replace the current editor contents with this saved version of <strong>${helpers.escapeHtml(file.name)}</strong>?`,
          ['Restore', 'Cancel'],
        );
        if (confirmed !== 'Restore') return;
        editor.restoreTimelineContent(_activeId, entry.content);
        list
          .querySelectorAll('.tl-entry-active')
          .forEach((r) => r.classList.remove('tl-entry-active'));
        toast.show('Version restored', 'ok', 1200);
      });
      time.title = new Date(entry.at).toLocaleString();
      info.append(label, time, restoreBtn);
      row.append(spine, dot, info);
      row.addEventListener('click', () => {
        const wasActive = row.classList.contains('tl-entry-active');
        list
          .querySelectorAll('.tl-entry-active')
          .forEach((r) => r.classList.remove('tl-entry-active'));
        if (wasActive) {
          editor.hideDiff();
          return;
        }
        row.classList.add('tl-entry-active');
        editor.showDiff(
          entry.name ?? file.name,
          entry.content,
          file.content ?? editor.getContent(),
        );
      });
      list.appendChild(row);
    });
  }
  function init() {
    const header = document.getElementById('tlHeader');
    const body = document.getElementById('tlBody');
    const arrow = document.getElementById('tlArrow');
    if (!header || !body) return;
    const section = header.closest('.sb-section');
    const panel = document.getElementById('sidebarBottom');
    _expanded = !uiState.timelineCollapsed;
    const sync = () => {
      body.hidden = !_expanded;
      section?.classList.toggle('is-collapsed', !_expanded);
      arrow?.classList.toggle('open', _expanded);
      header.setAttribute('aria-expanded', String(_expanded));
    };
    const toggle = () => {
      _expanded = !_expanded;
      uiState.setTimelineCollapsed(!_expanded);
      sync();
      if (!panel) return;
      if (_expanded && !panel.dataset.userResized) {
        panel.style.height = (uiState.sbBottomHeight > 0 ? uiState.sbBottomHeight : 200) + 'px';
      }
      const allCollapsed = !panel.querySelector('.sb-section:not(.is-collapsed)');
      if (allCollapsed) {
        panel.style.height = 'auto';
        delete panel.dataset.userResized;
      }
    };
    header._syncTimelineChrome = () => {
      _expanded = !uiState.timelineCollapsed;
      sync();
    };
    sync();
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    });
    _setupResizer();
  }
  function _setupResizer() {
    const resizer = document.getElementById('sidebarBottomResizer');
    const panel = document.getElementById('sidebarBottom');
    if (!resizer || !panel) return;
    let startY, startH;
    resizer.addEventListener('mousedown', (e) => {
      const anyExpanded = panel.querySelector('.sb-section:not(.is-collapsed)');
      if (!anyExpanded) return;
      panel.dataset.userResized = 'true';
      startY = e.clientY;
      startH = panel.offsetHeight;
      resizer.classList.add('dragging');
      const onMove = (e) => {
        panel.style.height = Math.max(86, Math.min(480, startH - (e.clientY - startY))) + 'px';
      };
      const onUp = () => {
        uiState.setSbBottomHeight(panel.offsetHeight);
        resizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  function snapshotByPath() {
    const snap = {};
    state.files.forEach((f) => {
      const h = _histories.get(f.id);
      if (h?.length) snap[f.path] = h;
    });
    return snap;
  }
  function restoreFromSnapshot(snap) {
    state.files.forEach((f) => {
      if (snap[f.path]?.length) _histories.set(f.id, snap[f.path]);
    });
    _render();
  }
  function syncChrome() {
    document.getElementById('tlHeader')?._syncTimelineChrome?.();
  }

  return {
    init,
    syncChrome,
    recordSave,
    setFile,
    refreshSize,
    clearActive,
    getHistory,
    restoreHistory,
    setPendingHistories,
    snapshotByPath,
    restoreFromSnapshot,
  };
})();
