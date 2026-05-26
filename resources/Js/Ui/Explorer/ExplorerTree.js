const ExplorerTree = (() => {
  const rootEl = () => document.getElementById('fileTree');
  let _selection = new Set();
  let _lastClickedId = null;
  let _dragSrcId = null;
  let _dragNodes = [];
  let _flatOrder = [];
  let _structureKey = '';
  let _vlist = null;
  let _nodeContainer = null;
  let _creatingNode = null;
  const SVG = {
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    newFile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    newFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    rename: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    copyPath: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    reveal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    duplicate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    addFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    remove: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };
  function _findNode(id, node) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = _findNode(id, child);
      if (found) return found;
    }
    return null;
  }
  function findNodeInRoots(id) {
    for (const root of state.roots) {
      const found = _findNode(id, root);
      if (found) return found;
    }
    return null;
  }
  function setDragSrc(id) {
    _dragSrcId = id;
  }
  function getDragSrc() {
    return _dragSrcId;
  }
  function setDragNodes(nodes) {
    _dragNodes = nodes ?? [];
  }
  function getDragNodes() {
    return _dragNodes;
  }
  function clearSelection() {
    _setSelection([]);
  }
  function _orderedChildren(node) {
    return (node.children ?? []).filter((child) => !autoexec.isProtectedRootNode(child));
  }
  function _terminalNodes(rootNode) {
    return [];
  }

  function _getFileCount(node) {
    if (node.type === 'file') return 1;
    return _orderedChildren(node).reduce((n, c) => n + _getFileCount(c), 0);
  }
  function _setSelection(ids) {
    _selection = new Set(ids);
    rootEl()
      ?.querySelectorAll('.tree-row')
      .forEach((row) => {
        row.classList.toggle('selected', _selection.has(row.dataset.id));
        row.classList.toggle('active', row.dataset.id === state.activeFileId);
      });
  }
  function _getSelectionNodes() {
    return [..._selection].map((id) => findNodeInRoots(id)).filter(Boolean);
  }
  function _buildStructureKey() {
    const parts = [];
    function walk(node) {
      parts.push(node.id + (node.type === 'folder' ? (node.open ? 'O' : 'C') : 'F'));
      if (node.type === 'folder' && node.open) {
        for (const c of _orderedChildren(node)) walk(c);
      }
    }
    state.roots.forEach((root, index) => {
      if (index > 0) parts.push('S' + root.id);
      parts.push('R' + root.id + (root.open ? 'O' : 'C'));
      if (root.open) for (const c of _orderedChildren(root)) walk(c);
      for (const terminal of _terminalNodes(root)) {
        parts.push('T' + root.id);
        walk(terminal);
      }
    });
    if (_creatingNode) parts.push(`N${_creatingNode.id}:${_creatingNode.parentId}`);
    return parts.join('|');
  }
  function _patchSelection() {
    const container = _nodeContainer ?? rootEl();
    if (!container) return;
    container.querySelectorAll('.tree-row').forEach((row) => {
      row.classList.toggle('selected', _selection.has(row.dataset.id));
      row.classList.toggle('active', row.dataset.id === state.activeFileId);
      const node = findNodeInRoots(row.dataset.id);
      const isAutoexecRoot = autoexec.isProtectedRootNode(node);
      row.classList.toggle('autoexec-root', isAutoexecRoot);
      const meta = row.querySelector('.tree-meta');
      if (!meta) return;
      let badge = meta.querySelector('.tree-autoexec-badge');
      if (isAutoexecRoot) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tree-autoexec-badge';
          meta.appendChild(badge);
        }
        badge.textContent = autoexec.isEnabled() ? 'on' : 'off';
      } else {
        badge?.remove();
      }
    });
  }
  function _patchUnsaved() {
    const container = _nodeContainer ?? rootEl();
    if (!container) return;
    container.querySelectorAll(".tree-row[data-type='file']").forEach((row) => {
      const id = row.dataset.id;
      const meta = row.querySelector('.tree-meta');
      if (!meta) return;
      const existingDot = meta.querySelector('.tree-unsaved-dot');
      const shouldHave = state.isUnsaved(id);
      if (shouldHave && !existingDot) {
        const dot = document.createElement('span');
        dot.className = 'tree-unsaved-dot';
        meta.insertBefore(dot, meta.firstChild);
      } else if (!shouldHave && existingDot) {
        existingDot.remove();
      }
    });
  }
  function _ensureRootContextMenu() {
    const root = rootEl();
    if (!root || root._ctxBound) return;
    root._ctxBound = true;
    root.addEventListener('contextmenu', (e) => {
      if (e.target === root || e.target.closest('.empty-explorer')) {
        e.preventDefault();
        ctxMenu.showEmpty(e, state.roots[0] ?? null);
      }
    });
  }
  function _destroyVirtualList() {
    _vlist?.destroy?.();
    _vlist = null;
    _nodeContainer = null;
  }

  function syncChrome() {
    const header = document.getElementById('explorerFilesHeader');
    const body = document.getElementById('explorerFilesBody');
    const arrow = document.getElementById('explorerFilesArrow');
    const section = document.getElementById('explorerFilesSection');
    const meta = document.getElementById('explorerFilesMeta');
    const expanded = !uiState.fileTreeCollapsed;
    if (!header || !body) return;
    body.hidden = !expanded;
    section?.classList.toggle('is-collapsed', !expanded);
    arrow?.classList.toggle('open', expanded);
    header.setAttribute('aria-expanded', String(expanded));
    if (meta)
      meta.textContent = state.roots.length
        ? `${state.roots.length} root${state.roots.length === 1 ? '' : 's'}`
        : '';
  }

  function _setupSectionHeader() {
    const header = document.getElementById('explorerFilesHeader');
    if (!header || header.dataset.explorerFilesBound) return;
    header.dataset.explorerFilesBound = 'true';
    const toggle = () => {
      uiState.setFileTreeCollapsed?.(!uiState.fileTreeCollapsed);
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
    syncChrome();
  }

  function render() {
    const root = rootEl();
    if (!root) return;
    syncChrome();
    _ensureRootContextMenu();
    if (!state.roots.length) {
      _structureKey = '';
      _destroyVirtualList();
      root.innerHTML = `
        <div class="empty-explorer">
          <div class="empty-explorer-icon">${SVG.folder}</div>
          <p class="empty-explorer-title">No folder open</p>
          <p class="empty-explorer-sub">Open a folder to start editing</p>
          <button class="open-folder-btn" id="explorerOpenFolderBtn">Open Folder…</button>
          <button class="open-folder-btn open-folder-btn--secondary" id="explorerResetDefaultBtn">Restore Default Workspace</button>
          <div class="empty-drop-hint">${SVG.upload}<span>or drag a folder here</span></div>
        </div>`;
      document
        .getElementById('explorerOpenFolderBtn')
        ?.addEventListener('click', () => workspaceController.openFolderDialog());
      document
        .getElementById('explorerResetDefaultBtn')
        ?.addEventListener('click', () => workspaceController.resetDefault());
      return;
    }
    const newKey = _buildStructureKey();
    const isDirty = root.querySelector('.tree-rename-input:not(.tree-rename-input--creating)');
    if (newKey === _structureKey && !isDirty) {
      _patchSelection();
      _patchUnsaved();
      autoexec.renderSection?.();
      return;
    }
    _structureKey = newKey;
    _destroyVirtualList();
    root.innerHTML = '';
    _flatOrder = [];

    _rebuildFlatOrder();

    _nodeContainer = document.createElement('div');
    _nodeContainer.className = 'tree-node-container';
    _nodeContainer.style.position = 'relative';
    root.appendChild(_nodeContainer);

    _nodeContainer.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.tree-row') && !e.target.closest('.tree-root-header')) {
        e.preventDefault();
        ctxMenu.showEmpty(e, state.roots[0] ?? null);
      }
    });

    _vlist = VirtualList.create({
      container: _nodeContainer,
      getCount: () => _flatOrder.length,
      getItem: (i) => _flatOrder[i],
      renderRow: (i, item) => {
        if (!item) return null;
        if (item.root) return _buildRootHeader(item.root);
        return _buildRow(item.node, item.depth);
      },
      getItemHeight: (_i, item) => (item?.rootGhost ? 42 : VirtualList.ROW_HEIGHT),
    });
    _vlist.update(_flatOrder.length);
    autoexec.renderSection?.();
  }

  function _buildFlatOrder(rootNode, out) {
    if (!rootNode.open) return;
    for (const child of _orderedChildren(rootNode)) _buildFlatOrderNode(child, 0, out);
  }
  function _buildFlatOrderNode(node, depth, out) {
    out.push({ node, depth });
    if (node.type === 'folder' && node.open) {
      for (const child of _orderedChildren(node)) _buildFlatOrderNode(child, depth + 1, out);
    }
  }
  async function _ensureFolderOpen(node) {
    if (!node || node.type !== 'folder') return;
    await fileManager.ensureChildren?.(node);
    node.open = true;
  }
  function _buildRootHeader(rootNode) {
    const isPrimary = state.roots.indexOf(rootNode) === 0;
    const header = document.createElement('div');
    header.className =
      'tree-root-header' +
      (isPrimary ? '' : ' tree-root-header--secondary tree-root-header--ghost-before');
    header.dataset.id = rootNode.id;
    const left = document.createElement('div');
    left.className = 'tree-root-left';
    const arrow = document.createElement('span');
    arrow.className = 'tree-root-arrow' + (rootNode.open ? ' open' : '');
    arrow.innerHTML = SVG.arrow;
    const name = document.createElement('span');
    name.className = 'tree-root-name';
    name.textContent = rootNode.name.toUpperCase();
    left.append(arrow, name);
    if (!isPrimary) {
      const badge = document.createElement('span');
      badge.className = 'tree-root-badge';
      badge.textContent = 'folder';
      left.appendChild(badge);
    }
    const right = document.createElement('div');
    right.className = 'tree-root-right';
    const count = document.createElement('span');
    count.className = 'tree-root-count';
    count.textContent = _getFileCount(rootNode);
    const menuBtn = document.createElement('button');
    menuBtn.className = 'tree-root-menu-btn';
    menuBtn.innerHTML = SVG.dots;
    menuBtn.title = 'Folder options';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ctxMenu.showForRoot(e, rootNode);
    });
    right.append(count, menuBtn);
    header.append(left, right);
    header.addEventListener('click', () => {
      rootNode.open = !rootNode.open;
      render();
    });
    ExplorerDnd.attachRootHeaderDrop(header, rootNode);
    return header;
  }
  function _toggleFolderInPlace(row, node, depth) {
    const arrowEl = row?.querySelector('.tree-arrow');
    const iconEl = row?.querySelector('.tree-icon > span');
    if (arrowEl) arrowEl.classList.toggle('open', node.open);
    if (iconEl) helpers.updateIconEl(iconEl, node.name, true, node.open);

    _rebuildFlatOrder();
    if (_vlist) _vlist.update(_flatOrder.length);
    _patchSelection();
    _patchUnsaved();
    persist.saveTreeState(state.workDir).catch(() => {});
  }

  function _rebuildFlatOrder() {
    _flatOrder = [];
    state.roots.forEach((root, index) => {
      _flatOrder.push({ root, rootGhost: index > 0 });
      if (root.open) _buildFlatOrder(root, _flatOrder);
      for (const terminal of _terminalNodes(root)) _buildFlatOrderNode(terminal, 0, _flatOrder);
    });
    if (_vlist) _vlist.update(_flatOrder.length);
  }

  function _buildRow(node, depth) {
    if (node?.creating) return _buildCreatingRow(node, depth);
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.id = node.id;
    row.dataset.type = node.type;
    row.classList.toggle('selected', _selection.has(node.id));
    row.classList.toggle('active', node.id === state.activeFileId);
    row.classList.toggle('autoexec-root', autoexec.isProtectedRootNode(node));
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    for (let i = 0; i < depth; i++) {
      const guide = document.createElement('span');
      guide.className = 'tree-guide';
      guide.style.left = i * 14 + 13 + 'px';
      row.appendChild(guide);
    }
    indent.style.paddingLeft = depth * 14 + 6 + 'px';
    const arrowEl = document.createElement('span');
    arrowEl.className =
      'tree-arrow' + (node.type === 'folder' ? (node.open ? ' open' : '') : ' leaf');
    arrowEl.innerHTML = SVG.arrow;
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.appendChild(helpers.fileIconEl(node.name, node.type === 'folder', node.open));
    const labelEl = document.createElement('span');
    labelEl.className = 'tree-label';
    labelEl.textContent = node.name;
    const metaEl = document.createElement('span');
    metaEl.className = 'tree-meta';
    if (state.isUnsaved(node.id)) {
      const dot = document.createElement('span');
      dot.className = 'tree-unsaved-dot';
      metaEl.appendChild(dot);
    }
    if (autoexec.isProtectedRootNode(node)) {
      const badge = document.createElement('span');
      badge.className = 'tree-autoexec-badge';
      badge.textContent = autoexec.isEnabled() ? 'on' : 'off';
      metaEl.appendChild(badge);
    } else if (node.type === 'folder' && node.children?.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'tree-folder-count';
      badge.textContent = node.children.length;
      metaEl.appendChild(badge);
    }
    indent.append(arrowEl, iconEl, labelEl, metaEl);
    row.appendChild(indent);
    row.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        if (_selection.has(node.id)) {
          _selection.delete(node.id);
          row.classList.remove('selected');
        } else {
          _selection.add(node.id);
          row.classList.add('selected');
        }
        _lastClickedId = node.id;
        return;
      }
      if (e.shiftKey && _lastClickedId && _lastClickedId !== node.id) {
        const a = _flatOrder.findIndex((item) => item.node?.id === _lastClickedId);
        const b = _flatOrder.findIndex((item) => item.node?.id === node.id);
        if (a !== -1 && b !== -1) {
          const lo = Math.min(a, b),
            hi = Math.max(a, b);
          _setSelection(
            _flatOrder
              .slice(lo, hi + 1)
              .map((item) => item.node?.id)
              .filter(Boolean),
          );
          return;
        }
      }
      _setSelection([node.id]);
      _lastClickedId = node.id;
      if (node.type === 'folder') {
        if (node.open) node.open = false;
        else await _ensureFolderOpen(node);
        _toggleFolderInPlace(row, node, depth);
      } else {
        eventBus.emit('ui:open-file', {
          id: node.id,
        });
      }
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!_selection.has(node.id)) {
        _setSelection([node.id]);
        _lastClickedId = node.id;
      }
      ctxMenu.showForNodes(e, _getSelectionNodes());
    });
    ExplorerDnd.attachRowDrop(row, node);
    if (node.type === 'file') ExplorerDnd.attachFileDrag(row, node);
    if (node.type === 'folder') ExplorerDnd.attachFolderDrag(row, node);
    return row;
  }

  function _buildCreatingRow(node, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row tree-row--creating';
    row.dataset.id = node.id;
    row.dataset.type = node.type;
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.paddingLeft = depth * 14 + 6 + 'px';
    const arrowEl = document.createElement('span');
    arrowEl.className = 'tree-arrow leaf';
    arrowEl.innerHTML = SVG.arrow;
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.appendChild(
      helpers.fileIconEl(node.type === 'file' ? 'untitled.lua' : '', node.type === 'folder', false),
    );
    const input = document.createElement('input');
    input.className = 'tree-rename-input tree-rename-input--creating';
    input.placeholder = node.type === 'file' ? 'filename.lua' : 'folder name';
    input.value = node.pendingName || '';
    input.addEventListener('input', () => {
      node.pendingName = input.value;
      helpers.updateIconEl(
        iconEl.querySelector('span'),
        input.value.trim() || '.',
        node.type === 'folder',
        false,
      );
    });
    let done = false;
    const finish = async (success) => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      const createHandler = node.creating;
      _creatingNode = null;
      _structureKey = '';
      await createHandler.finish(val, success);
      render();
    };
    const handleBlur = () => finish(true);
    input.addEventListener('blur', handleBlur, { once: true });
    input.addEventListener('keydown', (event) => {
      if (
        ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(
          event.key,
        )
      )
        event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        input.removeEventListener('blur', handleBlur);
        finish(true);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        input.removeEventListener('blur', handleBlur);
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
  function _selectByIndex(idx, step = 1) {
    if (!_flatOrder.length) return;
    let next = Math.max(0, Math.min(idx, _flatOrder.length - 1));
    while (next >= 0 && next < _flatOrder.length && !_flatOrder[next]?.node) next += step;
    const item = _flatOrder[next];
    if (!item?.node) return;
    _setSelection([item.node.id]);
    _lastClickedId = item.node.id;
    _vlist?.scrollToIndex(next);
  }
  function _selectedIndex() {
    const id = [..._selection][0] ?? state.activeFileId;
    const idx = _flatOrder.findIndex((item) => item.node?.id === id);
    if (idx !== -1) return idx;
    return _flatOrder.findIndex((item) => item.node);
  }
  function _parentIndexOf(idx) {
    const depth = _flatOrder[idx]?.depth ?? 0;
    if (depth <= 0) return -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (_flatOrder[i].node && _flatOrder[i].depth < depth) return i;
    }
    return -1;
  }
  function _handleTreeKeydown(e) {
    if (
      !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Delete', 'Backspace'].includes(
        e.key,
      )
    )
      return;
    if (document.activeElement?.classList.contains('tree-rename-input')) return;
    if (!_flatOrder.length) return;
    e.preventDefault();
    const idx = _selectedIndex();
    if (idx === -1) return;
    const item = _flatOrder[idx];
    const node = item?.node;
    if (!node) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const nodes = _getSelectionNodes();
      if (nodes.length) ExplorerOps.confirmDeleteMulti(nodes);
      return;
    }
    if (e.key === 'ArrowDown') {
      _selectByIndex(idx + 1, 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      _selectByIndex(idx - 1, -1);
      return;
    }
    if (e.key === 'ArrowRight') {
      if (node.type === 'folder' && !node.open) {
        _ensureFolderOpen(node).then(() => {
          _toggleFolderInPlace(
            document.querySelector(`.tree-row[data-id="${node.id}"]`),
            node,
            item.depth,
          );
        });
        return;
      } else if (node.type === 'folder' && node.children?.length) {
        _selectByIndex(idx + 1, 1);
      } else if (node.type === 'file') {
        eventBus.emit('ui:open-file', { id: node.id });
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      if (node.type === 'folder' && node.open) {
        node.open = false;
        _toggleFolderInPlace(
          document.querySelector(`.tree-row[data-id="${node.id}"]`),
          node,
          item.depth,
        );
      } else {
        const parent = _parentIndexOf(idx);
        if (parent !== -1) _selectByIndex(parent);
      }
      return;
    }
    if (node.type === 'folder') {
      if (node.open) node.open = false;
      else {
        _ensureFolderOpen(node).then(() => {
          _toggleFolderInPlace(
            document.querySelector(`.tree-row[data-id="${node.id}"]`),
            node,
            item.depth,
          );
        });
        return;
      }
      _toggleFolderInPlace(
        document.querySelector(`.tree-row[data-id="${node.id}"]`),
        node,
        item.depth,
      );
    } else {
      eventBus.emit('ui:open-file', { id: node.id });
    }
  }

  function init() {
    _setupSectionHeader();
    const root = rootEl();
    if (root) {
      root.tabIndex = 0;
      root.addEventListener('keydown', _handleTreeKeydown);
    }
    root?.addEventListener('click', (e) => {
      if (!e.target.closest('.tree-row') && !e.target.closest('.tree-root-header')) {
        _setSelection([]);
        _lastClickedId = null;
      }
    });
    ExplorerDnd.attachRootDrop(root);
  }
  function revealFile(id) {
    const file = state.getFile(id);
    if (!file) return;

    function expandAncestors(nodes, targetPath) {
      for (const node of nodes) {
        if (node.type === 'folder') {
          if (targetPath.startsWith(node.path + '/')) {
            node.open = true;
            expandAncestors(node.children ?? [], targetPath);
            return true;
          }
        }
      }
      return false;
    }
    for (const root of state.roots) {
      if (file.path.startsWith(root.path + '/')) {
        expandAncestors(root.children ?? [], file.path);
        break;
      }
    }

    _flatOrder = [];
    state.roots.forEach((root, index) => {
      _flatOrder.push({ root, rootGhost: index > 0 });
      if (root.open) _buildFlatOrder(root, _flatOrder);
      for (const terminal of _terminalNodes(root)) _buildFlatOrderNode(terminal, 0, _flatOrder);
    });
    if (_vlist) _vlist.update(_flatOrder.length);
    autoexec.renderSection?.();

    const idx = _flatOrder.findIndex((item) => item.node?.id === id);
    if (idx !== -1 && _vlist) {
      _vlist.scrollToIndex(idx);
    }

    _selection = new Set([id]);
    _patchSelection();
    _lastClickedId = id;
  }

  return {
    render,
    revealFile,
    init,
    setDragSrc,
    getDragSrc,
    setDragNodes,
    getDragNodes,
    clearSelection,
    findNode: findNodeInRoots,
    getSelection: _getSelectionNodes,
    getSvgs: () => SVG,
    syncChrome,
    setCreatingNode: (node) => {
      _creatingNode = node;
    },
    clearCreatingNode: () => {
      _creatingNode = null;
      _structureKey = '';
    },
    startRename: (node) => ExplorerOps.startRename(node),
    startCreate: (parentNode, type) => ExplorerOps.startCreate(parentNode, type),
    duplicate: (node) => ExplorerOps.duplicate(node),
    confirmDelete: (node) => ExplorerOps.confirmDelete(node),
    confirmDeleteMulti: (nodes) => ExplorerOps.confirmDeleteMulti(nodes),
    removeFolderFromWorkspace: (rootNode) => ExplorerOps.removeFolderFromWorkspace(rootNode),
    deleteFolderFromDisk: (rootNode) => ExplorerOps.deleteFolderFromDisk(rootNode),
    copyPath: (node) => ExplorerOps.copyPath(node),
    copyPaths: (nodes) => ExplorerOps.copyPaths(nodes),
    revealInFinder: (node) => ExplorerOps.revealInFinder(node),
    revealRootInFinder: (rootNode) => ExplorerOps.revealRootInFinder(rootNode),
  };
})();
