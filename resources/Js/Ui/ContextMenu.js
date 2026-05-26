const ctxMenu = (() => {
  const invoke = window.__TAURI__.core.invoke;
  const isMac = navigator.platform.includes('Mac');
  const REVEAL_LABEL = isMac ? 'Reveal in Finder' : 'Open in Explorer';
  let _token = 0;

  function _capture(e) {
    e.preventDefault();
    e.stopPropagation();
    _token += 1;
  }

  async function _menu(buildFn) {
    const { Menu, MenuItem, PredefinedMenuItem } = window.__TAURI__.menu;
    const sep = () => PredefinedMenuItem.new({ item: 'Separator' });
    const item = async (text, action) => MenuItem.new({ text, action });
    const items = [];
    const token = _token;
    await buildFn(items, item, sep);
    if (token !== _token) return;
    const menu = await Menu.new({ items });
    await menu.popup();
  }

  function show(e, node) {
    _capture(e);
    _menu(async (items, item, sep) => {
      if (node.type === 'folder') {
        const protectedAutoexec = autoexec.isProtectedRootNode(node);
        const protectedAutoexecArea = autoexec.isInsideProtectedArea(node.path);
        if (protectedAutoexec) {
          await autoexec.init();
          items.push(
            await item(autoexec.isEnabled() ? 'Disable Autoexecute' : 'Enable Autoexecute', () =>
              autoexec.toggleEnabled(),
            ),
          );
          items.push(await sep());
        }
        items.push(await item('New File', () => ExplorerTree.startCreate(node, 'file')));
        if (!protectedAutoexecArea) {
          items.push(await item('New Folder', () => ExplorerTree.startCreate(node, 'folder')));
        }
        items.push(await sep());
      }
      if (node.type === 'file') {
        items.push(await item('Execute Script', () => editorController.executeFile(node.id)));
        items.push(await sep());
        items.push(await item('Duplicate', () => ExplorerTree.duplicate(node)));
        if (editor.canPreview(node.name)) {
          items.push(
            await item('Open Preview', () => {
              const f = state.getFile(node.id);
              if (f) editor.openPreview(f);
            }),
          );
        }
        items.push(await item('Pin to Pinboard', () => pinboard.pinFile(node)));
        items.push(await sep());
      }
      if (!autoexec.isProtectedRootNode(node)) {
        items.push(await item('Rename', () => ExplorerTree.startRename(node)));
      }
      items.push(await item('Copy Path', () => ExplorerTree.copyPath(node)));
      items.push(await item(REVEAL_LABEL, () => ExplorerTree.revealInFinder(node)));
      if (!autoexec.isProtectedRootNode(node)) {
        items.push(await sep());
        items.push(await item('Move to Trash', () => ExplorerTree.confirmDelete(node)));
      }
    });
  }

  function showForNodes(e, nodes) {
    if (!nodes.length) return;
    if (nodes.length === 1) {
      show(e, nodes[0]);
      return;
    }
    _capture(e);
    _menu(async (items, item, sep) => {
      if (nodes.every((n) => n.type === 'file')) {
        items.push(await item('Copy Paths', () => ExplorerTree.copyPaths(nodes)));
        items.push(await sep());
      }
      items.push(
        await item(`Move ${nodes.length} Items to Trash`, () =>
          ExplorerTree.confirmDeleteMulti(nodes),
        ),
      );
    });
  }

  function showEmpty(e, rootNode) {
    _capture(e);
    _menu(async (items, item, sep) => {
      items.push(await item('New File', () => ExplorerTree.startCreate(rootNode, 'file')));
      if (!autoexec.isInsideProtectedArea(rootNode?.path)) {
        items.push(await item('New Folder', () => ExplorerTree.startCreate(rootNode, 'folder')));
      }
      items.push(await sep());
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
    });
  }

  function showForRoot(e, rootNode) {
    _capture(e);
    _menu(async (items, item, sep) => {
      items.push(await item('New File', () => ExplorerTree.startCreate(rootNode, 'file')));
      items.push(await item('New Folder', () => ExplorerTree.startCreate(rootNode, 'folder')));
      items.push(await sep());
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
      items.push(await item('Copy Path', () => ExplorerTree.copyPath(rootNode)));
      items.push(await item(REVEAL_LABEL, () => ExplorerTree.revealRootInFinder(rootNode)));
      items.push(await sep());
      items.push(
        await item('Remove from Workspace', () => ExplorerTree.removeFolderFromWorkspace(rootNode)),
      );
      items.push(
        await item('Move Folder to Trash', () => ExplorerTree.deleteFolderFromDisk(rootNode)),
      );
    });
  }

  function showAddFolder(e) {
    _capture(e);
    _menu(async (items, item) => {
      items.push(
        await item('Add Folder to Workspace', () => workspaceController.openFolderDialog()),
      );
    });
  }

  function showItems(e, entries) {
    _capture(e);
    _menu(async (items, item, sep) => {
      for (const entry of entries) {
        if (!entry) continue;
        if (entry.separator) {
          items.push(await sep());
          continue;
        }
        items.push(await item(entry.label, entry.action));
      }
    });
  }

  function showForTab(e, fileId) {
    _capture(e);
    const file = state.getFile(fileId);
    if (!file) return;
    _menu(async (items, item, sep) => {
      items.push(await item('Close', () => tabs.closeTab(fileId)));
      items.push(
        await item('Close Others', () => {
          state.openTabIds.filter((id) => id !== fileId).forEach((id) => tabs.closeTab(id));
        }),
      );
      items.push(
        await item('Close All', () => {
          [...state.openTabIds].forEach((id) => tabs.closeTab(id));
        }),
      );
      items.push(await sep());
      items.push(await item('Reveal in Explorer', () => ExplorerTree.revealFile(fileId)));
      items.push(
        await item(REVEAL_LABEL, () => {
          const dir = file.path.substring(0, file.path.lastIndexOf('/'));
          invoke('open_external', { url: `file://${dir}` }).catch(() => {});
        }),
      );
      items.push(await sep());
      items.push(
        await item('Copy Path', () => {
          invoke('write_clipboard', { text: file.path }).catch(() => {});
        }),
      );
    });
  }

  function hide() {
    _token += 1;
  }

  window.addEventListener('blur', hide);
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 2) hide();
    },
    true,
  );

  return { show, showForNodes, showEmpty, showForRoot, showAddFolder, showForTab, showItems, hide };
})();
