const outline = (() => {
  let _currentFileId = null;
  let _entries = [];
  let _query = '';
  let _emptyMessage = 'Open a file to see its outline';
  const _collapsed = new Map();

  const KINDS = [
    {
      kind: 'function',
      label: 'function',
      color: 'var(--accent)',
      patterns: [
        /^(?:local\s+)?function\s+([\w.:]+)\s*\(([^)]*)\)/gm,
        /^([\w.]+)\s*=\s*function\s*\(([^)]*)\)/gm,
      ],
    },
    {
      kind: 'method',
      label: 'method',
      color: 'var(--yellow, #e5c07b)',
      patterns: [
        /^function\s+([\w]+):([\w]+)\s*\(([^)]*)\)/gm,
        /^([\w]+):([\w]+)\s*=\s*function\s*\(([^)]*)\)/gm,
      ],
    },
    {
      kind: 'class',
      label: 'table',
      color: 'var(--green, #98c379)',
      patterns: [
        /^(?:local\s+)?([\w]+)\s*=\s*\{\s*$/gm,
        /^(?:local\s+)?([\w]+)\s*=\s*setmetatable\s*\(/gm,
      ],
    },
    {
      kind: 'local',
      label: 'local',
      color: 'var(--text2)',
      patterns: [/^local\s+([\w]+)\s*=\s*(?!function\b|{)[^-\n]+/gm],
    },
    {
      kind: 'require',
      label: 'require',
      color: 'var(--purple, #c678dd)',
      patterns: [/^(?:local\s+)?([\w]+)\s*=\s*require\s*\(["']([^"']+)["']\)/gm],
    },
  ];

  const ICONS = {
    function: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M4 6h16M4 12h16M4 18h7"/><path d="M17 15l2 2 4-4"/></svg>`,
    method: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`,
    class: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 21V9"/></svg>`,
    local: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    require: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  };

  function _lineOf(content, idx) {
    return content.slice(0, idx).split('\n').length;
  }

  function _parse(content) {
    const entries = [];
    const seen = new Set();

    for (const { kind, patterns } of KINDS) {
      for (const re of patterns) {
        const regex = new RegExp(re.source, re.flags);
        let m;
        while ((m = regex.exec(content)) !== null) {
          const name = m[1];
          if (!name || name.length < 2) continue;
          const key = `${kind}:${name}:${m.index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const line = _lineOf(content, m.index);
          const params = m[2] ? m[2].trim() : null;
          entries.push({ kind, name, line, params });
        }
      }
    }

    entries.sort((a, b) => a.line - b.line);
    return entries;
  }

  function _filtered() {
    if (!_query) return _entries;
    const q = _query.toLowerCase();
    return _entries.filter((e) => e.name.toLowerCase().includes(q));
  }

  function _renderEntry(entry) {
    const { kind, name, line, params } = entry;
    const cfg = KINDS.find((k) => k.kind === kind);
    const row = document.createElement('div');
    row.className = `outline-item outline-item--${kind}`;
    row.title = `Line ${line}`;

    const iconEl = document.createElement('span');
    iconEl.className = 'outline-icon';
    iconEl.style.color = cfg?.color ?? 'var(--text3)';
    iconEl.innerHTML = ICONS[kind] ?? '';

    const nameEl = document.createElement('span');
    nameEl.className = 'outline-name';
    nameEl.textContent = name;

    const metaEl = document.createElement('span');
    metaEl.className = 'outline-meta';

    if ((kind === 'function' || kind === 'method') && params !== null) {
      const paramStr = params.length > 28 ? params.slice(0, 26) + '…' : params;
      metaEl.textContent = `(${paramStr})`;
    } else if (kind === 'require' && entry.params) {
      metaEl.textContent = entry.params;
    } else {
      metaEl.textContent = `L${line}`;
    }

    const lineEl = document.createElement('span');
    lineEl.className = 'outline-line';
    lineEl.textContent = line;

    row.append(iconEl, nameEl, metaEl, lineEl);
    row.addEventListener('click', () => {
      if (_currentFileId) {
        state.setActive(_currentFileId);
        editor.jumpToLine(_currentFileId, line);
        eventBus.emit('ui:render-editor');
      }
    });
    return row;
  }

  function _render() {
    const list = document.getElementById('outlineList');
    const empty = document.getElementById('outlineEmpty');
    const count = document.getElementById('outlineCount');
    if (!list) return;

    const entries = _filtered();
    list.innerHTML = '';

    if (!entries.length) {
      if (empty) {
        empty.style.display = '';
        empty.textContent = _query && _entries.length ? 'No matching symbols' : _emptyMessage;
      }
      list.style.display = 'none';
      if (count) count.textContent = '';
      return;
    }

    if (empty) empty.style.display = 'none';
    list.style.display = '';

    if (count) count.textContent = String(entries.length);

    const groups = {};
    for (const e of entries) {
      if (!groups[e.kind]) groups[e.kind] = [];
      groups[e.kind].push(e);
    }

    const kindOrder = ['function', 'method', 'class', 'require', 'local'];
    for (const kind of kindOrder) {
      const group = groups[kind];
      if (!group?.length) continue;

      const cfg = KINDS.find((k) => k.kind === kind);
      const header = document.createElement('div');
      header.className = 'outline-group-header';
      header.innerHTML = `<span class="outline-group-chevron"><svg viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="outline-group-icon" style="color:${cfg?.color}">${ICONS[kind] ?? ''}</span><span>${cfg?.label?.toUpperCase() ?? kind.toUpperCase()}</span><span class="outline-group-count">${group.length}</span>`;

      const rowsContainer = document.createElement('div');
      rowsContainer.className = 'outline-group-rows';

      const isCollapsed = _collapsed.get(kind) ?? false;
      rowsContainer.style.display = isCollapsed ? 'none' : '';
      header.classList.toggle('collapsed', isCollapsed);

      header.addEventListener('click', () => {
        const next = !(_collapsed.get(kind) ?? false);
        _collapsed.set(kind, next);
        rowsContainer.style.display = next ? 'none' : '';
        header.classList.toggle('collapsed', next);
      });

      for (const entry of group) {
        rowsContainer.appendChild(_renderEntry(entry));
      }

      list.appendChild(header);
      list.appendChild(rowsContainer);
    }
  }

  function refresh() {
    const active = state.getActive();
    _currentFileId = active?.id ?? null;

    const empty = document.getElementById('outlineEmpty');
    const count = document.getElementById('outlineCount');

    if (!active) {
      _entries = [];
      _emptyMessage = 'Open a file to see its outline';
      if (empty) {
        empty.style.display = '';
        empty.textContent = _emptyMessage;
      }
      if (count) count.textContent = '';
      _render();
      return;
    }

    if (!/\.(lua|luau|js|ts|jsx|tsx)$/i.test(active.name)) {
      _entries = [];
      _emptyMessage = `Outline not available for ${active.name.split('.').pop().toUpperCase()} files`;
      if (empty) {
        empty.style.display = '';
        empty.textContent = _emptyMessage;
      }
      if (count) count.textContent = '';
      _render();
      return;
    }

    _entries = _parse(active.content ?? editor.getContent() ?? '');
    _emptyMessage = `No outline symbols found in ${active.name}`;
    _render();
  }

  function init() {
    const searchEl = document.getElementById('outlineSearch');
    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        _query = e.target.value.trim();
        _render();
      });
    }
    document.getElementById('btnOutlineRefresh')?.addEventListener('click', (e) => {
      e.stopPropagation();
      refresh();
    });
    const header = document.getElementById('outlineHeader');
    const body = document.getElementById('outlineBody');
    const arrow = document.getElementById('outlineArrow');
    if (header && body) {
      const section = header.closest('.sb-section');
      let expanded = !uiState.outlineCollapsed;
      const sync = () => {
        body.hidden = !expanded;
        section?.classList.toggle('is-collapsed', !expanded);
        arrow?.classList.toggle('open', expanded);
        header.setAttribute('aria-expanded', String(expanded));
      };
      const toggle = () => {
        expanded = !expanded;
        uiState.setOutlineCollapsed(!expanded);
        sync();
        const panel = document.getElementById('sidebarBottom');
        if (panel) {
          if (expanded && !panel.dataset.userResized) {
            panel.style.height = (uiState.sbBottomHeight > 0 ? uiState.sbBottomHeight : 200) + 'px';
          }
          const allCollapsed = !panel.querySelector('.sb-section:not(.is-collapsed)');
          if (allCollapsed) {
            panel.style.height = 'auto';
            delete panel.dataset.userResized;
          }
        }
      };
      header._syncOutlineChrome = () => {
        expanded = !uiState.outlineCollapsed;
        sync();
      };
      sync();
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggle();
      });
    }
    eventBus.on('ui:render-editor', refresh);
    eventBus.on('file:saved', refresh);
    eventBus.on('file:externalChange', ({ id }) => {
      if (id === _currentFileId) refresh();
    });
  }

  function syncChrome() {
    document.getElementById('outlineHeader')?._syncOutlineChrome?.();
  }

  return { init, refresh, syncChrome };
})();
