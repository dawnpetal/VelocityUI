const Breadcrumb = (() => {
  let _lastSyms = [];
  let _pickerEl = null;
  let _pickerAnchor = null;
  let _pickerMode = null;
  let _pickerItems = [];
  let _pickerFocus = -1;
  let _pickerCollapsed = new Set();
  let _dismissListener = null;
  let _editorRef = null;
  let _symbolProviders = null;
  function init(editorInstance, symbolProviders) {
    _editorRef = editorInstance;
    _symbolProviders = symbolProviders;
  }
  function update(position) {
    const bar = document.getElementById('breadcrumbBar');
    if (!bar || bar.style.display === 'none') return;
    const model = _editorRef?.getModel();
    if (!model) {
      bar.innerHTML = '';
      return;
    }
    const fileId = state.activeFileId;
    const file = fileId ? state.getFile(fileId) : null;
    if (!file || file.preview) {
      bar.innerHTML = '';
      return;
    }
    const lang = model.getLanguageId();
    const provider = _symbolProviders?.get(lang);
    if (!provider) {
      _render(bar, file.name, []);
      return;
    }
    try {
      const syms = provider.provideDocumentSymbols(model);
      _lastSyms = syms ?? [];
      _render(bar, file.name, syms?.length ? _findChain(syms, position.lineNumber) : []);
    } catch {
      _lastSyms = [];
      _render(bar, file.name, []);
    }
  }
  function _findChain(syms, ln) {
    for (const sym of syms) {
      if (sym.range.startLineNumber <= ln && sym.range.endLineNumber >= ln) {
        const inner = sym.children?.length ? _findChain(sym.children, ln) : [];
        return [sym, ...inner];
      }
    }
    return [];
  }
  function _symKindClass(kind) {
    const K = window.monaco?.languages.SymbolKind;
    if (!K) return 'var';
    if (kind === K.Function || kind === K.Method) return 'fn';
    if (kind === K.Class) return 'class';
    if (kind === K.Module || kind === K.Namespace) return 'mod';
    if (kind === K.Interface) return 'iface';
    return 'var';
  }
  function _symLabel(kind) {
    const K = window.monaco?.languages.SymbolKind;
    if (!K) return '·';
    const map = {
      [K.Class]: 'C',
      [K.Interface]: 'I',
      [K.Enum]: 'E',
      [K.Function]: 'f',
      [K.Method]: 'f',
      [K.Constructor]: 'f',
      [K.Module]: 'M',
      [K.Namespace]: 'N',
      [K.Package]: 'P',
      [K.Variable]: 'x',
      [K.Property]: 'x',
      [K.Field]: 'x',
      [K.Constant]: 'x',
      [K.String]: 'a',
      [K.Number]: '#',
      [K.Boolean]: 'b',
      [K.Array]: '[]',
      [K.Object]: '{}',
      [K.Key]: 'k',
      [K.Null]: 'n',
    };
    return map[kind] ?? '·';
  }
  function _bcSep() {
    const s = document.createElement('span');
    s.className = 'bc-sep';
    s.textContent = '›';
    return s;
  }
  function _makeBcIcon(kind) {
    const ic = document.createElement('span');
    ic.className = 'bc-icon bc-icon-' + _symKindClass(kind);
    ic.textContent = _symLabel(kind);
    return ic;
  }
  function _normPath(p) {
    return (p ?? '').replace(/\\/g, '/').replace(/\/$/, '');
  }

  function _render(bar, filename, chain) {
    bar.innerHTML = '';
    closePicker();
    const fileId = state.activeFileId;
    const file = fileId ? state.getFile(fileId) : null;
    const rawPath = file?.path ?? filename;
    const normFile = _normPath(rawPath);

    const candidates = [
      ...(state.roots ?? []).map((r) => _normPath(r.path)),
      _normPath(state.workDir),
    ].filter(Boolean);

    let matchedRoot = null;
    let matchedLen = -1;
    for (const candidate of candidates) {
      if (
        (normFile.startsWith(candidate + '/') || normFile === candidate) &&
        candidate.length > matchedLen
      ) {
        matchedRoot = candidate;
        matchedLen = candidate.length;
      }
    }

    let rel;
    if (matchedRoot) {
      const rootName = matchedRoot.split('/').pop();
      const rest = normFile.slice(matchedRoot.length).replace(/^\//, '');
      rel = rest ? rootName + '/' + rest : rootName;
    } else {
      rel = rawPath.replace(/\\/g, '/').split('/').pop() ?? rawPath;
    }

    const pathParts = rel.split('/').filter(Boolean);
    pathParts.forEach((part, i) => {
      if (i > 0) bar.appendChild(_bcSep());
      const isFile = i === pathParts.length - 1;
      const seg = document.createElement('span');
      seg.className =
        'bc-seg bc-path' +
        (isFile && !chain.length ? ' bc-active' : '') +
        (isFile ? ' bc-filename' : ' bc-folder');
      if (isFile) seg.appendChild(helpers.fileIconEl(part));
      const nameEl = document.createElement('span');
      nameEl.textContent = part;
      seg.appendChild(nameEl);
      const rootParent = matchedRoot ? matchedRoot.replace(/\/[^/]+$/, '') : (state.workDir ?? '');
      const segPath = pathParts.slice(0, i + 1).reduce((acc, p) => acc + '/' + p, rootParent);
      const segDir = isFile
        ? segPath.replace(/\/[^/]+$/, '') || matchedRoot || state.workDir
        : segPath;
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isFile) _openSymbolPicker(seg, _lastSyms, null);
        else _openFilePicker(seg, segDir);
      });
      bar.appendChild(seg);
    });
    chain.forEach((sym, i) => {
      bar.appendChild(_bcSep());
      const seg = document.createElement('span');
      seg.className = 'bc-seg bc-sym' + (i === chain.length - 1 ? ' bc-active' : '');
      seg.append(_makeBcIcon(sym.kind));
      const nameEl = document.createElement('span');
      nameEl.textContent = sym.name;
      seg.appendChild(nameEl);
      const siblings = i === 0 ? _lastSyms : (chain[i - 1].children ?? _lastSyms);
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        _openSymbolPicker(seg, siblings, sym);
      });
      bar.appendChild(seg);
    });
    requestAnimationFrame(() => {
      bar.scrollLeft = bar.scrollWidth;
    });
  }
  function closePicker() {
    if (_pickerEl) {
      _pickerEl.remove();
      _pickerEl = null;
    }
    if (_dismissListener) {
      document.removeEventListener('mousedown', _dismissListener, true);
      _dismissListener = null;
    }
    document
      .querySelectorAll('.bc-seg.bc-picker-open')
      .forEach((el) => el.classList.remove('bc-picker-open'));
    _pickerAnchor = null;
    _pickerMode = null;
  }
  function _makePickerPanel(anchor) {
    const panel = document.createElement('div');
    panel.className = 'bc-picker';
    _pickerEl = panel;
    _pickerItems = [];
    _pickerFocus = -1;
    const barRect = document.getElementById('breadcrumbBar').getBoundingClientRect();
    const ancRect = anchor.getBoundingClientRect();
    panel.style.top = barRect.bottom + 'px';
    panel.style.left = ancRect.left + 'px';
    return panel;
  }
  function _clampPanel(panel, anchor) {
    requestAnimationFrame(() => {
      const pr = panel.getBoundingClientRect();
      const ancRect = anchor.getBoundingClientRect();
      if (pr.right > window.innerWidth - 8)
        panel.style.left = window.innerWidth - 8 - pr.width + 'px';
      if (pr.bottom > window.innerHeight - 30) panel.style.top = ancRect.top - pr.height - 2 + 'px';
    });
  }
  function _pickerSetFocus(idx) {
    if (_pickerFocus >= 0 && _pickerItems[_pickerFocus])
      _pickerItems[_pickerFocus].el.classList.remove('bc-pick-focused');
    _pickerFocus = Math.max(0, Math.min(idx, _pickerItems.length - 1));
    if (_pickerItems[_pickerFocus]) {
      _pickerItems[_pickerFocus].el.classList.add('bc-pick-focused');
      _pickerItems[_pickerFocus].el.scrollIntoView({
        block: 'nearest',
      });
    }
  }
  function _pickerJump(sym) {
    closePicker();
    _editorRef.setPosition({
      lineNumber: sym.selectionRange.startLineNumber,
      column: sym.selectionRange.startColumn,
    });
    _editorRef.revealLineInCenterIfOutsideViewport(sym.selectionRange.startLineNumber);
    _editorRef.focus();
  }
  function _pickerKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePicker();
      _editorRef.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _pickerSetFocus(_pickerFocus + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _pickerSetFocus(_pickerFocus - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = _pickerItems[_pickerFocus];
      if (!item) return;
      if (item.type === 'symbol') _pickerJump(item.data);
      else if (item.type === 'file' && item.data.kind === 'file') {
        closePicker();
        eventBus.emit('ui:open-file', {
          id: item.data.path,
        });
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const item = _pickerItems[_pickerFocus];
      if (item?.type === 'symbol' && item.data.children?.length) {
        _pickerCollapsed.delete(item.data);
        const anchor = _pickerAnchor,
          active = item.data;
        closePicker();
        _openSymbolPicker(anchor, _lastSyms, active);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const item = _pickerItems[_pickerFocus];
      if (item?.type === 'symbol' && item.data.children?.length) {
        _pickerCollapsed.add(item.data);
        const anchor = _pickerAnchor,
          active = item.data;
        closePicker();
        _openSymbolPicker(anchor, _lastSyms, active);
      }
      return;
    }
  }
  async function _openFilePicker(anchor, dirPath) {
    if (_pickerAnchor === anchor) {
      closePicker();
      return;
    }
    closePicker();
    _pickerAnchor = anchor;
    _pickerMode = 'file';
    anchor.classList.add('bc-picker-open');
    const panel = _makePickerPanel(anchor);
    const searchWrap = document.createElement('div');
    searchWrap.className = 'bc-pick-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'bc-pick-search';
    searchInput.placeholder = 'Filter files…';
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);
    const listEl = document.createElement('div');
    listEl.className = 'bc-pick-list';
    panel.appendChild(listEl);
    document.body.appendChild(panel);
    _clampPanel(panel, anchor);
    panel.setAttribute('tabindex', '-1');
    panel.addEventListener('keydown', _pickerKeydown);
    _dismissListener = (e) => {
      if (!panel.contains(e.target) && e.target !== anchor) closePicker();
    };
    document.addEventListener('mousedown', _dismissListener, true);
    let _allEntries = [];
    const _renderList = (filter) => {
      listEl.innerHTML = '';
      _pickerItems = [];
      _pickerFocus = -1;
      const lower = filter.toLowerCase();
      const visible = filter
        ? _allEntries.filter((e) => e.name.toLowerCase().includes(lower))
        : _allEntries;
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'bc-pick-empty';
        empty.textContent = 'No files found';
        listEl.appendChild(empty);
        return;
      }
      visible.forEach((entry) => {
        const row = _makeFileRow(entry, dirPath, listEl);
        _pickerItems.push({
          el: row,
          data: entry,
          type: 'file',
        });
      });
      if (_pickerItems.length) _pickerSetFocus(0);
    };
    searchInput.addEventListener('input', () => _renderList(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        panel.focus();
        _pickerSetFocus(0);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
        _editorRef.focus();
      }
    });
    try {
      const entries = await window.__TAURI__.core.invoke('read_dir', {
        path: dirPath,
      });
      const dirs = entries
        .filter((e) => e.type === 'DIRECTORY' && !e.entry.startsWith('.'))
        .sort((a, b) => a.entry.localeCompare(b.entry));
      const files = entries
        .filter((e) => e.type === 'FILE' && !e.entry.startsWith('.'))
        .sort((a, b) => a.entry.localeCompare(b.entry));
      _allEntries = [
        ...dirs.map((e) => ({
          name: e.entry,
          path: dirPath + '/' + e.entry,
          kind: 'folder',
        })),
        ...files.map((e) => ({
          name: e.entry,
          path: dirPath + '/' + e.entry,
          kind: 'file',
        })),
      ];
      _renderList('');
      _clampPanel(panel, anchor);
      setTimeout(() => searchInput.focus(), 0);
    } catch {
      const err = document.createElement('div');
      err.className = 'bc-pick-empty';
      err.textContent = 'Cannot read directory';
      listEl.appendChild(err);
    }
  }
  function _makeFileRow(entry, parentDir, container) {
    const row = document.createElement('div');
    row.className = 'bc-pick-row';
    row.setAttribute('tabindex', '-1');
    const extMap = {
      js: 'bc-fi-js',
      ts: 'bc-fi-ts',
      jsx: 'bc-fi-js',
      tsx: 'bc-fi-ts',
      html: 'bc-fi-html',
      htm: 'bc-fi-html',
      css: 'bc-fi-css',
      scss: 'bc-fi-css',
      less: 'bc-fi-css',
      json: 'bc-fi-json',
      lua: 'bc-fi-lua',
      md: 'bc-fi-md',
      txt: 'bc-fi-txt',
      png: 'bc-fi-img',
      jpg: 'bc-fi-img',
      jpeg: 'bc-fi-img',
      gif: 'bc-fi-img',
      svg: 'bc-fi-img',
      webp: 'bc-fi-img',
      mp4: 'bc-fi-vid',
      webm: 'bc-fi-vid',
      ogg: 'bc-fi-vid',
      mov: 'bc-fi-vid',
      mkv: 'bc-fi-vid',
      avi: 'bc-fi-vid',
      m4v: 'bc-fi-vid',
    };
    const letterMap = {
      js: 'JS',
      ts: 'TS',
      jsx: 'JS',
      tsx: 'TS',
      html: 'HT',
      css: 'CS',
      scss: 'SC',
      less: 'LE',
      json: 'JS',
      lua: 'LU',
      md: 'MD',
      txt: 'TX',
      svg: 'SV',
      mp4: 'MP',
      webm: 'WB',
      mov: 'MV',
      mkv: 'MK',
      avi: 'AV',
      m4v: 'MV',
    };
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const icon = document.createElement('span');
    if (entry.kind === 'folder') {
      icon.className = 'bc-pick-file-icon bc-pick-icon-folder';
      icon.textContent = '▸';
    } else {
      icon.className = 'bc-pick-file-icon ' + (extMap[ext] ?? 'bc-fi-default');
      icon.textContent = letterMap[ext] ?? (ext.slice(0, 2).toUpperCase() || '?');
    }
    const label = document.createElement('span');
    label.className = 'bc-pick-label';
    label.textContent = entry.name;
    row.append(icon, label);
    if (entry.kind === 'folder') {
      const arrow = document.createElement('span');
      arrow.className = 'bc-pick-row-chevron';
      arrow.textContent = '›';
      row.appendChild(arrow);
      row.addEventListener('click', () => _openFilePicker(_pickerAnchor, entry.path));
    } else {
      row.addEventListener('click', () => {
        closePicker();
        eventBus.emit('ui:open-file', {
          id: entry.path,
        });
      });
    }
    container.appendChild(row);
    return row;
  }
  function _openSymbolPicker(anchor, syms, activeSym) {
    if (_pickerAnchor === anchor) {
      closePicker();
      return;
    }
    closePicker();
    if (!syms?.length) return;
    _pickerAnchor = anchor;
    _pickerMode = 'symbol';
    anchor.classList.add('bc-picker-open');
    const panel = _makePickerPanel(anchor);
    const searchWrap = document.createElement('div');
    searchWrap.className = 'bc-pick-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'bc-pick-search';
    searchInput.placeholder = 'Filter symbols…';
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);
    const listEl = document.createElement('div');
    listEl.className = 'bc-pick-list';
    panel.appendChild(listEl);
    document.body.appendChild(panel);
    _clampPanel(panel, anchor);
    panel.setAttribute('tabindex', '-1');
    panel.addEventListener('keydown', _pickerKeydown);
    _dismissListener = (e) => {
      if (!panel.contains(e.target) && e.target !== anchor) closePicker();
    };
    document.addEventListener('mousedown', _dismissListener, true);
    const _renderSyms = (filter) => {
      listEl.innerHTML = '';
      _pickerItems = [];
      _pickerFocus = -1;
      const lower = filter.toLowerCase();
      const walk = (items, depth) => {
        items.forEach((sym) => {
          if (filter && !sym.name.toLowerCase().includes(lower)) {
            if (sym.children?.length) walk(sym.children, depth);
            return;
          }
          const hasChildren = sym.children?.length > 0;
          const isCollapsed = _pickerCollapsed.has(sym);
          const row = document.createElement('div');
          row.className = 'bc-pick-row' + (sym === activeSym ? ' bc-pick-active' : '');
          row.style.paddingLeft = 10 + depth * 14 + 'px';
          row.setAttribute('tabindex', '-1');
          if (hasChildren) {
            const arrow = document.createElement('span');
            arrow.className = 'bc-pick-arrow';
            arrow.textContent = isCollapsed ? '›' : '⌄';
            arrow.addEventListener('click', (e) => {
              e.stopPropagation();
              if (isCollapsed) _pickerCollapsed.delete(sym);
              else _pickerCollapsed.add(sym);
              _renderSyms(searchInput.value);
            });
            row.appendChild(arrow);
          } else {
            const spacer = document.createElement('span');
            spacer.className = 'bc-pick-arrow bc-pick-arrow-none';
            row.appendChild(spacer);
          }
          row.appendChild(_makeBcIcon(sym.kind));
          const label = document.createElement('span');
          label.className = 'bc-pick-label';
          if (filter) {
            const lo = sym.name.toLowerCase(),
              idx = lo.indexOf(lower);
            if (idx >= 0) {
              label.appendChild(document.createTextNode(sym.name.slice(0, idx)));
              const mark = document.createElement('mark');
              mark.className = 'bc-pick-match';
              mark.textContent = sym.name.slice(idx, idx + lower.length);
              label.appendChild(mark);
              label.appendChild(document.createTextNode(sym.name.slice(idx + lower.length)));
            } else {
              label.textContent = sym.name;
            }
          } else {
            label.textContent = sym.name;
          }
          const lineHint = document.createElement('span');
          lineHint.className = 'bc-pick-line';
          lineHint.textContent = ':' + sym.selectionRange.startLineNumber;
          row.append(label, lineHint);
          row.addEventListener('click', () => _pickerJump(sym));
          listEl.appendChild(row);
          _pickerItems.push({
            el: row,
            data: sym,
            type: 'symbol',
          });
          if (hasChildren && !isCollapsed) walk(sym.children, depth + 1);
        });
      };
      walk(syms, 0);
      if (_pickerItems.length) {
        const activeIdx = _pickerItems.findIndex((it) => it.data === activeSym);
        _pickerSetFocus(activeIdx >= 0 ? activeIdx : 0);
      }
    };
    _renderSyms('');
    searchInput.addEventListener('input', () => _renderSyms(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        panel.focus();
        _pickerSetFocus(0);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
        _editorRef.focus();
      }
    });
    setTimeout(() => searchInput.focus(), 0);
  }
  return {
    init,
    update,
    closePicker,
  };
})();
