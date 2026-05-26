const panelController = (() => {
  const SIDEBAR_OPEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-panel-left-open-icon lucide-panel-left-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>`;
  const SIDEBAR_CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-panel-left-close-icon lucide-panel-left-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>`;
  const PANEL_BODIES = {
    console: 'consoleOutput',
    roblox: 'robloxOutput',
  };
  const PANEL_CONTROLS = {
    console: 'stdControls',
    roblox: 'rbxControls',
  };
  function _panelEl() {
    return document.getElementById('bottomPanel');
  }
  function _setPanelVisible(visible) {
    const panel = _panelEl();
    if (!panel) return;
    panel.classList.toggle('visible', visible);
    panel.classList.toggle('hidden', !visible);
    uiState.setPanelVisible(visible);
    eventBus.emit('ui:panel-toggled', { visible });
  }
  function togglePanel() {
    const panel = _panelEl();
    _setPanelVisible(!panel?.classList.contains('visible'));
  }
  function selectPanel(name = 'console') {
    const target = PANEL_BODIES[name] ? name : 'console';
    document.querySelectorAll('.panel-tab').forEach((tab) => {
      const active = tab.dataset.panel === target;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    for (const [panelName, bodyId] of Object.entries(PANEL_BODIES)) {
      const body = document.getElementById(bodyId);
      if (!body) continue;
      const active = panelName === target;
      body.classList.toggle('panel-body--hidden', !active);
      body.classList.toggle('selectable', active && panelName === 'roblox');
    }
    for (const [panelName, controlId] of Object.entries(PANEL_CONTROLS)) {
      document
        .getElementById(controlId)
        ?.classList.toggle('panel-ctrl-group--hidden', panelName !== target);
    }
  }
  function showPanel(name = 'console') {
    selectPanel(name);
    _setPanelVisible(true);
  }
  function _setupPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach((tab) => {
      tab.addEventListener('click', () => selectPanel(tab.dataset.panel));
    });
  }
  function _setupPanelControls() {
    document
      .getElementById('btnClosePanel')
      ?.addEventListener('click', () => _setPanelVisible(false));
    document.getElementById('btnClearConsole')?.addEventListener('click', () => {
      const o = document.getElementById('consoleOutput');
      if (o) o.innerHTML = '';
    });
    document.getElementById('btnClearRoblox')?.addEventListener('click', () => {
      const o = document.getElementById('robloxOutput');
      if (o) o.innerHTML = '';
    });
    document
      .getElementById('btnRbxStart')
      ?.addEventListener('click', () => console_.startMonitoring());
    document.getElementById('btnRbxStop')?.addEventListener('click', () => {
      console_.stopMonitoring();
      console_.robloxLog('[VelocityUI] Monitoring stopped.', 'warn');
    });
  }
  function _setupResizers() {
    _makeResizer({
      resizerEl: document.getElementById('sidebarResizer'),
      targetEl: document.querySelector('.sidebar'),
      axis: 'x',
      prop: 'width',
      min: 200,
      max: 480,
      compute: (clientX) => clientX - 46,
      onCommit: (val) => uiState.setSidebarWidth(val),
    });
    _makeResizer({
      resizerEl: document.getElementById('panelResizer'),
      targetEl: document.getElementById('bottomPanel'),
      axis: 'y',
      prop: 'height',
      min: 80,
      max: 500,
      compute: (clientY) => document.querySelector('.app').getBoundingClientRect().height - clientY,
      onCommit: (val) => uiState.setSbBottomHeight(val),
    });
    _makeResizer({
      resizerEl: document.getElementById('aiSideResizer'),
      targetEl: document.getElementById('aiSidePanel'),
      axis: 'x',
      prop: 'width',
      min: 260,
      max: 520,
      compute: (clientX) => document.querySelector('.app').getBoundingClientRect().width - clientX,
      onCommit: (val) => uiState.setAiPanelWidth?.(val),
      onChange: () => AiHelper.syncFabOffset?.(),
    });
  }
  function _makeResizer({
    resizerEl,
    targetEl,
    axis,
    prop,
    min,
    max,
    compute,
    onCommit,
    onChange,
  }) {
    if (!resizerEl || !targetEl) return;
    let dragging = false;
    let lastVal = null;
    resizerEl.addEventListener('mousedown', (e) => {
      dragging = true;
      resizerEl.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      lastVal = Math.min(max, Math.max(min, compute(axis === 'x' ? e.clientX : e.clientY)));
      targetEl.style[prop] = lastVal + 'px';
      onChange?.(lastVal);
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizerEl.classList.remove('dragging');
      if (lastVal !== null) {
        onCommit(lastVal);
        lastVal = null;
      }
    });
  }
  function _sidebarMode() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return 'open';
    if (sidebar.dataset.navLocked === '1') return 'locked';
    return sidebar.classList.contains('hidden') ? 'closed' : 'open';
  }
  function setSidebarMode(mode) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (sidebar.dataset.guideLocked && mode !== 'open') return;
    const locked = mode === 'locked';
    const hidden = mode !== 'open';
    sidebar.classList.toggle('hidden', hidden);
    if (locked) sidebar.dataset.navLocked = '1';
    else delete sidebar.dataset.navLocked;
    uiState.setSidebarHidden?.(hidden);
    uiState.setSidebarLocked?.(locked);
    setTimeout(() => editor.relayout(), 160);
    eventBus.emit('ui:sidebar-toggled', { hidden, locked, mode });
  }
  function toggleSidebar() {
    const activeView = document.querySelector('.activity-btn.active')?.dataset.view;
    if (activeView && activeView !== 'explorer' && activeView !== 'search') {
      return;
    }
    const mode = _sidebarMode();
    setSidebarMode(mode === 'open' ? 'closed' : mode === 'closed' ? 'locked' : 'open');
  }
  function _setupLayoutButtons() {
    document.getElementById('btnToggleSidebar')?.addEventListener('click', toggleSidebar);
    document.getElementById('btnTogglePanel')?.addEventListener('click', togglePanel);
  }

  function _syncLayoutButtons() {
    const sidebar = document.querySelector('.sidebar');
    const panel = document.getElementById('bottomPanel');
    const sBtn = document.getElementById('btnToggleSidebar');
    const pBtn = document.getElementById('btnTogglePanel');
    const mode = _sidebarMode();
    if (sBtn) {
      sBtn.classList.toggle('active', mode === 'open');
      sBtn.classList.toggle('locked', mode === 'locked');
      sBtn.dataset.state = mode;
      sBtn.innerHTML = mode === 'open' ? SIDEBAR_CLOSE_ICON : SIDEBAR_OPEN_ICON;
      sBtn.title =
        mode === 'open'
          ? 'Close Sidebar (⌘B)'
          : mode === 'closed'
            ? 'Lock Sidebar Closed (⌘B)'
            : 'Open Sidebar (⌘B)';
    }
    if (pBtn) pBtn.classList.toggle('active', panel?.classList.contains('visible'));
  }

  function init() {
    _setupPanelTabs();
    _setupPanelControls();
    _setupResizers();
    _setupLayoutButtons();
    selectPanel(document.querySelector('.panel-tab.active')?.dataset.panel ?? 'console');
    _syncLayoutButtons();
    eventBus.on('ui:panel-toggled', _syncLayoutButtons);
    eventBus.on('ui:sidebar-toggled', _syncLayoutButtons);
  }
  return {
    init,
    togglePanel,
    showPanel,
    selectPanel,
    toggleSidebar,
    setSidebarMode,
  };
})();
