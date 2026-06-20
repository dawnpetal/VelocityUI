const pinboard = (() => {
  let _snippets = [];
  let _filter = '';
  let _sortMode = 'manual';
  let _rendered = false;
  const _activeEditorIds = new Map();
  const SORT_MODES = ['manual', 'name'];
  const SEARCH_DEBOUNCE_MS = 100;
  const SVG = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };
  const _rerenderListSoon = scheduler.frame(() => _rerenderList());

  function _context() {
    return {
      snippets: _snippets,
      sortMode: _sortMode,
      activeEditorIds: _activeEditorIds,
      findIdx: _findIdx,
      onRun: (snippet, showOutput) => PinboardOps.run(snippet, showOutput, _context()),
      onOpenInEditor: (snippet) => PinboardOps.openInEditor(snippet, _context()),
      onSave: _save,
      onRender: render,
      onFilterByTag: (tag) => {
        _filter = tag;
        render();
      },
    };
  }

  async function _save() {
    try {
      const path = `${paths.internals}/state/pinboard.json`;
      await window.__TAURI__.core.invoke('write_text_file', {
        path,
        content: JSON.stringify({ snippets: _snippets, sortMode: _sortMode }),
      });
    } catch {}
  }

  async function _load() {
    const newPath = `${paths.internals}/state/pinboard.json`;
    const legacyPath = `${paths.internals}/pinboard.json`;
    try {
      const raw = await window.__TAURI__.core.invoke('read_text_file', { path: newPath });
      const data = JSON.parse(raw);
      _snippets = Array.isArray(data) ? data : (data.snippets ?? []);
      _sortMode = data.sortMode ?? 'manual';
      return;
    } catch {}
    try {
      const raw = await window.__TAURI__.core.invoke('read_text_file', { path: legacyPath });
      const data = JSON.parse(raw);
      _snippets = Array.isArray(data) ? data : (data.snippets ?? []);
      _sortMode = data.sortMode ?? 'manual';
      await _save();
      await window.__TAURI__.core.invoke('remove_path', { path: legacyPath }).catch(() => {});
    } catch {
      _snippets = [];
    }
  }

  function _container() {
    return document.getElementById('pinboardView');
  }

  function _findIdx(id) {
    return _snippets.findIndex((s) => s.id === id);
  }

  function _visibleSnippets() {
    let list = _snippets.slice();
    if (_filter) {
      const query = _filter.toLowerCase();
      list = list.filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.code.toLowerCase().includes(query) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(query)),
      );
    }
    if (_sortMode === 'name') list.sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }

  function _buildToolbar() {
    const bar = DomHelpers.el('div', 'pb-toolbar');
    const top = DomHelpers.el('div', 'pb-toolbar-top');
    const left = DomHelpers.el('div', 'pb-toolbar-left');
    const titleEl = DomHelpers.el('span', 'pb-toolbar-title', 'Pinboard');
    const countEl = DomHelpers.el('span', 'pb-toolbar-count', String(_snippets.length));
    left.append(titleEl, countEl);
    const right = DomHelpers.el('div', 'pb-toolbar-right');
    const sortBtn = document.createElement('button');
    sortBtn.className = 'pb-toolbar-btn pb-sort-btn';
    sortBtn.innerHTML = SVG.sort + `<span>${_sortMode}</span>`;
    sortBtn.addEventListener('click', () => {
      _sortMode = SORT_MODES[(SORT_MODES.indexOf(_sortMode) + 1) % SORT_MODES.length];
      _save().catch(() => {});
      render();
    });
    const pinBtn = document.createElement('button');
    pinBtn.className = 'pb-toolbar-btn pb-pin-btn';
    pinBtn.innerHTML = SVG.pin + '<span>Pin</span>';
    pinBtn.addEventListener('click', () => {
      const active = state.getActive();
      if (!active) return toast.show('No file open', 'warn', 1500);
      const snippet = {
        id: helpers.uid(),
        label: active.name.replace(/\.[^.]+$/, ''),
        tags: [],
        code: active.content,
        createdAt: Date.now(),
      };
      _snippets.unshift(snippet);
      _save().catch(() => {});
      render();
      toast.show('Pinned "' + snippet.label + '"', 'ok', 1800);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'pb-toolbar-btn pb-add-btn';
    addBtn.innerHTML = SVG.add + '<span>New</span>';
    addBtn.addEventListener('click', _addNew);
    right.append(sortBtn, pinBtn, addBtn);
    top.append(left, right);
    const searchRow = DomHelpers.el('div', 'pb-search-row');
    const searchIcon = DomHelpers.el('span', 'pb-search-icon');
    searchIcon.innerHTML = SVG.search;
    const searchInput = document.createElement('input');
    searchInput.className = 'pb-search-input';
    searchInput.placeholder = 'Filter by name, code, tag\u2026';
    searchInput.value = _filter;
    searchInput.addEventListener(
      'input',
      helpers.debounce(() => {
        _filter = searchInput.value;
        _rerenderListSoon();
      }, SEARCH_DEBOUNCE_MS),
    );
    searchRow.append(searchIcon, searchInput);
    if (_filter) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'pb-search-clear';
      clearBtn.innerHTML = SVG.close;
      clearBtn.addEventListener('click', () => {
        _filter = '';
        render();
      });
      searchRow.appendChild(clearBtn);
    }
    bar.append(top, searchRow);
    return bar;
  }

  function _rerenderList() {
    const container = _container();
    if (!container) return;
    container.querySelector('.pb-list')?.remove();
    container.querySelector('.pb-empty')?.remove();
    const visible = _visibleSnippets();
    if (!_snippets.length) {
      container.appendChild(PinboardCard.buildEmpty(_addNew));
      return;
    }
    const list = DomHelpers.el('div', 'pb-list');
    visible.forEach((snippet) => list.appendChild(PinboardCard.buildCard(snippet, _context())));
    container.appendChild(list);
  }

  function render() {
    const container = _container();
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(_buildToolbar());
    _rendered = true;
    _rerenderList();
  }

  function _addNew() {
    const snippet = {
      id: helpers.uid(),
      label: 'New Snippet',
      tags: [],
      code: '',
      createdAt: Date.now(),
    };
    _snippets.unshift(snippet);
    _save().catch(() => {});
    render();
    requestAnimationFrame(() => {
      const card = _container()?.querySelector(`.pb-card[data-id="${snippet.id}"]`);
      const labelEl = card?.querySelector('.pb-card-label');
      if (labelEl) PinboardCard.startInlineRename(labelEl, snippet, _context());
    });
  }

  async function init() {
    await _load();
    document.addEventListener('keydown', (e) => {
      const container = _container();
      if (
        !container ||
        container.style.display === 'none' ||
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA'
      )
        return;
      if (e.key.toLowerCase() === 'n') _addNew();
    });
  }

  return {
    init,
    show: () => {
      const container = _container();
      if (!_rendered || !container?.querySelector('.pb-toolbar')) render();
    },
    render,
    pinFile: (node) => PinboardOps.pinFile(node, _context()),
    handleEditorSave: (id) => PinboardOps.handleEditorSave(id, _context()),
    handleTabClose: (id) => PinboardOps.handleTabClose(id, _context()),
    isSnippetFile: (id) => PinboardOps.isSnippetFile(id, _context()),
  };
})();
