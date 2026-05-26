const ExplorerOps = (() => {
  function _syncInputIcon(input, iconEl, type, isOpen = false) {
    if (!input || !iconEl) return;
    const fallbackName = type === 'file' ? '.' : '';
    input.addEventListener('input', () => {
      helpers.updateIconEl(iconEl, input.value.trim() || fallbackName, type === 'folder', isOpen);
    });
  }

  function startRename(node) {
    if (autoexec.isProtectedRootNode(node)) {
      toast.show('Autoexecute folder is protected', 'info', 1500);
      return;
    }
    const row = document.querySelector(`.tree-row[data-id="${node.id}"]`);
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
    _syncInputIcon(input, iconEl, node.type, !!node.open);
    const commit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== node.name) {
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
        const newPath = `${parentPath}/${newName}`;
        try {
          await fileManager.rename(node.path, newPath);
        } catch (err) {
          console.error(err);
          toast.show(`Could not rename ${node.name}`, 'warn', 2400);
          ExplorerTree.render();
          return;
        }
        workspaceHistory.recordMove?.(node.path, newPath, node.type === 'folder');
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
    if (autoexec.isInsideProtectedArea(parentNode.path)) uiState.setAutoexecCollapsed?.(false);
    else uiState.setFileTreeCollapsed?.(false);
    if (!parentNode.open) {
      await fileManager.ensureChildren?.(parentNode);
      parentNode.open = true;
      ExplorerTree.render();
    }
    const phantom = {
      id: `new:${helpers.uid()}`,
      name: '',
      path: `${parentNode.path}/`,
      type,
      children: [],
      open: false,
      creating: null,
      parentId: parentNode.id,
      pendingName: '',
    };
    let finished = false;
    const removePhantom = () => {
      parentNode.children = (parentNode.children ?? []).filter((child) => child !== phantom);
      ExplorerTree.clearCreatingNode?.();
    };
    phantom.creating = {
      finish: async (rawName, success) => {
        if (finished) return;
        finished = true;
        removePhantom();
        const name = rawName.trim();
        if (!success || !name) {
          ExplorerTree.render();
          autoexec.renderSection?.();
          return;
        }
        try {
          if (type === 'file') {
            const result = await fileManager.createFile(parentNode.path, name);
            workspaceHistory.recordCreate?.(result.path, false, '');
            state.setActive(result.id, { permanent: true, keepTabs: true });
          } else {
            const path = await fileManager.createFolder(parentNode.path, name);
            workspaceHistory.recordCreate?.(path, true, '');
          }
          eventBus.emit('ui:refresh-tree');
        } catch (err) {
          modal.alert('Error', err.message ?? 'Could not create item.');
        }
      },
    };
    parentNode.children = parentNode.children ?? [];
    parentNode.children.unshift(phantom);
    ExplorerTree.setCreatingNode?.(phantom);
    if (autoexec.isInsideProtectedArea(parentNode.path)) autoexec.renderSection?.();
    else ExplorerTree.render();
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
      workspaceHistory.recordCreate?.(`${parentPath}/${newName}`, false, '');
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
      'Move to Trash',
      `Move <strong>${helpers.escapeHtml(node.name)}</strong> to Trash?`,
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
      `Move ${nodes.length} items to Trash`,
      `Move ${preview}${extra} to Trash?`,
    );
    if (!confirmed) return;
    for (const node of nodes) await _deleteNode(node);
    ExplorerTree.clearSelection();
    eventBus.emit('ui:refresh-tree');
  }

  async function _deleteNode(node) {
    try {
      const wasAutoexecScript = autoexec.containsScript?.(node.path);
      const result = await fileManager.moveToTrash(node.path);
      workspaceHistory.recordTrash?.(node.path, result?.trashPath, node.type === 'folder');
      if (wasAutoexecScript) autoexec.sync?.({ createSource: false }).catch(() => {});
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
    await workspaceController.syncWatchers?.();
    await persist.saveTreeState(state.workDir);
    await persist.saveSession(state.workDir);
    ExplorerTree.render();
    tabs.render();
    eventBus.emit('ui:render-editor');
  }

  async function deleteFolderFromDisk(rootNode) {
    const confirmed = await modal.confirm(
      'Move Folder to Trash',
      `Move <strong>${helpers.escapeHtml(rootNode.name)}</strong> and all its contents to Trash?`,
    );
    if (!confirmed) return;
    try {
      const result = await fileManager.moveToTrash(rootNode.path);
      workspaceHistory.recordTrash?.(rootNode.path, result?.trashPath, true, true);
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
