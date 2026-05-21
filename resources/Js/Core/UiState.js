const uiState = (() => {
  let _sidebarWidth = 200;
  let _sidebarHidden = false;
  let _sidebarLocked = false;
  let _panelVisible = false;
  let _sbBottomHeight = 100;
  let _activeView = 'explorer';
  let _outlineCollapsed = true;
  let _timelineCollapsed = true;
  let _fontSize = 12;
  let _wordWrap = true;
  let _minimap = false;
  let _lineNumbers = null;
  let _executor = 'opium';
  let _autoUpdate = true;
  let _appZoom = 1;
  let _hiddenActivityViews = new Set();
  const VALID_EXECUTORS = new Set(['hydrogen', 'opium']);
  const VALID_ACTIVITY_VIEWS = new Set(['search', 'datatree', 'accounts', 'pinboard', 'cloud']);
  function snapshot() {
    return {
      sidebarWidth: _sidebarWidth,
      sidebarHidden: _sidebarHidden,
      sidebarLocked: _sidebarLocked,
      panelVisible: _panelVisible,
      sbBottomHeight: _sbBottomHeight,
      activeView: _activeView === 'datatree' ? 'explorer' : _activeView,
      outlineCollapsed: _outlineCollapsed,
      timelineCollapsed: _timelineCollapsed,
      settings: {
        fontSize: _fontSize,
        wordWrap: _wordWrap,
        minimap: _minimap,
        lineNumbers: _lineNumbers,
        executor: _executor,
        autoUpdate: _autoUpdate,
        appZoom: _appZoom,
        hiddenActivityViews: [..._hiddenActivityViews],
      },
    };
  }
  function applyLoaded(loaded) {
    if (!loaded) return;
    if (loaded.sidebarWidth != null) _sidebarWidth = Math.max(200, loaded.sidebarWidth);
    if (loaded.sidebarHidden != null) _sidebarHidden = loaded.sidebarHidden;
    if (loaded.sidebarLocked != null) _sidebarLocked = loaded.sidebarLocked;
    if (loaded.sbBottomHeight != null) _sbBottomHeight = loaded.sbBottomHeight;
    if (loaded.panelVisible != null) _panelVisible = loaded.panelVisible;
    if (loaded.activeView)
      _activeView = loaded.activeView === 'datatree' ? 'explorer' : loaded.activeView;
    if (loaded.outlineCollapsed != null) _outlineCollapsed = !!loaded.outlineCollapsed;
    if (loaded.timelineCollapsed != null) _timelineCollapsed = !!loaded.timelineCollapsed;
    const s = loaded.settings ?? {};
    if (s.fontSize != null) _fontSize = s.fontSize;
    if (s.wordWrap != null) _wordWrap = s.wordWrap;
    if (s.minimap != null) _minimap = s.minimap;
    if (s.lineNumbers != null) _lineNumbers = s.lineNumbers;
    if (s.executor && VALID_EXECUTORS.has(s.executor)) _executor = s.executor;
    if (s.autoUpdate != null) _autoUpdate = !!s.autoUpdate;
    if (s.appZoom != null) _appZoom = Math.max(0.7, Math.min(1.5, Number(s.appZoom) || 1));
    if (Array.isArray(s.hiddenActivityViews)) {
      _hiddenActivityViews = new Set(
        s.hiddenActivityViews.filter((view) => VALID_ACTIVITY_VIEWS.has(view)),
      );
    }
  }
  function save() {
    persist.saveUI(snapshot()).catch(() => {});
  }
  function setSidebarHidden(v) {
    _sidebarHidden = v;
    save();
  }
  function getSidebarHidden() {
    return _sidebarHidden;
  }
  function setSidebarLocked(v) {
    _sidebarLocked = v;
    save();
  }
  function getSidebarLocked() {
    return _sidebarLocked;
  }
  function setSidebarWidth(px) {
    _sidebarWidth = Math.max(200, px);
    save();
  }
  function setPanelVisible(v) {
    _panelVisible = v;
    save();
  }
  function setSbBottomHeight(px) {
    _sbBottomHeight = px;
    save();
  }
  function setActiveView(v) {
    _activeView = v === 'datatree' ? 'explorer' : v;
    save();
  }
  function setOutlineCollapsed(v) {
    _outlineCollapsed = !!v;
    save();
  }
  function setTimelineCollapsed(v) {
    _timelineCollapsed = !!v;
    save();
  }
  function setFontSize(n) {
    _fontSize = n;
    save();
  }
  function setWordWrap(v) {
    _wordWrap = v;
    save();
  }
  function setMinimap(v) {
    _minimap = v;
    save();
  }
  function setLineNumbers(v) {
    _lineNumbers = v;
    save();
  }
  function setExecutor(v) {
    if (!VALID_EXECUTORS.has(v)) return;
    _executor = v;
    save();
  }
  function setAutoUpdate(v) {
    _autoUpdate = !!v;
    save();
  }
  function setAppZoom(v) {
    _appZoom = Math.max(0.7, Math.min(1.5, Number(v) || 1));
    save();
  }
  function isActivityViewVisible(view) {
    if (!VALID_ACTIVITY_VIEWS.has(view)) return true;
    return !_hiddenActivityViews.has(view);
  }
  function setActivityViewVisible(view, visible) {
    if (!VALID_ACTIVITY_VIEWS.has(view)) return;
    if (visible) _hiddenActivityViews.delete(view);
    else _hiddenActivityViews.add(view);
    save();
  }
  function toggleActivityViewVisible(view) {
    const visible = !isActivityViewVisible(view);
    setActivityViewVisible(view, visible);
    return visible;
  }
  return {
    applyLoaded,
    get executor() {
      return _executor;
    },
    get sidebarWidth() {
      return _sidebarWidth;
    },
    get sbBottomHeight() {
      return _sbBottomHeight;
    },
    get panelVisible() {
      return _panelVisible;
    },
    get activeView() {
      return _activeView;
    },
    get outlineCollapsed() {
      return _outlineCollapsed;
    },
    get timelineCollapsed() {
      return _timelineCollapsed;
    },
    get fontSize() {
      return _fontSize;
    },
    get wordWrap() {
      return _wordWrap;
    },
    get minimap() {
      return _minimap;
    },
    get lineNumbers() {
      return _lineNumbers;
    },
    get autoUpdate() {
      return _autoUpdate;
    },
    get appZoom() {
      return _appZoom;
    },
    get hiddenActivityViews() {
      return [..._hiddenActivityViews];
    },
    setSidebarHidden,
    getSidebarHidden,
    setSidebarLocked,
    getSidebarLocked,
    setSidebarWidth,
    setPanelVisible,
    setSbBottomHeight,
    setActiveView,
    setOutlineCollapsed,
    setTimelineCollapsed,
    setFontSize,
    setWordWrap,
    setMinimap,
    setLineNumbers,
    setExecutor,
    setAutoUpdate,
    setAppZoom,
    isActivityViewVisible,
    setActivityViewVisible,
    toggleActivityViewVisible,
    snapshot,
  };
})();
