const appController = (() => {
  let _cloudInited = false;
  let _commandPaletteEl = null;
  let _commandItems = [];
  let _commandIndex = 0;
  let _commandQuery = '';
  let _commandSymbolCacheKey = '';
  let _commandSymbolCache = [];
  const _relayoutEditor = scheduler.delay(() => editor.relayout(), 80);
  const _renderCommandCenterSoon = scheduler.frame(() => _renderCommandCenter(_commandQuery));
  const ACTIVITY_VIEW_META = [
    { view: 'explorer', label: 'Explorer', locked: true },
    { view: 'search', label: 'Search' },
    { view: 'datatree', label: 'DataTree' },
    { view: 'accounts', label: 'Accounts' },
    { view: 'pinboard', label: 'Pinboard' },
    { view: 'cloud', label: 'Cloud Scripts' },
    { view: 'settings', label: 'Settings', locked: true },
  ];
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.5;
  const ZOOM_STEP = 0.1;
  const VELOCITY_SITE_URL = 'https://dawnpetal.github.io/VelocitySite';

  function _scheduleEditorRelayout() {
    _relayoutEditor();
  }

  function _clampZoom(value) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(value * 100) / 100));
  }

  async function _applyAppZoom(value, showToast = false) {
    const zoom = _clampZoom(value);
    uiState.setAppZoom?.(zoom);
    try {
      await window.__TAURI__.core.invoke('set_app_zoom', { scaleFactor: zoom });
    } catch {}
    _scheduleEditorRelayout();
    if (showToast) toast.show(`Zoom ${Math.round(zoom * 100)}%`, 'info', 1200);
  }

  function _zoomIn() {
    return _applyAppZoom((uiState.appZoom || 1) + ZOOM_STEP, true);
  }

  function _zoomOut() {
    return _applyAppZoom((uiState.appZoom || 1) - ZOOM_STEP, true);
  }

  function _zoomReset() {
    return _applyAppZoom(1, true);
  }

  function _activityLabel(view) {
    return ACTIVITY_VIEW_META.find((item) => item.view === view)?.label ?? view;
  }

  function _syncActivityVisibility() {
    for (const { view } of ACTIVITY_VIEW_META) {
      const visible = uiState.isActivityViewVisible?.(view) !== false;
      const btn = document.querySelector(`.activity-btn[data-view="${view}"]`);
      if (btn) {
        btn.hidden = !visible;
        btn.style.display = visible ? '' : 'none';
        btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
    }
  }

  function _setActivityViewVisible(view, visible, showToast = false) {
    const meta = ACTIVITY_VIEW_META.find((item) => item.view === view);
    if (meta?.locked && !visible) return;
    uiState.setActivityViewVisible?.(view, visible);
    _syncActivityVisibility();
    if (showToast) {
      toast.show(`${_activityLabel(view)} ${visible ? 'shown' : 'hidden'}`, 'info', 1200);
    }
  }

  function _toggleActivityViewVisible(view) {
    const meta = ACTIVITY_VIEW_META.find((item) => item.view === view);
    if (meta?.locked) {
      toast.show(`${meta.label} stays visible`, 'info', 1200);
      return true;
    }
    const visible = uiState.toggleActivityViewVisible?.(view);
    _syncActivityVisibility();
    toast.show(`${_activityLabel(view)} ${visible ? 'shown' : 'hidden'}`, 'info', 1200);
  }

  function _openVelocityWebsite() {
    window.__TAURI__.core.invoke('open_external', { url: VELOCITY_SITE_URL }).catch(() => {});
  }

  async function _activityMenuItem(MenuItem, CheckMenuItem, view, label, visible) {
    if (CheckMenuItem?.new) {
      try {
        return await CheckMenuItem.new({
          text: label,
          checked: visible,
          enabled: !ACTIVITY_VIEW_META.find((item) => item.view === view)?.locked,
          action: () => _toggleActivityViewVisible(view),
        });
      } catch {}
    }
    return MenuItem.new({
      text: `${visible ? '✓ ' : ''}${label}`,
      action: () => _toggleActivityViewVisible(view),
    });
  }

  async function _showActivityBarContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem } = window.__TAURI__.menu;
    const items = [];
    for (const { view, label } of ACTIVITY_VIEW_META) {
      const visible = uiState.isActivityViewVisible?.(view) !== false;
      items.push(await _activityMenuItem(MenuItem, CheckMenuItem, view, label, visible));
    }
    items.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    items.push(
      await MenuItem.new({
        text: 'Show All Tabs',
        action: () => {
          for (const { view } of ACTIVITY_VIEW_META) uiState.setActivityViewVisible?.(view, true);
          _syncActivityVisibility();
        },
      }),
    );
    const menu = await Menu.new({ items });
    const at = new window.__TAURI__.dpi.LogicalPosition(event.clientX, event.clientY);
    await menu.popup(at);
  }

  function _initBridge() {
    eventBus.on('ui:render-editor', () => editorController.renderEditor());
    eventBus.on('ui:refresh-tree', () => workspaceController.refreshTree());

    outline.init();

    eventBus.on('workspace:loaded', ({ folderPath }) => {
      const el = document.getElementById('titlebarWorkspace');
      if (el) el.textContent = folderPath ? helpers.basename(folderPath) : 'No folder open';
    });

    eventBus.on('ui:panel-toggled', () => _scheduleEditorRelayout());

    eventBus.on('ui:sidebar-toggled', () => _scheduleEditorRelayout());
    eventBus.on('ui:open-file', ({ id } = {}) => id && editorController.openFile(id));
    eventBus.on('ui:open-workspace', () => workspaceController.openFolderDialog());
    eventBus.on('ui:file-saved', ({ id } = {}) => id && editorController.onFileSaved(id));
    eventBus.on('file:closed', ({ id, wasUnsaved } = {}) => {
      if (!id) return;
      editor.destroyTab(id);
      if (!wasUnsaved) state.releasePayload(id);
    });
    eventBus.on('workspace:cleared', () => editor.destroyAllTabs?.());
    eventBus.on('ui:activity-pulse', ({ view } = {}) => {
      const btn = document.querySelector(`.activity-btn[data-view="${view}"]`);
      if (!btn) return;
      btn.classList.remove('pulse');
      void btn.offsetWidth;
      btn.classList.add('pulse');
    });
  }

  function _suppressNativeSpellcheck() {
    const disable = (el) => {
      if (!el?.matches?.('input, textarea, [contenteditable="true"], .inputarea')) return;
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'off');
    };
    document
      .querySelectorAll('input, textarea, [contenteditable="true"], .inputarea')
      .forEach(disable);
    document.addEventListener('focusin', (event) => disable(event.target));
  }

  function _setupWindowFocusState() {
    const setActive = (active) => {
      document.documentElement.dataset.windowActive = active ? 'true' : 'false';
    };
    setActive(document.hasFocus());
    window.addEventListener('focus', () => setActive(true));
    window.addEventListener('blur', () => setActive(false));
  }

  function _setupTitlebar() {
    document
      .getElementById('btnExecute')
      ?.addEventListener('click', () => editorController.executeScript());
    const invoke = window.__TAURI__?.core?.invoke;
    document
      .getElementById('btnWindowClose')
      ?.addEventListener('click', () => invoke?.('close_window'));
    document
      .getElementById('btnWindowMinimize')
      ?.addEventListener('click', () => invoke?.('minimize_window'));
    document
      .getElementById('btnWindowMaximize')
      ?.addEventListener('click', () => invoke?.('toggle_maximize_window'));
    document.getElementById('btnUndo')?.addEventListener('click', () => {
      editor.getInstance?.()?.trigger?.('titlebar', 'undo');
    });
    document.getElementById('btnRedo')?.addEventListener('click', () => {
      editor.getInstance?.()?.trigger?.('titlebar', 'redo');
    });
    _setupCommandCenter();
    const titlebar = document.getElementById('titlebar');
    if (titlebar) {
      titlebar.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, a, [data-no-drag]')) return;
        window.__TAURI__.window.getCurrentWindow().startDragging();
      });
    }
  }

  function _setupCommandCenter() {
    const input = document.getElementById('titlebarCommand');
    if (!input) return;
    input.addEventListener('focus', () => {
      _commandQuery = input.value;
      _renderCommandCenterSoon();
    });
    input.addEventListener('input', () => {
      _commandIndex = 0;
      _commandQuery = input.value;
      _renderCommandCenterSoon();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        _hideCommandCenter();
        input.blur();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        _moveCommandSelection(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        _runCommandItem(_commandItems[_commandIndex]);
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.target.closest('.titlebar-command, .command-palette')) return;
      _hideCommandCenter();
    });
  }

  function _commandPalette() {
    if (_commandPaletteEl) return _commandPaletteEl;
    _commandPaletteEl = document.createElement('div');
    _commandPaletteEl.className = 'command-palette';
    _commandPaletteEl.addEventListener('mousemove', (event) => {
      const button = event.target?.closest?.('.command-item');
      if (!button || !_commandPaletteEl.contains(button)) return;
      const index = Number(button.dataset.index);
      if (!Number.isFinite(index) || index === _commandIndex) return;
      _commandIndex = index;
      _syncCommandSelection();
    });
    _commandPaletteEl.addEventListener('click', (event) => {
      const button = event.target?.closest?.('.command-item');
      if (!button || !_commandPaletteEl.contains(button)) return;
      _runCommandItem(_commandItems[Number(button.dataset.index)]);
    });
    _commandPaletteEl.setAttribute('role', 'listbox');
    document.body.appendChild(_commandPaletteEl);
    return _commandPaletteEl;
  }

  function _commandActions() {
    const active = state.getActive();
    return [
      {
        label: 'Open folder',
        hint: 'Workspace',
        key: '⌘⇧O',
        run: () => workspaceController.openFolderDialog(),
      },
      {
        label: 'Add folder to workspace',
        hint: 'Workspace',
        run: () => workspaceController.addFolderToWorkspace(),
      },
      {
        label: 'New file',
        hint: 'Editor',
        key: '⌘N',
        run: () => editorController.newUntitledFile(),
      },
      {
        label: 'New folder',
        hint: 'Explorer',
        run: () => {
          if (state.fileTree) ExplorerTree.startCreate(state.fileTree, 'folder');
        },
      },
      {
        label: 'Save file',
        hint: active?.name ?? 'No file open',
        key: '⌘S',
        run: async () => active && fileManager.save(active.id),
      },
      {
        label: 'Format document',
        hint: active?.name ?? 'Editor',
        run: () => editor.getInstance?.()?.trigger?.('command', 'editor.action.formatDocument'),
      },
      {
        label: 'Toggle comment',
        hint: active?.name ?? 'Editor',
        key: '⌘/',
        run: () => editor.getInstance?.()?.trigger?.('command', 'editor.action.commentLine'),
      },
      {
        label: 'Go to line',
        hint: 'Editor',
        key: '⌃G',
        run: () => editor.getInstance?.()?.trigger?.('command', 'editor.action.gotoLine'),
      },
      {
        label: 'Execute script',
        hint: active?.name ?? 'No file open',
        key: '⌘↩',
        run: () => editorController.executeScript(),
      },
      {
        label: 'Close current tab',
        hint: active?.name ?? 'No file open',
        key: '⌘W',
        run: () => active && tabs.closeTab(active.id),
      },
      {
        label: 'Copy active file path',
        hint: active?.path ? helpers.basename(active.path) : 'No file open',
        run: () =>
          active?.path && window.__TAURI__.core.invoke('write_clipboard', { text: active.path }),
      },
      {
        label: 'Cycle sidebar state',
        hint: 'Open, close, lock',
        key: '⌘B',
        run: () => panelController.toggleSidebar(),
      },
      { label: 'Zoom in', hint: 'Workbench', key: '⌘+', run: () => _zoomIn() },
      { label: 'Zoom out', hint: 'Workbench', key: '⌘-', run: () => _zoomOut() },
      { label: 'Reset zoom', hint: 'Workbench', key: '⌘0', run: () => _zoomReset() },
      {
        label: 'Toggle panel',
        hint: 'Layout',
        key: '⌘J',
        run: () => panelController.togglePanel(),
      },
      {
        label: 'Clear output',
        hint: 'Panel',
        run: () => {
          const o = document.getElementById('consoleOutput');
          if (o) o.innerHTML = '';
        },
      },
      {
        label: 'Clear Roblox console',
        hint: 'Panel',
        run: () => {
          const o = document.getElementById('robloxOutput');
          if (o) o.innerHTML = '';
        },
      },
      {
        label: 'Refresh file tree',
        hint: 'Workspace',
        key: '⌘⇧R',
        run: () => workspaceController.refreshTree(),
      },
      { label: 'Explorer', hint: 'View', key: '⌘⇧E', run: () => _switchView('explorer') },
      { label: 'Search files', hint: 'View', key: '⌘⇧F', run: () => _switchView('search') },
      {
        label: 'Reveal active file',
        hint: 'Explorer',
        run: () => active && ExplorerTree.revealFile(active.id),
      },
      { label: 'Refresh outline', hint: 'Explorer', run: () => outline.refresh() },
      { label: 'Cloud scripts', hint: 'View', run: () => _switchView('cloud') },
      { label: 'DataTree', hint: 'View', key: '⌘⇧D', run: () => _switchView('datatree') },
      {
        label: 'Import DataTree',
        hint: 'RBXLX / RBXMX',
        run: () => {
          _switchView('datatree');
          dataTree.openImportDialog?.();
        },
      },
      { label: 'Toggle Autoexecute', hint: 'Explorer', run: () => autoexec.toggleEnabled() },
      { label: 'Accounts', hint: 'View', run: () => _switchView('accounts') },
      { label: 'Pinboard', hint: 'View', run: () => _switchView('pinboard') },
      { label: 'Settings', hint: 'View', run: () => _switchView('settings') },
      ...ACTIVITY_VIEW_META.map(({ view, label }) => ({
        label: `${uiState.isActivityViewVisible?.(view) === false ? 'Show' : 'Hide'} ${label} tab`,
        hint: 'Activity Bar',
        run: () => _toggleActivityViewVisible(view),
      })),
      { label: 'Velocity Website', hint: 'VelocityUI', run: () => _openVelocityWebsite() },
      { label: 'Execution history', hint: 'VelocityUI', run: () => historyPanel.show() },
      {
        label: 'Focus Roblox',
        hint: 'VelocityUI',
        run: () => window.__TAURI__.core.invoke('focus_roblox').catch(() => {}),
      },
      { label: 'Start Roblox console', hint: 'Console', run: () => console_.startMonitoring() },
      { label: 'Stop Roblox console', hint: 'Console', run: () => console_.stopMonitoring() },
      { label: 'Check for updates', hint: 'VelocityUI', run: () => updateChecker.checkManual() },
    ];
  }

  function _commandSymbolItems(query) {
    const model = editor.getInstance?.()?.getModel?.();
    if (!model || typeof LuaIntelligence === 'undefined') return [];
    const q = query.replace(/^[@#]/, '').trim().toLowerCase();
    if (!q || (!query.startsWith('@') && q.length < 2)) return [];
    const version = model.getAlternativeVersionId?.() ?? model.getVersionId?.() ?? 0;
    const cacheKey = `${model.uri?.toString?.() ?? 'model'}:${version}`;
    if (cacheKey !== _commandSymbolCacheKey) {
      _commandSymbolCacheKey = cacheKey;
      _commandSymbolCache = LuaIntelligence.analyze(model, true).symbols || [];
    }
    return _commandSymbolCache
      .filter((sym) => `${sym.name} ${sym.kind} ${sym.detail || ''}`.toLowerCase().includes(q))
      .slice(0, 10)
      .map((sym) => ({
        label: sym.name,
        hint: `${sym.kind} · line ${sym.line}`,
        key: '@',
        run: () => editor.goToLineColumn?.(sym.line, sym.column || 1),
      }));
  }

  function _commandFileItems(query) {
    const q = query.toLowerCase();
    return state.files
      .filter(
        (file) =>
          file.name.toLowerCase().includes(q) || (file.path ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20)
      .map((file) => ({
        label: file.name,
        hint: file.path
          ? file.path.replace(state.workDir ?? '', '').replace(/^\/+/, '')
          : 'Open file',
        run: () => editorController.openFile(file.id),
      }));
  }

  function _rankCommandItems(query) {
    const q = query.trim().toLowerCase();
    const actions = _commandActions();
    const commandMatches = !q
      ? actions
      : actions.filter((item) =>
          `${item.label} ${item.hint} ${item.key ?? ''}`.toLowerCase().includes(q),
        );
    const symbolMatches = q ? _commandSymbolItems(q) : [];
    const fileMatches = q
      ? _commandFileItems(q)
      : state.openTabIds
          .map((id) => state.getFile(id))
          .filter(Boolean)
          .slice(-6)
          .reverse()
          .map((file) => ({
            label: file.name,
            hint: 'Open tab',
            run: () => editorController.openFile(file.id),
          }));
    const items = [...commandMatches, ...symbolMatches, ...fileMatches].slice(0, 12);
    if (q && !items.length) {
      items.push({
        label: `Search for "${query.trim()}"`,
        hint: 'Workspace',
        key: '⌘⇧F',
        run: () => {
          _switchView('search');
          const searchInput = document.getElementById('searchInput');
          if (searchInput) {
            searchInput.value = query.trim();
            searchInput.focus();
            search.run();
          }
        },
      });
    }
    return items;
  }

  function _renderCommandCenter(query = '') {
    const palette = _commandPalette();
    _commandItems = _rankCommandItems(query);
    _commandIndex = Math.min(_commandIndex, Math.max(_commandItems.length - 1, 0));
    if (!_commandItems.length) {
      palette.innerHTML = `<div class="command-empty">No commands found</div>`;
      palette.classList.add('open');
      return;
    }
    palette.innerHTML = _commandItems
      .map(
        (item, i) => `
      <button class="command-item${i === _commandIndex ? ' active' : ''}" data-index="${i}" type="button">
        <span class="command-title">${helpers.escapeHtml(item.label)}</span>
        <span class="command-hint">${helpers.escapeHtml(item.hint ?? '')}</span>
        ${item.key ? `<span class="command-key">${helpers.escapeHtml(item.key)}</span>` : ''}
      </button>
    `,
      )
      .join('');
    palette.classList.add('open');
  }

  function _moveCommandSelection(delta) {
    if (!_commandItems.length) return;
    _commandIndex = (_commandIndex + delta + _commandItems.length) % _commandItems.length;
    _syncCommandSelection();
  }

  function _syncCommandSelection() {
    const palette = _commandPaletteEl;
    if (!palette) return;
    palette.querySelector('.command-item.active')?.classList.remove('active');
    palette.querySelector(`.command-item[data-index="${_commandIndex}"]`)?.classList.add('active');
  }

  async function _runCommandItem(item) {
    if (!item) return;
    const input = document.getElementById('titlebarCommand');
    _hideCommandCenter();
    if (input) {
      input.value = '';
      input.blur();
    }
    await item.run();
  }

  function _hideCommandCenter() {
    _renderCommandCenterSoon.cancel?.();
    _commandPaletteEl?.classList.remove('open');
  }

  const STANDARD_VIEWS = new Set(['explorer', 'search']);
  const EXCLUSIVE_PANELS = {
    cloud: 'cloudView',
    datatree: 'dataTreeView',
    accounts: 'accountsView',
    pinboard: 'pinboardView',
    settings: 'settingsPanel',
  };

  function _switchView(view) {
    if (!STANDARD_VIEWS.has(view) && !EXCLUSIVE_PANELS[view]) view = 'explorer';
    const prevView = document.querySelector('.activity-btn.active')?.dataset.view;
    document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector(`.activity-btn[data-view="${view}"]`)?.classList.add('active');
    const isStandard = STANDARD_VIEWS.has(view) || !EXCLUSIVE_PANELS[view];
    const isExclusive = !!EXCLUSIVE_PANELS[view];
    const showMain = !isExclusive;
    const sidebar = document.querySelector('.sidebar');
    if (!showMain || !isStandard) sidebar?.classList.add('hidden');
    const editorArea = document.querySelector('.editor-area');
    if (editorArea) editorArea.style.display = showMain ? '' : 'none';
    const fabWrap = document.getElementById('fabWrap');
    if (fabWrap) fabWrap.style.display = showMain ? '' : 'none';
    const sbBottom = document.getElementById('sidebarBottom');
    if (sbBottom) sbBottom.style.display = showMain && view === 'explorer' ? '' : 'none';
    for (const [panelView, elId] of Object.entries(EXCLUSIVE_PANELS)) {
      const el = document.getElementById(elId);
      if (el) el.style.display = view === panelView ? 'flex' : 'none';
    }
    if (prevView === 'datatree' && view !== 'datatree') dataTree.hide?.();
    if (prevView === 'accounts' && view !== 'accounts') accountsPanel.hide();
    if (view === 'accounts') accountsPanel.show();
    if (view === 'pinboard') pinboard.show();
    if (view === 'datatree') dataTree.show();
    if (view === 'cloud' && !_cloudInited) {
      cloud.init();
      _cloudInited = true;
    }
    if (view === 'settings') {
      themeManager.renderGrid();
      themeManager.renderCustomEditor?.();
      iconThemeManager.renderList();
      _initSettingsNav();
      menuScriptsPanel.show();
      eventBus.emit('settings:opened');
    }
    if (isStandard) {
      const sidebarLabel = document.getElementById('sidebarLabel');
      if (sidebarLabel) sidebarLabel.textContent = view.charAt(0).toUpperCase() + view.slice(1);
      const fileTree = document.getElementById('fileTree');
      if (fileTree) fileTree.style.display = view === 'explorer' ? '' : 'none';
      const searchView = document.getElementById('searchView');
      if (searchView) searchView.style.display = view === 'search' ? 'flex' : 'none';
      const sidebarActions = document.getElementById('sidebarHeaderActions');
      if (sidebarActions) sidebarActions.style.display = view === 'search' ? 'none' : '';
      document
        .querySelectorAll('#sidebarHeaderActions > .icon-btn:not(.sidebar-action-outline)')
        .forEach((btn) => {
          btn.style.display = view === 'explorer' ? '' : 'none';
        });
      if (view === 'explorer') outline.refresh();
      if (view === 'search') {
        search.run();
        document.getElementById('searchInput')?.focus();
      }
    }
    keyboardManager.setScope(view);
    uiState.setActiveView(view);
    eventBus.emit('ui:view-changed', { view });
  }

  function _isSidebarHidden() {
    return document.querySelector('.sidebar')?.classList.contains('hidden') ?? false;
  }
  function _isSidebarLocked() {
    return document.querySelector('.sidebar')?.dataset.navLocked === '1';
  }

  function _setSidebarHidden(hidden) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (_isSidebarLocked()) return;
    if (sidebar.dataset.guideLocked && hidden) return;
    sidebar.classList.toggle('hidden', hidden);
    uiState.setSidebarHidden?.(hidden);
    eventBus.emit('ui:sidebar-toggled', { hidden });
  }

  function _setupActivityBar() {
    document.querySelectorAll('.activity-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        const currentView = document.querySelector('.activity-btn.active')?.dataset.view;
        const isExclusive = !!EXCLUSIVE_PANELS[view];

        if (isExclusive) {
          _switchView(view);
          return;
        }

        if (view === currentView) {
          // Clicking the active tab: VS Code collapses the sidebar
          _setSidebarHidden(!_isSidebarHidden());
        } else {
          // Switching to a different tab: ensure sidebar is visible
          if (_isSidebarHidden() && !_isSidebarLocked()) _setSidebarHidden(false);
          _switchView(view);
        }
      });
    });
    document.getElementById('btnNewFile')?.addEventListener('click', () => {
      if (!state.fileTree)
        return modal.alert('No Workspace Open', 'Open or import a folder first.');
      ExplorerTree.startCreate(state.fileTree, 'file');
    });
    document.getElementById('btnNewFolder')?.addEventListener('click', () => {
      if (!state.fileTree)
        return modal.alert('No Workspace Open', 'Open or import a folder first.');
      ExplorerTree.startCreate(state.fileTree, 'folder');
    });
    document
      .getElementById('btnNewTab')
      ?.addEventListener('click', () => editorController.newUntitledFile());
    document
      .getElementById('btnOpenFolder')
      ?.addEventListener('click', () => workspaceController.openFolderDialog());
    document.getElementById('btnGuide')?.addEventListener('click', () => _openVelocityWebsite());
    document
      .getElementById('activityBar')
      ?.addEventListener('contextmenu', _showActivityBarContextMenu);
    document
      .getElementById('btnRefreshTree')
      ?.addEventListener('click', () => workspaceController.refreshTree());
    document.getElementById('fileTree')?.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.tree-row') || e.target.closest('.tree-root-header')) return;
      if (state.fileTree) ctxMenu.showEmpty(e, state.fileTree);
    });
  }

  function _setupSettings() {
    document
      .getElementById('btnManageWorkspaces')
      ?.addEventListener('click', () => workspaceController.openFolderDialog());
    document
      .getElementById('btnResetDefault')
      ?.addEventListener('click', () => workspaceController.resetDefault());
    const fontSlider = document.getElementById('fontSizeSlider');
    const fontVal = document.getElementById('fontSizeVal');
    fontSlider?.addEventListener('input', () => {
      const size = parseInt(fontSlider.value);
      if (fontVal) fontVal.textContent = size;
      editor.updateSettings('fontSize', size);
      uiState.setFontSize(size);
    });
    _toggle('wordWrapToggle', 'wordWrap', uiState.setWordWrap.bind(uiState));
    _toggle('minimapToggle', 'minimap', uiState.setMinimap.bind(uiState));
    _toggle('lineNumToggle', 'lineNumbers', uiState.setLineNumbers.bind(uiState));
    document.getElementById('autoUpdateToggle')?.addEventListener('change', function () {
      uiState.setAutoUpdate(this.checked);
      updateChecker.syncAutoUpdateUi?.();
      if (this.checked) updateChecker.check?.();
    });
    const sidebarSlider = document.getElementById('sidebarWidthSlider');
    const sidebarWidthVal = document.getElementById('sidebarWidthVal');
    sidebarSlider?.addEventListener('input', () => {
      const w = parseInt(sidebarSlider.value);
      if (sidebarWidthVal) sidebarWidthVal.textContent = w;
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.width = w + 'px';
      uiState.setSidebarWidth(w);
    });
    const tlSlider = document.getElementById('timelineHeightSlider');
    const tlHeightVal = document.getElementById('timelineHeightVal');
    tlSlider?.addEventListener('input', () => {
      const h = parseInt(tlSlider.value);
      if (tlHeightVal) tlHeightVal.textContent = h;
      const panel = document.getElementById('sidebarBottom');
      if (panel) panel.style.height = h + 'px';
      uiState.setSbBottomHeight(h);
    });
  }

  function _toggle(id, settingKey, uiStateSetter) {
    document.getElementById(id)?.addEventListener('change', function () {
      editor.updateSettings(settingKey, this.checked);
      uiStateSetter(this.checked);
    });
  }

  let _settingsNavInited = false;

  function _initSettingsNav() {
    const body = document.getElementById('spBody');
    const navItems = document.querySelectorAll('.sp-nav-item[data-section]');
    if (!body || !navItems.length) return;
    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(item.dataset.section);
        if (!target || !body) return;
        const bodyRect = body.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        body.scrollTop += targetRect.top - bodyRect.top - 12;
      });
    });
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('.credit-link-btn[data-url]');
      if (btn)
        window.__TAURI__?.core?.invoke?.('open_external', { url: btn.dataset.url }).catch(() => {});
    });
    if (_settingsNavInited) return;
    _settingsNavInited = true;
    const sections = [...document.querySelectorAll('.sp-section')];
    body.addEventListener(
      'scroll',
      () => {
        let active = sections[0]?.id;
        for (const sec of sections) {
          if (sec.getBoundingClientRect().top - body.getBoundingClientRect().top < 60)
            active = sec.id;
        }
        navItems.forEach((item) =>
          item.classList.toggle('active', item.dataset.section === active),
        );
      },
      { passive: true },
    );
  }

  function _restoreUI(ui) {
    uiState.applyLoaded(ui);
    const sidebar = document.getElementById('sidebar');
    const sbBottom = document.getElementById('sidebarBottom');
    const panel = document.getElementById('bottomPanel');
    if (uiState.sidebarWidth && sidebar) sidebar.style.width = uiState.sidebarWidth + 'px';
    if (sidebar) {
      const locked = uiState.getSidebarLocked?.();
      if (locked) sidebar.dataset.navLocked = '1';
      if (locked || uiState.getSidebarHidden?.()) sidebar.classList.add('hidden');
      eventBus.emit('ui:sidebar-toggled', {
        hidden: sidebar.classList.contains('hidden'),
        locked,
        mode: locked ? 'locked' : sidebar.classList.contains('hidden') ? 'closed' : 'open',
      });
    }
    if (uiState.sbBottomHeight && sbBottom) sbBottom.style.height = uiState.sbBottomHeight + 'px';
    outline.syncChrome?.();
    timeline.syncChrome?.();
    if (sbBottom && !sbBottom.querySelector('.sb-section:not(.is-collapsed)')) {
      sbBottom.style.height = '';
      delete sbBottom.dataset.userResized;
    }
    if (uiState.panelVisible && panel) {
      panel.classList.add('visible');
      panel.classList.remove('hidden');
    }
    executorSettings.init(uiState.executor);
    _applyAppZoom(uiState.appZoom || 1, false);
    _syncActivityVisibility();
    const fontSlider = document.getElementById('fontSizeSlider');
    const fontVal = document.getElementById('fontSizeVal');
    if (uiState.fontSize != null && fontSlider) {
      fontSlider.value = uiState.fontSize;
      if (fontVal) fontVal.textContent = uiState.fontSize;
      editor.updateSettings('fontSize', uiState.fontSize);
    }
    _restoreToggle('wordWrapToggle', 'wordWrap', uiState.wordWrap);
    _restoreToggle('minimapToggle', 'minimap', uiState.minimap);
    _restoreToggle('lineNumToggle', 'lineNumbers', uiState.lineNumbers);
    const autoUpdateToggle = document.getElementById('autoUpdateToggle');
    if (autoUpdateToggle) autoUpdateToggle.checked = uiState.autoUpdate !== false;
    _switchView(uiState.activeView ?? 'explorer');
  }

  function _restoreToggle(id, key, value) {
    if (value == null) return;
    const el = document.getElementById(id);
    if (el) {
      el.checked = value;
      editor.updateSettings(key, value);
    }
  }

  function _focusCommandPalette() {
    const command = document.getElementById('titlebarCommand');
    command?.focus();
    command?.select();
  }

  async function _saveActiveFile() {
    const active = state.getActive();
    if (!active) return;
    if (pinboard.isSnippetFile(active.id)) {
      pinboard.handleEditorSave(active.id);
      state.markSaved(active.id);
      tabs.render();
      return;
    }
    if (active.path && !active.preview) {
      if (state.previewTabId === active.id) state.previewTabId = null;
      await fileManager.save(active.id);
      editorController.onFileSaved(active.id);
      tabs.render();
      toast.show('Saved', 'ok', 1200);
    }
  }

  function _setupWorkbenchZoomShortcuts() {
    window.addEventListener(
      'keydown',
      (e) => {
        const cmd = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
        if (!cmd || e.altKey) return;
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          _zoomIn();
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          _zoomOut();
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          _zoomReset();
        }
      },
      { capture: true },
    );
  }

  function _runAppMenuCommand(id) {
    if (!id) return;
    if (id.startsWith('activity:toggle:')) {
      _toggleActivityViewVisible(id.replace('activity:toggle:', ''));
      return;
    }
    const active = state.getActive();
    const view = id.startsWith('view:') ? id.replace('view:', '') : '';
    if (
      ['explorer', 'search', 'datatree', 'accounts', 'pinboard', 'cloud', 'settings'].includes(view)
    ) {
      _switchView(view);
      return;
    }
    const commands = {
      'file:new': () => editorController.newUntitledFile(),
      'file:open-folder': () => workspaceController.openFolderDialog(),
      'file:save': () => _saveActiveFile(),
      'file:close-tab': () => active?.id && tabs.closeTab(active.id),
      'edit:format-document': () =>
        editor.getInstance?.()?.trigger?.('menu', 'editor.action.formatDocument'),
      'edit:toggle-comment': () =>
        editor.getInstance?.()?.trigger?.('menu', 'editor.action.commentLine'),
      'view:command-palette': () => _focusCommandPalette(),
      'view:toggle-sidebar': () => panelController.toggleSidebar(),
      'view:toggle-panel': () => panelController.togglePanel(),
      'view:zoom-in': () => _zoomIn(),
      'view:zoom-out': () => _zoomOut(),
      'view:zoom-reset': () => _zoomReset(),
      'window:minimize': () => window.__TAURI__.core.invoke('minimize_window'),
      'window:toggle-zoom': () => window.__TAURI__.core.invoke('toggle_maximize_window'),
      'app:website': () => _openVelocityWebsite(),
      'app:updates': () => updateChecker.checkManual(),
      'help:website': () => _openVelocityWebsite(),
      'help:discord': () =>
        window.__TAURI__.core.invoke('open_external', { url: 'https://discord.gg/opiumware' }),
      'help:updates': () => updateChecker.checkManual(),
    };
    commands[id]?.();
  }

  function _setupGlobalShortcuts() {
    document.getElementById('tabStrip')?.addEventListener('mousedown', () => {
      const view = document.querySelector('.activity-btn.active')?.dataset.view ?? 'explorer';
      keyboardManager.setScope(view);
    });
    document.getElementById('editorContainer')?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.monaco-editor')) return;
      const view = document.querySelector('.activity-btn.active')?.dataset.view ?? 'explorer';
      keyboardManager.setScope(view);
    });
    document.getElementById('bottomPanel')?.addEventListener('mousedown', () => {
      const view = document.querySelector('.activity-btn.active')?.dataset.view ?? 'explorer';
      keyboardManager.setScope(view);
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Q',
      scope: ['global'],
      handler: async () => {
        await _shutdown();
        await window.__TAURI__.core.invoke('exit_app');
      },
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+S',
      scope: ['global'],
      allowInEditor: true,
      handler: async () => {
        const currentView = document.querySelector('.activity-btn.active')?.dataset.view;
        if (currentView === 'guide') return;
        await _saveActiveFile();
      },
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+W',
      scope: ['explorer', 'search', 'editor'],
      handler: () => {
        const id = state.activeFileId;
        if (id) tabs.closeTab(id);
      },
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+N',
      scope: ['explorer', 'search', 'editor'],
      handler: () => editorController.newUntitledFile(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Enter',
      scope: ['explorer', 'search', 'editor'],
      handler: () => editorController.executeScript(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+`',
      scope: ['global'],
      allowInEditor: true,
      handler: () => panelController.togglePanel(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+B',
      scope: ['global'],
      allowInEditor: true,
      handler: () => panelController.toggleSidebar(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+J',
      scope: ['global'],
      allowInEditor: true,
      handler: () => panelController.togglePanel(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+P',
      scope: ['global'],
      allowInEditor: true,
      allowInInputs: true,
      handler: () => _focusCommandPalette(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Shift+F',
      scope: ['global'],
      handler: () => _switchView('search'),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Shift+D',
      scope: ['global'],
      allowInEditor: true,
      handler: () => _switchView('datatree'),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Shift+O',
      scope: ['global'],
      handler: () => workspaceController.openFolderDialog(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Shift+R',
      scope: ['global'],
      handler: () => workspaceController.refreshTree(),
    });
    keyboardManager.registerShortcut({
      keys: 'Cmd+Shift+E',
      scope: ['global'],
      handler: () => _switchView('explorer'),
    });
  }

  function _setupFab() {
    const wrap = document.getElementById('fabWrap');
    const pill = document.getElementById('fabPill');
    const chevron = document.getElementById('fabChevron');
    if (!wrap || !pill || !chevron) return;
    let locked = false;
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      locked = !locked;
      pill.classList.toggle('open', locked);
      pill.classList.toggle('locked', locked);
      chevron.title = locked ? 'Unlock' : 'Lock open';
    });
    document.addEventListener('click', (e) => {
      if (!locked && !wrap.contains(e.target)) pill.classList.remove('open');
    });
    document.getElementById('fabOpenRoblox')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__TAURI__.core.invoke('focus_roblox').catch(() => {});
    });
    document.getElementById('fabHistory')?.addEventListener('click', (e) => {
      e.stopPropagation();
      historyPanel.show();
    });
  }

  function _handleClientBridgeEvent(payload) {
    dataTree.handleBridgeEvent?.(payload);
    const body = payload?.body ?? {};
    const kind = body.kind ?? 'message';
    if (kind === 'poll') return;
    if (kind === 'hello') {
      const name = body.display_name || body.username || 'client';
      console_.log(`[Client] ${name} connected on bridge :${payload.bridgePort}`, 'info');
      return;
    }
    if (kind === 'executed') {
      console_.log('[Client] Script acknowledged', 'ok');
      return;
    }
    if (kind === 'task:started') {
      console_.log(`[Client] Task started: ${body.task_kind || 'execute'}`, 'info');
      return;
    }
    if (kind === 'task:finished') {
      console_.log(`[Client] Task finished: ${body.task_kind || 'execute'}`, 'ok');
      return;
    }
    if (kind === 'task:error') {
      console_.log(`[Client] Task failed: ${body.message || 'unknown error'}`, 'fail');
      return;
    }
    if (kind === 'datatree:start') {
      console_.log('[DataTree] Capture started', 'info');
      return;
    }
    if (kind === 'datatree:done') {
      console_.log(
        `[DataTree] Captured ${(body.node_count || body.nodes?.length || 0).toLocaleString()} instances`,
        'ok',
      );
      return;
    }
    if (kind === 'datatree:error') {
      console_.log(`[DataTree] ${body.message || 'Capture failed'}`, 'fail');
      return;
    }
    if (kind === 'error') {
      console_.log(`[Client] ${body.message ?? 'Script error'}`, 'fail');
      return;
    }
    console_.log(`[Client] ${kind}`, 'info');
  }

  async function _shutdown() {
    await workspaceController.shutdown();
    await Promise.allSettled([
      menuBar.killAgent(),
      persist.saveUI(uiState.snapshot()),
      persist.saveTreeState(state.workDir),
      persist.saveTimeline(state.workDir),
      persist.saveSession(state.workDir),
    ]);
  }

  async function init() {
    const win = window.__TAURI__.window.getCurrentWindow();
    win.onCloseRequested(async (event) => {
      event.preventDefault();
      await _shutdown();
      await window.__TAURI__.core.invoke('exit_app');
    });
    window.__TAURI__.event.listen('watch-event', (event) =>
      workspaceController.onWatchEvent({ detail: event.payload }),
    );
    window.__TAURI__.event.listen('client-bridge:event', (event) =>
      _handleClientBridgeEvent(event.payload),
    );
    window.__TAURI__.event.listen('client-bridge:error', (event) => {
      const message = event.payload?.message || 'VelocityUI bridge is unavailable';
      toast.show(message, 'fail', 5200);
      console_.log(`[Bridge] ${message}`, 'fail');
      dataTree.handleBridgeError?.(event.payload);
    });
    window.__TAURI__.event.listen('app-menu-command', (event) => _runAppMenuCommand(event.payload));
    _suppressNativeSpellcheck();
    _initBridge();
    await paths.init();
    await autoexec.init();
    themeManager.load();
    _setupWindowFocusState();
    _setupTitlebar();
    _setupActivityBar();
    keyboardManager.init();
    _setupWorkbenchZoomShortcuts();
    _setupGlobalShortcuts();
    _setupSettings();
    StatusBarControls.init();
    themeManager.renderGrid();
    search.init();
    timeline.init();
    panelController.init();
    await iconThemeManager.load();
    await helpers.loadIcons();
    ExplorerTree.init();
    await execHistory.load();
    await pinboard.init();
    const ui = await persist.loadUI();
    if (ui) {
      _restoreUI(ui);
    } else {
      executorSettings.init('opium');
      _applyAppZoom(1, false);
      _syncActivityVisibility();
      _switchView('explorer');
    }
    await workspaceController.boot();
    _setupFab();
    multiInstanceUI.mount();
    menuScriptsPanel.mount();
    await menuBar.init();
    updateChecker.syncAutoUpdateUi?.();
    if (uiState.autoUpdate !== false) updateChecker.check();
    else updateChecker.populateVersion?.();
  }

  return { init };
})();
