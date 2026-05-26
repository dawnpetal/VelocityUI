const ExplorerDnd = (() => {
  let _handlingDrop = false;
  let _autoExpandTimer = null;
  let _autoExpandTargetId = null;
  let _ghostEl = null;
  let _currentDragOverEl = null;
  let _nativeDropReady = false;
  function _getIndicator() {
    const tree = document.getElementById('fileTree');
    if (!tree) return null;
    let ind = tree.querySelector('.tree-drop-line');
    if (!ind) {
      ind = document.createElement('div');
      ind.className = 'tree-drop-line';
      ind.style.display = 'none';
      tree.appendChild(ind);
    }
    return ind;
  }
  function _showDropLine(row, edge) {
    const ind = _getIndicator();
    const tree = document.getElementById('fileTree');
    if (!ind || !tree || !row) return;
    const treeRect = tree.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const indentPx = parseInt(row.querySelector('.tree-indent')?.style.paddingLeft || '6', 10) || 6;
    ind.style.left = indentPx + 'px';
    ind.style.right = '4px';
    ind.style.top =
      (edge === 'before' ? rowRect.top : rowRect.bottom) - treeRect.top + tree.scrollTop + 'px';
    ind.style.display = 'block';
  }
  function _hideDropLine() {
    const ind = document.getElementById('fileTree')?.querySelector('.tree-drop-line');
    if (ind) ind.style.display = 'none';
  }
  function _clearDragOver() {
    if (_currentDragOverEl) {
      _currentDragOverEl.classList.remove('drag-over');
      _currentDragOverEl = null;
    }
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  }
  function _setDragOver(el) {
    if (_currentDragOverEl === el) return;
    _clearDragOver();
    _currentDragOverEl = el;
    el?.classList.add('drag-over');
  }
  function _clearAll() {
    _hideDropLine();
    _clearDragOver();
  }
  function _clearAutoExpand() {
    clearTimeout(_autoExpandTimer);
    _autoExpandTimer = null;
    _autoExpandTargetId = null;
  }
  function _scheduleAutoExpand(node) {
    if (_autoExpandTargetId === node.id) return;
    _clearAutoExpand();
    _autoExpandTargetId = node.id;
    _autoExpandTimer = setTimeout(async () => {
      if (!node.open) {
        await fileManager.ensureChildren?.(node);
        node.open = true;
        ExplorerTree.render();
      }
    }, 700);
  }
  function _createGhost(nodes) {
    const el = document.createElement('div');
    el.className = 'tree-drag-ghost';
    el.textContent = nodes.length === 1 ? nodes[0].name : `${nodes.length} items`;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;z-index:9999;';
    document.body.appendChild(el);
    return el;
  }
  function _findParent(targetId, node, candidate) {
    if (node.id === targetId) return candidate;
    for (const c of node.children ?? []) {
      const r = _findParent(targetId, c, node);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  function _getParent(node) {
    for (const root of state.roots) {
      const r = _findParent(node.id, root, null);
      if (r !== undefined) return r;
    }
    return null;
  }
  function _isAncestorOf(ancestor, targetId) {
    if (ancestor.id === targetId) return true;
    for (const c of ancestor.children ?? []) {
      if (_isAncestorOf(c, targetId)) return true;
    }
    return false;
  }
  function _getContainingRoot(node) {
    for (const root of state.roots) {
      if (_isAncestorOf(root, node.id)) return root;
    }
    return null;
  }
  function _destinationForNode(node, preferNodeFolder = true) {
    if (!node) return null;
    if (preferNodeFolder && node.type === 'folder') return node.path;
    const parent = _getParent(node);
    return parent ? parent.path : (_getContainingRoot(node)?.path ?? null);
  }
  function _resolveZone(e, row, node) {
    const rect = row.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    if (node.type === 'folder') {
      if (ratio < 0.25) return 'before';
      if (ratio > 0.75) return 'after';
      return 'into';
    }
    return ratio < 0.5 ? 'before' : 'after';
  }
  function _applyFeedback(zone, row, node) {
    if (zone === 'into') {
      _hideDropLine();
      _setDragOver(row);
      _scheduleAutoExpand(node);
    } else {
      _clearDragOver();
      _clearAutoExpand();
      _showDropLine(row, zone);
    }
  }
  function _attachNodeDrag(row, node) {
    if (autoexec.isProtectedRootNode(node)) {
      row.draggable = false;
      return;
    }
    let _dragStartTimer = null;
    let _pendingDragStart = null;
    row.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      _pendingDragStart = { x: e.clientX, y: e.clientY };
      _dragStartTimer = setTimeout(() => {
        _pendingDragStart = null;
      }, 300);
    });
    row.addEventListener('mousemove', (e) => {
      if (!_pendingDragStart) return;
      const dx = e.clientX - _pendingDragStart.x;
      const dy = e.clientY - _pendingDragStart.y;
      if (Math.hypot(dx, dy) > 6) {
        clearTimeout(_dragStartTimer);
        _pendingDragStart = null;
        row.draggable = true;
      }
    });
    row.addEventListener('mouseup', () => {
      clearTimeout(_dragStartTimer);
      _pendingDragStart = null;
      requestAnimationFrame(() => {
        row.draggable = false;
      });
    });
    row.draggable = false;
    row.addEventListener('dragstart', (e) => {
      if (!row.draggable) {
        e.preventDefault();
        return;
      }
      const sel = ExplorerTree.getSelection();
      const dragNodes = sel.length > 0 && sel.some((n) => n.id === node.id) ? sel : [node];
      ExplorerTree.setDragSrc(node.id);
      ExplorerTree.setDragNodes(dragNodes);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragNodes.map((n) => n.id).join(','));
      _ghostEl = _createGhost(dragNodes);
      e.dataTransfer.setDragImage(_ghostEl, 14, 14);
      setTimeout(() => {
        dragNodes.forEach((n) => {
          document.querySelector(`.tree-row[data-id="${n.id}"]`)?.classList.add('dragging');
        });
      }, 0);
    });
    row.addEventListener('dragend', () => {
      row.draggable = false;
      _clearAll();
      _clearAutoExpand();
      if (_ghostEl) {
        _ghostEl.remove();
        _ghostEl = null;
      }
      ExplorerTree.setDragSrc(null);
      ExplorerTree.setDragNodes([]);
      document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    });
  }
  function attachFileDrag(row, node) {
    _attachNodeDrag(row, node);
  }
  function attachFolderDrag(row, node) {
    _attachNodeDrag(row, node);
  }
  function attachRowDrop(row, node) {
    row.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const isExternal = e.dataTransfer.types.includes('Files');
      e.dataTransfer.dropEffect = isExternal ? 'copy' : 'move';
      const dragNodes = ExplorerTree.getDragNodes();
      const isSelf = dragNodes.length === 1 && dragNodes[0].id === node.id;
      const isAncestor = dragNodes.some((dn) => _isAncestorOf(dn, node.id) && dn.id !== node.id);
      if (isSelf || isAncestor) {
        e.dataTransfer.dropEffect = 'none';
        _clearAll();
        return;
      }
      const zone = _resolveZone(e, row, node);
      _applyFeedback(zone, row, node);
    });
    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('drag-over');
        if (_currentDragOverEl === row) _currentDragOverEl = null;
      }
    });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      _clearAll();
      _clearAutoExpand();
      if (e.dataTransfer.files.length > 0) {
        if (_handlingDrop) return;
        _handlingDrop = true;
        try {
          const zone = _resolveZone(e, row, node);
          const destDir = _destinationForNode(node, zone === 'into');
          await _externalDrop(e.dataTransfer, destDir);
        } finally {
          _handlingDrop = false;
        }
        return;
      }
      const dragNodes = ExplorerTree.getDragNodes();
      if (!dragNodes.length) return;
      const zone = _resolveZone(e, row, node);
      await _internalDrop(dragNodes, node, zone);
    });
  }
  function attachRootHeaderDrop(headerEl, rootNode) {
    headerEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      _setDragOver(headerEl);
      _hideDropLine();
    });
    headerEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move';
      _setDragOver(headerEl);
      _hideDropLine();
      _clearAutoExpand();
    });
    headerEl.addEventListener('dragleave', (e) => {
      if (!headerEl.contains(e.relatedTarget)) {
        headerEl.classList.remove('drag-over');
        if (_currentDragOverEl === headerEl) _currentDragOverEl = null;
      }
    });
    headerEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      _clearAll();
      _clearAutoExpand();
      if (e.dataTransfer.files.length > 0) {
        if (_handlingDrop) return;
        _handlingDrop = true;
        try {
          await _externalDrop(e.dataTransfer, rootNode.path);
        } finally {
          _handlingDrop = false;
        }
        return;
      }
      const dragNodes = ExplorerTree.getDragNodes();
      if (!dragNodes.length) return;
      await _internalDrop(dragNodes, rootNode, 'into');
    });
  }
  async function _internalDrop(dragNodes, targetNode, zone) {
    let moved = 0;
    for (const dragNode of dragNodes) {
      if (autoexec.isProtectedRootNode(dragNode)) continue;
      if (dragNode.id === targetNode.id) continue;
      if (_isAncestorOf(dragNode, targetNode.id)) continue;
      let destDir;
      if (zone === 'into') {
        if (targetNode.type !== 'folder') continue;
        destDir = targetNode.path;
      } else {
        const parent = _getParent(targetNode);
        if (parent) {
          destDir = parent.path;
        } else {
          const root = _getContainingRoot(targetNode);
          destDir = root
            ? root.path
            : targetNode.path.substring(0, targetNode.path.lastIndexOf('/'));
        }
      }
      if (autoexec.isInsideProtectedArea(destDir) && dragNode.type === 'folder') {
        toast.show('Autoexecute only accepts Lua files', 'info', 1500);
        continue;
      }
      if (autoexec.isInsideProtectedArea(destDir) && !dragNode.name.endsWith('.lua')) {
        toast.show('Autoexecute only accepts .lua files', 'info', 1500);
        continue;
      }
      const newPath = `${destDir}/${dragNode.name}`;
      if (newPath === dragNode.path) continue;
      let destExists = false;
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', {
          path: newPath,
        });
        destExists = !!stat.exists;
      } catch {}
      if (destExists) {
        const ok = await modal.confirm(
          'Replace?',
          `<strong>${helpers.escapeHtml(dragNode.name)}</strong> already exists here. Replace it?`,
        );
        if (!ok) continue;
      }
      try {
        const oldPath = dragNode.path;
        await fileManager.rename(dragNode.path, newPath);
        workspaceHistory.recordMove?.(oldPath, newPath, dragNode.type === 'folder');
        dragNode.path = newPath;
        if (dragNode.type === 'file') {
          const f = state.getFile(dragNode.id);
          if (f) f.path = newPath;
        }
        moved++;
      } catch (err) {
        toast.show(`Could not move ${dragNode.name}`, 'warn', 3000);
        console.error(err);
      }
    }
    if (moved > 0) eventBus.emit('ui:refresh-tree');
  }
  function _dedupeSources(sources) {
    const sourcePaths = new Set();
    return sources.filter((source) => {
      if (!source?.path || sourcePaths.has(source.path)) return false;
      sourcePaths.add(source.path);
      return true;
    });
  }
  function _pathSource(path) {
    return {
      name: helpers.basename(path),
      path,
    };
  }
  async function _externalDropSources(sources, destDir) {
    if (!destDir) {
      toast.show('Open a folder first', 'warn');
      return;
    }

    sources = _dedupeSources(sources);
    if (!sources.length) {
      if (!_nativeDropReady) toast.show('Could not read that dropped item', 'warn', 2400);
      return;
    }
    const autoexecDrop = autoexec.isInsideProtectedArea(destDir);
    const progress = toast.progress?.(
      `Importing ${sources.length} item${sources.length > 1 ? 's' : ''}...`,
    );
    workspaceController.suppressWatcher?.(1800 + sources.length * 150);
    let copied = 0;
    let processed = 0;
    for (const file of sources) {
      const srcPath = file.path;
      const dest = `${destDir}/${file.name}`;
      progress?.update(
        `Importing ${file.name}...`,
        sources.length > 1 ? processed / sources.length : null,
      );
      try {
        const stat = await window.__TAURI__.core.invoke('stat_path', { path: srcPath });
        if (autoexecDrop && (stat.isDirectory || !file.name.endsWith('.lua'))) {
          toast.show('Autoexecute only accepts .lua files', 'info', 1500);
          continue;
        }
        if (stat.isDirectory) {
          await window.__TAURI__.core.invoke('copy_path_recursive', { src: srcPath, dest });
          workspaceHistory.recordCreate?.(dest, true, '');
        } else {
          await window.__TAURI__.core.invoke('copy_file', { src: srcPath, dest });
          workspaceHistory.recordCreate?.(dest, false, '');
        }
        copied++;
      } catch (err) {
        console.error('External drop failed:', file.name, err);
        toast.show(`Failed to copy ${file.name}`, 'warn', 3000);
      } finally {
        processed++;
      }
    }
    eventBus.emit('ui:refresh-tree');
    const message = `Imported ${copied}${copied < sources.length ? ` of ${sources.length}` : ''} item${copied !== 1 ? 's' : ''}`;
    if (copied === sources.length) progress?.finish(message);
    else progress?.fail(message);
    if (!progress) toast.show(message, copied === sources.length ? 'ok' : 'warn', 2500);
  }
  async function _externalDrop(dt, destDir) {
    const droppedFiles = [
      ...Array.from(dt.files ?? []),
      ...Array.from(dt.items ?? []).map((item) => item.getAsFile()),
    ].filter((f) => f?.path);
    await _externalDropSources(droppedFiles, destDir);
  }
  function _elementAtDropPosition(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const points = [[x, y]];
    if (window.devicePixelRatio > 1)
      points.push([x / window.devicePixelRatio, y / window.devicePixelRatio]);
    for (const [pointX, pointY] of points) {
      const el = document.elementFromPoint(pointX, pointY);
      if (el?.closest('#fileTree')) return el;
    }
    return null;
  }
  function _nativeDropDestination(position) {
    const el = _elementAtDropPosition(position);
    const tree = document.getElementById('fileTree');
    if (!el || !tree?.contains(el)) return undefined;
    const row = el.closest('.tree-row');
    if (row) return _destinationForNode(ExplorerTree.findNode(row.dataset.id), true);
    const rootHeader = el.closest('.tree-root-header');
    if (rootHeader) return ExplorerTree.findNode(rootHeader.dataset.id)?.path ?? null;
    return state.roots.at(-1)?.path ?? null;
  }
  async function _nativeExternalDrop(paths, destDir) {
    if (_handlingDrop) return;
    _handlingDrop = true;
    const progress = toast.progress?.('Reading dropped items...');
    try {
      const folders = [];
      const files = [];
      const sources = (paths ?? []).map(_pathSource);
      for (let index = 0; index < sources.length; index++) {
        const source = sources[index];
        progress?.update?.(
          `Reading ${source.name}...`,
          sources.length > 1 ? index / sources.length : null,
        );
        try {
          const stat = await window.__TAURI__.core.invoke('stat_path', { path: source.path });
          (stat.isDirectory ? folders : files).push(source);
        } catch (err) {
          console.error('Could not inspect dropped item:', source.path, err);
        }
      }
      const added = await workspaceController.addFoldersToWorkspace?.(
        folders.map((folder) => folder.path),
        progress,
      );
      if (files.length) {
        progress?.dismiss?.();
        await _externalDropSources(files, destDir);
      } else if (added === folders.length && folders.length) {
        progress?.finish?.(`Added ${added} folder${added === 1 ? '' : 's'} to workspace`);
      } else if (folders.length) {
        progress?.fail?.(`Added ${added} of ${folders.length} folders`);
      } else {
        progress?.fail?.('Nothing to import');
      }
    } finally {
      _handlingDrop = false;
    }
  }
  async function _attachNativeDrop(rootEl) {
    if (!rootEl || rootEl._nativeDropBound) return;
    rootEl._nativeDropBound = true;
    const webview = window.__TAURI__?.webview?.getCurrentWebview?.();
    if (!webview?.onDragDropEvent) return;
    try {
      await webview.onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload?.type === 'over') {
          rootEl.classList.toggle(
            'tree-drop-target',
            _nativeDropDestination(payload.position) !== undefined,
          );
          return;
        }
        rootEl.classList.remove('tree-drop-target');
        if (payload?.type !== 'drop') return;
        const destDir = _nativeDropDestination(payload.position);
        if (destDir === undefined) return;
        _nativeExternalDrop(payload.paths, destDir).catch((err) => {
          console.error('Native external drop failed:', err);
          toast.show('Import failed', 'warn', 2600);
        });
      });
      _nativeDropReady = true;
    } catch (err) {
      console.warn('Native drop listener unavailable:', err);
    }
  }
  function attachRootDrop(rootEl) {
    _attachNativeDrop(rootEl);
    rootEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    rootEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const isExternal = e.dataTransfer.types.includes('Files');
      e.dataTransfer.dropEffect = isExternal ? 'copy' : 'move';
      if (!e.target.closest('.tree-row') && !e.target.closest('.tree-root-header')) {
        if (isExternal) rootEl.classList.add('tree-drop-target');
      }
    });
    rootEl.addEventListener('dragleave', (e) => {
      if (!rootEl.contains(e.relatedTarget)) {
        rootEl.classList.remove('tree-drop-target');
        _clearAll();
      }
    });
    rootEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      rootEl.classList.remove('tree-drop-target');
      _clearAll();
      _clearAutoExpand();
      if (e.target.closest('.tree-row') || e.target.closest('.tree-root-header')) return;
      if (!e.dataTransfer.files.length || _handlingDrop) return;
      _handlingDrop = true;
      try {
        const last = state.roots[state.roots.length - 1];
        await _externalDrop(e.dataTransfer, last?.path ?? null);
      } finally {
        _handlingDrop = false;
      }
    });
  }
  return {
    attachFileDrag,
    attachFolderDrag,
    attachRowDrop,
    attachRootHeaderDrop,
    attachRootDrop,
    handleExternalDrop: _externalDrop,
  };
})();
