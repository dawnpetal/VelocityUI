const ExplorerOps = (() => {
  function startRename(node) {
    if (autoexec.isProtectedRootNode(node)) {
      toast.show('Autoexecute folder is protected', 'info', 1500);
      return;
    }
    const row = document
      .getElementById('fileTree')
      .querySelector(`.tree-row[data-id="${node.id}"]`);
    if (!row) return;
    const labelEl = row.querySelector('.tree-label');
    const iconEl = row.querySelector('.tree-icon > span');
    const input = document.createElement('input');
    input.className = 'tree-rename-input';
    input.value = node.name;
    labelEl.replaceWith(input);
    input.focus();
    const dotIdx = node.name.lastIndexOf('.');
    input.setSelectionRange(0, dotIdx > 0 ? dotIdx : node.name.length);
    if (iconEl)
      input.addEventListener('input', () =>
        helpers.updateIconEl(iconEl, input.value.trim() || '.', false, false),
      );
    const commit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== node.name) {
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
        const newPath = `${parentPath}/${newName}`;
        await fileManager.rename(node.path, newPath).catch(console.error);
        if (node.type === 'file') {
          const f = state.getFile(node.id);
          if (f) {
            f.name = newName;
            f.path = newPath;
          }
        }
        node.name = newName;
        node.path = newPath;
        eventBus.emit('ui:refresh-tree');
      } else {
        ExplorerTree.render();
      }
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key))
        e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        ExplorerTree.render();
      }
    });
  }

  async function startCreate(parentNode, type) {
    if (type === 'folder' && autoexec.isInsideProtectedArea(parentNode.path)) {
      toast.show('Autoexecute only accepts Lua files', 'info', 1500);
      return;
    }
    if (!parentNode.open) {
      parentNode.open = true;
      ExplorerTree.render();
    }
    const fileTreeEl = document.getElementById('fileTree');
    function _getDepth(node, roots) {
      for (const root of roots) {
        const d = _depthOf(node.id, root, 0);
        if (d !== -1) return d;
      }
      return 0;
    }
    function _depthOf(id, node, d) {
      if (node.id === id) return d;
      for (const c of node.children ?? []) {
        const found = _depthOf(id, c, d + 1);
        if (found !== -1) return found;
      }
      return -1;
    }
    const parentDepth = _getDepth(parentNode, state.roots);
    const childDepth = parentDepth + 1;
    const indentPx = childDepth * 14 + 6;
    const parentRow = fileTreeEl.querySelector(`.tree-row[data-id="${parentNode.id}"]`);
    let insertAfter =
      parentRow ?? fileTreeEl.querySelector('.tree-root-header') ?? fileTreeEl.lastElementChild;
    if (insertAfter) {
      let next = insertAfter.nextElementSibling;
      while (next && next.classList.contains('tree-row')) {
        const sibDepth = Math.round(
          (parseInt(next.querySelector('.tree-indent')?.style.paddingLeft) - 6) / 14,
        );
        if (sibDepth <= parentDepth) break;
        insertAfter = next;
        next = next.nextElementSibling;
      }
    }
    const row = document.createElement('div');
    row.className = 'tree-row tree-row--creating';
    const indent = document.createElement('div');
    indent.className = 'tree-indent';
    indent.style.paddingLeft = indentPx + 'px';
    const arrowEl = document.createElement('span');
    arrowEl.className = 'tree-arrow leaf';
    arrowEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    const iconEl = document.createElement('span');
    iconEl.className = 'tree-icon';
    iconEl.appendChild(
      helpers.fileIconEl(type === 'file' ? 'untitled.lua' : '', type === 'folder', false),
    );
    const input = document.createElement('input');
    input.className = 'tree-rename-input';
    input.placeholder = type === 'file' ? 'filename.lua' : 'folder name';
    input.style.flex = '1';
    indent.append(arrowEl, iconEl, input);
    row.appendChild(indent);
    if (insertAfter && insertAfter.parentNode === fileTreeEl) {
      insertAfter.after(row);
    } else {
      fileTreeEl.appendChild(row);
    }
    input.focus();
    const cleanup = () => row.remove();
    const commit = async () => {
      const name = input.value.trim();
      cleanup();
      if (!name) return;
      try {
        if (type === 'file') {
          const result = await fileManager.createFile(parentNode.path, name);
          state.setActive(result.id, { permanent: true, keepTabs: true });
        } else {
          await fileManager.createFolder(parentNode.path, name);
        }
        eventBus.emit('ui:refresh-tree');
      } catch (err) {
        modal.alert('Error', err.message ?? 'Could not create item.');
      }
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        cleanup();
      }
    });
  }

  async function duplicate(node) {
    const ext = node.name.includes('.') ? '.' + node.name.split('.').pop() : '';
    const base = ext ? node.name.slice(0, -ext.length) : node.name;
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    try {
      const newName = await window.__TAURI__.core.invoke('generate_unique_filename', {
        dirPath: parentPath,
        name: `${base}_copy${ext}`,
        isFolder: false,
      });
      await window.__TAURI__.core.invoke('copy_file', {
        src: node.path,
        dest: `${parentPath}/${newName}`,
      });
      eventBus.emit('ui:refresh-tree');
    } catch (err) {
      modal.alert('Error', err.message ?? 'Could not duplicate file.');
    }
  }

  async function confirmDelete(node) {
    if (autoexec.isProtectedRootNode(node)) {
      toast.show('Autoexecute folder is protected', 'info', 1500);
      return;
    }
    const confirmed = await modal.confirm(
      'Delete ' + (node.type === 'folder' ? 'Folder' : 'File'),
      `Permanently delete <strong>${helpers.escapeHtml(node.name)}</strong>? This cannot be undone.`,
    );
    if (!confirmed) return;
    await _deleteNode(node);
    eventBus.emit('ui:refresh-tree');
  }

  async function confirmDeleteMulti(nodes) {
    nodes = nodes.filter((node) => !autoexec.isProtectedRootNode(node));
    if (!nodes.length) {
      toast.show('Autoexecute folder is protected', 'info', 1500);
      return;
    }
    const preview = nodes
      .slice(0, 5)
      .map((n) => `<strong>${helpers.escapeHtml(n.name)}</strong>`)
      .join(', ');
    const extra = nodes.length > 5 ? ` and ${nodes.length - 5} more` : '';
    const confirmed = await modal.confirm(
      `Delete ${nodes.length} items`,
      `Permanently delete ${preview}${extra}? This cannot be undone.`,
    );
    if (!confirmed) return;
    for (const node of nodes) await _deleteNode(node);
    ExplorerTree.clearSelection();
    eventBus.emit('ui:refresh-tree');
  }

  async function _deleteNode(node) {
    try {
      await fileManager.remove(node.path);
      if (node.type === 'file') {
        if (state.openTabIds.includes(node.id)) {
          editor.destroyTab(node.id);
          state.closeTab(node.id);
        }
        state.removeFile(node.id);
      }
    } catch (err) {
      modal.alert('Error', err.message ?? `Could not delete ${node.name}.`);
    }
  }

  async function removeFolderFromWorkspace(rootNode) {
    const rootFiles = state.files.filter(
      (f) => f.path.startsWith(rootNode.path + '/') || f.path === rootNode.path,
    );
    for (const f of rootFiles) {
      if (state.openTabIds.includes(f.id)) {
        editor.destroyTab(f.id);
        state.closeTab(f.id);
      }
      state.removeFile(f.id);
    }
    state.removeRoot(rootNode.path);
    if (state.workDir === rootNode.path) {
      state.workDir = state.roots[0]?.path ?? null;
    }
    await persist.saveSession(state.workDir);
    ExplorerTree.render();
    tabs.render();
    eventBus.emit('ui:render-editor');
  }

  async function deleteFolderFromDisk(rootNode) {
    const confirmed = await modal.confirm(
      'Delete Folder from Disk',
      `Permanently delete <strong>${helpers.escapeHtml(rootNode.name)}</strong> and all its contents? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await fileManager.remove(rootNode.path);
      await removeFolderFromWorkspace(rootNode);
    } catch (err) {
      modal.alert('Error', err.message ?? 'Could not delete folder.');
    }
  }

  async function copyPath(node) {
    try {
      await window.__TAURI__.core.invoke('write_clipboard', { text: node.path });
      toast.show('Path copied', 'ok', 1500);
    } catch {}
  }

  async function copyPaths(nodes) {
    try {
      await window.__TAURI__.core.invoke('write_clipboard', {
        text: nodes.map((n) => n.path).join('\n'),
      });
      toast.show(`${nodes.length} paths copied`, 'ok', 1500);
    } catch {}
  }

  async function revealInFinder(node) {
    try {
      await window.__TAURI__.core.invoke('open_external', {
        url: node.path.substring(0, node.path.lastIndexOf('/')),
      });
    } catch {}
  }

  async function revealRootInFinder(rootNode) {
    try {
      await window.__TAURI__.core.invoke('open_external', { url: rootNode.path });
    } catch {}
  }

  return {
    startRename,
    startCreate,
    duplicate,
    confirmDelete,
    confirmDeleteMulti,
    removeFolderFromWorkspace,
    deleteFolderFromDisk,
    copyPath,
    copyPaths,
    revealInFinder,
    revealRootInFinder,
  };
})();
