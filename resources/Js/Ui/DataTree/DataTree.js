const dataTree = (() => {
  const {
    cross: _cross,
    dot: _dot,
    mat4LookAt: _mat4LookAt,
    mat4Multiply: _mat4Multiply,
    mat4Perspective: _mat4Perspective,
    norm: _norm,
    sub: _sub,
  } = DataTreeMath;
  const STORE_FILE = 'datatrees_index.json';
  const LEGACY_STORE_FILE = 'datatrees.json';
  const SNAPSHOT_DIR = 'datatree-snapshots';
  const ASSET_CACHE_DIR = 'Cache/Assets';
  const MAX_RENDER_ROWS = 720;
  const SNAPSHOT_LIMIT = 6;
  const ASSET_RATE_LIMIT_COUNT = 192;
  const ASSET_RATE_LIMIT_WINDOW_MS = 3000;
  const MAX_ASSET_BLOB_CACHE_BYTES = 64 * 1024 * 1024;
  const MAX_ASSET_BLOB_CACHE_ENTRIES = 64;
  const MAX_TERRAIN_CELL_CACHE_ENTRIES = 4;
  const MAX_READY_MESH_CACHE_ENTRIES = 96;
  const MAX_SCENE_LIGHTS = 192;
  const VIEWPORT_PERFORMANCE_MODE = false;
  const MAX_VIEWPORT_LIGHTS = 8;
  const INTERACTIVE_VIEWPORT_LIGHTS = 4;
  const MAX_VIEWPORT_DPR = 1.5;
  const COMPLEX_VIEWPORT_DPR = 1.25;
  const INTERACTIVE_VIEWPORT_DPR = 1;
  const CONTACT_AO_SCALE = 0.5;
  const ANY_MIME = '*' + '/' + '*';
  const ROBLOX_DESKTOP_HEADERS = {
    Accept: ANY_MIME,
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  };
  const VIEWPORT_BACKDROP_SKY = {
    cssTop: 'rgb(255 213 164)',
    cssBottom: 'rgb(237 164 112)',
  };

  const _log = {
    info: (...args) => console.log('[DataTree]', ...args),
    warn: (...args) => console.warn('[DataTree]', ...args),
    error: (...args) => console.error('[DataTree]', ...args),
    fetch: (...args) => console.log('[DataTree/fetch]', ...args),
  };

  const state_ = {
    snapshots: [],
    activeSnapshotId: null,
    activeNodeId: null,
    expanded: new Set(),
    query: '',
    propertyQuery: '',
    railExplorerHeight: null,
    railWidth: null,
    previewTab: 'viewport',
    visibleOverflow: 0,
    scroll: { tree: 0, details: 0 },
    meta: { orders: {}, icons: {}, iconHtml: new Map(), materials: null, robloxApi: null },
    meshAssets: new Map(),
    assetBlobs: new Map(),
    assetByteFetches: new Map(),
    terrainCells: new Map(),
    sceneCache: new Map(),
    viewportCameras: new Map(),
    viewportBuild: {
      key: '',
      token: 0,
      status: 'idle',
      progress: 0,
      message: '',
      scene: null,
      renderSnapshot: null,
      renderNodeId: null,
      assetRetryTimer: null,
      activeAssetKeys: new Set(),
    },
    viewportSummary: new Map(),
    nodeDetailLoads: new Map(),
    meshVersion: 0,
    viewportAutoLoad: false,
    viewportClickSelect: false,
    importing: false,
    treeLoading: false,
    treeProgress: {
      progress: null,
      message: 'Loading explorer',
    },
    snapshotLoadToken: 0,
    previewReady: false,
    visible: false,
    memoryUnloaded: false,
    importProgress: {
      progress: 0,
      message: 'Waiting for file',
      nodeCount: 0,
      bytesRead: 0,
      totalBytes: 0,
    },
  };
  let _inited = false;
  let _initPromise = null;
  let _searchTimer = null;
  let _saveTimer = null;
  let _previewWarmupTimer = null;
  let _activeRowEl = null;
  const _assetFetchWindow = [];
  const ICON_ALIASES = {
    Instance: 'Class',
    NumberValue: 'Value',
    IntValue: 'Value',
    ObjectValue: 'Value',
    StringValue: 'Value',
    DoubleConstrainedValue: 'Value',
    RayValue: 'Value',
    Vector3Value: 'Value',
    HumanoidDescription: 'Class',
    PackageLink: 'LinkingService',
    WrapLayer: 'LayerCollector',
    WrapTarget: 'LayerCollector',
  };

  const _container = () => document.getElementById('dataTreeView');
  const _storePath = () => `${paths.internals}/${STORE_FILE}`;
  const _legacyStorePath = () => `${paths.internals}/${LEGACY_STORE_FILE}`;
  const _assetCachePath = (id) => {
    const safeId = String(_extractAssetId(id) || id || '').replace(/[^a-z0-9_-]/gi, '_');
    return `${paths.internals}/${ASSET_CACHE_DIR}/${safeId}.bin`;
  };
  const _snapshotStoragePath = (id) => {
    const safeId = String(id || helpers.uid()).replace(/[^a-z0-9_-]/gi, '_');
    return `${paths.internals}/${SNAPSHOT_DIR}/${safeId}.json`;
  };
  const _explorerSnapshotStoragePath = (path = '') => {
    const text = String(path || '');
    const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
    const dot = text.lastIndexOf('.');
    return dot > slash ? `${text.slice(0, dot)}.explorer.json` : `${text}.explorer.json`;
  };
  const _escape = (value) => helpers.escapeHtml(String(value ?? ''));
  const _cssEscape = (value) =>
    window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
  const _fmtTime = (ts) => (ts ? new Date(ts).toLocaleString([], { hour12: false }) : 'Never');

  async function init() {
    if (_inited) return;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      await _loadMeta();
      await _load();
      _inited = true;
      render();
    })();
    return _initPromise;
  }

  async function _loadMeta() {
    _log.info('Loading icon manifest and explorer order');
    const [orders, icons, materials, robloxApi] = await Promise.allSettled([
      fetch('Assets/RobloxExplorerOrder.json').then((res) => (res.ok ? res.json() : null)),
      fetch('Assets/RobloxStudioIconManifest.json').then((res) => (res.ok ? res.json() : null)),
      fetch('Assets/RobloxMaterials/manifest.json').then((res) => (res.ok ? res.json() : null)),
      RobloxAPI.init().then(() => RobloxAPI.raw?.() || null),
    ]);
    const meta = orders.status === 'fulfilled' ? orders.value : null;
    state_.meta.orders = meta?.orders || {};
    state_.meta.icons = icons.status === 'fulfilled' ? icons.value || {} : {};
    state_.meta.materials = materials.status === 'fulfilled' ? materials.value || null : null;
    state_.meta.robloxApi = robloxApi.status === 'fulfilled' ? robloxApi.value || null : null;
    if (state_.meta.robloxApi) DataTreeStudioProperties.build(state_.meta.robloxApi);
    state_.meta.iconHtml = new Map();
    _log.info(
      `Meta loaded: ${Object.keys(state_.meta.orders).length} orders, ${Object.keys(state_.meta.icons).length} icons, ${state_.meta.materials?.materials?.length || 0} materials, ${state_.meta.robloxApi?.Classes?.length || 0} API classes`,
    );
  }

  async function _load() {
    try {
      _log.info('Loading saved DataTree state from disk');
      const raw = await window.__TAURI__.core.invoke('read_text_file', { path: _storePath() });
      const data = JSON.parse(raw);
      state_.snapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(
        0,
        SNAPSHOT_LIMIT,
      );
      state_.activeSnapshotId = data.activeSnapshotId ?? state_.snapshots[0]?.id ?? null;
      _log.info(`Loaded ${state_.snapshots.length} snapshot(s), active=${state_.activeSnapshotId}`);
    } catch (err) {
      await _loadLegacy();
    }
  }

  async function _loadLegacy() {
    try {
      const raw = await window.__TAURI__.core.invoke('read_text_file', {
        path: _legacyStorePath(),
      });
      const data = JSON.parse(raw);
      state_.snapshots = (Array.isArray(data.snapshots) ? data.snapshots : []).slice(
        0,
        SNAPSHOT_LIMIT,
      );
      for (const snapshot of state_.snapshots) await _persistLegacyPayload(snapshot);
      state_.activeSnapshotId = data.activeSnapshotId ?? state_.snapshots[0]?.id ?? null;
      const active = activeSnapshot();
      if (active?.nodes?.length) _hydrate(active);
      _restoreSnapshotState(active);
      _saveSoon();
      _log.warn(`Migrated legacy DataTree state with ${state_.snapshots.length} snapshot(s)`);
    } catch (err) {
      _log.warn(`No saved DataTree state (${err?.message}) — starting fresh`);
      state_.snapshots = [];
    }
  }

  async function _persistLegacyPayload(snapshot) {
    if (!snapshot?.nodes?.length || snapshot.storagePath) return;
    snapshot.id = snapshot.id || helpers.uid();
    snapshot.nodeCount = snapshot.nodeCount || snapshot.nodes.length;
    snapshot.storagePath = _snapshotStoragePath(snapshot.id);
    await window.__TAURI__.core.invoke('write_text_file', {
      path: snapshot.storagePath,
      content: JSON.stringify({
        ..._snapshotMeta(snapshot),
        rootId: snapshot.rootId || snapshot.nodes[0]?.id || null,
        nodes: snapshot.nodes,
      }),
    });
  }

  async function _ensureSnapshotLoaded(snapshot, { light = true } = {}) {
    if (!snapshot || snapshot.byId || snapshot.nodes?.length) {
      if (snapshot && !snapshot.byId) await _hydrateAsync(snapshot);
      return snapshot;
    }
    if (!snapshot.storagePath) return snapshot;
    const full = light
      ? await window.__TAURI__.core.invoke('datatree_load_explorer_snapshot', {
          path: snapshot.storagePath,
        })
      : await window.__TAURI__.core.invoke('datatree_load_snapshot', {
          path: snapshot.storagePath,
          light,
        });
    snapshot.nodes = full.nodes || [];
    snapshot.materialVariantNodes =
      full.materialVariantNodes || snapshot.materialVariantNodes || [];
    snapshot.nodeCount = full.nodeCount ?? snapshot.nodes.length;
    snapshot.rootId = snapshot.rootId || full.rootId || snapshot.nodes[0]?.id || null;
    snapshot.expandedIds = snapshot.expandedIds || full.expandedIds || [];
    snapshot.activeNodeId = snapshot.activeNodeId || full.activeNodeId || null;
    snapshot.sourcePath = snapshot.sourcePath || full.sourcePath || '';
    snapshot.sourceSize = snapshot.sourceSize || full.sourceSize || 0;
    snapshot.heavyLoaded = !light;
    snapshot.explorerOnly = light;
    await _hydrateAsync(snapshot);
    return snapshot;
  }

  async function _ensureHeavySnapshotLoaded(snapshot) {
    if (!snapshot?.storagePath || snapshot.heavyLoaded) return snapshot;
    const full = await window.__TAURI__.core.invoke('datatree_load_snapshot', {
      path: snapshot.storagePath,
      light: false,
    });
    const keepActive = snapshot.activeNodeId;
    const keepExpanded = snapshot.expandedIds;
    snapshot.nodes = full.nodes || [];
    snapshot.nodeCount = full.nodeCount ?? snapshot.nodes.length;
    snapshot.rootId = full.rootId || snapshot.rootId || snapshot.nodes[0]?.id || null;
    snapshot.expandedIds = keepExpanded || full.expandedIds || [];
    snapshot.activeNodeId = keepActive || full.activeNodeId || null;
    snapshot.sourcePath = full.sourcePath || snapshot.sourcePath || '';
    snapshot.sourceSize = full.sourceSize || snapshot.sourceSize || 0;
    snapshot.heavyLoaded = true;
    snapshot.explorerOnly = false;
    await _hydrateAsync(snapshot);
    return snapshot;
  }

  async function _loadRenderSnapshot(snapshot, node) {
    if (!snapshot?.storagePath || !node?.id) return snapshot;
    const renderSnapshot = await window.__TAURI__.core.invoke('datatree_render_snapshot', {
      path: snapshot.storagePath,
      rootId: node.id,
    });
    renderSnapshot.id = `${snapshot.id}:render:${node.id}`;
    renderSnapshot.sourcePath = snapshot.sourcePath || renderSnapshot.sourcePath || '';
    renderSnapshot.sourceSize = snapshot.sourceSize || renderSnapshot.sourceSize || 0;
    renderSnapshot.heavyLoaded = true;
    await _hydrateAsync(renderSnapshot, { chunkMs: 4 });
    if (snapshot.materialVariants?.size && !renderSnapshot.materialVariants?.size) {
      renderSnapshot.materialVariants = snapshot.materialVariants;
    }
    return renderSnapshot;
  }

  function _loadActiveSnapshotForView() {
    const snapshot = activeSnapshot();
    if (!state_.visible) return;
    state_.memoryUnloaded = false;
    if (!snapshot?.storagePath || snapshot.byId || snapshot.nodes?.length || state_.treeLoading)
      return;
    const token = (state_.snapshotLoadToken || 0) + 1;
    const snapshotId = snapshot.id;
    state_.snapshotLoadToken = token;
    state_.treeLoading = true;
    state_.treeProgress = {
      progress: null,
      message: 'Opening optimized explorer snapshot',
    };
    state_.previewReady = false;
    render();
    _ensureSnapshotLoaded(snapshot, { light: true })
      .then(() => {
        if (!_isActiveSnapshotLoad(token, snapshotId)) return;
        state_.treeProgress = {
          progress: null,
          message: 'Hydrating tree index',
        };
        _restoreSnapshotState(snapshot);
        state_.previewTab = 'raw';
        _ensureActiveNodeDetailLoaded(snapshot).catch(() => {});
      })
      .catch((err) => {
        if (_isActiveSnapshotLoad(token, snapshotId))
          toast.show(err?.message || 'DataTree failed to load', 'fail', 3200);
      })
      .finally(() => {
        if (!_isActiveSnapshotLoad(token, snapshotId)) return;
        state_.treeProgress = {
          progress: null,
          message: 'Explorer ready',
        };
        state_.treeLoading = false;
        render();
        _schedulePreviewWarmup();
      });
  }

  function _isActiveSnapshotLoad(token, snapshotId) {
    return (
      state_.visible && state_.snapshotLoadToken === token && state_.activeSnapshotId === snapshotId
    );
  }

  function _cancelSnapshotLoad() {
    state_.snapshotLoadToken = (state_.snapshotLoadToken || 0) + 1;
    state_.treeLoading = false;
  }

  function _nodeHasDetails(node) {
    return Boolean(
      node?.detailLoaded || node?.properties || node?.itemAttributes || node?.attributes,
    );
  }

  async function _ensureActiveNodeDetailLoaded(snapshot = activeSnapshot()) {
    const node =
      snapshot?.byId?.get(state_.activeNodeId) ||
      (snapshot?.rootId ? snapshot.byId?.get(snapshot.rootId) : null);
    if (node) await _ensureNodeDetailsLoaded(snapshot, node);
  }

  async function _ensureNodeDetailsLoaded(snapshot, node) {
    if (!snapshot?.storagePath || !node?.id || _nodeHasDetails(node)) return node;
    const key = `${snapshot.id}:${node.id}`;
    if (state_.nodeDetailLoads.has(key)) return state_.nodeDetailLoads.get(key);
    const load = window.__TAURI__.core
      .invoke('datatree_node_detail', {
        path: snapshot.storagePath,
        nodeId: node.id,
      })
      .then((detail) => {
        Object.assign(node, detail, { detailLoaded: true });
        if (snapshot === activeSnapshot() && state_.activeNodeId === node.id) {
          if (state_.previewReady) _replace('.dt-preview-pane', _previewPane());
          _replace('.dt-details', _detailsPane());
        }
        return node;
      })
      .finally(() => state_.nodeDetailLoads.delete(key));
    state_.nodeDetailLoads.set(key, load);
    return load;
  }

  function _schedulePreviewWarmup() {
    clearTimeout(_previewWarmupTimer);
    if (!state_.visible) return;
    if (!activeSnapshot()?.byId) return;
    _previewWarmupTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          state_.previewReady = true;
          _replace('.dt-preview-pane', _previewPane());
        });
      });
    }, 80);
  }

  function _saveSoon() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => _save().catch(() => {}), 220);
  }

  async function _save() {
    _log.info(`Saving ${state_.snapshots.length} snapshot(s) to disk`);
    await window.__TAURI__.core.invoke('write_text_file', {
      path: _storePath(),
      content: JSON.stringify({
        activeSnapshotId: state_.activeSnapshotId,
        snapshots: state_.snapshots.map(_snapshotMeta),
      }),
    });
  }

  function show() {
    state_.visible = true;
    if (!_inited) {
      const root = _container();
      if (root) root.replaceChildren(_shellSkeleton('Preparing DataTree'));
      init()
        .then(() => requestAnimationFrame(_loadActiveSnapshotForView))
        .catch((err) => toast.show(err?.message || 'DataTree failed to load', 'fail', 3200));
      return;
    }
    render();
    if (!state_.memoryUnloaded) requestAnimationFrame(_loadActiveSnapshotForView);
    if (activeSnapshot()?.byId && !state_.previewReady) _schedulePreviewWarmup();
  }

  function hide() {
    state_.visible = false;
    _cancelSnapshotLoad();
    clearTimeout(_previewWarmupTimer);
    state_.previewReady = false;
    const root = _container();
    if (root) {
      _rememberScroll(root);
      _disposeViewports(root);
      root.innerHTML = '';
    }
    _releaseHeavyRenderState({ unloadSnapshots: false, preserveWarmState: true });
  }

  function unloadMemory() {
    const snapshot = activeSnapshot();
    if (!snapshot?.storagePath) {
      toast.show('Nothing to unload yet', 'info', 1400);
      return;
    }
    _persistSnapshotState(snapshot);
    _cancelSnapshotLoad();
    clearTimeout(_previewWarmupTimer);
    state_.previewReady = false;
    state_.memoryUnloaded = true;
    const root = _container();
    if (root) {
      _rememberScroll(root);
      _disposeViewports(root);
    }
    _releaseHeavyRenderState({ unloadSnapshots: true, preserveWarmState: false });
    if (state_.visible) render();
    toast.show('DataTree memory unloaded', 'ok', 1800);
  }

  function reloadMemory() {
    if (!activeSnapshot()?.storagePath) return;
    state_.memoryUnloaded = false;
    render();
    requestAnimationFrame(_loadActiveSnapshotForView);
  }

  async function openImportDialog() {
    await init();
    _container()?.querySelector('[data-action="import"]')?.click();
  }

  async function importRbxlx(file) {
    if (state_.importing) return;
    _log.info('Importing RBXLX via native Tauri parser');
    const importId = helpers.uid();
    state_.importing = true;
    state_.importProgress = {
      importId,
      progress: 0.02,
      message: 'Waiting for file selection',
      nodeCount: 0,
      bytesRead: 0,
      totalBytes: 0,
    };
    render();
    const unlisten = await window.__TAURI__?.event
      ?.listen?.('datatree-import-progress', (event) => {
        const payload = event?.payload || {};
        if (payload.importId !== importId) return;
        state_.importProgress = {
          importId,
          progress: Math.max(0.02, Math.min(1, Number(payload.progress) || 0.02)),
          message: payload.message || 'Importing RBXLX',
          nodeCount: Number(payload.nodeCount) || 0,
          bytesRead: Number(payload.bytesRead) || 0,
          totalBytes: Number(payload.totalBytes) || 0,
        };
        _paintImportProgress();
      })
      .catch?.(() => null);
    try {
      const snapshot = await window.__TAURI__.core.invoke('datatree_import_dialog', { importId });
      if (!snapshot) return;
      await _hydrateAsync(snapshot);
      state_.snapshots.unshift(snapshot);
      state_.snapshots = state_.snapshots.slice(0, SNAPSHOT_LIMIT);
      state_.memoryUnloaded = false;
      await _activateSnapshot(snapshot.id);
      await _save();
      _log.info(`Import complete: ${snapshot.nodeCount} instances, id=${snapshot.id}`);
      toast.show(`Imported ${snapshot.nodeCount.toLocaleString()} instances`, 'ok', 2200);
    } catch (err) {
      _log.error(`Import failed: ${err?.message}`);
      toast.show(err?.message || 'RBXLX import failed', 'fail', 3600);
    } finally {
      if (typeof unlisten === 'function') unlisten();
      state_.importing = false;
      if (state_.visible) {
        render();
        _schedulePreviewWarmup();
      }
    }
  }

  function activeSnapshot() {
    return (
      state_.snapshots.find((snapshot) => snapshot.id === state_.activeSnapshotId) ||
      state_.snapshots[0] ||
      null
    );
  }

  async function _activateSnapshot(id) {
    const snapshot = state_.snapshots.find((item) => item.id === id) || state_.snapshots[0] || null;
    _log.info(
      `Activating snapshot id=${snapshot?.id} name="${snapshot?.name}" nodes=${snapshot?.nodeCount}`,
    );
    _cancelSnapshotLoad();
    clearTimeout(_previewWarmupTimer);
    _cancelViewportBuild();
    state_.activeSnapshotId = snapshot?.id ?? null;
    state_.memoryUnloaded = false;
    state_.previewReady = false;
    state_.previewTab = 'raw';
    _clearSceneCache();
    if (snapshot?.byId || snapshot?.nodes?.length) _restoreSnapshotState(snapshot);
    else {
      state_.activeNodeId = snapshot?.activeNodeId || snapshot?.rootId || null;
      state_.expanded = new Set((snapshot?.expandedIds || []).filter(Boolean));
    }
  }

  function _restoreSnapshotState(snapshot) {
    state_.activeNodeId =
      snapshot?.activeNodeId || snapshot?.rootId || snapshot?.nodes?.[0]?.id || null;
    state_.expanded = new Set(
      snapshot?.expandedIds?.length ? snapshot.expandedIds : [state_.activeNodeId].filter(Boolean),
    );
  }

  function _persistSnapshotState(snapshot = activeSnapshot()) {
    if (!snapshot) return;
    snapshot.activeNodeId = state_.activeNodeId;
    snapshot.expandedIds = [...state_.expanded];
    _saveSoon();
  }

  function _hydrate(snapshot) {
    const byId = new Map();
    const children = new Map();
    for (const node of snapshot.nodes || []) {
      byId.set(node.id, node);
      delete node.path;
      node.detailLoaded = _nodeHasDetails(node);
      node.searchText =
        node.searchText || `${node.name || ''} ${node.className || ''}`.toLowerCase();
      const parentId = node.parentId ?? 0;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
    }
    for (const list of children.values()) list.sort(_nodeSort);
    snapshot.byId = byId;
    snapshot.children = children;
    delete snapshot.searchIndex;
    snapshot.rootId = children.get(0)?.[0]?.id ?? snapshot.nodes?.[0]?.id ?? null;
    snapshot.nodeCount = snapshot.nodes?.length || 0;
    _hydrateMaterialRegistry(snapshot);
    _ensureDepths(snapshot);
  }

  async function _hydrateAsync(snapshot, { chunkMs = 5 } = {}) {
    const byId = new Map();
    const children = new Map();
    const nodes = snapshot.nodes || [];
    let sliceStart = performance.now();
    for (const node of nodes) {
      byId.set(node.id, node);
      delete node.path;
      node.detailLoaded = _nodeHasDetails(node);
      node.searchText =
        node.searchText || `${node.name || ''} ${node.className || ''}`.toLowerCase();
      const parentId = node.parentId ?? 0;
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
      if (performance.now() - sliceStart >= chunkMs) {
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
    let sorted = 0;
    sliceStart = performance.now();
    for (const list of children.values()) {
      list.sort(_nodeSort);
      sorted += list.length;
      if (sorted > 1400 || performance.now() - sliceStart >= chunkMs) {
        sorted = 0;
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
    snapshot.byId = byId;
    snapshot.children = children;
    delete snapshot.searchIndex;
    snapshot.rootId = children.get(0)?.[0]?.id ?? snapshot.nodes?.[0]?.id ?? null;
    snapshot.nodeCount = nodes.length || 0;
    _hydrateMaterialRegistry(snapshot);
    if (nodes.some((node) => !Number.isFinite(node.depth)))
      await _ensureDepthsAsync(snapshot, chunkMs);
  }

  function _hydrateMaterialRegistry(snapshot) {
    const variants = new Map();
    for (const node of [...(snapshot?.nodes || []), ...(snapshot?.materialVariantNodes || [])]) {
      if (!/^materialvariant$/i.test(String(node.className || ''))) continue;
      const props = node.properties || {};
      const name = String(node.name || props.Name || '').trim();
      if (!name) continue;
      const maps = {};
      for (const key of ['ColorMap', 'NormalMap', 'RoughnessMap', 'MetalnessMap', 'TexturePack']) {
        const value = _firstProp(props, [key]);
        if (!value) continue;
        maps[key] = {
          value,
          id: _assetId(value),
          kind: key === 'TexturePack' ? 'Asset' : 'Image',
        };
      }
      variants.set(_materialVariantKey(name), {
        name,
        baseMaterial: _firstProp(props, ['BaseMaterial']),
        studPattern: _firstProp(props, ['StudsPerTile', 'studsPerTile']),
        maps,
        nodeId: node.id,
      });
    }
    snapshot.materialVariants = variants;
  }

  function _ensureDepths(snapshot) {
    const stack = (snapshot.children.get(0) || []).map((node) => [node, 0]);
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (node.depth == null) node.depth = depth;
      const nextDepth = Number(node.depth) + 1;
      const kids = snapshot.children.get(node.id) || [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], nextDepth]);
    }
  }

  async function _ensureDepthsAsync(snapshot, chunkMs = 5) {
    const stack = (snapshot.children.get(0) || []).map((node) => [node, 0]);
    let sliceStart = performance.now();
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (node.depth == null) node.depth = depth;
      const nextDepth = Number(node.depth) + 1;
      const kids = snapshot.children.get(node.id) || [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push([kids[i], nextDepth]);
      if (performance.now() - sliceStart >= chunkMs) {
        await _yieldFrame();
        sliceStart = performance.now();
      }
    }
  }

  function _nodeSort(a, b) {
    const ao = state_.meta.orders[a.className] ?? 9999;
    const bo = state_.meta.orders[b.className] ?? 9999;
    if (ao !== bo) return ao - bo;
    const an = String(a.name || '');
    const bn = String(b.name || '');
    if (an !== bn) return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
    return String(a.className || '').localeCompare(String(b.className || ''));
  }

  function _snapshotMeta(snapshot) {
    return {
      id: snapshot.id,
      name: snapshot.name,
      source: snapshot.source,
      capturedAt: snapshot.capturedAt,
      completedAt: snapshot.completedAt,
      nodeCount: snapshot.nodeCount,
      status: snapshot.status,
      rootId: snapshot.rootId || null,
      expandedIds: snapshot.expandedIds || [],
      activeNodeId: snapshot.activeNodeId || null,
      storagePath: snapshot.storagePath || '',
      sourcePath: snapshot.sourcePath || '',
      sourceSize: snapshot.sourceSize || 0,
    };
  }

  function render() {
    const root = _container();
    if (!root) return;
    _rememberScroll(root);
    _disposeViewports(root);
    root.innerHTML = '';
    root.appendChild(_view());
    _restoreScroll(root);
  }

  function _shellSkeleton(message = 'Loading DataTree') {
    const shell = document.createElement('div');
    shell.className = 'dt-shell';
    shell.innerHTML = `<header class="dt-topbar"><div class="dt-title-block"><h2>DataTree</h2><p>RBXLX Explorer</p></div><div class="dt-actions"><button class="dt-btn dt-btn-primary" disabled>Import RBXLX</button></div></header><div class="dt-content"><main class="dt-preview-pane"><div class="dt-preview-empty dt-preview-empty--deferred"><span>${_escape(message)}</span><p>Preview is intentionally asleep while the explorer becomes interactive.</p></div></main><section class="dt-side dt-side--loading"><main class="dt-tree-pane"><div class="dt-tree-toolbar"><div><span class="dt-tree-title">Data Model Explorer</span><small>${_escape(message)}</small></div><label class="dt-search"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><input placeholder="Search" disabled></label></div><div class="dt-tree-list"><div class="dt-stage-card"><span class="dt-stage-pill">Explorer first</span><strong>Loading saved imports</strong><p>The side tree and inspector are loading before the preview wakes up.</p><div class="dt-stage-line"><span></span></div></div></div></main><aside class="dt-details"><div class="dt-empty">Inspector will appear after the tree loads.</div></aside></section></div>`;
    return shell;
  }

  function _rememberScroll(root) {
    state_.scroll.tree = root.querySelector('.dt-tree-list')?.scrollTop ?? state_.scroll.tree;
    state_.scroll.details = root.querySelector('.dt-details')?.scrollTop ?? state_.scroll.details;
  }

  function _restoreScroll(root) {
    requestAnimationFrame(() => {
      const tree = root.querySelector('.dt-tree-list');
      const details = root.querySelector('.dt-details');
      if (tree) tree.scrollTop = state_.scroll.tree || 0;
      if (details) details.scrollTop = state_.scroll.details || 0;
    });
  }

  function _view() {
    const shell = document.createElement('div');
    shell.className = `dt-shell${state_.importing ? ' is-importing' : ''}${state_.treeLoading ? ' is-tree-loading' : ''}`;
    shell.append(_topbar(), _content());
    if (state_.importing) shell.appendChild(_importOverlay());
    else if (state_.treeLoading) shell.appendChild(_treeLoadOverlay());
    return shell;
  }

  function _topbar() {
    const bar = document.createElement('header');
    bar.className = 'dt-topbar';
    const snapshot = activeSnapshot();
    const busy = state_.importing;
    bar.setAttribute('aria-busy', String(busy));
    bar.innerHTML = `<div class="dt-title-block"><h2>DataTree</h2><p>${busy ? 'Importing RBXLX' : 'RBXLX Explorer'}</p></div><div class="dt-actions"><select class="dt-snapshot-select" aria-label="Saved DataTrees"${busy ? ' disabled' : ''}>${state_.snapshots.map((item) => `<option value="${_escape(item.id)}"${item.id === state_.activeSnapshotId ? ' selected' : ''}>${_escape(item.name || 'Untitled DataTree')}</option>`).join('') || '<option>No imports</option>'}</select><button class="dt-icon-action dt-memory-action" type="button" data-action="${state_.memoryUnloaded ? 'reload-memory' : 'unload-memory'}" title="${state_.memoryUnloaded ? 'Reload this DataTree into memory' : 'Unload this DataTree from memory when you are done inspecting it'}"${busy || !snapshot?.storagePath ? ' disabled' : ''}>${state_.memoryUnloaded ? 'Reload' : 'Unload'}</button><button class="dt-icon-action" type="button" data-action="delete" title="Delete import"${busy ? ' disabled' : ''}>Delete</button><button class="dt-btn dt-btn-primary" data-action="import"${busy ? ' disabled' : ''}>${busy ? 'Importing RBXLX' : 'Import RBXLX'}</button></div>`;
    const select = bar.querySelector('.dt-snapshot-select');
    select?.addEventListener('change', async () => {
      if (state_.importing) return;
      await _activateSnapshot(select.value);
      _saveSoon();
      render();
      requestAnimationFrame(_loadActiveSnapshotForView);
    });
    bar.querySelector('[data-action="unload-memory"]')?.addEventListener('click', unloadMemory);
    bar.querySelector('[data-action="reload-memory"]')?.addEventListener('click', reloadMemory);
    bar.querySelector('[data-action="delete"]')?.addEventListener('click', deleteSnapshot);
    bar.querySelector('[data-action="import"]')?.addEventListener('click', () => importRbxlx());
    if (!snapshot) {
      bar.querySelector('[data-action="delete"]')?.setAttribute('disabled', '');
    }
    return bar;
  }

  function _importOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'dt-busy-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    const pct = Math.round(
      Math.max(0.02, Math.min(1, state_.importProgress.progress || 0.02)) * 100,
    );
    const count = state_.importProgress.nodeCount
      ? `${state_.importProgress.nodeCount.toLocaleString()} instances`
      : 'Preparing parser';
    overlay.innerHTML = `<div class="dt-busy-card"><span class="dt-busy-spinner"></span><strong>Importing RBXLX</strong><p class="dt-import-message">${_escape(state_.importProgress.message || 'Parsing and indexing in Tauri.')}</p><div class="dt-progress-track dt-import-progress"><span style="width:${pct}%"></span></div><small class="dt-import-meta">${pct}% · ${_escape(count)}</small></div>`;
    return overlay;
  }

  function _paintImportProgress() {
    const pct = Math.round(
      Math.max(0.02, Math.min(1, state_.importProgress.progress || 0.02)) * 100,
    );
    const message = _container()?.querySelector('.dt-import-message');
    const bar = _container()?.querySelector('.dt-import-progress span');
    const meta = _container()?.querySelector('.dt-import-meta');
    if (message) message.textContent = state_.importProgress.message || 'Importing RBXLX';
    if (bar) bar.style.width = `${pct}%`;
    if (meta) {
      const count = state_.importProgress.nodeCount
        ? `${state_.importProgress.nodeCount.toLocaleString()} instances`
        : 'Preparing parser';
      meta.textContent = `${pct}% · ${count}`;
    }
  }

  function _treeLoadOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'dt-busy-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    const progress = Number(state_.treeProgress.progress);
    const hasProgress = Number.isFinite(progress);
    const pct = hasProgress ? Math.round(Math.max(0.02, Math.min(1, progress)) * 100) : null;
    const snapshot = activeSnapshot();
    const count = snapshot?.nodeCount
      ? `${snapshot.nodeCount.toLocaleString()} instances`
      : 'Preparing explorer';
    overlay.innerHTML = `<div class="dt-busy-card"><span class="dt-busy-spinner"></span><strong>Loading Explorer</strong><p class="dt-import-message">${_escape(state_.treeProgress.message || 'Loading saved explorer')}</p><div class="dt-progress-track dt-import-progress${hasProgress ? '' : ' is-indeterminate'}"><span style="width:${hasProgress ? pct : 42}%"></span></div><small class="dt-import-meta">${hasProgress ? `${pct}% · ` : ''}${_escape(count)}</small></div>`;
    return overlay;
  }

  function _content() {
    const wrap = document.createElement('div');
    wrap.className = 'dt-content';
    if (state_.railWidth) wrap.style.setProperty('--dt-side-width', `${state_.railWidth}px`);
    if (state_.memoryUnloaded) {
      wrap.append(_memoryUnloadedPane(), _sideSplitter(wrap), _memoryUnloadedSide());
      return wrap;
    }
    const side = document.createElement('section');
    side.className = `dt-side${state_.treeLoading ? ' dt-side--loading' : ''}`;
    if (state_.railExplorerHeight) {
      side.style.setProperty('--dt-explorer-height', `${state_.railExplorerHeight}px`);
    }
    side.append(_treePane(), _railSplitter(side), _detailsPane());
    wrap.append(
      state_.previewReady ? _previewPane() : _previewDormantPane(),
      _sideSplitter(wrap),
      side,
    );
    return wrap;
  }

  function _memoryUnloadedPane() {
    const pane = document.createElement('main');
    pane.className = 'dt-preview-pane';
    pane.innerHTML =
      '<div class="dt-preview-empty dt-preview-empty--deferred"><span>DataTree is unloaded</span><p>The saved import is still available. Reload it when you want to inspect it again.</p><button class="dt-btn dt-btn-primary" type="button" data-action="reload-memory">Reload DataTree</button></div>';
    pane.querySelector('[data-action="reload-memory"]')?.addEventListener('click', reloadMemory);
    return pane;
  }

  function _memoryUnloadedSide() {
    const side = document.createElement('section');
    side.className = 'dt-side dt-side--loading';
    side.innerHTML =
      '<main class="dt-tree-pane"><div class="dt-tree-toolbar"><div><span class="dt-tree-title">Data Model Explorer</span><small>Memory unloaded</small></div></div><div class="dt-tree-list"><div class="dt-empty">Reload DataTree to restore the explorer.</div></div></main><aside class="dt-details"><div class="dt-empty">Inspector is sleeping.</div></aside>';
    return side;
  }

  function _sideSplitter(content) {
    const handle = document.createElement('div');
    handle.className = 'dt-side-splitter';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.title = 'Drag to resize DataTree inspector';
    let dragging = false;
    let pointerId = null;
    const minSide = 320;
    const maxSide = 560;
    const minPreview = 520;
    const move = (event) => {
      if (!dragging) return;
      const rect = content.getBoundingClientRect();
      const maxByPreview = Math.max(minSide, rect.width - minPreview - handle.offsetWidth);
      const max = Math.min(maxSide, maxByPreview);
      const next = Math.max(minSide, Math.min(max, rect.right - event.clientX));
      state_.railWidth = Math.round(next);
      content.style.setProperty('--dt-side-width', `${state_.railWidth}px`);
    };
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      if (pointerId != null) handle.releasePointerCapture?.(pointerId);
      pointerId = null;
    };
    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      pointerId = event.pointerId;
      handle.classList.add('dragging');
      handle.setPointerCapture?.(pointerId);
      move(event);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('dblclick', () => {
      state_.railWidth = null;
      content.style.removeProperty('--dt-side-width');
    });
    return handle;
  }

  function _railSplitter(side) {
    const handle = document.createElement('div');
    handle.className = 'dt-rail-splitter';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.title = 'Drag to resize Explorer and Properties';
    let dragging = false;
    let pointerId = null;
    const minExplorer = 180;
    const minDetails = 170;
    const move = (event) => {
      if (!dragging) return;
      const rect = side.getBoundingClientRect();
      const maxExplorer = Math.max(minExplorer, rect.height - minDetails - handle.offsetHeight);
      const next = Math.max(minExplorer, Math.min(maxExplorer, event.clientY - rect.top));
      state_.railExplorerHeight = Math.round(next);
      side.style.setProperty('--dt-explorer-height', `${state_.railExplorerHeight}px`);
    };
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      if (pointerId != null) handle.releasePointerCapture?.(pointerId);
      pointerId = null;
    };
    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      pointerId = event.pointerId;
      handle.classList.add('dragging');
      handle.setPointerCapture?.(pointerId);
      move(event);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('dblclick', () => {
      state_.railExplorerHeight = null;
      side.style.removeProperty('--dt-explorer-height');
    });
    return handle;
  }

  function renameSnapshot() {
    const snapshot = activeSnapshot();
    if (!snapshot) return;
    const name = window.prompt('Rename DataTree', snapshot.name || 'Untitled DataTree')?.trim();
    if (!name || name === snapshot.name) return;
    snapshot.name = name;
    _saveSoon();
    render();
  }

  async function deleteSnapshot() {
    const snapshot = activeSnapshot();
    if (!snapshot || state_.importing) return;
    const ok = await (modal.confirmInApp || modal.confirm)(
      'Delete DataTree',
      `Delete <strong>${_escape(snapshot.name || 'Untitled DataTree')}</strong>? This removes the saved snapshot file.`,
    );
    if (!ok) return;
    _releaseSnapshotPayload(snapshot, snapshot.id === state_.activeSnapshotId);
    _releaseHeavyRenderState({ unloadSnapshots: false });
    state_.snapshots = state_.snapshots.filter((item) => item.id !== snapshot.id);
    if (snapshot.storagePath) {
      window.__TAURI__.core.invoke('remove_path', { path: snapshot.storagePath }).catch(() => {});
      window.__TAURI__.core
        .invoke('remove_path', { path: _explorerSnapshotStoragePath(snapshot.storagePath) })
        .catch(() => {});
    }
    await _activateSnapshot(state_.snapshots[0]?.id ?? null);
    _saveSoon();
    render();
  }

  function _treePane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('main');
    pane.className = 'dt-tree-pane';
    const loading = Boolean(snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length);
    const status = loading
      ? state_.treeLoading
        ? 'Loading explorer tree...'
        : 'Queued for explorer load'
      : snapshot
        ? `${snapshot.nodeCount.toLocaleString()} instances · ${_fmtTime(snapshot.completedAt || snapshot.capturedAt)}`
        : 'Import an RBXLX or RBXMX file';
    pane.innerHTML = `<div class="dt-tree-toolbar"><div><span class="dt-tree-title">Data Model Explorer</span><small>${_escape(status)}</small></div><label class="dt-search"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg><input placeholder="Search" value="${_escape(state_.query)}" spellcheck="false"></label></div><div class="dt-tree-list"></div>`;
    const input = pane.querySelector('input');
    input?.addEventListener('input', () => {
      state_.query = input.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => _refreshTreeList(), 140);
    });
    _renderTreeList(pane.querySelector('.dt-tree-list'), snapshot);
    return pane;
  }

  function _renderTreeList(list, snapshot) {
    if (!list) return;
    _activeRowEl = null;
    list.replaceChildren();
    if (!snapshot) {
      list.innerHTML =
        '<div class="dt-empty">Import a saved place file to inspect its hierarchy.</div>';
      return;
    }
    if (!snapshot.byId && !snapshot.nodes?.length) {
      list.innerHTML = '<div class="dt-empty">Loading explorer tree...</div>';
      return;
    }
    const rows = _visibleRows(snapshot);
    if (!rows.length) {
      list.innerHTML = '<div class="dt-empty">No matching instances.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(_treeRow(snapshot, row.node, row.depth));
    if (state_.visibleOverflow > 0) fragment.appendChild(_overflowRow());
    list.appendChild(fragment);
  }

  function _refreshTreeList(snapshot = activeSnapshot()) {
    const list = _container()?.querySelector('.dt-tree-list');
    if (!list) return;
    const top = list.scrollTop;
    _renderTreeList(list, snapshot);
    list.scrollTop = top;
  }

  function _visibleRows(snapshot) {
    const query = state_.query.trim().toLowerCase();
    const rows = [];
    let total = 0;
    if (query) {
      for (const node of snapshot.nodes || []) {
        if (!_nodeMatches(node, query)) continue;
        total += 1;
        if (rows.length < MAX_RENDER_ROWS) rows.push({ node, depth: _depth(snapshot, node) });
      }
      state_.visibleOverflow = Math.max(0, total - rows.length);
      return rows;
    }
    const walk = (parentId, depth) => {
      for (const node of snapshot.children.get(parentId) || []) {
        total += 1;
        if (rows.length < MAX_RENDER_ROWS) rows.push({ node, depth });
        if (rows.length >= MAX_RENDER_ROWS) continue;
        if (state_.expanded.has(node.id)) walk(node.id, depth + 1);
      }
    };
    walk(0, 0);
    state_.visibleOverflow = Math.max(0, total - rows.length);
    return rows;
  }

  function _nodeMatches(node, query) {
    return (node.searchText || '').includes(query);
  }

  function _overflowRow() {
    const row = document.createElement('div');
    row.className = 'dt-overflow-row';
    row.textContent = `${state_.visibleOverflow.toLocaleString()} more instances hidden. Refine search or collapse branches.`;
    return row;
  }

  function _nodePath(snapshot, node) {
    const names = [];
    let current = node;
    while (current && names.length < 160) {
      names.unshift(String(current.name || current.className || 'Instance'));
      current = current.parentId ? snapshot?.byId?.get(current.parentId) : null;
    }
    return names.join('.');
  }

  function _depth(snapshot, node) {
    if (Number.isFinite(node?.depth)) return Number(node.depth);
    let depth = 0;
    let current = node;
    while (current?.parentId && snapshot.byId.has(current.parentId) && depth < 128) {
      depth += 1;
      current = snapshot.byId.get(current.parentId);
    }
    return depth;
  }

  function _treeRow(snapshot, node, depth) {
    const hasChildren = (snapshot.children.get(node.id) || []).length > 0;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `dt-tree-row${node.id === state_.activeNodeId ? ' active' : ''}`;
    row.dataset.nodeId = String(node.id);
    row.dataset.depth = String(depth);
    row.style.setProperty('--depth', depth);
    row.innerHTML = `<span class="dt-disclosure${state_.expanded.has(node.id) ? ' open' : ''}${hasChildren ? '' : ' empty'}">›</span>${_iconMarkup(_classIcon(node.className))}<span class="dt-node-name">${_escape(node.name)}</span><span class="dt-node-class">${_escape(node.className)}</span>`;
    if (node.id === state_.activeNodeId) _activeRowEl = row;
    row.addEventListener('click', () => _selectNode(node.id, row));
    row.querySelector('.dt-disclosure')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!hasChildren) return;
      _toggleNodeInPlace(snapshot, node, depth, row);
    });
    return row;
  }

  function _selectNode(id, rowEl = null) {
    if (state_.activeNodeId === id) return;
    state_.activeNodeId = id;
    const snapshot = activeSnapshot();
    const node = snapshot?.byId?.get(id);
    _log.info(`Selected node id=${id} class=${node?.className} name="${node?.name}"`);
    if (node) state_.previewTab = state_.previewReady ? _preferredPreviewTab(node) : 'raw';
    _cancelViewportBuild();
    if (snapshot) snapshot.activeNodeId = id;
    _activeRowEl?.classList.remove('active');
    _activeRowEl =
      rowEl || _container()?.querySelector(`.dt-tree-row[data-node-id="${String(id)}"]`) || null;
    _activeRowEl?.classList.add('active');
    if (state_.previewReady) _replace('.dt-preview-pane', _previewPane());
    _replace('.dt-details', _detailsPane());
    if (snapshot && node) _ensureNodeDetailsLoaded(snapshot, node).catch(() => {});
    if (!state_.previewReady) _schedulePreviewWarmup();
    _saveSoon();
  }

  function _replace(selector, node) {
    const current = _container()?.querySelector(selector);
    if (!current) return;
    _disposeViewports(current);
    current.replaceWith(node);
  }

  function _disposeViewports(scope) {
    scope?.querySelectorAll?.('.dt-viewport-canvas').forEach((canvas) => canvas.__dtDispose?.());
  }

  function _releaseHeavyRenderState({ unloadSnapshots = false, preserveWarmState = false } = {}) {
    const activeBuildScene = state_.viewportBuild.scene;
    _cancelViewportBuild();
    for (const scene of state_.sceneCache.values()) _releaseSceneCpuMesh(scene);
    _releaseSceneCpuMesh(activeBuildScene);
    state_.sceneCache.clear();
    state_.meshAssets.clear();
    for (const entry of state_.assetBlobs.values()) URL.revokeObjectURL(entry.url || entry);
    state_.assetBlobs.clear();
    state_.assetByteFetches.clear();
    state_.terrainCells.clear();
    state_.nodeDetailLoads.clear();
    state_.meshVersion += 1;
    if (!preserveWarmState) {
      state_.viewportCameras.clear();
      state_.viewportSummary.clear();
      state_.viewportAutoLoad = false;
      state_.viewportClickSelect = false;
      state_.visibleOverflow = 0;
      for (const snapshot of state_.snapshots) _stripHeavySnapshotValues(snapshot);
    }
    if (!unloadSnapshots) return;
    const activeId = state_.activeSnapshotId;
    for (const snapshot of state_.snapshots)
      _releaseSnapshotPayload(snapshot, snapshot.id === activeId);
  }

  function _isHeavySnapshotKey(key = '') {
    return /mesh|texture|content|image|asset|physics|serialized|modelmesh|sound|animation|template/i.test(
      String(key || ''),
    );
  }

  function _stripHeavySnapshotValues(snapshot) {
    if (!snapshot?.nodes?.length) return;
    let stripped = false;
    for (const node of snapshot.nodes) {
      for (const bag of [node.properties, node.attributes]) {
        for (const [key, value] of Object.entries(bag || {})) {
          if (
            typeof value === 'string' &&
            value.length > 512 &&
            (_isHeavySnapshotKey(key) || bag === node.attributes)
          ) {
            bag[key] = `__dt_heavy__:${value.length} bytes preserved in native snapshot`;
            stripped = true;
          }
        }
      }
    }
    if (stripped) {
      snapshot.heavyLoaded = false;
    }
  }

  function _releaseSnapshotPayload(snapshot, persistState = false) {
    if (!snapshot?.storagePath) return;
    if (persistState) _persistSnapshotState(snapshot);
    delete snapshot.nodes;
    delete snapshot.byId;
    delete snapshot.children;
    delete snapshot.searchIndex;
  }

  function _toggleNode(id) {
    if (state_.expanded.has(id)) state_.expanded.delete(id);
    else state_.expanded.add(id);
  }

  function _toggleNodeInPlace(snapshot, node, depth, row) {
    const wasOpen = state_.expanded.has(node.id);
    _toggleNode(node.id);
    _persistSnapshotState(snapshot);
    if (state_.query.trim() || state_.visibleOverflow > 0) {
      _refreshTreeList(snapshot);
      return;
    }
    row.querySelector('.dt-disclosure')?.classList.toggle('open', !wasOpen);
    if (wasOpen) {
      _removeRenderedChildren(row, depth);
      return;
    }
    const rows = _descendantRows(snapshot, node.id, depth + 1);
    const currentRows = _container()?.querySelectorAll('.dt-tree-row').length || 0;
    if (currentRows + rows.length > MAX_RENDER_ROWS) {
      _refreshTreeList(snapshot);
      return;
    }
    row.after(...rows.map((item) => _treeRow(snapshot, item.node, item.depth)));
  }

  function _removeRenderedChildren(row, depth) {
    let next = row.nextElementSibling;
    while (next?.classList?.contains('dt-tree-row') && Number(next.dataset.depth || 0) > depth) {
      const current = next;
      next = next.nextElementSibling;
      current.remove();
    }
  }

  function _descendantRows(snapshot, parentId, depth) {
    const rows = [];
    const walk = (id, rowDepth) => {
      for (const child of snapshot.children.get(id) || []) {
        rows.push({ node: child, depth: rowDepth });
        if (rows.length >= MAX_RENDER_ROWS) return;
        if (state_.expanded.has(child.id)) walk(child.id, rowDepth + 1);
        if (rows.length >= MAX_RENDER_ROWS) return;
      }
    };
    walk(parentId, depth);
    return rows;
  }

  function _classIcon(className = '') {
    const klass = String(className || 'Instance');
    const key = _iconKey(klass);
    return {
      glyph: klass.slice(0, 1).toUpperCase() || 'I',
      src: key ? state_.meta.icons[key] : '',
    };
  }

  function _iconKey(klass) {
    const icons = state_.meta.icons || {};
    if (icons[klass]) return klass;
    const alias = ICON_ALIASES[klass];
    if (alias && icons[alias]) return alias;
    if (/module/i.test(klass) && icons.ModuleScript) return 'ModuleScript';
    if (/localscript/i.test(klass) && icons.LocalScript) return 'LocalScript';
    if (/script/i.test(klass) && icons.Script) return 'Script';
    if (/value$/i.test(klass) && icons.Value) return 'Value';
    if (/folder|configuration/i.test(klass) && icons.Folder) return 'Folder';
    if (/model|accessory|character/i.test(klass) && icons.Model) return 'Model';
    if (/mesh/i.test(klass) && icons.MeshPart) return 'MeshPart';
    if (/part|seat|spawn|wedge|union/i.test(klass) && icons.Part) return 'Part';
    if (/texture/i.test(klass) && icons.Texture) return 'Texture';
    if (/decal/i.test(klass) && icons.Decal) return 'Decal';
    if (/sound|audio/i.test(klass) && icons.Sound) return 'Sound';
    if (/image/i.test(klass) && icons.ImageLabel) return 'ImageLabel';
    if (/gui|frame|button|label/i.test(klass) && icons.Frame) return 'Frame';
    return icons.Class ? 'Class' : '';
  }

  function _iconMarkup(icon, className = 'dt-node-icon') {
    const key = `${className}|${icon.src || ''}|${icon.glyph || ''}`;
    const cached = state_.meta.iconHtml.get(key);
    if (cached) return cached;
    const html = icon.src
      ? `<span class="${className} has-icon" data-glyph="${_escape(icon.glyph)}"><img src="${_escape(icon.src)}" alt="" loading="lazy" decoding="async" draggable="false"></span>`
      : `<span class="${className} missing" data-glyph="${_escape(icon.glyph)}"></span>`;
    state_.meta.iconHtml.set(key, html);
    return html;
  }

  function _previewPane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('main');
    pane.className = 'dt-preview-pane';
    if (snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length) {
      pane.innerHTML =
        '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Preview paused</span><p>Explorer and inspector are loading before preview work starts.</p></div>';
      return pane;
    }
    const node =
      snapshot?.byId?.get(state_.activeNodeId) ||
      (snapshot?.rootId ? snapshot.byId.get(snapshot.rootId) : null);
    if (!snapshot || !node) {
      pane.innerHTML =
        '<div class="dt-preview-empty"><span>No DataTree Loaded</span><p>Import an RBXLX or RBXMX file to inspect its hierarchy.</p></div>';
      return pane;
    }
    if (!state_.previewReady) {
      pane.innerHTML =
        '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Explorer first</span><p>Select instances freely. Raw inspection wakes up after the side tree paints.</p></div>';
      return pane;
    }
    const previewKind = _previewKind(node);
    const tabs = _previewTabs(node, previewKind);
    if (!tabs.includes(state_.previewTab))
      state_.previewTab = _preferredPreviewTab(node, previewKind);
    pane.innerHTML = `<div class="dt-preview-head"><div><span>${_escape(node.name)}</span><small>${_escape(node.className)} · ${_escape(_nodePath(snapshot, node))}</small></div><strong>${_escape(previewKind.label)}</strong></div><div class="dt-preview-tools">${tabs.map((tab) => `<button class="${state_.previewTab === tab ? 'active' : ''}" type="button" data-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div><div class="dt-preview-body"></div>`;
    pane.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state_.previewTab = button.dataset.tab || 'viewport';
        _replace('.dt-preview-pane', _previewPane());
      });
    });
    pane.querySelector('.dt-preview-body')?.append(_previewPanel(node, previewKind));
    return pane;
  }

  function _previewDormantPane() {
    const pane = document.createElement('main');
    pane.className = 'dt-preview-pane dt-preview-pane--dormant';
    pane.innerHTML =
      '<div class="dt-preview-empty dt-preview-empty--deferred"><span>Explorer first</span><p>The 3D viewport is idle. Select instances; raw inspection will wake after the side tree is ready.</p></div>';
    return pane;
  }

  function _previewPanel(node, previewKind) {
    if (state_.previewTab === 'script') return _scriptPanel(node);
    if (state_.previewTab === 'asset') return _assetPanel(node);
    if (state_.previewTab === 'raw') return _rawPanel(node);
    return _viewportPanel(node, previewKind);
  }

  function _viewportPanel(node, previewKind) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--viewport';
    const snapshot = activeSnapshot();
    if (!state_.viewportAutoLoad) {
      const summaryKey = _viewportSummaryKey(snapshot, node);
      const summary = state_.viewportSummary.get(summaryKey);
      const summaryText = summary
        ? `${summary.parts.toLocaleString()} renderable instances · ${summary.assets.toLocaleString()} external mesh IDs · built only when requested.`
        : '3D stays completely idle until you press Load 3D.';
      wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--prompt"><div class="dt-render-grid"></div><div class="dt-preview-copy"><span>Load 3D preview?</span><p data-summary-key="${_escape(summaryKey)}">${_escape(summaryText)}</p><div class="dt-render-actions"><button type="button" class="dt-btn dt-btn-primary" data-action="load-viewport">Load 3D</button><button type="button" class="dt-icon-action" data-action="skip-viewport">Stay light</button></div></div></section>`;
      wrap.querySelector('[data-action="load-viewport"]')?.addEventListener('click', () => {
        state_.viewportAutoLoad = true;
        _replace('.dt-preview-pane', _previewPane());
      });
      wrap.querySelector('[data-action="skip-viewport"]')?.addEventListener('click', () => {
        state_.previewTab = 'raw';
        _replace('.dt-preview-pane', _previewPane());
      });
      return wrap;
    }
    const buildKey = _viewportBuildKey(snapshot, node);
    const job = state_.viewportBuild.key === buildKey ? state_.viewportBuild : null;
    const scene = job?.status === 'ready' ? job.scene : state_.sceneCache.get(buildKey);
    if (!scene) {
      const activeJob = job || {
        progress: 0.02,
        message: 'Preparing 3D preview',
        startedAt: performance.now(),
      };
      wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--loading"><div class="dt-render-grid"></div>${_viewportProgressMarkup(activeJob, buildKey)}</section>`;
      requestAnimationFrame(() => _ensureViewportBuild(snapshot, node, buildKey));
      return wrap;
    }
    if (!(scene.partCount || scene.parts.length) || !scene.mesh.visualVertexCount) {
      wrap.innerHTML = `<section class="dt-render-frame"><div class="dt-render-grid"></div><div class="dt-preview-copy"><span>${_escape(previewKind.title)}</span><p>${_escape(previewKind.body)}</p></div></section>`;
      return wrap;
    }
    const assetStats = scene.assetCount
      ? `<span>${scene.assetReady.toLocaleString()}/${scene.assetCount.toLocaleString()} meshes</span>${scene.assetFailed ? `<span>${scene.assetFailed.toLocaleString()} unavailable</span>` : ''}`
      : '';
    const omittedStats = scene.omittedParts
      ? `<span>${scene.omittedParts.toLocaleString()} deferred</span>`
      : '';
    const assetProgress = _viewportProgressMarkup(job || state_.viewportBuild, buildKey, 'asset');
    const skyTop = scene.sky?.cssTop || VIEWPORT_BACKDROP_SKY.cssTop;
    const skyBottom = scene.sky?.cssBottom || VIEWPORT_BACKDROP_SKY.cssBottom;
    const skyStyle = `--dt-sky-top:${skyTop};--dt-sky-bottom:${skyBottom}`;
    wrap.innerHTML = `<section class="dt-render-frame dt-render-frame--canvas" style="${skyStyle}"><canvas class="dt-viewport-canvas" data-build-key="${_escape(buildKey)}" aria-label="3D preview"></canvas><div class="dt-render-stats" data-render-stats="${_escape(buildKey)}"><span>${(scene.partCount || scene.parts.length).toLocaleString()} parts</span><span>${(scene.mesh.visualTriangleCount || scene.mesh.triangleCount).toLocaleString()} tris</span>${assetStats}${omittedStats}</div>${assetProgress}<div class="dt-render-hint">Drag/right-drag look · WASD fly · Q/E up/down · Shift fast · Scroll forward · F focus · Dbl-click reset<button type="button" class="dt-click-select-toggle${state_.viewportClickSelect ? ' active' : ''}" title="Click parts in viewport to select them in the tree">Click Select</button></div></section>`;
    wrap.querySelector('.dt-click-select-toggle')?.addEventListener('click', () => {
      state_.viewportClickSelect = !state_.viewportClickSelect;
      wrap
        .querySelector('.dt-click-select-toggle')
        ?.classList.toggle('active', state_.viewportClickSelect);
    });
    requestAnimationFrame(() => {
      _mountViewport(
        wrap.querySelector('.dt-viewport-canvas'),
        scene,
        _viewportCameraKey(snapshot, node),
      );
      _loadViewportAssets(scene.assets, node.id, buildKey, state_.viewportBuild.token);
      // Release CPU mesh only AFTER _mountViewport has uploaded it to the GPU.
      _releaseSceneCpuMesh(scene);
      state_.sceneCache.delete(buildKey);
      state_.viewportBuild.activeAssetKeys = _sceneAssetKeys(scene);
      if (state_.viewportBuild.scene === scene) state_.viewportBuild.scene = null;
    });
    return wrap;
  }

  function _viewportCameraKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}`;
  }

  function _defaultViewportCamera(scene) {
    const d = Math.max(3, scene.extent * 2.2);

    const yaw = -0.72;
    const pitch = 0.38;
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    return {
      x: scene.center[0] + sy * cp * d,
      y: scene.center[1] - sp * d + scene.extent * 0.1,
      z: scene.center[2] + cy * cp * d,
      yaw: yaw + Math.PI,
      pitch: -pitch,
      distance: d,
      panX: 0,
      panY: 0,
    };
  }

  function _saveViewportCamera(key, camera) {
    if (!key || !camera) return;
    state_.viewportCameras.set(key, {
      x: camera.x,
      y: camera.y,
      z: camera.z,
      yaw: camera.yaw,
      pitch: camera.pitch,
      distance: camera.distance,
      panX: camera.panX,
      panY: camera.panY,
    });
    while (state_.viewportCameras.size > 32)
      state_.viewportCameras.delete(state_.viewportCameras.keys().next().value);
  }

  const _yieldFrame = () =>
    new Promise((resolve) => {
      if (window.requestIdleCallback) window.requestIdleCallback(() => resolve(), { timeout: 50 });
      else if (window.requestAnimationFrame) window.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });

  function _viewportBuildKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}:${state_.meshVersion}`;
  }

  function _viewportSummaryKey(snapshot, node) {
    return `${snapshot?.id || 'snapshot'}:${node?.id || 'node'}`;
  }

  function _activeViewportBuildKey() {
    return _viewportBuildKey(activeSnapshot(), activeSnapshot()?.byId?.get(state_.activeNodeId));
  }

  function _cancelViewportBuild() {
    if (state_.viewportBuild.assetRetryTimer) clearTimeout(state_.viewportBuild.assetRetryTimer);
    state_.viewportBuild.token = (state_.viewportBuild.token || 0) + 1;
    state_.viewportBuild.status = 'idle';
    state_.viewportBuild.key = '';
    state_.viewportBuild.scene = null;
    state_.viewportBuild.renderSnapshot = null;
    state_.viewportBuild.renderNodeId = null;
    state_.viewportBuild.assetRetryTimer = null;
    state_.viewportBuild.activeAssetKeys = new Set();
  }

  function _isViewportBuildActive(key, token) {
    return !!key && state_.viewportBuild.key === key && state_.viewportBuild.token === token;
  }

  function _updateViewportBuild(key, patch) {
    if (state_.viewportBuild.key !== key) return;
    Object.assign(state_.viewportBuild, patch);
    _paintViewportProgress(key);
  }

  function _etaText(startedAt, progress) {
    if (!startedAt || progress <= 0.03 || progress >= 0.98) return 'Estimating time...';
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, (elapsed / progress) * (1 - progress));
    if (remaining < 1000) return 'Almost done';
    return `About ${Math.ceil(remaining / 1000)}s remaining`;
  }

  function _viewportProgressMarkup(job, key, mode = 'block') {
    const progress = Math.max(0.02, Math.min(1, job?.progress || 0.02));
    const pct = Math.round(progress * 100);
    const message = job?.message || 'Preparing 3D preview';
    const cls = `dt-viewport-loading${mode === 'asset' ? ' dt-viewport-loading--asset' : ''}`;
    return `<div class="${cls}" data-build-key="${_escape(key)}"><strong>${_escape(message)}</strong><p>${_escape(_etaText(job?.startedAt, progress))}</p><div class="dt-progress-track"><span style="width:${pct}%"></span></div><small>${pct}%</small></div>`;
  }

  function _paintViewportProgress(key) {
    const job = state_.viewportBuild;
    if (job.key !== key) return;
    const el = _container()?.querySelector(
      `.dt-viewport-loading[data-build-key="${_cssEscape(key)}"]`,
    );
    if (!el) return;
    const progress = Math.max(0.02, Math.min(1, job.progress || 0.02));
    const pct = Math.round(progress * 100);
    const strong = el.querySelector('strong');
    const p = el.querySelector('p');
    const bar = el.querySelector('.dt-progress-track span');
    const small = el.querySelector('small');
    if (strong) strong.textContent = job.message || 'Preparing 3D preview';
    if (p) p.textContent = _etaText(job.startedAt, progress);
    if (bar) bar.style.width = `${pct}%`;
    if (small) small.textContent = `${pct}%`;
    const isAssetPill = el.classList.contains('dt-viewport-loading--asset');
    el.hidden = isAssetPill && (job.status === 'ready' || job.progress >= 1);
  }

  async function _ensureViewportSummary(snapshot, node, key) {
    if (!snapshot || !node || state_.viewportSummary.has(key)) return;
    const token = state_.viewportBuild.token;
    if (snapshot.storagePath) {
      try {
        const summary = await window.__TAURI__.core.invoke('viewport_summary', {
          path: snapshot.storagePath,
          rootId: node.id,
        });
        if (token !== state_.viewportBuild.token) return;
        const nativeSummary = {
          parts: Number(summary.renderableParts) || 0,
          assets: Number(summary.externalMeshReferences) || 0,
          processed: Number(summary.processedNodes) || 0,
        };
        state_.viewportSummary.set(key, nativeSummary);
        const el = _container()?.querySelector(`[data-summary-key="${_cssEscape(key)}"]`);
        if (el) {
          el.textContent = `${nativeSummary.parts.toLocaleString()} renderable instances · ${nativeSummary.assets.toLocaleString()} external mesh IDs · built only when requested.`;
        }
        return;
      } catch (err) {
        _log.warn(`Native viewport summary failed; using JS fallback: ${_errMsg(err)}`);
      }
    }
    let parts = 0;
    let assets = 0;
    let processed = 0;
    const stack = [node];
    while (stack.length) {
      if (token !== state_.viewportBuild.token) return;
      const start = performance.now();
      while (stack.length && performance.now() - start < 7) {
        const current = stack.pop();
        processed += 1;
        const children = snapshot.children.get(current.id) || [];
        if (_isRenderablePart(current.className)) {
          parts += 1;
          const mesh = _meshDescriptor(current, _meshChildFor(children));
          if (mesh?.id && !mesh.embedded) assets += 1;
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      await _yieldFrame();
    }
    state_.viewportSummary.set(key, { parts, assets, processed });
    const el = _container()?.querySelector(`[data-summary-key="${_cssEscape(key)}"]`);
    if (el) {
      el.textContent = `${parts.toLocaleString()} renderable instances · ${assets.toLocaleString()} external mesh IDs · built only when requested.`;
    }
  }

  function _ensureViewportBuild(snapshot, node, key) {
    if (!state_.visible) return;
    if (!snapshot || !node) return;
    const current = state_.viewportBuild;
    if (current.key === key && (current.status === 'scanning' || current.status === 'building')) {
      return;
    }
    const cached = state_.sceneCache.get(key);
    if (cached) {
      state_.viewportBuild = {
        key,
        token: current.token,
        status: 'ready',
        progress: 1,
        message: '3D preview ready',
        startedAt: performance.now(),
        scene: cached,
        assetRetryTimer: null,
        activeAssetKeys: _sceneAssetKeys(cached),
      };
      return;
    }
    const token = (current.token || 0) + 1;
    state_.viewportBuild = {
      key,
      token,
      status: 'scanning',
      progress: 0.02,
      message: 'Scanning geometry',
      startedAt: performance.now(),
      scene: null,
      renderSnapshot: null,
      renderNodeId: node.id,
      assetRetryTimer: null,
      activeAssetKeys: new Set(),
    };
    _buildViewportSceneProgressive(snapshot, node, key, token).catch((err) => {
      if (state_.viewportBuild.key !== key || state_.viewportBuild.token !== token) return;
      _updateViewportBuild(key, {
        status: 'error',
        progress: 1,
        message: err?.message || '3D preview failed',
      });
    });
  }

  async function _buildViewportSceneProgressive(snapshot, node, key, token) {
    if (!state_.visible) return;
    let renderSnapshot = snapshot;
    let renderNode = node;
    if (snapshot.storagePath) {
      _updateViewportBuild(key, {
        status: 'scanning',
        progress: 0.03,
        message: 'Loading renderable geometry',
      });
      renderSnapshot = await _loadRenderSnapshot(snapshot, node);
      renderNode = renderSnapshot.byId?.get(node.id) || renderNode;
      if (
        !state_.visible ||
        state_.viewportBuild.token !== token ||
        state_.viewportBuild.key !== key
      ) {
        return;
      }
    }
    state_.viewportBuild.renderSnapshot = renderSnapshot;
    state_.viewportBuild.renderNodeId = renderNode.id;
    const parts = [];
    const stack = [renderNode];
    let scanned = 0;
    while (stack.length) {
      if (
        !state_.visible ||
        state_.viewportBuild.token !== token ||
        state_.viewportBuild.key !== key
      )
        return;
      const sliceStart = performance.now();
      while (stack.length && performance.now() - sliceStart < 8) {
        const current = stack.pop();
        scanned += 1;
        const children = renderSnapshot.children.get(current.id) || [];
        if (/^terrain$/i.test(String(current.className || ''))) {
          const terrainParts = await _terrainToPartsAsync(current);
          for (const tp of terrainParts) parts.push(tp);
        } else if (_isRenderablePart(current.className)) {
          const part = _nodePart(
            current,
            _meshChildFor(children),
            renderSnapshot,
            _surfaceTextureFor(children),
            _surfaceAppearanceFor(children),
          );
          if (part) parts.push(part);
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      _updateViewportBuild(key, {
        status: 'scanning',
        progress: Math.min(
          0.22,
          0.02 + (scanned / Math.max(renderSnapshot.nodeCount || 1, 1)) * 0.22,
        ),
        message: `Scanning geometry · ${parts.length.toLocaleString()} renderables`,
      });
      await _yieldFrame();
    }

    _updateViewportBuild(key, {
      status: 'building',
      progress: 0.25,
      message: `Building preview · ${parts.length.toLocaleString()} renderables`,
    });
    const scene = await _buildSceneProgressive(parts, key, token, renderSnapshot);
    if (!state_.visible || state_.viewportBuild.token !== token || state_.viewportBuild.key !== key)
      return;
    state_.sceneCache.set(key, scene);
    _trimSceneCache();
    _updateViewportBuild(key, {
      status: 'ready',
      progress: 1,
      message: '3D preview ready',
      scene,
    });
    if (
      activeSnapshot()?.id === snapshot.id &&
      state_.activeNodeId === node.id &&
      state_.previewTab === 'viewport'
    ) {
      _replace('.dt-preview-pane', _previewPane());
    }
  }

  async function _buildSceneProgressive(parts, key, token, snapshot = null) {
    if (!parts.length) return { ..._emptyScene(), sky: _sceneSky(snapshot) };
    const budget = _sceneBudget(parts.length);
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = _pointCollector();
    const assetMap = new Map();
    const readyAssets = new Set();
    const failedAssets = new Set();
    const aabbs = [];
    let omittedParts = 0;
    for (let i = 0; i < parts.length; i += 1) {
      if (
        !state_.visible ||
        state_.viewportBuild.token !== token ||
        state_.viewportBuild.key !== key
      )
        return _emptyScene();
      if (mesh.visualVertexCount() >= budget.maxVertices) {
        omittedParts = parts.length - i;
        break;
      }
      const part = parts[i];
      const assetKey = _meshAssetKey(part.mesh);
      if (assetKey) {
        assetMap.set(assetKey, part.mesh);
        const cached = state_.meshAssets.get(assetKey);
        if (cached?.status === 'ready') {
          cached.lastUsed = Date.now();
          readyAssets.add(assetKey);
        }
        if (cached?.status === 'failed') failedAssets.add(assetKey);
      }

      mesh.setFlag(part.matFlag || 0);
      mesh.setMatId(part.matId || 0);
      const before = points.length;
      points.beginPart();
      _emitPart(part, mesh, points, budget);

      if (points.length > before && part.id) {
        aabbs.push({ partId: part.id, ...points.endPart() });
      } else {
        points.endPart();
      }

      if (i % 96 === 0) {
        _updateViewportBuild(key, {
          status: 'building',
          progress: 0.25 + (i / Math.max(parts.length, 1)) * 0.65,
          message: `Building preview · ${i.toLocaleString()}/${parts.length.toLocaleString()} parts`,
        });
        await _yieldFrame();
      }
    }
    if (!points.length) {
      const lights = _sceneLights(snapshot, parts);
      return {
        ..._emptyScene(),
        partCount: parts.length,
        assets: [...assetMap.values()],
        assetCount: assetMap.size,
        assetReady: readyAssets.size,
        assetFailed: failedAssets.size,
        omittedParts,
        aabbs,
        lights,
        lightProfile: _sceneLightProfile(lights),
        sky: _sceneSky(snapshot),
      };
    }
    const bounds = _bounds(points);
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    const lights = _sceneLights(snapshot, parts);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts: [],
      partCount: parts.length,
      assets: [...assetMap.values()],
      assetCount: assetMap.size,
      assetReady: readyAssets.size,
      assetFailed: failedAssets.size,
      omittedParts,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
      aabbs,
      lights,
      lightProfile: _sceneLightProfile(lights, bounds),
      sky: _sceneSky(snapshot),
    };
  }

  function _viewportScene(snapshot, node) {
    if (!snapshot || !node) return _emptyScene();
    const parts = _collectRenderableParts(snapshot, node);
    const signature = parts
      .map((part) => _meshAssetKey(part.mesh))
      .filter(Boolean)
      .sort()
      .map((key) => `${key}:${state_.meshAssets.get(key)?.status || 'new'}`)
      .join('|');
    const key = `${snapshot.id}:${node.id}:${parts.length}:${signature}`;
    const cached = state_.sceneCache.get(key);
    if (cached) {
      _log.info(`Scene cache hit: ${parts.length} parts`);
      return cached;
    }
    _log.info(
      `Building scene for node id=${node.id} class=${node.className}: ${parts.length} parts`,
    );
    const scene = _buildScene(parts);
    _log.info(
      `Scene built: ${scene.mesh.visualVertexCount || scene.mesh.vertexCount} verts, ${scene.mesh.visualTriangleCount || scene.mesh.triangleCount} tris, ${scene.assetCount} asset(s) (${scene.assetReady} ready, ${scene.assetFailed} failed), ${scene.omittedParts} deferred`,
    );
    state_.sceneCache.set(key, scene);
    _trimSceneCache();
    return scene;
  }

  function _computeViewportSummary(snapshot, node) {
    if (!snapshot || !node) return { parts: 0, assets: 0 };
    let parts = 0;
    let assets = 0;
    const stack = [node];
    while (stack.length) {
      const current = stack.pop();
      const children = snapshot.children.get(current.id) || [];
      if (_isRenderablePart(current.className)) {
        parts += 1;
        const mesh = _meshDescriptor(current, _meshChildFor(children));
        if (mesh?.id && !mesh.embedded) assets += 1;
      }
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    return { parts, assets };
  }

  function _collectRenderableParts(snapshot, node) {
    const parts = [];
    const stack = [node];
    while (stack.length) {
      const current = stack.pop();
      const children = snapshot.children.get(current.id) || [];
      if (/^terrain$/i.test(String(current.className || ''))) {
        const terrainParts = _terrainToParts(current);
        for (const tp of terrainParts) parts.push(tp);
      } else if (_isRenderablePart(current.className)) {
        const part = _nodePart(
          current,
          _meshChildFor(children),
          snapshot,
          _surfaceTextureFor(children),
          _surfaceAppearanceFor(children),
        );
        if (part) parts.push(part);
      }
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    return parts;
  }

  function _trimSceneCache() {
    while (state_.sceneCache.size > 1) {
      const key = state_.sceneCache.keys().next().value;
      _releaseSceneCpuMesh(state_.sceneCache.get(key));
      state_.sceneCache.delete(key);
    }
    let vertices = [...state_.sceneCache.values()].reduce(
      (sum, scene) => sum + (scene.mesh?.vertexCount || 0),
      0,
    );
    while (vertices > 2400000 && state_.sceneCache.size > 1) {
      const key = state_.sceneCache.keys().next().value;
      const scene = state_.sceneCache.get(key);
      vertices -= scene?.mesh?.vertexCount || 0;
      _releaseSceneCpuMesh(scene);
      state_.sceneCache.delete(key);
    }
  }

  function _releaseSceneCpuMesh(scene) {
    if (!scene) return;
    for (const mesh of [scene.mesh, scene.guide]) {
      if (!mesh) continue;
      mesh.positions = new Float32Array(0);
      mesh.normals = new Float32Array(0);
      mesh.colors = new Float32Array(0);
      mesh.flags = new Float32Array(0);
      mesh.matIds = new Float32Array(0);
      for (const group of mesh.textured || []) {
        group.positions = new Float32Array(0);
        group.normals = new Float32Array(0);
        group.colors = new Float32Array(0);
        group.uvs = new Float32Array(0);
        group.flags = new Float32Array(0);
      }
      mesh.textured = [];
    }
    scene.parts = [];
  }

  function _clearSceneCache() {
    for (const scene of state_.sceneCache.values()) _releaseSceneCpuMesh(scene);
    state_.sceneCache.clear();
  }

  function _emptyScene() {
    return {
      parts: [],
      assets: [],
      assetCount: 0,
      assetReady: 0,
      assetFailed: 0,
      omittedParts: 0,
      mesh: {
        vertexCount: 0,
        triangleCount: 0,
        visualVertexCount: 0,
        visualTriangleCount: 0,
        textured: [],
      },
      guide: { vertexCount: 0 },
      textured: [],
      center: [0, 0, 0],
      extent: 1,
      aabbs: [],
      lights: [],
      lightProfile: { indirect: [0, 0, 0], energy: 0 },
      sky: _sceneSky(activeSnapshot()),
    };
  }

  function _sceneSky(snapshot) {
    return {
      top: [235, 237, 241],
      bottom: [205, 209, 216],
      cssTop: 'rgb(235 237 241)',
      cssBottom: 'rgb(205 209 216)',
      rain: 0,
      wind: 0,
      effects: {
        exposure: 1,
        contrast: 0,
        saturation: 0,
        tint: [255, 255, 255],
        ambientLift: 0,
        shadowLift: 0,
        bloom: 0,
      },
      ambient: {
        sky: [156, 156, 156],
        ground: [76, 76, 76],
      },
      sun: {
        direction: _norm([0.48, 0.82, 0.31]),
        color: [255, 255, 255],
        strength: 0.92,
      },
    };
  }

  function _neutralizeRgb(rgb, amount = 0.85) {
    const lum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    return _mixRgb(rgb, [lum, lum, lum], Math.max(0, Math.min(1, amount)));
  }

  function _sceneSun(props, skyColor = [126, 151, 178]) {
    const clockRaw = _firstProp(props, ['ClockTime']);
    let clock = Number(clockRaw);
    if (!Number.isFinite(clock)) {
      const tod = String(_firstProp(props, ['TimeOfDay']) || '').match(/(\d+):(\d+):?(\d+)?/);
      clock = tod ? Number(tod[1]) + Number(tod[2] || 0) / 60 + Number(tod[3] || 0) / 3600 : 14;
    }
    clock = ((clock % 24) + 24) % 24;
    const daylight = Math.max(0, Math.sin(((clock - 6) / 12) * Math.PI));
    const azimuth = (clock / 24) * Math.PI * 2 - Math.PI * 0.5;
    const elevation = Math.max(-0.12, Math.sin(((clock - 6) / 12) * Math.PI));
    const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
    const dir = _norm([Math.cos(azimuth) * horizontal, elevation, Math.sin(azimuth) * horizontal]);
    const warm = [255, 204, 150];
    const noon = _mixRgb(skyColor, [255, 248, 236], 0.82);
    const warmth = 1 - Math.pow(daylight, 0.42);
    return {
      direction: dir,
      color: _mixRgb(noon, warm, Math.min(0.78, warmth)),
      strength: 0.34 + daylight * 0.94,
    };
  }

  function _sceneLights(snapshot, parts = []) {
    const nodes = snapshot?.nodes || [];
    if (!nodes.length || !parts.length) return [];
    const partById = new Map(parts.map((part) => [part.id, part]));
    const lights = [];
    for (const node of nodes) {
      const className = String(node.className || '').toLowerCase();
      if (!/^(pointlight|spotlight|surfacelight)$/.test(className)) continue;
      const host = partById.get(node.parentId);
      if (!host?.center) continue;
      const props = node.properties || {};
      const enabled = String(_firstProp(props, ['Enabled']) ?? 'true').toLowerCase();
      if (enabled === 'false' || enabled === '0') continue;
      const brightness = Math.max(0, Math.min(10, Number(_firstProp(props, ['Brightness'])) || 1));
      const range = Math.max(4, Math.min(220, Number(_firstProp(props, ['Range'])) || 16));
      const color = _parseColor(_firstProp(props, ['Color']) || '255 244 214');
      const face = _firstProp(props, ['Face']) || 'Front';
      const angle = Math.max(1, Math.min(180, Number(_firstProp(props, ['Angle'])) || 45));
      const kind = className === 'spotlight' ? 1 : className === 'surfacelight' ? 2 : 0;
      const direction = kind ? _partFaceDirection(host, face) : [0, 0, 0];
      const position = kind ? _partFacePosition(host, face) : host.center.slice();
      const intensity = Math.min(2.5, 0.48 + brightness * 0.42);
      lights.push({
        position,
        direction,
        kind,
        coneCos: kind === 1 ? Math.cos((angle * Math.PI) / 360) : 0,
        color: color.map((item) => (item / 255) * intensity),
        intensity,
        range,
      });
    }
    lights.sort((a, b) => b.intensity * Math.sqrt(b.range) - a.intensity * Math.sqrt(a.range));
    return lights.slice(0, MAX_SCENE_LIGHTS);
  }

  function _sceneLightProfile(lights = [], bounds = null) {
    if (!lights.length) return { indirect: [0, 0, 0], energy: 0 };
    const diagonal = bounds
      ? Math.max(
          1,
          Math.hypot(
            bounds.max[0] - bounds.min[0],
            bounds.max[1] - bounds.min[1],
            bounds.max[2] - bounds.min[2],
          ),
        )
      : 48;
    let total = 0;
    const weighted = [0, 0, 0];
    for (const light of lights) {
      const weight = (light.intensity || 1) * Math.sqrt(Math.max(light.range || 1, 1));
      total += weight;
      weighted[0] += (light.color?.[0] || 0) * weight;
      weighted[1] += (light.color?.[1] || 0) * weight;
      weighted[2] += (light.color?.[2] || 0) * weight;
    }
    const average = total ? weighted.map((item) => item / total) : [0, 0, 0];
    const density = Math.min(1, total / Math.max(18, diagonal * 0.72));
    const indirectStrength = Math.min(0.56, 0.08 + density * 0.48);
    return {
      indirect: average.map((item) => item * indirectStrength),
      energy: density,
    };
  }

  function _lightFaceLocal(face) {
    const key = String(face || '')
      .trim()
      .toLowerCase();
    if (key === 'right' || key === '0') return [1, 0, 0];
    if (key === 'top' || key === '1') return [0, 1, 0];
    if (key === 'back' || key === '2') return [0, 0, 1];
    if (key === 'left' || key === '3') return [-1, 0, 0];
    if (key === 'bottom' || key === '4') return [0, -1, 0];
    return [0, 0, -1];
  }

  function _partFaceDirection(part, face) {
    const local = _lightFaceLocal(face);
    return _partNormal(part, local);
  }

  function _partFacePosition(part, face) {
    const local = _lightFaceLocal(face);
    return _partPoint(part, [local[0] * 0.5, local[1] * 0.5, local[2] * 0.5]);
  }

  function _mixRgb(a, b, t) {
    const weight = Math.max(0, Math.min(1, t));
    return [0, 1, 2].map((index) => Math.round(a[index] * (1 - weight) + b[index] * weight));
  }

  function _boostRgb(rgb, amount) {
    return rgb.map((item) => Math.max(0, Math.min(255, Math.round(item * amount))));
  }

  function _rgbCss(rgb) {
    return `rgb(${rgb.map((item) => Math.max(0, Math.min(255, Math.round(item)))).join(' ')})`;
  }

  function _isRenderablePart(className = '') {
    return /^(part|meshpart|unionoperation|intersectoperation|negateoperation|wedgepart|cornerwedgepart|trusspart|seat|vehicleseat|spawnlocation|terrain)$/i.test(
      String(className || ''),
    );
  }

  const _TERRAIN_COLORS = {
    0: [106, 127, 63],
    1: [106, 127, 63],
    2: [198, 176, 133],
    3: [102, 92, 78],
    4: [132, 123, 110],
    5: [141, 154, 158],
    6: [130, 160, 130],
    7: [106, 127, 63],
    8: [214, 210, 205],
    9: [160, 140, 110],
    10: [140, 82, 43],
    11: [161, 154, 147],
    12: [192, 172, 135],
    13: [100, 80, 60],
    14: [120, 143, 165],
    15: [248, 244, 230],
    16: [210, 210, 210],
    17: [120, 85, 50],
    18: [128, 128, 128],
    19: [200, 200, 210],
    20: [170, 95, 40],
    21: [110, 110, 110],
    22: [90, 75, 60],
    23: [240, 235, 225],
    24: [200, 155, 80],
  };

  function _terrainToParts(terrainNode) {
    const props = terrainNode.properties || {};

    const cells = _decodeTerrainGrid(props.SmoothGrid || props.Voxels || '');
    return _terrainCellsToParts(terrainNode, props, cells);
  }

  async function _terrainToPartsAsync(terrainNode) {
    const props = terrainNode.properties || {};
    const raw = props.SmoothGrid || props.Voxels || '';
    const cells = await _decodeTerrainGridNative(raw);
    return _terrainCellsToParts(terrainNode, props, cells);
  }

  function _terrainCellsToParts(terrainNode, props, cells) {
    if (!cells.length) {
      return _terrainFallbackSlab(props);
    }
    const parts = [];
    const CELL = 4;
    for (const cell of cells) {
      if (cell.material === 0 || cell.occupancy < 0.12) continue;
      const color = _TERRAIN_COLORS[cell.material] || [130, 120, 100];

      const fill = Math.max(0.15, Math.min(1.0, cell.occupancy));
      const sizeY = CELL * fill;
      parts.push({
        id: terrainNode.id,
        className: 'Terrain',
        shape: 'box',
        center: [cell.x * CELL + CELL / 2, cell.y * CELL + sizeY / 2, cell.z * CELL + CELL / 2],
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        size: [CELL, sizeY, CELL],
        color,
        alpha: cell.material === 14 ? 0.62 : 1.0,
        mesh: { id: '', embedded: null },
        matFlag: cell.material === 14 ? 2 : cell.material === 18 || cell.material === 21 ? 3 : 0,
        material: {
          key: _terrainMaterialKey(cell.material),
          preview: _materialPreviewUrl(_terrainMaterialKey(cell.material)),
          viewportTexture: _materialViewportTexture(_terrainMaterialKey(cell.material)),
          studsPerTile: 4,
          maps: {},
        },
        isTerrain: true,
      });
    }
    return parts;
  }

  async function _decodeTerrainGridNative(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const cacheKey = _compactCacheKey(raw);
    const cached = state_.terrainCells.get(cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.cells;
    }
    try {
      const cells = await window.__TAURI__.core.invoke('datatree_decode_terrain_grid', { raw });
      _cacheTerrainCells(cacheKey, Array.isArray(cells) ? cells : []);
      return state_.terrainCells.get(cacheKey)?.cells || [];
    } catch (err) {
      _log.warn(`Native terrain decode failed; falling back to JS (${err?.message || err})`);
      const cells = _decodeTerrainGrid(raw);
      _cacheTerrainCells(cacheKey, cells);
      return cells;
    }
  }

  function _compactCacheKey(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${value.length}:${hash >>> 0}`;
  }

  function _cacheTerrainCells(key, cells) {
    state_.terrainCells.set(key, { cells, lastUsed: Date.now() });
    while (state_.terrainCells.size > MAX_TERRAIN_CELL_CACHE_ENTRIES) {
      let oldestKey = null;
      let oldest = Infinity;
      for (const [cacheKey, entry] of state_.terrainCells) {
        if ((entry.lastUsed || 0) < oldest) {
          oldest = entry.lastUsed || 0;
          oldestKey = cacheKey;
        }
      }
      if (!oldestKey) break;
      state_.terrainCells.delete(oldestKey);
    }
  }

  function _terrainMaterialKey(materialId) {
    const keys = {
      1: 'grass',
      2: 'sand',
      3: 'rock',
      4: 'ground',
      5: 'slate',
      6: 'leafygrass',
      7: 'grass',
      8: 'snow',
      9: 'sandstone',
      10: 'mud',
      11: 'concrete',
      12: 'limestone',
      13: 'ground',
      14: 'water',
      15: 'snow',
      16: 'ice',
      17: 'woodplanks',
      18: 'metal',
      19: 'ice',
      20: 'crackedlava',
      21: 'basalt',
      22: 'asphalt',
      23: 'salt',
      24: 'pavement',
    };
    return keys[materialId] || 'ground';
  }

  function _decodeTerrainGrid(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const text = raw.trim();

    let bytes;
    try {
      const b64 = text.replace(/^.*?,/, '').replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 10) return [];
      bytes = _base64ToBytes(b64);
    } catch {
      return [];
    }
    if (bytes.length < 6) return [];
    const xSize = bytes[0] | (bytes[1] << 8);
    const ySize = bytes[2] | (bytes[3] << 8);
    const zSize = bytes[4] | (bytes[5] << 8);
    if (!xSize || !ySize || !zSize) return [];
    const expectedBytes = 6 + xSize * ySize * zSize * 3;
    if (bytes.length < expectedBytes) return [];
    const cells = [];
    let offset = 6;
    for (let y = 0; y < ySize; y++) {
      for (let z = 0; z < zSize; z++) {
        for (let x = 0; x < xSize; x++) {
          const material = bytes[offset];
          const occupancy = bytes[offset + 1] / 255;
          offset += 3;
          if (material !== 0 && occupancy > 0.05) {
            cells.push({ material, occupancy, x, y, z });
          }
        }
      }
    }
    return cells;
  }

  function _terrainFallbackSlab(props) {
    const minStr = props.MinExtents || props.minExtents || '';
    const maxStr = props.MaxExtents || props.maxExtents || '';
    const min = _parseOptionalVector3(minStr) || [-64, -8, -64];
    const max = _parseOptionalVector3(maxStr) || [64, 0, 64];
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const sx = Math.max(4, max[0] - min[0]);
    const sy = Math.max(2, max[1] - min[1]);
    const sz = Math.max(4, max[2] - min[2]);
    return [
      {
        id: 0,
        className: 'Terrain',
        shape: 'box',
        center: [cx, cy, cz],
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        size: [sx, sy, sz],
        color: [106, 127, 63],
        alpha: 1.0,
        mesh: { id: '', embedded: null },
        matFlag: 0,
        isTerrain: true,
      },
    ];
  }

  function _nodePart(
    node,
    meshNode = null,
    snapshot = activeSnapshot(),
    surfaceTexture = null,
    surfaceAppearance = null,
  ) {
    const props = node.properties || {};
    const cframe = _parseCFrame(
      _firstProp(props, ['CFrame', 'CoordinateFrame', 'Position', 'PivotOffset']),
    );
    const mesh = _meshDescriptor(node, meshNode);
    const size = _partSize(node.className, props, mesh);
    const material = _firstProp(props, ['Material', 'material']);
    const materialVariantName = _firstProp(props, [
      'MaterialVariantSerialized',
      'MaterialVariant',
      'materialVariantSerialized',
    ]);
    const materialVariant = _resolveMaterialVariant(snapshot, materialVariantName);
    const resolvedMaterial = materialVariant?.baseMaterial || material;
    const reflectance = Math.max(0, Math.min(1, Number(_firstProp(props, ['Reflectance'])) || 0));
    const color = _materialColor(
      _parseColor(
        _firstProp(props, ['Color', 'Color3', 'Color3uint8', 'BrickColor', 'BrickColorValue']),
      ),
      resolvedMaterial,
      reflectance,
      materialVariant,
    );
    const transparency = Math.max(0, Math.min(1, Number(_firstProp(props, ['Transparency'])) || 0));
    if (transparency >= 0.995) return null;
    const center = mesh.offset ? _offsetCenter(cframe, mesh.offset) : cframe.center;
    const matKey = _materialKey(resolvedMaterial);
    const matFlag = matKey.includes('neon')
      ? 1
      : matKey.includes('glass') || matKey.includes('forcefield')
        ? 2
        : matKey.includes('metal') || matKey.includes('diamond') || matKey.includes('foil')
          ? 3
          : 0;
    const previewMaterial = _materialPreviewUrl(materialVariant?.name)
      ? materialVariant.name
      : matKey;
    return {
      id: node.id,
      className: node.className,
      shape: _partShape(node.className, props, mesh),
      center,
      matrix: cframe.matrix,
      size,
      color,
      alpha: _materialAlpha(Math.max(0.08, 1 - transparency), resolvedMaterial),
      mesh,
      matFlag,
      matId: _materialId(matKey),
      surfaceTexture,
      material: {
        value: material,
        key: matKey,
        variant: materialVariant?.name || materialVariantName || '',
        preview: _materialPreviewUrl(previewMaterial),
        viewportTexture: _materialViewportTexture(matKey, materialVariant?.studPattern),
        studsPerTile: Math.max(0.25, Number(materialVariant?.studPattern) || 4),
        maps: { ...(materialVariant?.maps || {}), ...(surfaceAppearance?.maps || {}) },
      },
    };
  }

  function _meshChildFor(children = []) {
    return (
      children.find((child) =>
        /^(specialmesh|filemesh|blockmesh|cylindermesh)$/i.test(String(child.className || '')),
      ) || null
    );
  }

  function _surfaceTextureFor(children = []) {
    for (const child of children) {
      if (!/^(texture|decal)$/i.test(String(child.className || ''))) continue;
      const props = child.properties || {};
      const raw = _firstProp(props, ['Texture', 'TextureId', 'TextureID', 'TextureContent']);
      const id = _assetId(raw);
      if (!raw && !id) continue;
      const studsPerTileU = Math.max(0.25, Number(_firstProp(props, ['StudsPerTileU'])) || 4);
      const studsPerTileV = Math.max(0.25, Number(_firstProp(props, ['StudsPerTileV'])) || 4);
      return {
        id,
        raw,
        key: id ? `asset:${id}` : `texture:${String(raw).slice(0, 80)}`,
        source: child.className || 'Texture',
        studsPerTileU,
        studsPerTileV,
      };
    }
    return null;
  }

  function _surfaceAppearanceFor(children = []) {
    const child = children.find((item) =>
      /^surfaceappearance$/i.test(String(item.className || '')),
    );
    if (!child) return null;
    const props = child.properties || {};
    const maps = {};
    for (const key of ['ColorMap', 'NormalMap', 'RoughnessMap', 'MetalnessMap']) {
      const value = _firstProp(props, [key]);
      if (!value) continue;
      maps[key] = {
        value,
        id: _assetId(value),
        kind: 'Image',
      };
    }
    return Object.keys(maps).length ? { maps } : null;
  }

  function _meshDescriptor(node, meshNode) {
    const props = node.properties || {};
    const meshProps = meshNode?.properties || {};
    const rawMesh =
      _firstProp(props, ['MeshId', 'MeshID', 'MeshContent', 'MeshData', 'ModelMeshData']) ||
      _firstProp(meshProps, ['MeshId', 'MeshID', 'MeshContent', 'MeshData', 'ModelMeshData']);
    const embedded = _embeddedMesh(props) || _embeddedMesh(meshProps);
    const meshId = embedded ? '' : _assetId(rawMesh);
    const textureId = _assetId(
      _firstProp(props, ['TextureID', 'TextureId', 'TextureContent']) ||
        _firstProp(meshProps, ['TextureID', 'TextureId', 'TextureContent']),
    );
    const scale =
      meshNode && !/meshpart/i.test(node.className) ? _parseOptionalVector3(meshProps.Scale) : null;
    const offset = meshNode ? _parseOptionalVector3(meshProps.Offset) : null;
    const vertexCount = Number(_firstProp(props, ['VertexCount', 'vertexCount'])) || 0;
    const initialSize = _parseOptionalVector3(_firstProp(props, ['InitialSize', 'initialSize']));
    return {
      id: meshId,
      textureId,
      embedded,
      meshType: String(meshProps.MeshType || '').toLowerCase(),
      childClass: String(meshNode?.className || '').toLowerCase(),
      scale,
      offset,
      name: String(node.name || ''),
      vertexCount,
      initialSize,
    };
  }

  function _embeddedMesh(props) {
    const raw = _firstProp(props, [
      'MeshData',
      'MeshContent',
      'ModelMeshData',
      'SerializedMesh',
      'PhysicsData',
    ]);
    if (!raw || /^rbxasset|^https?:/i.test(raw)) return null;
    return raw;
  }

  function _firstProp(props, keys) {
    if (!props) return '';
    for (const key of keys) {
      const value = props[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    const lower = new Map(Object.keys(props).map((key) => [key.toLowerCase(), key]));
    for (const key of keys) {
      const realKey = lower.get(String(key).toLowerCase());
      const value = realKey ? props[realKey] : null;
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function _partSize(className, props, mesh) {
    const rawSize = _firstProp(props, ['Size', 'size']);
    const fallback =
      mesh?.initialSize && /meshpart|union|intersect|negate/i.test(String(className || ''))
        ? mesh.initialSize
        : _defaultPartSize(className);
    const size = _parseVector3(rawSize, fallback);
    if (!mesh?.scale) return size;
    return size.map((item, index) => Math.max(0.04, item * mesh.scale[index]));
  }

  function _offsetCenter(cframe, offset) {
    const m = cframe.matrix;
    const c = cframe.center;
    return [
      c[0] + m[0][0] * offset[0] + m[0][1] * offset[1] + m[0][2] * offset[2],
      c[1] + m[1][0] * offset[0] + m[1][1] * offset[1] + m[1][2] * offset[2],
      c[2] + m[2][0] * offset[0] + m[2][1] * offset[1] + m[2][2] * offset[2],
    ];
  }

  function _partShape(className = '', props = {}, mesh = {}) {
    const klass = String(className || '').toLowerCase();
    const raw = String(_firstProp(props, ['Shape', 'shape']) || '')
      .toLowerCase()
      .trim();

    const meshShape = _meshTypeShape(mesh);
    if (meshShape) return meshShape;
    if (mesh.embedded || mesh.id) return 'asset-mesh';

    if (klass.includes('cornerwedgepart')) return 'cornerwedge';
    if (klass.includes('wedgepart')) return 'wedge';
    if (klass.includes('trusspart')) return 'truss';

    if (
      klass.includes('meshpart') ||
      klass.includes('union') ||
      klass.includes('intersect') ||
      klass.includes('negate')
    )
      return 'asset-mesh';

    if (klass.includes('spherepart') || klass.includes('ballpart')) return 'sphere';

    if (raw) {
      if (raw === 'ball' || raw === 'sphere' || raw === '0') return 'sphere';
      if (raw === 'cylinder' || raw === '2') return 'cylinder';
      if (raw === 'wedge' || raw === '3') return 'wedge';
    }

    return 'box';
  }

  function _inferredMeshShape(klass = '', mesh = {}) {
    const name = String(mesh.name || '').toLowerCase();
    const text = `${klass} ${name}`;
    if (/barrel|chamber|pin|bolt|muzzle|axle|shaft|peg/.test(text)) return 'cylinder';
    if (
      /trigger|sight|body|butt|stock|grip|receiver|guard|clip|magazine|cube|block|brick|wall|floor|base|board|panel|plate|plank|door|window|sign|screen|trim|frame|step|stair|shelf|table|seat|backrest/.test(
        text,
      )
    )
      return 'sculptbox';
    if (/torus|ring|donut|hoop|loop|tire|tyre/.test(text)) return 'torus';
    if (/cone|spike|horn|tip|point/.test(text)) return 'cone';
    if (/capsule|rounded|pill/.test(text)) return 'capsule';
    if (/sphere|ball|orb|globe|bubble/.test(text)) return 'sphere';
    if (
      /cylinder|pipe|tube|pole|rod|bar|beam|leg|handle|rail|rope|wire|cable|wheel|coin/.test(text)
    )
      return 'cylinder';
    if (/wedge|ramp|slope/.test(text)) return 'wedge';
    if (/meshpart|union|intersect|negate/.test(klass)) {
      const v = Number(mesh.vertexCount) || 0;
      if (/rock|boulder|leaf|bush|cloud|hair|cloth|scarf|cape|fur|organic/.test(text))
        return 'organicbox';
      if (v >= 48) return 'sculptbox';
    }
    return '';
  }

  function _meshTypeShape(mesh = {}) {
    const child = String(mesh.childClass || '').toLowerCase();
    const value = String(mesh.meshType || '')
      .toLowerCase()
      .trim();

    if (child === 'cylindermesh') return 'cylinder';

    if (!value) return '';

    const number = Number(value);
    const hasNumber = value !== '' && Number.isFinite(number);

    if (value === 'cylinder' || (hasNumber && number === 4)) return 'cylinder';

    if (value === 'sphere' || (hasNumber && number === 3)) return 'sphere';

    if (value === 'head' || (hasNumber && number === 0 && child === 'specialmesh')) return 'sphere';
    if (value === 'wedge' || (hasNumber && number === 2)) return 'wedge';
    if (value === 'brick' || (hasNumber && number === 6)) return 'box';
    if (value === 'prism' || (hasNumber && number === 7)) return 'prism';
    if (value === 'pyramid' || (hasNumber && number === 8)) return 'pyramid';
    if (value === 'parallelramp' || value.includes('parallel') || (hasNumber && number === 9))
      return 'parallelramp';
    if (value === 'rightangleramp' || value.includes('rightangle') || (hasNumber && number === 10))
      return 'rightangleramp';
    if (value === 'cornerwedge' || value.includes('corner') || (hasNumber && number === 11))
      return 'cornerwedge';

    if (hasNumber && number === 0) return 'box';

    if (value === 'torso' || value === 'blob') return 'box';
    return '';
  }

  function _defaultPartSize(className = '') {
    if (/seat/i.test(className)) return [4, 1, 4];
    if (/truss/i.test(className)) return [2, 6, 2];
    return [4, 1.2, 2];
  }

  function _parseVector3(value, fallback) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    if (nums.length >= 3)
      return nums.slice(0, 3).map((item, index) => Math.max(Math.abs(item), 0.01));
    return fallback;
  }

  function _parseOptionalVector3(value) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    return nums.length >= 3 ? nums.slice(0, 3) : null;
  }

  function _parseCFrame(value) {
    const nums =
      String(value ?? '')
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    const center = nums.length >= 3 ? nums.slice(0, 3) : [0, 0, 0];
    const matrix =
      nums.length >= 12
        ? [nums.slice(3, 6), nums.slice(6, 9), nums.slice(9, 12)]
        : [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ];
    return { center, matrix };
  }

  function _parseColor(value) {
    const text = String(value ?? '').trim();
    const named = _brickColor(text);
    if (named) return named;
    const nums =
      text
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter(Number.isFinite) || [];
    if (nums.length >= 3) {
      const rgb = nums.slice(0, 3).map((item) => Math.round(item <= 1 ? item * 255 : item));
      return rgb.map((item) => Math.max(0, Math.min(255, item)));
    }
    if (nums.length === 1) {
      const brick = _brickColor(String(nums[0]));
      if (brick) return brick;
      if (nums[0] > 255) {
        const packed = nums[0] >>> 0;
        return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
      }
    }
    return [126, 151, 178];
  }

  function _materialColor(color, material = '', reflectance = 0, variant = null) {
    const key = _materialKey(material);
    let out = color.slice();

    if (key.includes('neon')) out = out.map((item) => Math.min(255, item * 1.2 + 12));

    if (reflectance > 0)
      out = out.map((item) => item + (255 - item) * Math.min(0.35, reflectance * 0.4));
    return out.map((item) => Math.max(0, Math.min(255, Math.round(item))));
  }

  function _materialVariantKey(value = '') {
    return DataTreeMaterials.variantKey(value);
  }

  function _resolveMaterialVariant(snapshot, name) {
    if (!name) return null;
    return snapshot?.materialVariants?.get(_materialVariantKey(name)) || null;
  }

  function _materialPreviewUrl(name) {
    return DataTreeMaterials.previewUrl(state_.meta.materials, name);
  }

  function _materialViewportTexture(name, studsPerTile = '') {
    return DataTreeMaterials.viewportTexture(state_.meta.materials, name, studsPerTile);
  }

  function _materialTint(name = '') {
    return DataTreeMaterials.tint(name);
  }

  function _materialAlpha(alpha, material = '') {
    return DataTreeMaterials.alpha(alpha, material);
  }

  function _materialKey(material = '') {
    return DataTreeMaterials.key(material);
  }

  function _materialId(matKey) {
    return DataTreeMaterials.id(matKey);
  }

  function _brickColor(text) {
    const key = text.toLowerCase();
    const colors = {
      1: [242, 243, 243],
      5: [215, 197, 154],
      18: [204, 142, 105],
      21: [196, 40, 28],
      23: [13, 105, 172],
      24: [245, 205, 48],
      26: [27, 42, 53],
      28: [40, 127, 71],
      29: [161, 196, 140],
      37: [75, 151, 75],
      38: [160, 95, 53],
      45: [180, 210, 228],
      101: [218, 133, 65],
      102: [110, 153, 202],
      103: [199, 193, 183],
      104: [107, 50, 124],
      105: [226, 155, 64],
      106: [218, 134, 122],
      107: [163, 162, 165],
      108: [99, 95, 98],
      192: [105, 64, 40],
      194: [163, 162, 165],
      199: [99, 95, 98],
      1001: [248, 248, 248],
      1002: [205, 205, 205],
      1003: [17, 17, 17],
      1004: [255, 0, 0],
      1005: [255, 176, 0],
      1006: [180, 128, 255],
      1007: [163, 75, 75],
      1008: [193, 190, 66],
      1009: [255, 255, 0],
      1010: [0, 0, 255],
      1011: [0, 32, 96],
      1012: [33, 84, 185],
      1013: [4, 175, 236],
      1014: [170, 85, 0],
      1015: [170, 0, 170],
      1016: [255, 102, 204],
      1017: [255, 175, 0],
      1018: [18, 238, 212],
      1019: [0, 255, 255],
      1020: [0, 255, 0],
      1021: [58, 125, 21],
      1022: [127, 142, 100],
      1023: [140, 91, 159],
      1024: [175, 221, 255],
      'medium stone grey': [163, 162, 165],
      'dark stone grey': [99, 95, 98],
      'light stone grey': [229, 228, 223],
      'really black': [17, 17, 17],
      black: [27, 42, 53],
      white: [242, 243, 243],
      'institutional white': [248, 248, 248],
      'bright red': [196, 40, 28],
      'bright blue': [13, 105, 172],
      'bright green': [75, 151, 75],
      'bright yellow': [245, 205, 48],
      'earth green': [39, 70, 45],
      'sand green': [120, 144, 130],
      'sand blue': [116, 134, 157],
      'reddish brown': [105, 64, 40],
    };
    return colors[key] || null;
  }

  function _buildScene(parts) {
    if (!parts.length) return { ..._emptyScene(), sky: _sceneSky(activeSnapshot()) };
    const budget = _sceneBudget(parts.length);
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = _pointCollector();
    const assetMap = new Map();
    const readyAssets = new Set();
    const failedAssets = new Set();
    const aabbs = [];
    let omittedParts = 0;
    for (let i = 0; i < parts.length; i += 1) {
      if (mesh.visualVertexCount() >= budget.maxVertices) {
        omittedParts = parts.length - i;
        break;
      }
      const part = parts[i];
      const assetKey = _meshAssetKey(part.mesh);
      if (assetKey) {
        assetMap.set(assetKey, part.mesh);
        const cached = state_.meshAssets.get(assetKey);
        if (cached?.status === 'ready') {
          cached.lastUsed = Date.now();
          readyAssets.add(assetKey);
        }
        if (cached?.status === 'failed') failedAssets.add(assetKey);
      }

      mesh.setFlag(part.matFlag || 0);
      mesh.setMatId(part.matId || 0);
      const before = points.length;
      points.beginPart();
      _emitPart(part, mesh, points, budget);

      if (points.length > before && part.id) {
        aabbs.push({ partId: part.id, ...points.endPart() });
      } else {
        points.endPart();
      }
    }
    if (!points.length) {
      const lights = _sceneLights(activeSnapshot(), parts);
      return {
        ..._emptyScene(),
        parts,
        assets: [...assetMap.values()],
        assetCount: assetMap.size,
        assetReady: readyAssets.size,
        assetFailed: failedAssets.size,
        omittedParts,
        aabbs,
        lights,
        lightProfile: _sceneLightProfile(lights),
        sky: _sceneSky(activeSnapshot()),
      };
    }
    const bounds = _bounds(points);
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    const lights = _sceneLights(activeSnapshot(), parts);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts,
      assets: [...assetMap.values()],
      assetCount: assetMap.size,
      assetReady: readyAssets.size,
      assetFailed: failedAssets.size,
      omittedParts,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
      aabbs,
      lights,
      lightProfile: _sceneLightProfile(lights, bounds),
      sky: _sceneSky(activeSnapshot()),
    };
  }

  function _sceneBudget(partCount) {
    return {
      maxVertices: Number.POSITIVE_INFINITY,
      sphereLat: 24,
      sphereLon: 48,
      cylinderSegments: 64,
    };
  }

  function _meshBuilder() {
    const positions = [];
    const normals = [];
    const colors = [];
    const flags = [];
    const matIds = [];
    const textured = new Map();
    let _currentFlag = 0;
    let _currentMatId = 0;
    const textureGroup = (texture) => {
      const key = texture?.key || '';
      if (!key) return null;
      if (!textured.has(key)) {
        textured.set(key, {
          texture,
          positions: [],
          normals: [],
          colors: [],
          uvs: [],
          flags: [],
        });
      }
      return textured.get(key);
    };
    const pushTexturedVertex = (group, point, normal, uv, color, alpha) => {
      const n = _norm(normal);
      group.positions.push(point[0], point[1], point[2]);
      group.normals.push(n[0], n[1], n[2]);
      group.colors.push(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
      group.uvs.push(uv?.[0] || 0, uv?.[1] || 0);
      group.flags.push(_currentFlag);
    };
    return {
      setFlag(f) {
        _currentFlag = f || 0;
      },
      setMatId(id) {
        _currentMatId = id || 0;
      },
      texturedTriNormal(texture, a, b, c, na, nb, nc, uva, uvb, uvc, color, alpha = 1) {
        const group = textureGroup(texture);
        if (!group) return false;
        pushTexturedVertex(group, a, na, uva, color, alpha);
        pushTexturedVertex(group, b, nb, uvb, color, alpha);
        pushTexturedVertex(group, c, nc, uvc, color, alpha);
        return true;
      },
      tri(a, b, c, color, alpha = 1) {
        const normal = _norm(_cross(_sub(b, a), _sub(c, a)));
        this.triNormal(a, b, c, normal, normal, normal, color, alpha);
      },
      triNormal(a, b, c, na, nb, nc, color, alpha = 1) {
        for (const [point, normal] of [
          [a, na],
          [b, nb],
          [c, nc],
        ]) {
          const n = _norm(normal);
          positions.push(point[0], point[1], point[2]);
          normals.push(n[0], n[1], n[2]);
          colors.push(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
          flags.push(_currentFlag);
          matIds.push(_currentMatId);
        }
      },
      quad(a, b, c, d, color, alpha = 1) {
        this.tri(a, b, c, color, alpha);
        this.tri(a, c, d, color, alpha);
      },
      vertexCount() {
        return positions.length / 3;
      },
      visualVertexCount() {
        let texturedVertices = 0;
        for (const group of textured.values()) texturedVertices += group.positions.length / 3;
        return positions.length / 3 + texturedVertices;
      },
      finish() {
        const texturedGroups = [...textured.values()].map((group) => ({
          texture: group.texture,
          positions: new Float32Array(group.positions),
          normals: new Float32Array(group.normals),
          colors: new Float32Array(group.colors),
          uvs: new Float32Array(group.uvs),
          flags: new Float32Array(group.flags),
          vertexCount: group.positions.length / 3,
          triangleCount: group.positions.length / 9,
        }));
        const texturedVertexCount = texturedGroups.reduce(
          (sum, group) => sum + group.vertexCount,
          0,
        );
        const texturedTriangleCount = texturedGroups.reduce(
          (sum, group) => sum + group.triangleCount,
          0,
        );
        return {
          positions: new Float32Array(positions),
          normals: new Float32Array(normals),
          colors: new Float32Array(colors),
          flags: new Float32Array(flags),
          matIds: new Float32Array(matIds),
          vertexCount: positions.length / 3,
          triangleCount: positions.length / 9,
          texturedVertexCount,
          texturedTriangleCount,
          visualVertexCount: positions.length / 3 + texturedVertexCount,
          visualTriangleCount: positions.length / 9 + texturedTriangleCount,
          textured: texturedGroups,
        };
      },
    };
  }

  function _pointCollector() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let partMin = null;
    let partMax = null;
    const ingest = (point) => {
      if (!point) return;
      for (let k = 0; k < 3; k++) {
        const value = point[k];
        if (value < min[k]) min[k] = value;
        if (value > max[k]) max[k] = value;
        if (partMin) {
          if (value < partMin[k]) partMin[k] = value;
          if (value > partMax[k]) partMax[k] = value;
        }
      }
    };
    return {
      length: 0,
      push(...items) {
        for (const item of items) {
          ingest(item);
          this.length += 1;
        }
      },
      beginPart() {
        partMin = [Infinity, Infinity, Infinity];
        partMax = [-Infinity, -Infinity, -Infinity];
      },
      endPart() {
        const out = partMin ? { min: partMin, max: partMax } : { min: [0, 0, 0], max: [0, 0, 0] };
        partMin = null;
        partMax = null;
        return out;
      },
      bounds() {
        return { min: min.slice(), max: max.slice() };
      },
    };
  }

  function _lineBuilder() {
    const positions = [];
    const colors = [];
    return {
      line(a, b, color) {
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        colors.push(...color, ...color);
      },
      finish() {
        return {
          positions: new Float32Array(positions),
          colors: new Float32Array(colors),
          vertexCount: positions.length / 3,
        };
      },
    };
  }

  function _emitPart(part, mesh, points, budget = _sceneBudget(0)) {
    if (part.shape === 'asset-mesh') {
      const asset = state_.meshAssets.get(_meshAssetKey(part.mesh));
      if (asset?.status === 'ready' && asset.mesh)
        return _emitAssetMesh(part, asset.mesh, mesh, points);

      return;
    }
    if (part.shape === 'sphere') return _emitSphere(part, mesh, points, budget);
    if (part.shape === 'cylinder') return _emitCylinder(part, mesh, points, budget);
    if (part.shape === 'cone') return _emitCone(part, mesh, points, budget);
    if (part.shape === 'capsule') return _emitCapsule(part, mesh, points, budget);
    if (part.shape === 'torus') return _emitTorus(part, mesh, points, budget);
    if (part.shape === 'wedge') return _emitPoly(part, mesh, points, _wedgePrimitive());
    if (part.shape === 'cornerwedge') return _emitPoly(part, mesh, points, _cornerWedgePrimitive());
    if (part.shape === 'prism') return _emitPoly(part, mesh, points, _prismPrimitive());
    if (part.shape === 'pyramid') return _emitPoly(part, mesh, points, _pyramidPrimitive());
    if (part.shape === 'parallelramp')
      return _emitPoly(part, mesh, points, _parallelRampPrimitive());
    if (part.shape === 'rightangleramp')
      return _emitPoly(part, mesh, points, _rightAngleRampPrimitive());
    if (part.shape === 'truss') return _emitTruss(part, mesh, points);

    const bevel = part.shape === 'organicbox' ? _softBoxBevel(part) : 0;
    return _emitPoly(part, mesh, points, _boxPrimitive(bevel));
  }

  function _emitMeshProxy(part, mesh, points, budget) {
    const inferred = _inferredMeshShape(part.className, part.mesh);
    if (inferred && inferred !== 'sculptbox' && inferred !== 'organicbox') {
      const proxy = { ...part, shape: inferred };
      return _emitPart(proxy, mesh, points, budget);
    }
    const klass = String(part.className || '').toLowerCase();
    const name = String(part.mesh?.name || part.name || '').toLowerCase();
    const text = `${klass} ${name}`;
    if (/\bcylinder\b|\bpipe\b|\btube\b|\bpole\b|\brod\b/.test(text))
      return _emitCylinder(part, mesh, points, budget);
    if (/\bsphere\b|\bball\b|\borb\b/.test(text)) return _emitSphere(part, mesh, points, budget);
    if (/\bwedge\b|\bramp\b/.test(text)) return _emitPoly(part, mesh, points, _wedgePrimitive());
    if (/\btorus\b|\bring\b/.test(text)) return _emitTorus(part, mesh, points, budget);
    const bevel = inferred === 'organicbox' || inferred === 'sculptbox' ? _softBoxBevel(part) : 0;
    return _emitPoly(part, mesh, points, _boxPrimitive(bevel));
  }

  function _softBoxBevel(part) {
    const v = Number(part.mesh?.vertexCount) || 0;
    const name = String(part.mesh?.name || '').toLowerCase();
    if (/cube|block|brick|wall|floor|base|board|panel|plate/.test(name)) return 0.025;
    if (v > 300) return 0.18;
    if (v > 120) return 0.13;
    if (v > 32) return 0.08;
    return 0.04;
  }

  function _emitAssetMesh(part, asset, mesh, points) {
    const positions = asset.positions;
    const indices = asset.indices;
    const size = asset.size || [1, 1, 1];
    const center = asset.center || [0, 0, 0];
    const normals = asset.normals;
    const uvs = asset.uvs;
    const texture = _partTextureSource(part);
    const localPoint = (index) => {
      const offset = index * 3;
      return [
        (positions[offset] - center[0]) / size[0],
        (positions[offset + 1] - center[1]) / size[1],
        (positions[offset + 2] - center[2]) / size[2],
      ];
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = _partPoint(part, localPoint(indices[i]));
      const b = _partPoint(part, localPoint(indices[i + 1]));
      const c = _partPoint(part, localPoint(indices[i + 2]));
      points.push(a, b, c);
      if (normals?.length) {
        const normalPoint = (index) => {
          const offset = index * 3;
          return _partNormal(part, [normals[offset], normals[offset + 1], normals[offset + 2]]);
        };
        const uvPoint = (index) => {
          const offset = index * 2;
          return uvs?.length ? [uvs[offset] || 0, uvs[offset + 1] || 0] : [0, 0];
        };
        if (
          texture &&
          uvs?.length &&
          mesh.texturedTriNormal(
            texture,
            a,
            b,
            c,
            normalPoint(indices[i]),
            normalPoint(indices[i + 1]),
            normalPoint(indices[i + 2]),
            uvPoint(indices[i]),
            uvPoint(indices[i + 1]),
            uvPoint(indices[i + 2]),
            part.color,
            part.alpha,
          )
        ) {
          continue;
        }
        mesh.triNormal(
          a,
          b,
          c,
          normalPoint(indices[i]),
          normalPoint(indices[i + 1]),
          normalPoint(indices[i + 2]),
          part.color,
          part.alpha,
        );
      } else {
        mesh.tri(a, b, c, part.color, part.alpha);
      }
    }
  }

  function _partTextureSource(part) {
    if (part.surfaceTexture?.id || part.surfaceTexture?.localUrl) return part.surfaceTexture;
    const colorMap = part.material?.maps?.ColorMap;
    if (colorMap?.id)
      return {
        key: `asset:${colorMap.id}`,
        id: colorMap.id,
        source: 'ColorMap',
        studsPerTileU: part.material?.studsPerTile,
        studsPerTileV: part.material?.studsPerTile,
      };
    if (part.mesh?.textureId)
      return { key: `asset:${part.mesh.textureId}`, id: part.mesh.textureId, source: 'TextureID' };
    if (part.material?.viewportTexture) return part.material.viewportTexture;
    return null;
  }

  function _emitPoly(part, mesh, points, primitive) {
    const vertices = primitive.vertices.map((point) => _partPoint(part, point));
    points.push(...vertices);
    const texture = _partTextureSource(part);
    for (const face of primitive.faces) {
      if (texture && _emitTexturedPolyFace(part, mesh, primitive.vertices, vertices, face, texture))
        continue;
      if (face.length === 3)
        mesh.tri(vertices[face[0]], vertices[face[1]], vertices[face[2]], part.color, part.alpha);
      else if (face.length === 4)
        mesh.quad(
          vertices[face[0]],
          vertices[face[1]],
          vertices[face[2]],
          vertices[face[3]],
          part.color,
          part.alpha,
        );
      else {
        for (let i = 1; i < face.length - 1; i += 1)
          mesh.tri(
            vertices[face[0]],
            vertices[face[i]],
            vertices[face[i + 1]],
            part.color,
            part.alpha,
          );
      }
    }
  }

  function _emitTexturedPolyFace(part, mesh, localVertices, worldVertices, face, texture) {
    if (face.length < 3) return false;
    const localFace = face.map((idx) => localVertices[idx]);
    const normalLocal = _norm(
      _cross(_sub(localFace[1], localFace[0]), _sub(localFace[2], localFace[0])),
    );
    const normalWorld = _partNormal(part, normalLocal);
    const uvs = localFace.map((point) => _primitiveUv(part, point, normalLocal, texture));
    for (let i = 1; i < face.length - 1; i += 1) {
      const ok = mesh.texturedTriNormal(
        texture,
        worldVertices[face[0]],
        worldVertices[face[i]],
        worldVertices[face[i + 1]],
        normalWorld,
        normalWorld,
        normalWorld,
        uvs[0],
        uvs[i],
        uvs[i + 1],
        part.color,
        part.alpha,
      );
      if (!ok) return false;
    }
    return true;
  }

  function _primitiveUv(part, localPoint, normal, texture) {
    const ax = Math.abs(normal[0]);
    const ay = Math.abs(normal[1]);
    const az = Math.abs(normal[2]);
    const sx = Math.max(0.001, part.size?.[0] || 1);
    const sy = Math.max(0.001, part.size?.[1] || 1);
    const sz = Math.max(0.001, part.size?.[2] || 1);
    const tileU = Math.max(0.25, Number(texture?.studsPerTileU) || 4);
    const tileV = Math.max(0.25, Number(texture?.studsPerTileV) || 4);
    if (ay >= ax && ay >= az) return [(localPoint[0] * sx) / tileU, (localPoint[2] * sz) / tileV];
    if (ax >= ay && ax >= az) return [(localPoint[2] * sz) / tileU, (localPoint[1] * sy) / tileV];
    return [(localPoint[0] * sx) / tileU, (localPoint[1] * sy) / tileV];
  }

  function _boxPrimitive(bevel = 0) {
    const x = 0.5;
    const y = 0.5;
    const z = 0.5;
    const b = Math.max(0, Math.min(0.18, bevel));
    const vertices = [
      [-x + b, -y, -z + b],
      [x - b, -y, -z + b],
      [x, -y, -z + b],
      [x, -y, z - b],
      [x - b, -y, z],
      [-x + b, -y, z],
      [-x, -y, z - b],
      [-x, -y, -z + b],
      [-x + b, y, -z + b],
      [x - b, y, -z + b],
      [x, y, -z + b],
      [x, y, z - b],
      [x - b, y, z],
      [-x + b, y, z],
      [-x, y, z - b],
      [-x, y, -z + b],
    ];
    if (!b)
      return {
        vertices: [
          [-x, -y, -z],
          [x, -y, -z],
          [x, y, -z],
          [-x, y, -z],
          [-x, -y, z],
          [x, -y, z],
          [x, y, z],
          [-x, y, z],
        ],
        faces: [
          [3, 2, 1, 0],
          [5, 6, 7, 4],
          [1, 5, 4, 0],
          [7, 6, 2, 3],
          [2, 6, 5, 1],
          [4, 7, 3, 0],
        ],
      };
    return {
      vertices,
      faces: [
        [8, 9, 1, 0],
        [10, 11, 3, 2],
        [12, 13, 5, 4],
        [14, 15, 7, 6],
        [1, 2, 3, 4, 5, 6, 7, 0],
        [15, 14, 13, 12, 11, 10, 9, 8],
        [9, 10, 2, 1],
        [11, 12, 4, 3],
        [13, 14, 6, 5],
        [15, 8, 0, 7],
      ],
    };
  }

  function _wedgePrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [3, 2, 5, 4],
        [0, 3, 4],
        [1, 5, 2],
        [0, 4, 5, 1],
      ],
    };
  }

  function _cornerWedgePrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [1, 4, 2],
        [2, 4, 3],
        [0, 3, 4, 1],
      ],
    };
  }

  function _prismPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0, 0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2],
        [3, 5, 4],
        [0, 3, 4, 1],
        [1, 4, 5, 2],
        [2, 5, 3, 0],
      ],
    };
  }

  function _pyramidPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [0, 0.5, 0],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 4, 1],
        [1, 4, 2],
        [2, 4, 3],
        [3, 4, 0],
      ],
    };
  }

  function _parallelRampPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 4, 5, 1],
        [3, 2, 5, 4],
        [0, 3, 4],
        [1, 5, 2],
      ],
    };
  }

  function _rightAngleRampPrimitive() {
    return {
      vertices: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
      ],
      faces: [
        [0, 1, 2, 3],
        [0, 3, 4],
        [0, 4, 1],
        [1, 4, 2],
        [2, 4, 3],
      ],
    };
  }

  function _emitSphere(part, mesh, points, budget = _sceneBudget(0)) {
    const lat = budget.sphereLat;
    const lon = budget.sphereLon;
    const rows = [];
    for (let y = 0; y <= lat; y += 1) {
      const v = y / lat;
      const theta = v * Math.PI;
      const row = [];
      for (let x = 0; x <= lon; x += 1) {
        const u = x / lon;
        const phi = u * Math.PI * 2;
        row.push(
          _partPoint(part, [
            Math.cos(phi) * Math.sin(theta) * 0.5,
            Math.cos(theta) * 0.5,
            Math.sin(phi) * Math.sin(theta) * 0.5,
          ]),
        );
      }
      rows.push(row);
    }
    for (const row of rows) points.push(...row);
    for (let y = 0; y < lat; y += 1) {
      for (let x = 0; x < lon; x += 1) {
        const a = rows[y][x];
        const b = rows[y][x + 1];
        const c = rows[y + 1][x + 1];
        const d = rows[y + 1][x];
        mesh.tri(a, b, c, part.color, part.alpha);
        mesh.tri(a, c, d, part.color, part.alpha);
      }
    }
  }

  function _emitCylinder(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = budget.cylinderSegments;
    const top = [];
    const bottom = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      top.push(_partPoint(part, [Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5]));
      bottom.push(_partPoint(part, [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]));
    }
    const topCenter = _partPoint(part, [0, 0.5, 0]);
    const bottomCenter = _partPoint(part, [0, -0.5, 0]);
    points.push(topCenter, bottomCenter, ...top, ...bottom);
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.quad(bottom[i], bottom[next], top[next], top[i], part.color, part.alpha);
      mesh.tri(topCenter, top[i], top[next], part.color, part.alpha);
      mesh.tri(bottomCenter, bottom[next], bottom[i], part.color, part.alpha);
    }
  }

  function _emitCone(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = budget.cylinderSegments;
    const tip = _partPoint(part, [0, 0.5, 0]);
    const center = _partPoint(part, [0, -0.5, 0]);
    const ring = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      ring.push(_partPoint(part, [Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]));
    }
    points.push(tip, center, ...ring);
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.tri(tip, ring[i], ring[next], part.color, part.alpha);
      mesh.tri(center, ring[next], ring[i], part.color, part.alpha);
    }
  }

  function _emitCapsule(part, mesh, points, budget = _sceneBudget(0)) {
    const body = { ...part, size: [part.size[0], part.size[1] * 0.58, part.size[2]] };
    _emitCylinder(body, mesh, points, budget);
    const top = {
      ...part,
      center: _partPoint(part, [0, 0.29, 0]),
      size: [part.size[0], part.size[1] * 0.42, part.size[2]],
    };
    const bottom = {
      ...part,
      center: _partPoint(part, [0, -0.29, 0]),
      size: [part.size[0], part.size[1] * 0.42, part.size[2]],
    };
    _emitSphere(top, mesh, points, budget);
    _emitSphere(bottom, mesh, points, budget);
  }

  function _emitTorus(part, mesh, points, budget = _sceneBudget(0)) {
    const major = Math.max(12, Math.min(36, budget.cylinderSegments + 8));
    const minor = Math.max(6, Math.min(14, Math.round(major / 3)));
    const rows = [];
    for (let i = 0; i <= major; i += 1) {
      const u = (i / major) * Math.PI * 2;
      const row = [];
      for (let j = 0; j <= minor; j += 1) {
        const v = (j / minor) * Math.PI * 2;
        const r = 0.34 + Math.cos(v) * 0.14;
        row.push(_partPoint(part, [Math.cos(u) * r, Math.sin(v) * 0.14, Math.sin(u) * r]));
      }
      rows.push(row);
    }
    for (const row of rows) points.push(...row);
    for (let i = 0; i < major; i += 1) {
      for (let j = 0; j < minor; j += 1) {
        mesh.quad(
          rows[i][j],
          rows[i + 1][j],
          rows[i + 1][j + 1],
          rows[i][j + 1],
          part.color,
          part.alpha,
        );
      }
    }
  }

  function _emitFacetedProxy(part, mesh, points, budget = _sceneBudget(0)) {
    const segments = Math.max(8, Math.min(18, budget.cylinderSegments));
    const levels = [-0.5, -0.24, 0.24, 0.5];
    const radii = [0.62, 0.78, 0.74, 0.56];
    const rows = levels.map((y, rowIndex) => {
      const row = [];
      for (let i = 0; i < segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        const facet = i % 2 ? 0.92 : 1;
        const rx = 0.5 * radii[rowIndex] * facet;
        const rz = 0.5 * radii[rowIndex] * (i % 3 ? 0.96 : 1.08);
        row.push(_partPoint(part, [Math.cos(a) * rx, y, Math.sin(a) * rz]));
      }
      return row;
    });
    const top = _partPoint(part, [0, 0.5, 0]);
    const bottom = _partPoint(part, [0, -0.5, 0]);
    points.push(top, bottom, ...rows.flat());
    for (let row = 0; row < rows.length - 1; row += 1) {
      for (let i = 0; i < segments; i += 1) {
        const next = (i + 1) % segments;
        mesh.quad(
          rows[row][i],
          rows[row][next],
          rows[row + 1][next],
          rows[row + 1][i],
          part.color,
          part.alpha,
        );
      }
    }
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      mesh.tri(top, rows[rows.length - 1][i], rows[rows.length - 1][next], part.color, part.alpha);
      mesh.tri(bottom, rows[0][next], rows[0][i], part.color, part.alpha);
    }
  }

  function _emitTruss(part, mesh, points) {
    const bars = [
      [
        [-0.36, 0, -0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0.36, 0, -0.36],
        [0.12, 1, 0.12],
      ],
      [
        [-0.36, 0, 0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0.36, 0, 0.36],
        [0.12, 1, 0.12],
      ],
      [
        [0, -0.35, 0],
        [0.9, 0.12, 0.9],
      ],
      [
        [0, 0.35, 0],
        [0.9, 0.12, 0.9],
      ],
    ];
    for (const [offset, size] of bars) {
      const bar = {
        ...part,
        center: _partPoint(part, offset),
        matrix: part.matrix,
        size: [part.size[0] * size[0], part.size[1] * size[1], part.size[2] * size[2]],
      };
      _emitPoly(bar, mesh, points, _boxPrimitive(0));
    }
  }

  function _partPoint(part, point) {
    const x = point[0] * part.size[0];
    const y = point[1] * part.size[1];
    const z = point[2] * part.size[2];
    const m = part.matrix;
    const c = part.center;
    return [
      c[0] + m[0][0] * x + m[0][1] * y + m[0][2] * z,
      c[1] + m[1][0] * x + m[1][1] * y + m[1][2] * z,
      c[2] + m[2][0] * x + m[2][1] * y + m[2][2] * z,
    ];
  }

  function _partNormal(part, normal) {
    const m = part.matrix;
    const sx = Math.max(1e-8, part.size?.[0] || 1);
    const sy = Math.max(1e-8, part.size?.[1] || 1);
    const sz = Math.max(1e-8, part.size?.[2] || 1);
    const nx = normal[0] / sx;
    const ny = normal[1] / sy;
    const nz = normal[2] / sz;
    return _norm([
      m[0][0] * nx + m[0][1] * ny + m[0][2] * nz,
      m[1][0] * nx + m[1][1] * ny + m[1][2] * nz,
      m[2][0] * nx + m[2][1] * ny + m[2][2] * nz,
    ]);
  }

  function _bounds(points) {
    if (points?.bounds) return points.bounds();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const point of points) {
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], point[i]);
        max[i] = Math.max(max[i], point[i]);
      }
    }
    return { min, max };
  }

  function _emitGuides(guide, bounds, center, extent) {
    const y = bounds.min[1];

    const axis = Math.max(4, extent * 0.24);
    const root = [bounds.min[0], y, bounds.min[2]];
    guide.line(root, [root[0] + axis, root[1], root[2]], [1, 0.28, 0.28, 0.82]);
    guide.line(root, [root[0], root[1] + axis, root[2]], [0.35, 1, 0.56, 0.82]);
    guide.line(root, [root[0], root[1], root[2] + axis], [0.36, 0.66, 1, 0.82]);
  }

  function _createDepthViewportProgram(gl) {
    const vertex = _compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
      precision highp float;
      attribute vec3 aPosition;
      uniform mat4 uMvp;
      void main() {
        gl_Position = uMvp * vec4(aPosition, 1.0);
      }
    `,
    );
    const fragment = _compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(1.0);
      }
    `,
    );
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      uMvp: gl.getUniformLocation(program, 'uMvp'),
    };
  }

  function _createContactAoProgram(gl) {
    const vertex = _compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
      precision highp float;
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `,
    );
    const fragment = _compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision highp float;
      uniform sampler2D uDepth;
      uniform vec2 uTexelSize;
      uniform float uNear;
      uniform float uFar;
      varying vec2 vUv;
      float linearizeDepth(float d) {
        return (2.0 * uNear) / (uFar + uNear - d * (uFar - uNear));
      }
      void main() {
        float depth = texture2D(uDepth, vUv).r;
        if (depth >= 0.9999) { gl_FragColor = vec4(0.0); return; }
        float linD = linearizeDepth(depth);
        vec2 radius = uTexelSize * (1.5 + clamp(linD * 24.0, 0.0, 2.5));
        float occ = 0.0;
        float sd, diff;
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(0.0, 1.0) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(1.0, 0.0) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(0.0, -1.0) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(-1.0, 0.0) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(0.71, 0.71) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(0.71, -0.71) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(-0.71, 0.71) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        sd = linearizeDepth(texture2D(uDepth, vUv + vec2(-0.71, -0.71) * radius).r);
        diff = linD - sd; occ += smoothstep(0.0,0.004,diff)*(1.0-smoothstep(0.008,0.022,diff));
        occ = clamp(occ / 8.0, 0.0, 1.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, occ * 0.34);
      }
    `,
    );
    if (!vertex || !fragment) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vertex);
    gl.attachShader(prog, fragment);
    gl.linkProgram(prog);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    const triData = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const triBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, triData, gl.STATIC_DRAW);
    return {
      program: prog,
      aPos: gl.getAttribLocation(prog, 'aPos'),
      uDepth: gl.getUniformLocation(prog, 'uDepth'),
      uTexelSize: gl.getUniformLocation(prog, 'uTexelSize'),
      uNear: gl.getUniformLocation(prog, 'uNear'),
      uFar: gl.getUniformLocation(prog, 'uFar'),
      triBuf,
    };
  }

  function _mountViewport(canvas, scene, cameraKey = '') {
    if (!canvas || !scene?.mesh?.visualVertexCount) return;
    const gl =
      canvas.getContext('webgl2', {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }) ||
      canvas.getContext('webgl', {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    if (!gl) return _mountViewport2dFallback(canvas, scene);
    const program = _createViewportProgram(gl);
    if (!program) return;
    const textureProgram = _createTextureViewportProgram(gl);

    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const depthTexExt = isWebGL2
      ? true
      : gl.getExtension('WEBGL_depth_texture') || gl.getExtension('WEBKIT_WEBGL_depth_texture');

    const contactAoEnabled = !!depthTexExt;
    let aoColor = null,
      aoDepth = null,
      aoFbo = null,
      contactAoProgram = null,
      depthProgram = null;

    if (contactAoEnabled) {
      aoColor = gl.createTexture();
      aoDepth = gl.createTexture();
      aoFbo = gl.createFramebuffer();
      contactAoProgram = _createContactAoProgram(gl);
      depthProgram = _createDepthViewportProgram(gl);
      if (!contactAoProgram || !depthProgram) {
        aoColor = aoDepth = aoFbo = null;
      }
    }

    const resizeAoFbo = (w, h) => {
      if (!aoFbo) return;
      gl.bindTexture(gl.TEXTURE_2D, aoColor);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, aoDepth);
      if (isWebGL2) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.DEPTH_COMPONENT24,
          w,
          h,
          0,
          gl.DEPTH_COMPONENT,
          gl.UNSIGNED_INT,
          null,
        );
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.DEPTH_COMPONENT,
          w,
          h,
          0,
          gl.DEPTH_COMPONENT,
          gl.UNSIGNED_SHORT,
          null,
        );
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, aoFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, aoColor, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, aoDepth, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    };

    let buffers = null;
    const savedCamera = cameraKey ? state_.viewportCameras.get(cameraKey) : null;
    const camera = savedCamera ? { ...savedCamera } : _defaultViewportCamera(scene);
    if (!savedCamera && cameraKey) _saveViewportCamera(cameraKey, camera);

    const keys = new Set();
    let looking = false;
    let lastPointer = null;
    let frame = 0;
    let lastTime = 0;
    let disposed = false;
    let animating = false;
    let aoWidth = 0,
      aoHeight = 0;

    const moveSpeed = () => {
      const base = Math.max(1.15, Math.min(22, scene.extent * 0.012));
      return keys.has('ShiftLeft') || keys.has('ShiftRight') ? base * 5.2 : base;
    };

    const clampPitch = (p) => Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p));

    const camVectors = () => {
      const cy = Math.cos(camera.yaw),
        sy = Math.sin(camera.yaw);
      const cp = Math.cos(camera.pitch),
        sp = Math.sin(camera.pitch);
      const fwd = [-sy * cp, sp, -cy * cp];
      const right = [cy, 0, -sy];
      const up = [0, 1, 0];
      return { fwd, right, up };
    };

    const schedule = (continuous = false) => {
      if (disposed) return;
      animating = continuous;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    buffers = _createViewportBuffers(gl, scene, program, () => schedule());

    const resize = new ResizeObserver(() => schedule());
    const deleteBuffers = () => {
      if (!buffers) return;
      for (const buf of [buffers.mesh, buffers.guide]) if (buf?.buffer) gl.deleteBuffer(buf.buffer);
      for (const group of buffers.textured || []) {
        if (group?.buffer) gl.deleteBuffer(group.buffer);
        if (group?.texture) gl.deleteTexture(group.texture);
        if (group?.heightTexture) gl.deleteTexture(group.heightTexture);
      }
    };
    canvas.__dtUpdateScene = (nextScene) => {
      if (disposed || !nextScene?.mesh?.visualVertexCount) return;
      const oldCenter = scene.center || [0, 0, 0];
      const newCenter = nextScene.center || oldCenter;
      const delta = [
        newCenter[0] - oldCenter[0],
        newCenter[1] - oldCenter[1],
        newCenter[2] - oldCenter[2],
      ];
      deleteBuffers();
      scene = nextScene;
      if (delta.every(Number.isFinite) && Math.hypot(delta[0], delta[1], delta[2]) > 0.001) {
        camera.x += delta[0];
        camera.y += delta[1];
        camera.z += delta[2];
        _saveViewportCamera(cameraKey, camera);
      }
      buffers = _createViewportBuffers(gl, scene, program, () => schedule());
      const frame = canvas.closest('.dt-render-frame--canvas');
      if (frame) {
        const skyTop = nextScene.sky?.cssTop || VIEWPORT_BACKDROP_SKY.cssTop;
        const skyBottom = nextScene.sky?.cssBottom || VIEWPORT_BACKDROP_SKY.cssBottom;
        frame.style.setProperty('--dt-sky-top', skyTop);
        frame.style.setProperty('--dt-sky-bottom', skyBottom);
      }
      schedule();
    };
    canvas.__dtDispose = () => {
      disposed = true;
      looking = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      deleteBuffers();
      gl.deleteProgram(program.program);
      if (textureProgram?.program) gl.deleteProgram(textureProgram.program);
      if (aoFbo) gl.deleteFramebuffer(aoFbo);
      if (aoColor) gl.deleteTexture(aoColor);
      if (aoDepth) gl.deleteTexture(aoDepth);
      if (contactAoProgram) {
        gl.deleteProgram(contactAoProgram.program);
        gl.deleteBuffer(contactAoProgram.triBuf);
      }
      if (depthProgram) gl.deleteProgram(depthProgram.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext?.();
      canvas.width = 0;
      canvas.height = 0;
    };
    resize.observe(canvas.parentElement || canvas);

    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 0.38s ease';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        canvas.style.opacity = '1';
      }),
    );

    let rainCanvas = null;
    let rainCtx = null;
    let rainDrops = [];
    let rainFrame = 0;
    let rainLastTime = 0;

    const initRain = () => {
      if (rainCanvas) return;
      rainCanvas = document.createElement('canvas');
      rainCanvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.55;';
      const parent = canvas.parentElement;
      if (parent) {
        const pos = getComputedStyle(parent).position;
        if (pos === 'static') parent.style.position = 'relative';
        parent.appendChild(rainCanvas);
      }
    };
    const destroyRain = () => {
      cancelAnimationFrame(rainFrame);
      rainCanvas?.remove();
      rainCanvas = null;
      rainCtx = null;
      rainDrops = [];
    };
    const tickRain = (now) => {
      if (disposed) {
        destroyRain();
        return;
      }
      const rainRate = scene.sky?.rain || 0;
      if (rainRate < 0.01) {
        destroyRain();
        return;
      }
      initRain();
      const W = rainCanvas.offsetWidth;
      const H = rainCanvas.offsetHeight;
      if (rainCanvas.width !== W || rainCanvas.height !== H) {
        rainCanvas.width = W;
        rainCanvas.height = H;
        rainDrops = [];
      }
      if (!rainCtx) rainCtx = rainCanvas.getContext('2d');
      const ctx = rainCtx;
      const dt = Math.min((now - (rainLastTime || now)) / 1000, 0.05);
      rainLastTime = now;

      const wind = (scene.sky?.wind || 0) * 0.012;
      const speed = 320 + rainRate * 480;
      const len = 10 + rainRate * 22;
      const maxDrops = Math.floor(rainRate * 280);

      while (rainDrops.length < maxDrops)
        rainDrops.push({
          x: Math.random() * W,
          y: Math.random() * H,
          opacity: 0.25 + Math.random() * 0.45,
        });

      ctx.clearRect(0, 0, W, H);
      const dx = wind * speed;
      ctx.strokeStyle = 'rgba(168,210,255,1)';
      ctx.lineWidth = 0.8;
      for (const drop of rainDrops) {
        drop.x += dx * dt;
        drop.y += speed * dt;
        if (drop.y > H) {
          drop.y = -len;
          drop.x = Math.random() * W;
        }
        if (drop.x > W) drop.x -= W;
        if (drop.x < 0) drop.x += W;
        ctx.globalAlpha = drop.opacity;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + dx * (len / speed), drop.y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      rainFrame = requestAnimationFrame(tickRain);
    };

    if ((scene.sky?.rain || 0) > 0.01) rainFrame = requestAnimationFrame(tickRain);

    const _origDispose = canvas.__dtDispose;
    canvas.__dtDispose = () => {
      destroyRain();
      _origDispose?.();
    };

    const _origUpdateScene = canvas.__dtUpdateScene;
    canvas.__dtUpdateScene = (nextScene) => {
      _origUpdateScene?.(nextScene);
      cancelAnimationFrame(rainFrame);
      if ((nextScene?.sky?.rain || 0) > 0.01) {
        rainLastTime = 0;
        rainFrame = requestAnimationFrame(tickRain);
      } else {
        destroyRain();
      }
    };

    if (!savedCamera) {
      const d = scene.extent * 1.4;
      const { fwd } = camVectors();
      camera.x = scene.center[0] - fwd[0] * d;
      camera.y = scene.center[1] - fwd[1] * d;
      camera.z = scene.center[2] - fwd[2] * d;
      _saveViewportCamera(cameraKey, camera);
    }

    const MOVE_KEYS = new Set([
      'KeyW',
      'KeyS',
      'KeyA',
      'KeyD',
      'KeyQ',
      'KeyE',
      'Space',
      'ShiftLeft',
      'ShiftRight',
    ]);
    const onKeyDown = (e) => {
      if (!canvas.isConnected || disposed) return;

      if (!canvas.matches(':hover') && document.pointerLockElement !== canvas) return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.add(e.code);
        schedule(true);
      }
      if (e.code === 'KeyF') {
        const d = scene.extent * 1.4;
        const { fwd } = camVectors();
        camera.x = scene.center[0] - fwd[0] * d;
        camera.y = scene.center[1] - fwd[1] * d;
        camera.z = scene.center[2] - fwd[2] * d;
        _saveViewportCamera(cameraKey, camera);
        schedule();
      }
    };
    const onKeyUp = (e) => {
      keys.delete(e.code);
      if (keys.size === 0) {
        animating = false;
        schedule();
      }
    };
    const onPointerLockChange = () => {
      if (document.pointerLockElement !== canvas) looking = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) {
        looking = true;
        lastPointer = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (e.button === 0) {
        lastPointer = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        looking = true;
        e.preventDefault();
      }
    });

    let _clickStart = null;
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button === 0) _clickStart = { x: e.clientX, y: e.clientY, time: Date.now() };
      },
      true,
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (e.button === 0 && _clickStart) {
          const dx = e.clientX - _clickStart.x;
          const dy = e.clientY - _clickStart.y;
          const dt = Date.now() - _clickStart.time;
          _clickStart = null;

          if (Math.hypot(dx, dy) < 6 && dt < 400 && state_.viewportClickSelect) {
            _raycastClick(e, canvas, scene, camera);
          }
        }
      },
      true,
    );

    canvas.addEventListener('pointermove', (e) => {
      if (!looking && document.pointerLockElement !== canvas) return;

      let dx, dy;
      if (document.pointerLockElement === canvas) {
        dx = e.movementX;
        dy = e.movementY;
      } else {
        if (!lastPointer) return;
        dx = e.clientX - lastPointer.x;
        dy = e.clientY - lastPointer.y;
        lastPointer = { x: e.clientX, y: e.clientY };
      }
      camera.yaw += dx * 0.006;
      camera.pitch = clampPitch(camera.pitch - dy * 0.006);
      _saveViewportCamera(cameraKey, camera);
      schedule();
    });

    canvas.addEventListener('pointerup', (e) => {
      looking = false;
      lastPointer = null;
      schedule();
    });
    canvas.addEventListener('pointercancel', () => {
      looking = false;
      lastPointer = null;
      schedule();
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const { fwd } = camVectors();
        const speed = Math.max(1.5, Math.min(85, scene.extent * 0.045));
        const delta = -e.deltaY * 0.005 * speed;
        camera.x += fwd[0] * delta;
        camera.y += fwd[1] * delta;
        camera.z += fwd[2] * delta;
        _saveViewportCamera(cameraKey, camera);
        schedule();
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', () => {
      Object.assign(camera, _defaultViewportCamera(scene));
      _saveViewportCamera(cameraKey, camera);
      schedule();
    });

    function drawScene(width, height, matrices) {
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program.program);

      gl.uniformMatrix4fv(program.uMvp, false, matrices.mvp);
      gl.uniform1f(program.uUnlit, 0);
      _setViewportPostUniforms(gl, program, scene, camera);

      _bindViewportBuffer(gl, program, buffers.mesh);
      gl.drawArrays(gl.TRIANGLES, 0, scene.mesh.vertexCount);

      if (textureProgram && buffers.textured?.length) {
        gl.useProgram(textureProgram.program);
        gl.uniformMatrix4fv(textureProgram.uMvp, false, matrices.mvp);
        _setViewportPostUniforms(gl, textureProgram, scene, camera);
        for (const group of buffers.textured) {
          _bindTexturedViewportBuffer(gl, textureProgram, group);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, group.texture);
          gl.uniform1i(textureProgram.uTexture, 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, group.heightTexture || group.texture);
          if (textureProgram.uHeightTexture) gl.uniform1i(textureProgram.uHeightTexture, 1);
          if (textureProgram.uTextureDetail)
            gl.uniform1f(textureProgram.uTextureDetail, group.textureInfo?.detailStrength ?? 1);
          if (textureProgram.uTextureDetile)
            gl.uniform1f(textureProgram.uTextureDetile, group.textureInfo?.detileStrength ?? 0);
          if (textureProgram.uHeightStrength)
            gl.uniform1f(textureProgram.uHeightStrength, group.textureInfo?.heightStrength ?? 0);
          if (textureProgram.uTextureMean) {
            const mean = group.textureInfo?.meanColor || [1, 1, 1];
            gl.uniform3f(textureProgram.uTextureMean, mean[0], mean[1], mean[2]);
          }
          gl.drawArrays(gl.TRIANGLES, 0, group.vertexCount);
        }
        gl.useProgram(program.program);
      }

      gl.uniform1f(program.uUnlit, 1);
      gl.disable(gl.DEPTH_TEST);
      _bindViewportBuffer(gl, program, buffers.guide);
      gl.drawArrays(gl.LINES, 0, scene.guide.vertexCount);
      gl.enable(gl.DEPTH_TEST);
    }

    function drawDepthScene(matrices) {
      if (!depthProgram) return;
      gl.clearColor(1, 1, 1, 1);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.colorMask(false, false, false, false);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depthProgram.program);
      gl.uniformMatrix4fv(depthProgram.uMvp, false, matrices.mvp);
      _prepareDepthViewportAttributes(gl, depthProgram, program, textureProgram, contactAoProgram);
      _bindDepthViewportBuffer(gl, depthProgram, buffers.mesh);
      gl.drawArrays(gl.TRIANGLES, 0, scene.mesh.vertexCount);
      for (const group of buffers.textured || []) {
        _bindDepthViewportBuffer(gl, depthProgram, group);
        gl.drawArrays(gl.TRIANGLES, 0, group.vertexCount);
      }
      gl.colorMask(true, true, true, true);
    }

    function draw(now) {
      if (disposed || !canvas.isConnected) {
        canvas.__dtDispose?.();
        return;
      }
      const dt = Math.min((now - (lastTime || now)) / 1000, 0.1);
      lastTime = now;

      if (keys.size > 0) {
        const speed = moveSpeed();
        const { fwd, right } = camVectors();
        if (keys.has('KeyW') || keys.has('ArrowUp')) {
          camera.x += fwd[0] * speed * dt;
          camera.y += fwd[1] * speed * dt;
          camera.z += fwd[2] * speed * dt;
        }
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
          camera.x -= fwd[0] * speed * dt;
          camera.y -= fwd[1] * speed * dt;
          camera.z -= fwd[2] * speed * dt;
        }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) {
          camera.x -= right[0] * speed * dt;
          camera.z -= right[2] * speed * dt;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
          camera.x += right[0] * speed * dt;
          camera.z += right[2] * speed * dt;
        }
        if (keys.has('KeyE') || keys.has('Space')) {
          camera.y += speed * dt;
        }
        if (keys.has('KeyQ')) {
          camera.y -= speed * dt;
        }
        _saveViewportCamera(cameraKey, camera);
      }

      const rect = canvas.getBoundingClientRect();
      const interactive = animating || keys.size > 0 || looking;
      const dpr = _viewportDpr(scene, interactive);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const matrices = _viewportMatrices(scene, camera, width / height);

      const useContactAo = !!(aoFbo && contactAoProgram && depthProgram && !interactive);
      if (useContactAo) {
        const nextAoWidth = Math.max(1, Math.floor(width * CONTACT_AO_SCALE));
        const nextAoHeight = Math.max(1, Math.floor(height * CONTACT_AO_SCALE));
        if (aoWidth !== nextAoWidth || aoHeight !== nextAoHeight) {
          resizeAoFbo(nextAoWidth, nextAoHeight);
          aoWidth = nextAoWidth;
          aoHeight = nextAoHeight;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, aoFbo);
        gl.viewport(0, 0, aoWidth, aoHeight);
        drawDepthScene(matrices);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      gl.viewport(0, 0, width, height);
      drawScene(width, height, matrices);

      if (useContactAo) {
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(contactAoProgram.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, aoDepth);
        gl.uniform1i(contactAoProgram.uDepth, 0);
        gl.uniform2f(contactAoProgram.uTexelSize, 1.0 / aoWidth, 1.0 / aoHeight);
        gl.uniform1f(contactAoProgram.uNear, matrices.near);
        gl.uniform1f(contactAoProgram.uFar, matrices.far);
        gl.bindBuffer(gl.ARRAY_BUFFER, contactAoProgram.triBuf);
        gl.enableVertexAttribArray(contactAoProgram.aPos);
        gl.vertexAttribPointer(contactAoProgram.aPos, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
      }

      if (animating || keys.size > 0) schedule(true);
    }
    schedule();
  }

  function _viewportDpr(scene, interactive = false) {
    const nativeDpr = window.devicePixelRatio || 1;
    if (interactive) return Math.min(nativeDpr, INTERACTIVE_VIEWPORT_DPR);
    const tris = scene.mesh?.visualTriangleCount || scene.mesh?.triangleCount || 0;
    const texturedGroups = scene.mesh?.textured?.length || 0;
    const complex = tris > 220000 || texturedGroups > 72;
    return Math.min(nativeDpr, complex ? COMPLEX_VIEWPORT_DPR : MAX_VIEWPORT_DPR);
  }

  function _setViewportPostUniforms(gl, program, scene, camera, options = {}) {
    const effects = scene.sky?.effects || {};
    const tint = effects.tint || [255, 255, 255];
    if (program.uCameraPos) gl.uniform3f(program.uCameraPos, camera.x, camera.y, camera.z);
    if (program.uCamOffset) gl.uniform3f(program.uCamOffset, camera.x, camera.y, camera.z);
    if (program.uTint) gl.uniform3f(program.uTint, tint[0] / 255, tint[1] / 255, tint[2] / 255);
    if (program.uExposure) gl.uniform1f(program.uExposure, effects.exposure ?? 1);
    if (program.uContrast) gl.uniform1f(program.uContrast, effects.contrast ?? 0);
    if (program.uSaturation) gl.uniform1f(program.uSaturation, effects.saturation ?? 0);
    if (program.uAmbientLift) gl.uniform1f(program.uAmbientLift, effects.ambientLift ?? 0);
    if (program.uShadowLift) gl.uniform1f(program.uShadowLift, effects.shadowLift ?? 0);
    if (program.uDetailQuality) gl.uniform1f(program.uDetailQuality, 0);
    if (program.uPerformanceMode) gl.uniform1f(program.uPerformanceMode, 0);
    const lightProfile = scene.lightProfile || {};
    if (program.uBloom)
      gl.uniform1f(program.uBloom, Math.max(effects.bloom ?? 0, (lightProfile.energy || 0) * 0.34));
    const ambient = scene.sky?.ambient || {};
    const skyRaw = ambient.sky || [107, 122, 148];
    const groundRaw = ambient.ground || [82, 71, 61];
    const _ambientProbe = (rgb, hueMix) => {
      const lum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      const clampedLum = Math.min(lum, 160);
      const r = clampedLum * (1 - hueMix) + Math.min(rgb[0], 180) * hueMix;
      const g = clampedLum * (1 - hueMix) + Math.min(rgb[1], 180) * hueMix;
      const b = clampedLum * (1 - hueMix) + Math.min(rgb[2], 180) * hueMix;
      return [r, g, b];
    };
    const sky = _ambientProbe(skyRaw, 0.01);
    const ground = _ambientProbe(groundRaw, 0.015);
    if (program.uSkyColor)
      gl.uniform3f(program.uSkyColor, sky[0] / 255, sky[1] / 255, sky[2] / 255);
    if (program.uGroundColor)
      gl.uniform3f(program.uGroundColor, ground[0] / 255, ground[1] / 255, ground[2] / 255);
    const indirect = lightProfile.indirect || [0, 0, 0];
    if (program.uLocalAmbient)
      gl.uniform3f(program.uLocalAmbient, indirect[0], indirect[1], indirect[2]);
    const sun = scene.sky?.sun || {};
    const sunDir = sun.direction || [0.55, 0.82, 0.45];
    const sunColor = sun.color || [255, 248, 236];
    if (program.uSunDir) gl.uniform3f(program.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
    if (program.uSunColor)
      gl.uniform3f(program.uSunColor, sunColor[0] / 255, sunColor[1] / 255, sunColor[2] / 255);
    if (program.uSunStrength) gl.uniform1f(program.uSunStrength, sun.strength ?? 1);
    if (program.uLightCount) {
      const lightCapacity = Math.max(
        1,
        Math.min(
          program.lightCapacity || MAX_VIEWPORT_LIGHTS,
          options.maxLights || MAX_VIEWPORT_LIGHTS,
        ),
      );
      const lights = _selectViewportLights(scene.lights || [], camera, lightCapacity);
      const positions = new Float32Array(lightCapacity * 3);
      const colors = new Float32Array(lightCapacity * 3);
      const ranges = new Float32Array(lightCapacity);
      const directions = new Float32Array(lightCapacity * 3);
      const kinds = new Float32Array(lightCapacity);
      const coneCos = new Float32Array(lightCapacity);
      lights.forEach((light, index) => {
        positions.set(light.position || [0, 0, 0], index * 3);
        colors.set(light.color || [0, 0, 0], index * 3);
        ranges[index] = light.range || 1;
        directions.set(light.direction || [0, 0, 0], index * 3);
        kinds[index] = light.kind || 0;
        coneCos[index] = light.coneCos || 0;
      });
      gl.uniform1i(program.uLightCount, lights.length);
      if (program.uLightPos) gl.uniform3fv(program.uLightPos, positions);
      if (program.uLightColor) gl.uniform3fv(program.uLightColor, colors);
      if (program.uLightRange) gl.uniform1fv(program.uLightRange, ranges);
      if (program.uLightDir) gl.uniform3fv(program.uLightDir, directions);
      if (program.uLightKind) gl.uniform1fv(program.uLightKind, kinds);
      if (program.uLightConeCos) gl.uniform1fv(program.uLightConeCos, coneCos);
    }
  }

  function _selectViewportLights(lights = [], camera = null, limit = MAX_VIEWPORT_LIGHTS) {
    if (lights.length <= limit) return lights.slice(0, limit);
    const cx = camera?.x || 0;
    const cy = camera?.y || 0;
    const cz = camera?.z || 0;
    const cacheKey = `${limit}:${Math.round(cx / 6)}:${Math.round(cy / 6)}:${Math.round(cz / 6)}`;
    if (lights._viewportSelectionCache?.key === cacheKey)
      return lights._viewportSelectionCache.value;
    const selected = lights
      .map((light) => {
        const dx = (light.position?.[0] || 0) - cx;
        const dy = (light.position?.[1] || 0) - cy;
        const dz = (light.position?.[2] || 0) - cz;
        const distance = Math.hypot(dx, dy, dz);
        const range = Math.max(light.range || 1, 1);
        const reach = Math.max(0, 1 - distance / Math.max(range * 2.25, 1));
        const score =
          (light.intensity || 1) *
          Math.sqrt(range) *
          (0.22 + reach * 1.78) *
          (light.kind === 0 ? 1 : 1.08);
        return { light, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.light);
    Object.defineProperty(lights, '_viewportSelectionCache', {
      configurable: true,
      writable: true,
      value: { key: cacheKey, value: selected },
    });
    return selected;
  }

  function _mountViewport2dFallback(canvas, scene) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.__dtDispose = () => {};
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function _raycastClick(e, canvas, scene, camera) {
    const aabbs = scene.aabbs;
    if (!aabbs || !aabbs.length) return;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;

    const aspect = rect.width / rect.height;
    const fovy = Math.PI / 3;
    const cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw);
    const fwd = [-sy * cp, sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
    const tanHalf = Math.tan(fovy / 2);
    const rayDir = _norm([
      fwd[0] + right[0] * ndcX * tanHalf * aspect + up[0] * ndcY * tanHalf,
      fwd[1] + right[1] * ndcX * tanHalf * aspect + up[1] * ndcY * tanHalf,
      fwd[2] + right[2] * ndcX * tanHalf * aspect + up[2] * ndcY * tanHalf,
    ]);
    const origin = [camera.x, camera.y, camera.z];
    let bestT = Infinity;
    let bestId = null;
    for (const aabb of aabbs) {
      const t = _rayAABB(origin, rayDir, aabb.min, aabb.max);
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = aabb.partId;
      }
    }
    if (bestId != null) {
      const snapshot = activeSnapshot();
      if (snapshot) {
        let cur = snapshot.byId.get(bestId);
        while (cur?.parentId) {
          state_.expanded.add(cur.parentId);
          cur = snapshot.byId.get(cur.parentId);
        }
        _refreshTreeList(snapshot);
      }
      _selectNode(bestId);

      requestAnimationFrame(() => {
        const row = _container()?.querySelector(`.dt-tree-row[data-node-id="${bestId}"]`);
        if (row) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          row.classList.add('dt-tree-row--flash');
          setTimeout(() => row.classList.remove('dt-tree-row--flash'), 600);
        }
      });
    }
  }

  function _rayAABB(origin, dir, min, max) {
    let tmin = 0,
      tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const inv = 1 / dir[i];
      let t1 = (min[i] - origin[i]) * inv;
      let t2 = (max[i] - origin[i]) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
  }

  const MESH_CONCURRENCY = 20;
  const MESH_FETCH_TIMEOUT_MS = 5800;
  const ASSET_FETCH_TIMEOUT_MS = 5800;
  const MAX_VIEWPORT_REMOTE_MESH_FETCHES = 768;
  const VIEWPORT_REFRESH_BATCH = 32;

  async function _loadViewportAssets(assets = [], nodeId, buildKey = '', token = null) {
    const isActive = () =>
      state_.visible && (token == null || _isViewportBuildActive(buildKey, token));
    if (!isActive()) return;
    const pending = [];
    for (const asset of assets) {
      const key = _meshAssetKey(asset);
      const cached = state_.meshAssets.get(key);
      if (key && (!cached || (cached.status === 'failed' && Date.now() >= (cached.retryAt || 0))))
        pending.push(asset);
    }
    if (!pending.length) {
      _scheduleViewportAssetRetry(assets, nodeId, buildKey, token);
      return;
    }

    const embedded = pending.filter((asset) => asset.embedded);
    const remote = pending.filter((asset) => !asset.embedded);
    const limitedRemote = remote.slice(0, MAX_VIEWPORT_REMOTE_MESH_FETCHES);
    const skippedRemote = remote.slice(MAX_VIEWPORT_REMOTE_MESH_FETCHES);
    for (const asset of skippedRemote) {
      if (!isActive()) return;
      const key = _meshAssetKey(asset);
      state_.meshAssets.set(key, {
        status: 'failed',
        failedAt: Date.now(),
        message: 'Deferred to keep the viewport responsive',
      });
    }
    const work = [...embedded, ...limitedRemote];
    if (!work.length) {
      _scheduleViewportAssetRetry(assets, nodeId, buildKey, token);
      return;
    }

    _log.info(
      `Loading ${work.length}/${pending.length} mesh asset(s) for node ${nodeId} (parallel, concurrency=${MESH_CONCURRENCY})`,
    );
    for (const asset of work) {
      if (!isActive()) return;
      const key = _meshAssetKey(asset);
      const previous = state_.meshAssets.get(key);
      state_.meshAssets.set(key, { status: 'loading', attempts: previous?.attempts || 0 });
    }
    const startedAt = performance.now();
    if (buildKey && state_.viewportBuild.key === buildKey) {
      _updateViewportBuild(buildKey, {
        status: 'assets',
        progress: 0.92,
        message: `Loading mesh assets · 0/${work.length}`,
        startedAt,
      });
    }

    let completed = 0;
    let refreshQueue = Promise.resolve();
    let lastRefreshAt = performance.now();
    const refreshBatch = VIEWPORT_PERFORMANCE_MODE
      ? Math.max(VIEWPORT_REFRESH_BATCH * 4, 128)
      : 9999;
    const refreshIntervalMs = VIEWPORT_PERFORMANCE_MODE ? 5000 : 99999;
    const scheduleRefresh = () => {
      if (!isActive()) return;
      refreshQueue = refreshQueue
        .then(() => _refreshViewportSceneLive(buildKey, nodeId, { quiet: true }))
        .catch((err) => _log.warn(`Live mesh refresh failed: ${_errMsg(err)}`));
    };
    await _parallelMap(
      work,
      MESH_CONCURRENCY,
      async (asset) => {
        if (!isActive()) return;
        const key = _meshAssetKey(asset);
        try {
          _log.fetch(`Fetching mesh asset key=${key} id=${asset.id}`);
          const bytes = asset.embedded
            ? _decodeMeshBlob(asset.embedded)
            : await _fetchMeshAssetBytes(asset.id);
          const mesh = await _parseRobloxMesh(bytes);
          if (!isActive()) return;
          state_.meshAssets.set(key, { status: 'ready', mesh, lastUsed: Date.now() });
          _log.info(`Mesh ready: ${key} (${mesh.vertexCount} verts, ${mesh.triangleCount} tris)`);
        } catch (err) {
          if (!isActive()) return;
          const msg = err?.message || String(err || 'Mesh unavailable');
          _log.error(`Mesh failed: ${key} — ${msg}`);
          state_.meshAssets.set(key, _meshFailureState(msg, state_.meshAssets.get(key)));
        } finally {
          if (!isActive()) return;
          completed += 1;
          if (buildKey && state_.viewportBuild.key === buildKey) {
            _updateViewportBuild(buildKey, {
              status: 'assets',
              progress: 0.92 + (completed / work.length) * 0.07,
              message: `Loading mesh assets · ${completed}/${work.length}`,
            });
          }
          if (
            completed % refreshBatch === 0 ||
            performance.now() - lastRefreshAt > refreshIntervalMs
          ) {
            lastRefreshAt = performance.now();
            scheduleRefresh();
          }
        }
      },
      isActive,
    );

    if (!isActive()) return;
    await refreshQueue;
    if (!isActive()) return;
    _trimMeshAssets();
    await _refreshViewportSceneLive(buildKey, nodeId);
    _scheduleViewportAssetRetry(assets, nodeId, buildKey, token);
  }

  function _scheduleViewportAssetRetry(assets = [], nodeId, buildKey = '', token = null) {
    if (!state_.visible) return;
    if (!_isViewportBuildActive(buildKey, token)) return;
    const job = state_.viewportBuild;
    if (job.assetRetryTimer) {
      clearTimeout(job.assetRetryTimer);
      job.assetRetryTimer = null;
    }
    const retryable = assets
      .map((asset) => state_.meshAssets.get(_meshAssetKey(asset)))
      .filter((entry) => entry?.status === 'failed' && entry.transient && entry.attempts < 4);
    if (!retryable.length) return;
    const now = Date.now();
    const retryAt = Math.min(...retryable.map((entry) => entry.retryAt || now));
    const delay = Math.max(250, retryAt - now);
    _updateViewportBuild(buildKey, {
      status: 'assets',
      progress: 0.99,
      message: `Waiting to retry ${retryable.length.toLocaleString()} transient mesh${retryable.length === 1 ? '' : 'es'}`,
    });
    job.assetRetryTimer = setTimeout(() => {
      if (!_isViewportBuildActive(buildKey, token)) return;
      job.assetRetryTimer = null;
      _updateViewportBuild(buildKey, {
        status: 'assets',
        progress: Math.min(job.progress || 0.92, 0.99),
        message: `Retrying ${retryable.length.toLocaleString()} transient mesh${retryable.length === 1 ? '' : 'es'}`,
      });
      _loadViewportAssets(assets, nodeId, buildKey, token).catch((err) =>
        _log.warn(`Mesh retry pass failed: ${_errMsg(err)}`),
      );
    }, delay);
  }

  async function _refreshViewportSceneLive(buildKey, nodeId, opts = {}) {
    if (!state_.visible) return;
    const job = state_.viewportBuild;
    if (!buildKey || job.key !== buildKey || !job.renderSnapshot) return;
    const snapshot = job.renderSnapshot;
    const node = snapshot.byId?.get(nodeId);
    const canvas = _container()?.querySelector(
      `.dt-viewport-canvas[data-build-key="${_cssEscape(buildKey)}"]`,
    );
    if (!node || !canvas?.__dtUpdateScene) return;
    const token = job.token;
    const parts = await _collectRenderablePartsProgressive(snapshot, node, token, buildKey);
    if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== buildKey) return;
    const scene = await _buildSceneProgressive(parts, buildKey, token, snapshot);
    if (state_.viewportBuild.token !== token || state_.viewportBuild.key !== buildKey) return;

    state_.viewportBuild.status = 'ready';
    state_.viewportBuild.progress = 1;
    state_.viewportBuild.message = '3D preview ready';
    state_.viewportBuild.scene = scene;
    state_.viewportBuild.activeAssetKeys = _sceneAssetKeys(scene);
    canvas.__dtUpdateScene(scene);
    _updateRenderStats(buildKey, scene);
    _paintViewportProgress(buildKey);
    if (state_.viewportBuild.scene !== scene) _releaseSceneCpuMesh(state_.viewportBuild.scene);
    if (state_.viewportBuild.scene === scene) state_.viewportBuild.scene = null;
  }

  async function _collectRenderablePartsProgressive(snapshot, node, token, key) {
    const parts = [];
    const stack = [node];
    while (stack.length) {
      if (
        !state_.visible ||
        state_.viewportBuild.token !== token ||
        state_.viewportBuild.key !== key
      )
        return parts;
      const sliceStart = performance.now();
      while (stack.length && performance.now() - sliceStart < 6) {
        const current = stack.pop();
        const children = snapshot.children.get(current.id) || [];
        if (/^terrain$/i.test(String(current.className || ''))) {
          const terrainParts = _terrainToParts(current);
          for (const tp of terrainParts) parts.push(tp);
        } else if (_isRenderablePart(current.className)) {
          const part = _nodePart(
            current,
            _meshChildFor(children),
            snapshot,
            _surfaceTextureFor(children),
            _surfaceAppearanceFor(children),
          );
          if (part) parts.push(part);
        }
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      await _yieldFrame();
    }
    return parts;
  }

  function _updateRenderStats(buildKey, scene) {
    const stats = _container()?.querySelector(`[data-render-stats="${_cssEscape(buildKey)}"]`);
    if (!stats) return;
    stats.innerHTML = `<span>${(scene.partCount || scene.parts.length).toLocaleString()} parts</span><span>${(scene.mesh.visualTriangleCount || scene.mesh.triangleCount).toLocaleString()} tris</span>${scene.assetCount ? `<span>${scene.assetReady.toLocaleString()}/${scene.assetCount.toLocaleString()} meshes</span>` : ''}${scene.assetFailed ? `<span>${scene.assetFailed.toLocaleString()} unavailable</span>` : ''}`;
  }

  async function _parallelMap(items, concurrency, fn, shouldContinue = null) {
    const results = [];
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length && (!shouldContinue || shouldContinue())) {
        const i = index++;
        results[i] = await fn(items[i]).catch((err) => err);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function _loadMeshAsset(asset) {
    const key = _meshAssetKey(asset);
    try {
      const bytes = asset.embedded
        ? _decodeMeshBlob(asset.embedded)
        : await _fetchMeshAssetBytes(asset.id);
      const mesh = await _parseRobloxMesh(bytes);
      state_.meshAssets.set(key, { status: 'ready', mesh, lastUsed: Date.now() });
      state_.meshVersion += 1;
      _trimMeshAssets();
      _clearSceneCache();
    } catch (err) {
      state_.meshAssets.set(
        key,
        _meshFailureState(
          err?.message || String(err || 'Mesh unavailable'),
          state_.meshAssets.get(key),
        ),
      );
      state_.meshVersion += 1;
      _trimMeshAssets();
      _clearSceneCache();
    }
  }

  function _extractAssetId(value) {
    const text = String(value || '').trim();

    const m1 = text.match(/rbxasset(?:id)?:\/\/(\d+)/i);
    if (m1) return m1[1];

    const m2 = text.match(/[?&]id=(\d+)/i);
    if (m2) return m2[1];

    const m3 = text.match(/\/(?:asset|assetId)\/(\d+)/i);
    if (m3) return m3[1];

    const m4 = text.match(/\b(\d{5,})\b/);
    if (m4) return m4[1];
    return '';
  }

  function _meshFailureState(message, previous = null) {
    const failedAt = Date.now();
    const transient = /429|timed out|timeout|network|fetch|5\\d\\d/i.test(String(message || ''));
    const attempts = (previous?.attempts || 0) + 1;
    return {
      status: 'failed',
      failedAt,
      retryAt: failedAt + (transient ? Math.min(30000, 4000 * attempts) : 120000),
      transient,
      attempts,
      message,
    };
  }

  function _errMsg(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err?.message) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function _sniffPayloadType(bytes) {
    if (!bytes?.length) return 'empty';
    const h = bytes;
    const hdr = new TextDecoder().decode(h.slice(0, Math.min(16, h.length)));
    if (/^version 1\.0/.test(hdr)) return 'mesh(text/v1)';
    if (/^version \d/.test(hdr)) return 'mesh';
    if (h[0] === 0xff && h[1] === 0xd8) return 'jpeg';
    if (h[0] === 0x89 && h[1] === 0x50) return 'png';
    if (h[0] === 0x47 && h[1] === 0x49) return 'gif';
    if (h[0] === 0x52 && h[1] === 0x49 && h[8] === 0x57) return 'wav';
    if (h[0] === 0x3c) return 'html/xml';
    if (h[0] === 0x7b) return 'json';
    if (h[0] === 0x1f && h[1] === 0x8b) return 'gzip';
    if (h[0] === 0x4f && h[1] === 0x67) return 'ogg';
    if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'mp3';
    if (h[0] === 0x66 && h[1] === 0x74 && h[2] === 0x79) return 'mp4';
    return `unknown(0x${h[0].toString(16).padStart(2, '0')}${h[1]?.toString(16).padStart(2, '0') ?? ''})`;
  }

  async function _fetchMeshAssetBytes(id) {
    if (!id) throw new Error('Missing mesh asset id');
    const numericId = _extractAssetId(id) || id;
    return _fetchAssetBytesById(numericId, {
      hint: 'mesh',
      label: `mesh ${numericId}`,
      timeoutMs: MESH_FETCH_TIMEOUT_MS,
      headers: {
        ...ROBLOX_DESKTOP_HEADERS,
        Accept: ['application/octet-stream', ANY_MIME].join(','),
      },
      validate: _isMeshPayload,
    });
  }

  function _invokeWithTimeout(command, args, timeoutMs, label) {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return Promise.reject(new Error('Tauri not available'));
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label || command} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    return Promise.race([invoke(command, args), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function _rateLimitedInvoke(command, args, timeoutMs, label) {
    await _waitForAssetBudget();
    return _invokeWithTimeout(command, args, timeoutMs, label);
  }

  async function _waitForAssetBudget() {
    while (true) {
      const now = performance.now();
      while (_assetFetchWindow.length && now - _assetFetchWindow[0] > ASSET_RATE_LIMIT_WINDOW_MS) {
        _assetFetchWindow.shift();
      }
      if (_assetFetchWindow.length < ASSET_RATE_LIMIT_COUNT) {
        _assetFetchWindow.push(now);
        return;
      }
      const waitMs = Math.max(12, ASSET_RATE_LIMIT_WINDOW_MS - (now - _assetFetchWindow[0]) + 8);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  function _trimMeshAssets() {
    const protectedKeys = new Set([
      ...(state_.viewportBuild.activeAssetKeys || []),
      ...(state_.viewportBuild.scene?.assets || []).map(_meshAssetKey),
    ]);
    for (const [key, val] of state_.meshAssets) {
      if (val.status === 'failed' && Date.now() - (val.failedAt || 0) > 300000) {
        state_.meshAssets.delete(key);
      }
    }
    const ready = [...state_.meshAssets.entries()]
      .filter(([key, val]) => val.status === 'ready' && !protectedKeys.has(key))
      .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    while (ready.length > MAX_READY_MESH_CACHE_ENTRIES) {
      const [key] = ready.shift();
      state_.meshAssets.delete(key);
    }
  }

  function _sceneAssetKeys(scene) {
    return new Set((scene?.assets || []).map(_meshAssetKey).filter(Boolean));
  }

  async function _fetchAssetBlob(id, hint) {
    if (!id) return null;
    const numericId = _extractAssetId(String(id)) || String(id);
    const cacheKey = `${hint || 'asset'}:${numericId}`;
    const cached = state_.assetBlobs.get(cacheKey);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.url;
    }
    try {
      const bytes = await _fetchAssetBytesById(numericId, {
        hint: hint || 'asset',
        label: `${hint || 'asset'} ${numericId}`,
        timeoutMs: ASSET_FETCH_TIMEOUT_MS,
        headers: ROBLOX_DESKTOP_HEADERS,
        validate: (candidate) => _isBlobPayloadForHint(candidate, hint),
      });
      const mime = _sniffBlobMime(bytes, hint);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      _cacheAssetBlob(cacheKey, blobUrl, bytes.length);
      return blobUrl;
    } catch (err) {
      _log.error(`All fetches failed for id=${numericId}: ${_errMsg(err)}`);
      return null;
    }
  }

  async function _fetchAssetBytesById(
    id,
    { hint = 'asset', label = hint, timeoutMs = ASSET_FETCH_TIMEOUT_MS, headers, validate } = {},
  ) {
    if (!id) throw new Error('Missing asset id');
    const numericId = _extractAssetId(String(id)) || String(id);
    const fetchKey = `${hint}:${numericId}`;
    const existing = state_.assetByteFetches.get(fetchKey);
    if (existing) return existing;

    const task = (async () => {
      const verifier = typeof validate === 'function' ? validate : _isUsableAssetPayload;
      const cached = await _readCachedAssetBytes(numericId, verifier);
      if (cached) return cached;

      _log.fetch(`Fetching ${hint} id=${numericId}`);
      let lastError = null;
      let deliveryDenial = null;
      let deliveryDenialCount = 0;
      const requestHeaders = headers || ROBLOX_DESKTOP_HEADERS;
      const deliveryHeaders = {
        ...ROBLOX_DESKTOP_HEADERS,
        Accept: ['application/json', ANY_MIME].join(','),
      };

      for (const apiUrl of _assetDeliveryApiUrls(numericId)) {
        try {
          _log.fetch(`  delivery API: ${apiUrl}`);
          const raw = await _rateLimitedInvoke(
            'http_fetch',
            { url: apiUrl, headers: deliveryHeaders },
            ASSET_FETCH_TIMEOUT_MS,
            `asset delivery ${numericId}`,
          );
          const data = JSON.parse(raw);
          const apiErr = data?.errors?.[0]?.message || data?.error || data?.message;
          const location =
            data?.location || data?.locations?.find((entry) => entry?.location)?.location;
          if (!location) {
            lastError = new Error(apiErr || 'No delivery location');
            if (_isHardAssetDenial(apiErr)) {
              deliveryDenial = apiErr;
              deliveryDenialCount += 1;
            }
            _log.warn(`  delivery API had no location: ${lastError.message}`);
            continue;
          }
          _log.fetch(`  CDN: ${location.split('?')[0]}`);
          const bytes = _base64ToBytes(
            await _rateLimitedInvoke(
              'http_fetch_binary',
              { url: location, headers: requestHeaders },
              timeoutMs,
              `${label} CDN`,
            ),
          );
          if (!verifier(bytes)) {
            lastError = new Error(`Rejected ${_sniffPayloadType(bytes)} payload from CDN`);
            _log.warn(`  CDN rejected: ${_sniffPayloadType(bytes)} ${bytes.length}B`);
            continue;
          }
          await _writeCachedAssetBytes(numericId, bytes);
          _log.fetch(`  ✓ CDN (${bytes.length}B)`);
          return bytes;
        } catch (err) {
          lastError = new Error(_errMsg(err));
          _log.warn(`  delivery failed: ${_errMsg(err)}`);
          await _backoffIfRateLimited(err);
        }
      }

      if (deliveryDenial && deliveryDenialCount >= _assetDeliveryApiUrls(numericId).length) {
        throw new Error(deliveryDenial);
      }

      for (const url of _assetDirectUrls(numericId)) {
        try {
          _log.fetch(`  direct: ${url}`);
          const bytes = _base64ToBytes(
            await _rateLimitedInvoke(
              'http_fetch_binary',
              { url, headers: requestHeaders },
              timeoutMs,
              label,
            ),
          );
          if (!verifier(bytes)) {
            lastError = new Error(`Rejected ${_sniffPayloadType(bytes)} payload from direct URL`);
            _log.warn(`  direct rejected: ${_sniffPayloadType(bytes)} ${bytes.length}B`);
            continue;
          }
          await _writeCachedAssetBytes(numericId, bytes);
          _log.fetch(`  ✓ direct (${bytes.length}B)`);
          return bytes;
        } catch (err) {
          lastError = new Error(_errMsg(err));
          _log.warn(`  direct failed: ${_errMsg(err)}`);
          await _backoffIfRateLimited(err);
        }
      }

      const msg = lastError?.message || `${label} unavailable`;
      throw new Error(msg);
    })();

    state_.assetByteFetches.set(fetchKey, task);
    try {
      return await task;
    } finally {
      state_.assetByteFetches.delete(fetchKey);
    }
  }

  function _assetDeliveryApiUrls(id) {
    const encoded = encodeURIComponent(id);
    return [
      `https://assetdelivery.roblox.com/v2/assetId/${encoded}`,
      `https://assetdelivery.roblox.com/v1/assetId/${encoded}`,
    ];
  }

  function _assetDirectUrls(id) {
    const encoded = encodeURIComponent(id);
    return [
      `https://assetdelivery.roblox.com/v1/asset/?id=${encoded}`,
      `https://www.roblox.com/asset/?id=${encoded}`,
    ];
  }

  async function _backoffIfRateLimited(err) {
    const msg = _errMsg(err);
    if (!/429/.test(msg)) return;
    _log.warn(`  rate-limited (429), backing off 1.5s`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  async function _readCachedAssetBytes(id, validate) {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return null;
    try {
      const bytes = _base64ToBytes(
        await invoke('read_binary_file', {
          path: _assetCachePath(id),
        }),
      );
      if (!validate(bytes)) {
        _log.warn(`  disk cache rejected id=${id}: ${_sniffPayloadType(bytes)} ${bytes.length}B`);
        invoke('remove_path', { path: _assetCachePath(id) }).catch(() => {});
        return null;
      }
      _log.fetch(`  ✓ disk cache id=${id} (${bytes.length}B)`);
      return bytes;
    } catch {
      return null;
    }
  }

  async function _writeCachedAssetBytes(id, bytes) {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || !bytes?.length) return;
    try {
      await invoke('write_binary_file', {
        path: _assetCachePath(id),
        contentBase64: _bytesToBase64(bytes),
      });
    } catch (err) {
      _log.warn(`  disk cache write failed id=${id}: ${_errMsg(err)}`);
    }
  }

  function _isUsableAssetPayload(bytes) {
    return !!bytes?.length && !_isRejectedAssetPayload(bytes);
  }

  function _isHardAssetDenial(message) {
    return /authentication required|not approved for the requester/i.test(String(message || ''));
  }

  function _isRejectedAssetPayload(bytes) {
    const type = _sniffPayloadType(bytes);
    return type === 'empty' || type === 'html/xml' || type === 'json';
  }

  function _isBlobPayloadForHint(bytes, hint) {
    if (!_isUsableAssetPayload(bytes)) return false;
    if (hint === 'image') return _isImagePayload(bytes);
    if (hint === 'audio') return _isAudioPayload(bytes);
    return true;
  }

  function _isImagePayload(bytes) {
    return (
      (bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (bytes[0] === 0x89 && bytes[1] === 0x50) ||
      (bytes[0] === 0x47 && bytes[1] === 0x49)
    );
  }

  function _isAudioPayload(bytes) {
    return (
      (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) ||
      (bytes[0] === 0x4f && bytes[1] === 0x67) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
      (bytes[0] === 0x66 && bytes[1] === 0x74 && bytes[2] === 0x79)
    );
  }

  function _sniffBlobMime(bytes, hint) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'audio/wav';
    if (bytes[0] === 0x4f && bytes[1] === 0x67) return 'audio/ogg';
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
    if (bytes[0] === 0x66 && bytes[1] === 0x74 && bytes[2] === 0x79) return 'audio/mp4';
    return hint === 'audio' ? 'audio/mpeg' : 'application/octet-stream';
  }

  function _cacheAssetBlob(key, url, bytes = 0) {
    state_.assetBlobs.set(key, { url, bytes, lastUsed: Date.now() });
    _trimAssetBlobs();
  }

  function _trimAssetBlobs() {
    const entries = [...state_.assetBlobs.entries()].sort(
      (a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0),
    );
    let totalBytes = entries.reduce((sum, [, entry]) => sum + (entry.bytes || 0), 0);
    while (
      entries.length > MAX_ASSET_BLOB_CACHE_ENTRIES ||
      totalBytes > MAX_ASSET_BLOB_CACHE_BYTES
    ) {
      const [key, entry] = entries.shift() || [];
      if (!key || !entry) break;
      URL.revokeObjectURL(entry.url);
      state_.assetBlobs.delete(key);
      totalBytes -= entry.bytes || 0;
    }
  }

  function _meshAssetKey(asset) {
    if (!asset) return '';
    return asset.embedded
      ? `embedded:${asset.embedded.length}:${asset.embedded.slice(0, 48)}`
      : asset.id
        ? `mesh:${asset.id}`
        : '';
  }

  function _base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function _bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function _decodeMeshBlob(value) {
    const text = String(value || '').trim();
    const b64 = text.includes(',') ? text.split(',').pop() : text;
    if (/^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 80)
      return _base64ToBytes(b64.replace(/\s+/g, ''));
    return new TextEncoder().encode(text);
  }

  async function _parseRobloxMesh(bytes) {
    bytes = await _decompressIfGzip(bytes);
    bytes = _meshPayload(bytes);
    const headerText = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 32)));
    const header = headerText.match(/^version \d+\.\d\d/)?.[0];
    if (!header) throw new Error('Unknown mesh header');
    if (/version 1\.0[01]/.test(header)) return _parseMeshV1(bytes, header.endsWith('1.00'));
    if (/version 2\.00/.test(header)) return _parseMeshV2(bytes, header.length + 1);
    if (/version 3\.0[01]/.test(header)) return _parseMeshV3(bytes, header.length + 1);
    if (/version [45]\.0[01]/.test(header)) return _parseMeshV4(bytes, header.length + 1);
    if (/version 7\.00/.test(header) && DataTreeMeshCodec.canParseCompressedCoreMesh(bytes)) {
      const mesh = await DataTreeMeshCodec.parseCompressedCoreMesh(bytes);
      return _finishParsedMesh(mesh.positions, mesh.indices, mesh.normals, mesh.uvs);
    }
    throw new Error(
      `${header} needs embedded compressed mesh data that is not present in RBXLX-native mode`,
    );
  }

  function _isMeshPayload(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
    const payload = _meshPayload(bytes);
    const headerText = new TextDecoder().decode(payload.slice(0, Math.min(payload.length, 32)));
    return /^version \d+\.\d\d/.test(headerText);
  }

  function _meshPayload(bytes) {
    const marker = _bytesIndexOf(bytes, 'version ');
    return marker > 0 ? bytes.slice(marker) : bytes;
  }

  async function _decompressIfGzip(bytes) {
    if (!bytes || bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      let totalLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
      const out = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      _log.fetch(`  gzip decompressed ${bytes.length}B → ${out.length}B`);
      return out;
    } catch (err) {
      _log.warn(`  gzip decompress failed: ${err?.message} — using raw bytes`);
      return bytes;
    }
  }

  function _bytesIndexOf(bytes, text, start = 0) {
    const needle = new TextEncoder().encode(text);
    outer: for (let i = Math.max(0, start); i <= bytes.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function _parseMeshV1(bytes, halfScale) {
    const text = new TextDecoder().decode(bytes);
    const values = [
      ...text
        .split('\n')
        .slice(2)
        .join('')
        .matchAll(/\[([^\]]+)\]/g),
    ].map((match) => match[1].split(',').map(Number));
    const positions = [];
    const indices = [];
    for (let i = 0; i + 8 < values.length; i += 9) {
      for (let j = 0; j < 3; j += 1) {
        const point = values[i + j * 3] || [0, 0, 0];
        positions.push(
          point[0] * (halfScale ? 0.5 : 1),
          point[1] * (halfScale ? 0.5 : 1),
          point[2] * (halfScale ? 0.5 : 1),
        );
        indices.push(indices.length);
      }
    }
    return _finishParsedMesh(positions, indices);
  }

  function _parseMeshV2(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vertexSize = view.getUint8(offset + 2);
    const faceSize = view.getUint8(offset + 3);
    const numVerts = view.getUint32(offset + 4, true);
    const numFaces = view.getUint32(offset + 8, true);
    return _parseMeshArrays(view, offset + 12, numVerts, numFaces, vertexSize, faceSize, null);
  }

  function _parseMeshV3(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vertexSize = view.getUint8(offset + 2);
    const faceSize = view.getUint8(offset + 3);
    const lodCount = view.getUint16(offset + 6, true);
    const numVerts = view.getUint32(offset + 8, true);
    const numFaces = view.getUint32(offset + 12, true);
    return _parseMeshArrays(view, offset + 16, numVerts, numFaces, vertexSize, faceSize, lodCount);
  }

  function _parseMeshV4(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerSize = view.getUint16(offset, true);
    const numVerts = view.getUint32(offset + 4, true);
    const numFaces = view.getUint32(offset + 8, true);
    const lodCount = view.getUint16(offset + 12, true);
    return _parseMeshArrays(view, offset + headerSize, numVerts, numFaces, 40, 12, lodCount);
  }

  function _parseMeshArrays(view, offset, numVerts, numFaces, vertexSize, faceSize, lodCount) {
    const vertexBytes = offset + numVerts * vertexSize;
    const faceBytes = vertexBytes + numFaces * faceSize;
    if (!numVerts || !numFaces || vertexBytes > view.byteLength || faceBytes > view.byteLength)
      throw new Error('Invalid mesh dimensions');
    const positions = new Float32Array(numVerts * 3);
    let cursor = offset;
    for (let i = 0; i < numVerts; i += 1) {
      positions[i * 3] = view.getFloat32(cursor, true);
      positions[i * 3 + 1] = view.getFloat32(cursor + 4, true);
      positions[i * 3 + 2] = view.getFloat32(cursor + 8, true);
      cursor += vertexSize;
    }
    const rawFaces = [];
    for (let i = 0; i < numFaces; i += 1) {
      const a = faceSize === 6 ? view.getUint16(cursor, true) : view.getUint32(cursor, true);
      const b =
        faceSize === 6 ? view.getUint16(cursor + 2, true) : view.getUint32(cursor + 4, true);
      const c =
        faceSize === 6 ? view.getUint16(cursor + 4, true) : view.getUint32(cursor + 8, true);
      if (a < numVerts && b < numVerts && c < numVerts) rawFaces.push(a, b, c);
      cursor += faceSize;
    }
    let endFace = rawFaces.length / 3;
    if (lodCount && lodCount > 1 && cursor + lodCount * 4 <= view.byteLength) {
      const lods = Array.from({ length: lodCount }, (_, index) =>
        view.getUint32(cursor + index * 4, true),
      );
      if (lods[1] > lods[0] && lods[1] <= endFace) endFace = lods[1];
    }
    const normals = new Float32Array(numVerts * 3);
    const uvs = new Float32Array(numVerts * 2);
    cursor = offset;
    for (let i = 0; i < numVerts; i += 1) {
      if (vertexSize >= 24) {
        normals[i * 3] = view.getFloat32(cursor + 12, true);
        normals[i * 3 + 1] = view.getFloat32(cursor + 16, true);
        normals[i * 3 + 2] = view.getFloat32(cursor + 20, true);
      }
      if (vertexSize >= 32) {
        uvs[i * 2] = view.getFloat32(cursor + 24, true);
        uvs[i * 2 + 1] = 1 - view.getFloat32(cursor + 28, true);
      }
      cursor += vertexSize;
    }
    return _finishParsedMesh(
      positions,
      rawFaces.slice(0, endFace * 3),
      normals,
      vertexSize >= 32 ? uvs : null,
    );
  }

  function _finishParsedMesh(positionsInput, indicesInput, normalsInput = null, uvsInput = null) {
    const positions =
      positionsInput instanceof Float32Array ? positionsInput : new Float32Array(positionsInput);
    const indices =
      indicesInput instanceof Uint32Array ? indicesInput : new Uint32Array(indicesInput);
    const normals =
      normalsInput instanceof Float32Array
        ? normalsInput
        : normalsInput
          ? new Float32Array(normalsInput)
          : null;
    const uvs =
      uvsInput instanceof Float32Array ? uvsInput : uvsInput ? new Float32Array(uvsInput) : null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
    const bounds = { min, max };
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const size = bounds.max.map((item, index) => Math.max(item - bounds.min[index], 0.0001));
    return {
      positions,
      indices,
      normals,
      uvs,
      center,
      size,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
    };
  }

  function _viewportLightCapacity(gl) {
    const vectors = Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 128;
    if (VIEWPORT_PERFORMANCE_MODE) return MAX_VIEWPORT_LIGHTS;
    if (vectors >= 160) return MAX_VIEWPORT_LIGHTS;
    if (vectors >= 112) return 16;
    if (vectors >= 88) return 12;
    return 8;
  }

  function _createViewportProgram(gl) {
    const lightCapacity = _viewportLightCapacity(gl);
    const vertex = _compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec4 aColor;
      attribute float aFlag;
      attribute float aMatId;
      uniform mat4 uMvp;
      uniform float uUnlit;
      uniform vec3 uCamOffset;
      varying vec4  vColor;
      varying vec3  vNormal;
      varying vec3  vWorld;
      varying vec3  vPosition;
      varying float vUnlit;
      varying float vFlag;
      varying float vMatId;
      void main() {
        vColor    = aColor;
        vNormal   = aNormal;
        vWorld    = aPosition - uCamOffset;
        vPosition = aPosition;
        vUnlit    = uUnlit;
        vFlag     = aFlag;
        vMatId    = aMatId;
        gl_Position = uMvp * vec4(aPosition, 1.0);
      }
    `,
    );
    const fragment = _compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision highp float;
      varying vec4  vColor;
      varying vec3  vNormal;
      varying vec3  vWorld;
      varying vec3  vPosition;
      varying float vUnlit;
      varying float vFlag;
      varying float vMatId;
      uniform vec3  uCameraPos;
      uniform vec3  uTint;
      uniform float uExposure;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uAmbientLift;
      uniform float uShadowLift;
      uniform float uBloom;
      uniform float uDetailQuality;
      uniform float uPerformanceMode;
      uniform vec3  uSkyColor;
      uniform vec3  uGroundColor;
      uniform vec3  uLocalAmbient;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform float uSunStrength;
      uniform int   uLightCount;
      uniform vec3  uLightPos[${lightCapacity}];
      uniform vec3  uLightColor[${lightCapacity}];
      uniform float uLightRange[${lightCapacity}];
      uniform vec3  uLightDir[${lightCapacity}];
      uniform float uLightKind[${lightCapacity}];
      uniform float uLightConeCos[${lightCapacity}];

      const float PI = 3.14159265359;

      // ── Hash / noise ────────────────────────────────────────────────────────
      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 17.5);
        return fract(p.x * p.y);
      }
      float hash31(vec3 p) {
        p = fract(p * vec3(127.1, 311.7, 74.7));
        p += dot(p, p + 19.19);
        return fract(p.x * p.y * p.z);
      }
      float valueNoise2(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
                   mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
      }
      // 4-octave FBM
      float fbm(vec2 p) {
        float v=0.0, a=0.5;
        for(int i=0;i<4;i++){v+=a*valueNoise2(p);p*=2.1;a*=0.5;}
        return v;
      }
      // 3-D value noise for volume texturing
      float valueNoise3(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
              mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
              mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
      }

      // ── Tangent frame ────────────────────────────────────────────────────────
      void tangentFrame(vec3 n, out vec3 t, out vec3 b) {
        t = abs(n.y) < 0.85 ? vec3(0,1,0) : vec3(1,0,0);
        t = normalize(cross(t, n));
        b = cross(n, t);
      }

      // ── Per-material PBR params: rough, metallic, f0, sssStrength ───────────
      // matId: 0=plastic 1=wood 2=metal 3=concrete 4=brick 5=cobble
      //        6=rock   7=fabric 8=diamondplate 9=limestone 10=asphalt 11=tiles
      vec4 matParams(int id) {
        // rough, metallic, f0, sss
        if (id ==  1) return vec4(0.78, 0.00, 0.04, 0.06); // wood
        if (id ==  2) return vec4(0.22, 1.00, 0.72, 0.00); // metal
        if (id ==  3) return vec4(0.90, 0.00, 0.03, 0.00); // concrete
        if (id ==  4) return vec4(0.84, 0.00, 0.04, 0.02); // brick
        if (id ==  5) return vec4(0.88, 0.00, 0.04, 0.00); // cobble
        if (id ==  6) return vec4(0.91, 0.00, 0.03, 0.00); // rock
        if (id ==  7) return vec4(0.97, 0.00, 0.02, 0.12); // fabric/cloth
        if (id ==  8) return vec4(0.14, 1.00, 0.86, 0.00); // diamondplate
        if (id ==  9) return vec4(0.82, 0.00, 0.05, 0.01); // limestone
        if (id == 10) return vec4(0.96, 0.00, 0.02, 0.00); // asphalt
        if (id == 11) return vec4(0.48, 0.00, 0.18, 0.00); // ceramic tiles
        return vec4(0.68, 0.00, 0.05, 0.04);               // plastic
      }

      // ── Cook-Torrance BRDF helpers ───────────────────────────────────────────
      // GGX NDF
      float D_GGX(float ndh, float a2) {
        float d = ndh*ndh*(a2-1.0)+1.0;
        return a2 / (PI*d*d + 1e-5);
      }
      // Smith G1 Schlick-GGX
      float G1_Schlick(float ndx, float k) {
        return ndx / (ndx*(1.0-k)+k + 1e-5);
      }
      // Smith G correlated
      float G_Smith(float ndv, float ndl, float rough) {
        float k = (rough+1.0)*(rough+1.0)*0.125;
        return G1_Schlick(ndv,k)*G1_Schlick(ndl,k);
      }
      // Schlick fresnel
      vec3 F_Schlick(vec3 f0, float vdh) {
        return f0 + (1.0-f0)*pow(1.0-vdh, 5.0);
      }
      // Full specular lobe
      vec3 specularBRDF(float ndh, float ndl, float ndv, float vdh, float rough, vec3 f0) {
        float a  = rough*rough;
        float a2 = a*a;
        float D  = D_GGX(ndh, a2);
        float G  = G_Smith(ndv, ndl, rough);
        vec3  F  = F_Schlick(f0, vdh);
        return (D*G*F) / (4.0*ndv*ndl + 1e-5);
      }

      // ── IBL split-sum approximation ─────────────────────────────────────────
      // Cheap env BRDF fit (Karis 2013)
      vec2 envBRDF(float ndv, float rough) {
        vec4 c0 = vec4(-1.0,-0.0275,-0.572, 0.022);
        vec4 c1 = vec4( 1.0, 0.0425, 1.040,-0.040);
        vec4 r  = rough*c0+c1;
        float a004 = min(r.x*r.x, exp2(-9.28*ndv))*r.x+r.y;
        return vec2(-1.04,1.04)*a004 + r.zw;
      }
      vec3 iblSpecular(vec3 f0, float rough, float ndv, vec3 envRef) {
        vec2 brdf = envBRDF(ndv, rough);
        return envRef * (f0*brdf.x + brdf.y);
      }

      // ── Procedural bump (FBM-based, per material) ───────────────────────────
      // worldPos is in Roblox studs — normalize to ~1-unit scale before sampling.
      // 1 stud ≈ 0.28m, typical part is 4 studs wide → use 0.25 as base scale.
      vec3 proceduralBump(int matId, vec3 worldPos, vec3 baseNormal) {
        if (uDetailQuality < 0.5) return baseNormal;
        if (matId == 0) return baseNormal;
        vec3 t, b;
        tangentFrame(baseNormal, t, b);
        // Scale world position to ~1 unit per stud for noise sampling
        vec3 sp = worldPos * 0.25;
        vec2 uv = vec2(dot(sp,t), dot(sp,b));
        float h, h1, h2, eps, strength;

        if (matId == 1) {
          // Wood — plank grain
          vec2 uvw = vec2(uv.x*0.7, uv.y*6.0);
          float grain = valueNoise2(uvw)*0.6 + valueNoise2(uvw*2.1+3.3)*0.4;
          float plank = smoothstep(0.90,1.0, abs(fract(uv.x*1.1+0.5)*2.0-1.0));
          h = grain*0.7+plank*0.3; eps=0.06; strength=0.55;
          h1 = valueNoise2(uvw+vec2(eps,0))*0.6+valueNoise2((uvw+vec2(eps,0))*2.1+3.3)*0.4 + smoothstep(0.90,1.0,abs(fract((uv.x+eps)*1.1+0.5)*2.0-1.0))*0.3;
          h2 = valueNoise2(uvw+vec2(0,eps))*0.6+valueNoise2((uvw+vec2(0,eps))*2.1+3.3)*0.4 + plank*0.3;
        } else if (matId == 2) {
          // Metal — fine brushed scratch
          vec2 uvw = uv * 8.0;
          float scratch = valueNoise2(vec2(uvw.x*4.0,uvw.y*0.3))*0.7 + valueNoise2(uvw*1.5)*0.3;
          h = scratch; eps=0.04; strength=0.18;
          h1 = valueNoise2(vec2((uvw.x+eps)*4.0,uvw.y*0.3))*0.7+valueNoise2((uvw+vec2(eps,0))*1.5)*0.3;
          h2 = valueNoise2(vec2(uvw.x*4.0,(uvw.y+eps)*0.3))*0.7+valueNoise2((uvw+vec2(0,eps))*1.5)*0.3;
        } else if (matId == 3) {
          // Concrete — coarse aggregate only (no cracks at stud scale)
          vec2 uvw = uv * 1.8;
          h = valueNoise2(uvw)*0.6+valueNoise2(uvw*2.8+1.3)*0.4; eps=0.05; strength=0.45;
          h1 = valueNoise2(uvw+vec2(eps,0))*0.6+valueNoise2((uvw+vec2(eps,0))*2.8+1.3)*0.4;
          h2 = valueNoise2(uvw+vec2(0,eps))*0.6+valueNoise2((uvw+vec2(0,eps))*2.8+1.3)*0.4;
        } else if (matId == 4) {
          // Brick — mortar joints
          vec2 uvw = uv * 2.0;
          float row = floor(uvw.y);
          vec2 bk = vec2(fract(uvw.x+mod(row,2.0)*0.5), fract(uvw.y));
          float mx = smoothstep(0.0,0.07,bk.x)*smoothstep(0.0,0.07,1.0-bk.x);
          float my = smoothstep(0.0,0.06,bk.y)*smoothstep(0.0,0.06,1.0-bk.y);
          float face = valueNoise2(bk*4.0+row)*0.28;
          h = mx*my*(0.65+face); eps=0.04; strength=0.9;
          float bx2=fract(uvw.x+mod(row,2.0)*0.5+eps);
          float mx2=smoothstep(0.0,0.07,bx2)*smoothstep(0.0,0.07,1.0-bx2);
          float by2=fract(uvw.y+eps);
          float my2=smoothstep(0.0,0.06,by2)*smoothstep(0.0,0.06,1.0-by2);
          h1=mx2*my*(0.65+face); h2=mx*my2*(0.65+face);
        } else if (matId == 5) {
          // Cobblestone — voronoi, smaller scale
          vec2 uvw = uv * 1.4;
          vec2 cell=floor(uvw); vec2 frc=fract(uvw);
          float md=1.0;
          for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
            vec2 nb=vec2(float(dx),float(dy));
            vec2 jit=vec2(hash21(cell+nb),hash21(cell+nb+13.7));
            md=min(md,length(frc-nb-jit));
          }
          h=1.0-smoothstep(0.0,0.42,md); eps=0.04; strength=0.75;
          h1=1.0-smoothstep(0.0,0.42,md+valueNoise2((uvw+vec2(eps,0))*2.0)*0.06-0.03);
          h2=1.0-smoothstep(0.0,0.42,md+valueNoise2((uvw+vec2(0,eps))*2.0)*0.06-0.03);
        } else if (matId == 6) {
          // Rock — 2-octave fracture
          vec2 uvw = uv * 2.8;
          h = valueNoise2(uvw)*0.55+valueNoise2(uvw*2.9+1.8)*0.45; eps=0.05; strength=0.7;
          h1=valueNoise2(uvw+vec2(eps,0))*0.55+valueNoise2((uvw+vec2(eps,0))*2.9+1.8)*0.45;
          h2=valueNoise2(uvw+vec2(0,eps))*0.55+valueNoise2((uvw+vec2(0,eps))*2.9+1.8)*0.45;
        } else if (matId == 7) {
          // Fabric — woven weave
          vec2 uvw = uv * 10.0;
          float wx=abs(sin(uvw.x*PI*4.0))*0.5; float wy=abs(sin(uvw.y*PI*4.0))*0.5;
          h=wx*0.5+wy*0.5+valueNoise2(uvw*1.2)*0.12; eps=0.04; strength=0.35;
          h1=abs(sin((uvw.x+eps)*PI*4.0))*0.25+wy*0.5;
          h2=wx*0.5+abs(sin((uvw.y+eps)*PI*4.0))*0.25;
        } else if (matId == 8) {
          // Diamondplate — raised diamond tread
          vec2 uvw = uv * 2.0;
          float d1=abs(fract(uvw.x+uvw.y)-0.5)*2.0;
          float d2=abs(fract(uvw.x-uvw.y)-0.5)*2.0;
          h=pow(d1*d2,0.55); eps=0.03; strength=0.85;
          h1=pow(abs(fract(uvw.x+eps+uvw.y)-0.5)*2.0*d2,0.55);
          h2=pow(d1*abs(fract(uvw.x-uvw.y-eps)-0.5)*2.0,0.55);
        } else if (matId == 9) {
          // Limestone — strata
          vec2 uvw = uv * 1.1;
          float strata=sin(uvw.y*PI*3.0+valueNoise2(uvw*0.5)*1.8)*0.5+0.5;
          h=strata*0.7+valueNoise2(uvw*2.2)*0.3; eps=0.05; strength=0.5;
          h1=sin(uvw.y*PI*3.0+valueNoise2((uvw+vec2(eps,0))*0.5)*1.8)*0.35+0.5+valueNoise2((uvw+vec2(eps,0))*2.2)*0.3;
          h2=sin((uvw.y+eps)*PI*3.0+valueNoise2((uvw+vec2(0,eps))*0.5)*1.8)*0.35+0.5+valueNoise2((uvw+vec2(0,eps))*2.2)*0.3;
        } else if (matId == 10) {
          // Asphalt — gritty
          vec2 uvw = uv * 2.5;
          h=valueNoise2(uvw)*0.55+valueNoise2(uvw*3.8+2.6)*0.45; eps=0.05; strength=0.38;
          h1=valueNoise2(uvw+vec2(eps,0))*0.55+valueNoise2((uvw+vec2(eps,0))*3.8+2.6)*0.45;
          h2=valueNoise2(uvw+vec2(0,eps))*0.55+valueNoise2((uvw+vec2(0,eps))*3.8+2.6)*0.45;
        } else {
          // Ceramic tiles — grout lines
          vec2 uvw = uv * 2.0;
          float gx=smoothstep(0.0,0.05,fract(uvw.x))*smoothstep(0.0,0.05,1.0-fract(uvw.x));
          float gy=smoothstep(0.0,0.05,fract(uvw.y))*smoothstep(0.0,0.05,1.0-fract(uvw.y));
          h=gx*gy; eps=0.025; strength=0.55;
          float gx2=smoothstep(0.0,0.05,fract(uvw.x+eps))*smoothstep(0.0,0.05,1.0-fract(uvw.x+eps));
          float gy2=smoothstep(0.0,0.05,fract(uvw.y+eps))*smoothstep(0.0,0.05,1.0-fract(uvw.y+eps));
          h1=gx2*gy; h2=gx*gy2;
        }
        float bx=(h-h1)*strength, by=(h-h2)*strength;
        return normalize(baseNormal + t*bx + b*by);
      }

      // Per-material cavity AO from bump gradient
      float bumpCavity(int matId, vec3 worldPos, vec3 baseNormal) {
        if (uDetailQuality < 0.5 || matId == 0) return 1.0;
        vec3 t, b; tangentFrame(baseNormal, t, b);
        vec3 sp = worldPos * 0.25;
        vec2 uv = vec2(dot(sp,t), dot(sp,b));
        float h0, h1, h2;
        if (matId==4) {
          vec2 u=uv*2.0; float row=floor(u.y);
          vec2 bk=vec2(fract(u.x+mod(row,2.0)*0.5),fract(u.y));
          h0=smoothstep(0.0,0.07,bk.x)*smoothstep(0.0,0.07,1.0-bk.x)*smoothstep(0.0,0.06,bk.y)*smoothstep(0.0,0.06,1.0-bk.y);
          vec2 bk2=vec2(fract(u.x+0.04+mod(row,2.0)*0.5),bk.y);
          h1=smoothstep(0.0,0.07,bk2.x)*smoothstep(0.0,0.07,1.0-bk2.x)*h0/max(h0,0.01);
          h2=h0; // symmetric cavity
        } else if (matId==5) {
          vec2 u=uv*1.4; h0=valueNoise2(u); h1=valueNoise2(u+vec2(0.04,0)); h2=valueNoise2(u+vec2(0,0.04));
        } else if (matId==3) {
          vec2 u=uv*1.8; h0=valueNoise2(u); h1=valueNoise2(u+vec2(0.05,0)); h2=valueNoise2(u+vec2(0,0.05));
        } else { return 1.0; }
        float bx=h0-h1, by=h0-h2;
        return clamp(1.0-(bx*bx+by*by)*4.0, 0.4, 1.0);
      }

      // ── ACES filmic tonemapping ──────────────────────────────────────────────
      vec3 acesTonemap(vec3 x) {
        // Narkowicz 2015, ACES approximation
        float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
        return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
      }

      // ── Post-processing ──────────────────────────────────────────────────────
      vec3 applyPost(vec3 color) {
        // Exposure
        color *= uExposure;
        // Saturation
        float lum = dot(color, vec3(0.2126,0.7152,0.0722));
        color = mix(vec3(lum), color, clamp(1.0+uSaturation, 0.0, 2.5));
        // Contrast (S-curve via shadows lift)
        color = max(color+vec3(uAmbientLift), vec3(uShadowLift));
        color = (color-0.5)*(1.0+uContrast)+0.5;
        // Tint
        color *= uTint;
        // Bloom highlight glow
        float glow = max(max(color.r,color.g),color.b);
        float bloom = max(glow-0.72,0.0)*uBloom;
        color += color*bloom*0.22 + vec3(bloom*0.055);
        // ACES filmic tonemap — no pre-scale crush
        color = acesTonemap(color);
        return max(color, vec3(0.0));
      }

      // ── Point/spot/surface lights ────────────────────────────────────────────
      vec3 dynamicLights(vec3 worldPos, vec3 n, vec3 viewDir, float rough, vec3 f0) {
        vec3 total = vec3(0.0);
        for (int i = 0; i < ${lightCapacity}; i++) {
          if (i >= uLightCount) continue;
          vec3 delta = uLightPos[i] - worldPos;
          float dist = length(delta);
          if (dist < 0.001) continue;
          vec3 toLight = delta / dist;
          float atten = clamp(1.0 - dist/max(uLightRange[i],0.001), 0.0, 1.0);
          atten *= atten; // inverse square falloff
          float emission = 1.0;
          if (uLightKind[i] > 0.5 && uLightKind[i] < 1.5) {
            float cone = dot(normalize(uLightDir[i]), -toLight);
            float softCone = smoothstep(max(-1.0,uLightConeCos[i]-0.24), min(1.0,uLightConeCos[i]+0.18), cone);
            emission = mix(0.28, 1.0, softCone);
          } else if (uLightKind[i] > 1.5) {
            emission = pow(max(dot(normalize(uLightDir[i]), -toLight), 0.0), 0.65);
          }
          float ndl = max(dot(n, toLight), 0.0);
          if (ndl < 0.001 || atten < 0.001) continue;
          vec3 h2 = normalize(toLight + viewDir);
          float ndh = max(dot(n,h2),0.0);
          float ndv = max(dot(n,viewDir),0.001);
          float vdh = max(dot(viewDir,h2),0.0);
          vec3 spec = specularBRDF(ndh, ndl, ndv, vdh, rough, f0);
          vec3 kd = (1.0 - F_Schlick(f0, vdh)) / PI;
          total += uLightColor[i] * atten * emission * ndl * (kd + spec) * 1.55;
        }
        return total;
      }

      // ── 3-D micro-noise for albedo variation ─────────────────────────────────
      // Scale by 0.025 so 1 noise unit = 40 studs — just subtle surface variation, no blotches
      float microNoise(vec3 p) {
        vec3 sp = p * 0.025;
        return valueNoise3(sp*3.7)*0.55 + valueNoise3(sp*8.9+1.3)*0.30 + valueNoise3(sp*22.1+4.7)*0.15;
      }

      void main() {
        if (vUnlit > 0.5) { gl_FragColor = vColor; return; }

        int matId = int(vMatId + 0.5);
        vec4 mp   = matParams(matId);
        float rough    = mp.x;
        float metallic = mp.y;
        float f0scalar = mp.z;
        float sssStr   = mp.w;

        // Shading vectors
        vec3 geoN   = normalize(vNormal);
        // Roblox-style fallback materials should stay honest when we do not have real
        // normal/roughness maps. Do not invent noisy fake normals or cavity masks.
        vec3 n      = geoN;
        float cavAO = 1.0;
        vec3 viewDir = normalize(-vWorld);
        vec3 sunDir  = normalize(uSunDir);
        vec3 halfDir = normalize(sunDir + viewDir);

        float ndl = max(dot(n, sunDir), 0.0);
        float ndh = max(dot(n, halfDir), 0.0);
        float ndv = clamp(dot(n, viewDir), 0.001, 1.0);
        float vdh = max(dot(viewDir, halfDir), 0.0);

        // Geometry AO from normal perturbation — keep subtle, don't over-darken
        float geoAO = clamp(dot(n, geoN)*0.6+0.4, 0.0, 1.0);
        float ao = min(geoAO, cavAO);


        vec3 baseRgb = pow(max(vColor.rgb, vec3(0.0)), vec3(2.2));


        vec3 f0 = mix(vec3(f0scalar), baseRgb, metallic);
        vec3 diffAlbedo = baseRgb * (1.0 - metallic);


        float wrapNdl = clamp((ndl + 0.08)/1.08, 0.0, 1.0);
        vec3 sunSpec  = specularBRDF(ndh, max(ndl,0.001), ndv, vdh, rough, f0) * ndl * uSunStrength;

        vec3 kd       = (vec3(1.0) - F_Schlick(f0, vdh)) * (1.0 - metallic);
        vec3 sunDiff  = kd * diffAlbedo / PI * wrapNdl * uSunStrength;
        vec3 sunLight = (sunDiff + sunSpec) * uSunColor;


        float hemi   = n.y * 0.5 + 0.5;
        vec3 sky     = uSkyColor;
        vec3 ground  = uGroundColor;


        vec3 envDiff = mix(ground * 0.92, sky, hemi) * 0.28 + vec3(0.025);
        envDiff     += uLocalAmbient * (0.42 + hemi * 0.12);
        envDiff     *= ao;


        vec3 refl        = reflect(-viewDir, n);
        float refHemi    = clamp(refl.y*0.5+0.5, 0.0, 1.0);
        vec3 envRef      = mix(ground * 0.92, sky * 1.03, refHemi);
        vec3 envRefBlur  = mix(ground, sky, 0.5) * 0.78 + vec3(0.025);
        vec3 envSample   = mix(envRef, envRefBlur, rough*rough);
        vec3 iblSpec     = iblSpecular(f0, rough, ndv, envSample) * ao;




        vec3 fillDir  = normalize(vec3(-0.55, 0.30, -0.50));
        float fillNdl = max(dot(n, fillDir), 0.0);
        vec3 skyFill  = sky * fillNdl * diffAlbedo * 0.06;
        vec3 bounceDir = vec3(0.0, 1.0, 0.0);
        float bounceNdl = max(dot(-n, bounceDir), 0.0);
        vec3 bounce = ground * bounceNdl * diffAlbedo * 0.08;


        vec3 ambientDiff = diffAlbedo * envDiff;


        vec3 sss = vec3(0.0);
        if (sssStr > 0.001) {
          float backL   = max(dot(-n, sunDir)*0.5+0.5, 0.0);
          float thickness = clamp(1.0 - microNoise(vPosition*0.8)*0.5, 0.25, 1.0);
          sss = baseRgb * uSunColor * backL * thickness * sssStr * uSunStrength * 0.55;
        }


        vec3 localLights = dynamicLights(vPosition, n, viewDir, rough, f0);

        float alpha = vColor.a;
        int flag = int(vFlag + 0.5);
        vec3 lit;

        if (flag == 1) {

          float emRim = pow(1.0 - abs(dot(n, sunDir)), 2.8) * 0.5;
          lit = baseRgb * 2.2 + vec3(emRim * 0.4) + baseRgb * localLights * 0.5;
          lit = clamp(lit, 0.0, 4.0);
        } else if (flag == 2) {

          vec3 diffuse  = diffAlbedo * (envDiff + sunDiff*0.45 + skyFill + bounce + localLights);
          float wF      = pow(1.0 - max(dot(n, sunDir), 0.0), 3.0);
          vec3 spec2    = specularBRDF(ndh, max(ndl,0.001), ndv, vdh, 0.04, f0) * ndl * uSunStrength * uSunColor;
          lit = mix(diffuse, iblSpec + envSample*0.15, wF*0.55) + spec2*0.9 + localLights*diffAlbedo;
          alpha = min(alpha, 0.58);
        } else if (flag == 3) {

          lit = iblSpec + sunLight + localLights + skyFill*0.3;
        } else {

          lit = ambientDiff + iblSpec + sunLight + skyFill + bounce + sss + localLights;
        }

        lit = applyPost(lit);
        lit = pow(clamp(lit, 0.0, 1.0), vec3(1.0/2.2));
        gl_FragColor = vec4(lit, alpha);
      }
    `,
    );
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      aColor: gl.getAttribLocation(program, 'aColor'),
      aFlag: gl.getAttribLocation(program, 'aFlag'),
      aMatId: gl.getAttribLocation(program, 'aMatId'),
      uMvp: gl.getUniformLocation(program, 'uMvp'),
      uUnlit: gl.getUniformLocation(program, 'uUnlit'),
      uCamOffset: gl.getUniformLocation(program, 'uCamOffset'),
      uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
      uTint: gl.getUniformLocation(program, 'uTint'),
      uExposure: gl.getUniformLocation(program, 'uExposure'),
      uContrast: gl.getUniformLocation(program, 'uContrast'),
      uSaturation: gl.getUniformLocation(program, 'uSaturation'),
      uAmbientLift: gl.getUniformLocation(program, 'uAmbientLift'),
      uShadowLift: gl.getUniformLocation(program, 'uShadowLift'),
      uBloom: gl.getUniformLocation(program, 'uBloom'),
      uDetailQuality: gl.getUniformLocation(program, 'uDetailQuality'),
      uPerformanceMode: gl.getUniformLocation(program, 'uPerformanceMode'),
      uSkyColor: gl.getUniformLocation(program, 'uSkyColor'),
      uGroundColor: gl.getUniformLocation(program, 'uGroundColor'),
      uLocalAmbient: gl.getUniformLocation(program, 'uLocalAmbient'),
      uSunDir: gl.getUniformLocation(program, 'uSunDir'),
      uSunColor: gl.getUniformLocation(program, 'uSunColor'),
      uSunStrength: gl.getUniformLocation(program, 'uSunStrength'),
      uLightCount: gl.getUniformLocation(program, 'uLightCount'),
      uLightPos: gl.getUniformLocation(program, 'uLightPos[0]'),
      uLightColor: gl.getUniformLocation(program, 'uLightColor[0]'),
      uLightRange: gl.getUniformLocation(program, 'uLightRange[0]'),
      uLightDir: gl.getUniformLocation(program, 'uLightDir[0]'),
      uLightKind: gl.getUniformLocation(program, 'uLightKind[0]'),
      uLightConeCos: gl.getUniformLocation(program, 'uLightConeCos[0]'),
      lightCapacity,
    };
  }

  function _createTextureViewportProgram(gl) {
    const lightCapacity = _viewportLightCapacity(gl);
    const vertex = _compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec4 aColor;
      attribute vec2 aUv;
      attribute float aFlag;
      uniform mat4 uMvp;
      uniform vec3 uCamOffset;
      varying vec4 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vFlag;
      void main() {
        vColor = aColor;
        vNormal = aNormal;
        vWorld = aPosition - uCamOffset;
        vPosition = aPosition;
        vUv = aUv;
        vFlag = aFlag;
        gl_Position = uMvp * vec4(aPosition, 1.0);
      }
    `,
    );
    const fragment = _compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision highp float;
      uniform sampler2D uTexture;
      uniform sampler2D uHeightTexture;
      uniform float uTextureDetail;
      uniform float uTextureDetile;
      uniform float uHeightStrength;
      uniform vec3  uTextureMean;
      varying vec4 vColor;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vPosition;
      varying vec2 vUv;
      varying float vFlag;
      uniform vec3  uCameraPos;
      uniform vec3  uTint;
      uniform float uExposure;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uAmbientLift;
      uniform float uShadowLift;
      uniform float uBloom;
      uniform float uPerformanceMode;
      uniform vec3  uSkyColor;
      uniform vec3  uGroundColor;
      uniform vec3  uLocalAmbient;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform float uSunStrength;
      uniform int   uLightCount;
      uniform vec3  uLightPos[${lightCapacity}];
      uniform vec3  uLightColor[${lightCapacity}];
      uniform float uLightRange[${lightCapacity}];
      uniform vec3  uLightDir[${lightCapacity}];
      uniform float uLightKind[${lightCapacity}];
      uniform float uLightConeCos[${lightCapacity}];

      const float PI = 3.14159265359;

      float D_GGX(float ndh, float a2) {
        float d = ndh*ndh*(a2-1.0)+1.0;
        return a2/(PI*d*d+1e-5);
      }
      float G1s(float ndx, float k){ return ndx/(ndx*(1.0-k)+k+1e-5); }
      float G_Smith(float ndv, float ndl, float r) {
        float k=(r+1.0)*(r+1.0)*0.125;
        return G1s(ndv,k)*G1s(ndl,k);
      }
      vec3 F_Schlick(vec3 f0, float vdh){ return f0+(1.0-f0)*pow(1.0-vdh,5.0); }
      vec3 specBRDF(float ndh,float ndl,float ndv,float vdh,float r,vec3 f0){
        float a=r*r; float a2=a*a;
        return (D_GGX(ndh,a2)*G_Smith(ndv,ndl,r)*F_Schlick(f0,vdh))/(4.0*ndv*ndl+1e-5);
      }
      vec2 envBRDF(float ndv, float r) {
        vec4 c0=vec4(-1,-0.0275,-0.572,0.022), c1=vec4(1,0.0425,1.04,-0.04);
        vec4 rv=r*c0+c1;
        float a004=min(rv.x*rv.x,exp2(-9.28*ndv))*rv.x+rv.y;
        return vec2(-1.04,1.04)*a004+rv.zw;
      }
      vec3 acesTonemap(vec3 x){
        return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
      }
      vec3 applyPost(vec3 color) {
        color *= uExposure;
        float lum = dot(color, vec3(0.2126,0.7152,0.0722));
        color = mix(vec3(lum), color, clamp(1.0+uSaturation,0.0,2.5));
        color = max(color+vec3(uAmbientLift), vec3(uShadowLift));
        color = (color-0.5)*(1.0+uContrast)+0.5;
        color *= uTint;
        float glow=max(max(color.r,color.g),color.b);
        float bloom=max(glow-0.72,0.0)*uBloom;
        color += color*bloom*0.22+vec3(bloom*0.055);
        return max(acesTonemap(color), vec3(0.0));
      }
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
          mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      vec4 sampleMaterial(vec2 uv) {
        vec4 primary = texture2D(uTexture, fract(uv));
        if (uTextureDetile < 0.001) return primary;
        float seed = valueNoise(uv * 0.17 + vec2(19.3, 7.1));
        vec2 altUv = vec2(uv.y, -uv.x) * (0.82 + seed * 0.29) + vec2(17.17, 9.37);
        vec4 alternate = texture2D(uTexture, fract(altUv));
        float amount = uTextureDetile * (0.15 + seed * 0.27);
        return mix(primary, alternate, amount);
      }
      float sampleHeightDetail(vec2 uv) {
        if (uHeightStrength < 0.001) return 1.0;
        vec2 baseUv = fract(uv);
        vec2 tap = vec2(0.0018);
        float h = texture2D(uHeightTexture, baseUv).r;
        float l = texture2D(uHeightTexture, fract(baseUv - vec2(tap.x, 0.0))).r;
        float r = texture2D(uHeightTexture, fract(baseUv + vec2(tap.x, 0.0))).r;
        float d = texture2D(uHeightTexture, fract(baseUv - vec2(0.0, tap.y))).r;
        float u = texture2D(uHeightTexture, fract(baseUv + vec2(0.0, tap.y))).r;
        float cavity = clamp(1.0 + (h * 4.0 - l - r - d - u) * 1.32, 0.78, 1.27);
        float level = clamp(0.89 + h * 0.22, 0.84, 1.17);
        return mix(1.0, cavity * level, uHeightStrength);
      }
      vec3 dynamicLights(vec3 worldPos, vec3 n, vec3 viewDir, float rough, vec3 f0) {
        vec3 total=vec3(0.0);
        for(int i=0;i<${lightCapacity};i++){
          if(i>=uLightCount) continue;
          vec3 delta=uLightPos[i]-worldPos;
          float dist=length(delta); if(dist<0.001) continue;
          vec3 toL=delta/dist;
          float atten=clamp(1.0-dist/max(uLightRange[i],0.001),0.0,1.0); atten*=atten;
          float em=1.0;
          if(uLightKind[i]>0.5&&uLightKind[i]<1.5){
            float cone=dot(normalize(uLightDir[i]),-toL);
            float softCone=smoothstep(max(-1.0,uLightConeCos[i]-0.24),min(1.0,uLightConeCos[i]+0.18),cone);
            em=mix(0.28,1.0,softCone);
          } else if(uLightKind[i]>1.5){
            em=pow(max(dot(normalize(uLightDir[i]),-toL),0.0),0.65);
          }
          float ndl=max(dot(n,toL),0.0); if(ndl<0.001||atten<0.001) continue;
          vec3 h2=normalize(toL+viewDir);
          float ndh=max(dot(n,h2),0.0), ndv2=max(dot(n,viewDir),0.001), vdh=max(dot(viewDir,h2),0.0);
          vec3 spec=specBRDF(ndh,ndl,ndv2,vdh,rough,f0);
          vec3 kd=(1.0-F_Schlick(f0,vdh))/PI;
          total+=uLightColor[i]*atten*em*ndl*(kd+spec)*1.55;
        }
        return total;
      }
      void main() {
        vec4 tex = sampleMaterial(vUv);
        if (tex.a < 0.03) discard;
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(-vWorld);
        vec3 sunDir  = normalize(uSunDir);
        vec3 halfDir = normalize(sunDir+viewDir);
        float ndl = max(dot(n,sunDir),0.0);
        float ndh = max(dot(n,halfDir),0.0);
        float ndv = clamp(dot(n,viewDir),0.001,1.0);
        float vdh = max(dot(viewDir,halfDir),0.0);
        float hemi = n.y*0.5+0.5;
        vec3 sky=uSkyColor, ground=uGroundColor;


        float rough=0.86;
        vec3 f0=vec3(0.025);

        vec3 authoredRgb = pow(max(vColor.rgb,vec3(0.0)),vec3(2.2));
        vec3 sampledRgb = pow(max(tex.rgb,vec3(0.0)),vec3(2.2));
        vec3 meanRgb = pow(max(uTextureMean,vec3(0.02)),vec3(2.2));
        vec3 relativeTexture = clamp(sampledRgb / meanRgb, vec3(0.36), vec3(2.12));
        relativeTexture = pow(relativeTexture, vec3(1.09));
        vec3 texRgb = authoredRgb * mix(vec3(1.0), relativeTexture, clamp(uTextureDetail,0.0,1.0));
        texRgb *= sampleHeightDetail(vUv);
        float alpha = tex.a*vColor.a;
        int flag = int(vFlag+0.5);


        vec3 envDiff = mix(ground*0.92,sky,hemi)*0.28+vec3(0.025)+uLocalAmbient*(0.42+hemi*0.12);
        vec3 refl = reflect(-viewDir,n);
        vec3 envRef = mix(ground,sky,clamp(refl.y*0.5+0.5,0.0,1.0));
        vec2 brdf = envBRDF(ndv,rough);
        vec3 iblSpec = envRef*(f0*brdf.x+brdf.y);


        float wrapNdl=clamp((ndl+0.08)/1.08,0.0,1.0);
        vec3 kd=(vec3(1.0)-F_Schlick(f0,vdh));
        vec3 sunDiff=kd*texRgb/PI*wrapNdl*uSunStrength;
        vec3 sunSpec=specBRDF(ndh,max(ndl,0.001),ndv,vdh,rough,f0)*ndl*uSunStrength;
        vec3 sunLight=(sunDiff+sunSpec)*uSunColor;

        vec3 fillDir=normalize(vec3(-0.55,0.25,-0.50));
        vec3 skyFill=sky*max(dot(n,fillDir),0.0)*0.05*texRgb;
        vec3 bounce=ground*max(dot(n,normalize(vec3(-0.28,0.50,0.82))),0.0)*0.07*texRgb;
        vec3 localLights=dynamicLights(vPosition,n,viewDir,rough,f0);

        vec3 lit;
        if(flag==1){
          lit=texRgb*1.8+localLights*texRgb*0.4;
          lit=clamp(lit,0.0,4.0);
        } else if(flag==2){
          vec3 diffuse=texRgb*(envDiff+sunDiff*0.4+skyFill+bounce+localLights);
          float wF=pow(1.0-max(dot(n,sunDir),0.0),3.0);
          vec3 sp=specBRDF(ndh,max(ndl,0.001),ndv,vdh,0.04,f0)*ndl*uSunStrength*uSunColor;
          lit=mix(diffuse,iblSpec+envRef*0.08,wF*0.55)+sp*0.8+localLights*texRgb;
          alpha=min(alpha,0.58);
        } else if(flag==3){
          vec3 mf0=texRgb;
          vec3 mSpec=specBRDF(ndh,max(ndl,0.001),ndv,vdh,0.18,mf0)*ndl*uSunStrength*uSunColor;
          vec2 mb=envBRDF(ndv,0.18);
          vec3 mIbl=envRef*(mf0*mb.x+mb.y);
          lit=mIbl+mSpec+localLights;
        } else {
          lit=texRgb*envDiff+iblSpec+sunLight+skyFill+bounce+localLights;
        }
        lit=applyPost(lit);
        lit=pow(clamp(lit,0.0,1.0),vec3(1.0/2.2));
        gl_FragColor=vec4(lit,alpha);
      }
    `,
    );
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      aColor: gl.getAttribLocation(program, 'aColor'),
      aUv: gl.getAttribLocation(program, 'aUv'),
      aFlag: gl.getAttribLocation(program, 'aFlag'),
      uMvp: gl.getUniformLocation(program, 'uMvp'),
      uTexture: gl.getUniformLocation(program, 'uTexture'),
      uHeightTexture: gl.getUniformLocation(program, 'uHeightTexture'),
      uTextureDetail: gl.getUniformLocation(program, 'uTextureDetail'),
      uTextureDetile: gl.getUniformLocation(program, 'uTextureDetile'),
      uHeightStrength: gl.getUniformLocation(program, 'uHeightStrength'),
      uTextureMean: gl.getUniformLocation(program, 'uTextureMean'),
      uCamOffset: gl.getUniformLocation(program, 'uCamOffset'),
      uCameraPos: gl.getUniformLocation(program, 'uCameraPos'),
      uTint: gl.getUniformLocation(program, 'uTint'),
      uExposure: gl.getUniformLocation(program, 'uExposure'),
      uContrast: gl.getUniformLocation(program, 'uContrast'),
      uSaturation: gl.getUniformLocation(program, 'uSaturation'),
      uAmbientLift: gl.getUniformLocation(program, 'uAmbientLift'),
      uShadowLift: gl.getUniformLocation(program, 'uShadowLift'),
      uBloom: gl.getUniformLocation(program, 'uBloom'),
      uPerformanceMode: gl.getUniformLocation(program, 'uPerformanceMode'),
      uSkyColor: gl.getUniformLocation(program, 'uSkyColor'),
      uGroundColor: gl.getUniformLocation(program, 'uGroundColor'),
      uLocalAmbient: gl.getUniformLocation(program, 'uLocalAmbient'),
      uSunDir: gl.getUniformLocation(program, 'uSunDir'),
      uSunColor: gl.getUniformLocation(program, 'uSunColor'),
      uSunStrength: gl.getUniformLocation(program, 'uSunStrength'),
      uLightCount: gl.getUniformLocation(program, 'uLightCount'),
      uLightPos: gl.getUniformLocation(program, 'uLightPos[0]'),
      uLightColor: gl.getUniformLocation(program, 'uLightColor[0]'),
      uLightRange: gl.getUniformLocation(program, 'uLightRange[0]'),
      uLightDir: gl.getUniformLocation(program, 'uLightDir[0]'),
      uLightKind: gl.getUniformLocation(program, 'uLightKind[0]'),
      uLightConeCos: gl.getUniformLocation(program, 'uLightConeCos[0]'),
      lightCapacity,
    };
  }

  function _compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function _createViewportBuffers(gl, scene, program, onTextureReady = null) {
    const flatFlags = new Float32Array(scene.guide.vertexCount);
    return {
      mesh: _createVertexBuffer(
        gl,
        scene.mesh.positions,
        scene.mesh.normals,
        scene.mesh.colors,
        scene.mesh.flags || new Float32Array(scene.mesh.vertexCount),
        scene.mesh.vertexCount,
        scene.mesh.matIds || null,
      ),
      guide: _createVertexBuffer(
        gl,
        scene.guide.positions,
        _flatNormals(scene.guide.vertexCount),
        scene.guide.colors,
        flatFlags,
        scene.guide.vertexCount,
        null,
      ),
      textured: (scene.mesh.textured || [])
        .filter((group) => group.vertexCount > 0)
        .map((group) => _createTexturedVertexBuffer(gl, group, onTextureReady)),
    };
  }

  function _createVertexBuffer(gl, positions, normals, colors, flags, vertexCount, matIds) {
    const stride = 12;
    const data = new Float32Array(vertexCount * stride);
    for (let i = 0; i < vertexCount; i += 1) {
      const base = i * stride;
      data[base] = positions[i * 3];
      data[base + 1] = positions[i * 3 + 1];
      data[base + 2] = positions[i * 3 + 2];
      data[base + 3] = normals[i * 3];
      data[base + 4] = normals[i * 3 + 1];
      data[base + 5] = normals[i * 3 + 2];
      data[base + 6] = colors[i * 4];
      data[base + 7] = colors[i * 4 + 1];
      data[base + 8] = colors[i * 4 + 2];
      data[base + 9] = colors[i * 4 + 3];
      data[base + 10] = flags ? flags[i] || 0 : 0;
      data[base + 11] = matIds ? matIds[i] || 0 : 0;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, vertexCount, stride: stride * 4 };
  }

  function _bindViewportBuffer(gl, program, buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.enableVertexAttribArray(program.aPosition);
    gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, buffer.stride, 0);
    gl.enableVertexAttribArray(program.aNormal);
    gl.vertexAttribPointer(program.aNormal, 3, gl.FLOAT, false, buffer.stride, 12);
    gl.enableVertexAttribArray(program.aColor);
    gl.vertexAttribPointer(program.aColor, 4, gl.FLOAT, false, buffer.stride, 24);
    if (program.aFlag >= 0) {
      gl.enableVertexAttribArray(program.aFlag);
      gl.vertexAttribPointer(program.aFlag, 1, gl.FLOAT, false, buffer.stride, 40);
    }
    if (program.aMatId >= 0) {
      gl.enableVertexAttribArray(program.aMatId);
      gl.vertexAttribPointer(program.aMatId, 1, gl.FLOAT, false, buffer.stride, 44);
    }
  }

  function _bindDepthViewportBuffer(gl, program, buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.enableVertexAttribArray(program.aPosition);
    gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, buffer.stride, 0);
  }

  function _prepareDepthViewportAttributes(gl, depthProgram, ...programs) {
    const keep = depthProgram?.aPosition;
    const seen = new Set();
    for (const program of programs) {
      if (!program) continue;
      for (const key of ['aPosition', 'aNormal', 'aColor', 'aUv', 'aFlag', 'aMatId']) {
        const location = program[key];
        if (location == null || location < 0 || location === keep || seen.has(location)) continue;
        seen.add(location);
        gl.disableVertexAttribArray(location);
      }
    }
  }

  function _createTexturedVertexBuffer(gl, group, onTextureReady = null) {
    const stride = 13;
    const data = new Float32Array(group.vertexCount * stride);
    for (let i = 0; i < group.vertexCount; i += 1) {
      const base = i * stride;
      data[base] = group.positions[i * 3];
      data[base + 1] = group.positions[i * 3 + 1];
      data[base + 2] = group.positions[i * 3 + 2];
      data[base + 3] = group.normals[i * 3];
      data[base + 4] = group.normals[i * 3 + 1];
      data[base + 5] = group.normals[i * 3 + 2];
      data[base + 6] = group.colors[i * 4];
      data[base + 7] = group.colors[i * 4 + 1];
      data[base + 8] = group.colors[i * 4 + 2];
      data[base + 9] = group.colors[i * 4 + 3];
      data[base + 10] = group.uvs[i * 2];
      data[base + 11] = group.uvs[i * 2 + 1];
      data[base + 12] = group.flags ? group.flags[i] || 0 : 0;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return {
      buffer,
      vertexCount: group.vertexCount,
      stride: stride * 4,
      texture: _createGlTexture(gl, group.texture, onTextureReady),
      heightTexture: group.texture?.heightUrl
        ? _createGlTexture(
            gl,
            { key: `${group.texture.key}:height`, localUrl: group.texture.heightUrl },
            onTextureReady,
            [128, 128, 128, 255],
          )
        : null,
      textureInfo: group.texture,
    };
  }

  function _bindTexturedViewportBuffer(gl, program, buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.enableVertexAttribArray(program.aPosition);
    gl.vertexAttribPointer(program.aPosition, 3, gl.FLOAT, false, buffer.stride, 0);
    gl.enableVertexAttribArray(program.aNormal);
    gl.vertexAttribPointer(program.aNormal, 3, gl.FLOAT, false, buffer.stride, 12);
    gl.enableVertexAttribArray(program.aColor);
    gl.vertexAttribPointer(program.aColor, 4, gl.FLOAT, false, buffer.stride, 24);
    gl.enableVertexAttribArray(program.aUv);
    gl.vertexAttribPointer(program.aUv, 2, gl.FLOAT, false, buffer.stride, 40);
    if (program.aFlag >= 0) {
      gl.enableVertexAttribArray(program.aFlag);
      gl.vertexAttribPointer(program.aFlag, 1, gl.FLOAT, false, buffer.stride, 48);
    }
  }

  function _createGlTexture(
    gl,
    textureInfo,
    onTextureReady = null,
    fallbackPixel = [255, 255, 255, 255],
  ) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const anisotropyExt =
      gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(fallbackPixel),
    );
    _textureUrl(textureInfo)
      .then((url) => _loadImage(url))
      .then((image) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        if (_isPowerOf2(image.width) && _isPowerOf2(image.height)) {
          gl.generateMipmap(gl.TEXTURE_2D);
        } else {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        if (anisotropyExt) {
          const maxAnisotropy = gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
          gl.texParameterf(
            gl.TEXTURE_2D,
            anisotropyExt.TEXTURE_MAX_ANISOTROPY_EXT,
            Math.min(16, maxAnisotropy),
          );
        }
        onTextureReady?.();
      })
      .catch((err) => _log.warn(`Texture load failed ${textureInfo?.key || ''}: ${_errMsg(err)}`));
    return texture;
  }

  async function _textureUrl(textureInfo) {
    if (textureInfo?.localUrl) return textureInfo.localUrl;
    if (textureInfo?.id) return (await _fetchAssetBlob(textureInfo.id, 'image')) || '';
    return '';
  }

  function _loadImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) return reject(new Error('Missing texture URL'));
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image decode failed'));
      image.src = url;
    });
  }

  function _isPowerOf2(value) {
    return value > 0 && (value & (value - 1)) === 0;
  }

  function _flatNormals(vertexCount) {
    const normals = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) normals.set([0, 1, 0], i * 3);
    return normals;
  }

  function _viewportMatrices(scene, camera, aspect) {
    const eye = [camera.x, camera.y, camera.z];
    const cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw);

    const target = [eye[0] - sy * cp, eye[1] + sp, eye[2] - cy * cp];
    const view = _mat4LookAt(eye, target, [0, 1, 0]);
    const near = Math.max(0.05, scene.extent / 2000);
    const far = Math.max(1000, scene.extent * 120);
    const projection = _mat4Perspective(Math.PI / 3, Math.max(0.1, aspect), near, far);
    return { mvp: _mat4Multiply(projection, view), eye, near, far };
  }

  function _niceGridStep(value) {
    const power = 10 ** Math.floor(Math.log10(Math.max(0.001, value)));
    const scaled = value / power;
    if (scaled <= 1) return power;
    if (scaled <= 2) return power * 2;
    if (scaled <= 5) return power * 5;
    return power * 10;
  }

  function _scriptPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    const source = node.properties?.Source || node.properties?.source || '';
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Script</span><small>${_escape(node.className)}</small></div><pre>${_escape(source || 'No script source is present in this file.')}</pre></section>`;
    return wrap;
  }

  function _assetPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    const assets = _assetsFromNode(node);
    const asset = assets[0] || { key: '', value: '', id: '', kind: '' };
    if (!asset.value) {
      wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Asset</span><small>${_escape(node.className)}</small></div><div class="dt-asset-empty"><span>No asset reference</span><p>Image, texture, mesh, sound, animation, and content properties appear here.</p></div></section>`;
      return wrap;
    }
    const cards = assets.map((item, index) => _assetCard(item, index)).join('');
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Asset</span><small>${_escape(node.className)}</small></div><div class="dt-asset-stack">${cards}</div></section>`;
    wrap.querySelectorAll('[data-load-mesh-asset]').forEach((button) => {
      button.addEventListener('click', () =>
        _loadAssetMeshPreview(wrap, assets[Number(button.dataset.loadMeshAsset)], button),
      );
    });

    wrap.querySelectorAll('[data-download-asset]').forEach((button) => {
      button.addEventListener('click', () =>
        _downloadAsset(assets[Number(button.dataset.downloadAsset)], button),
      );
    });

    wrap.querySelectorAll('[data-local-image]').forEach((frame) => {
      const src = frame.dataset.localImage;
      if (!src) return;
      const img = document.createElement('img');
      img.className = 'dt-asset-image';
      img.decoding = 'async';
      img.alt = '';
      img.src = src;
      frame.replaceChildren(img);
    });

    wrap.querySelectorAll('[data-fetch-image]').forEach((frame) => {
      const id = frame.dataset.fetchImage;
      _fetchAssetBlob(id, 'image').then((url) => {
        const placeholder = frame.querySelector('.dt-asset-loading');
        if (!url) {
          if (placeholder) placeholder.textContent = 'Preview unavailable';
          return;
        }
        const img = document.createElement('img');
        img.className = 'dt-asset-image';
        img.decoding = 'async';
        img.alt = '';
        img.src = url;
        if (placeholder) placeholder.replaceWith(img);
        else frame.prepend(img);
      });
    });

    wrap.querySelectorAll('[data-fetch-audio]').forEach((frame) => {
      const id = frame.dataset.fetchAudio;
      _fetchAssetBlob(id, 'audio').then((url) => {
        const placeholder = frame.querySelector('.dt-asset-loading');
        if (!url) {
          if (placeholder) placeholder.textContent = 'Audio unavailable';
          return;
        }
        const audio = document.createElement('audio');
        audio.className = 'dt-asset-audio';
        audio.controls = true;
        audio.src = url;
        if (placeholder) placeholder.replaceWith(audio);
        else frame.prepend(audio);
      });
    });

    return wrap;
  }

  async function _loadAssetMeshPreview(wrap, asset, button) {
    if (!asset?.id) return;
    const stage = button.closest('.dt-asset-card')?.querySelector('[data-mesh-stage]');
    try {
      button.disabled = true;
      button.textContent = 'Loading mesh';
      const mesh = await _parseRobloxMesh(await _fetchMeshAssetBytes(asset.id));
      if (!stage) return;
      stage.innerHTML = `<canvas class="dt-viewport-canvas" aria-label="Mesh asset preview"></canvas><div class="dt-render-stats"><span>${mesh.vertexCount.toLocaleString()} verts</span><span>${mesh.triangleCount.toLocaleString()} tris</span></div>`;
      requestAnimationFrame(() =>
        _mountViewport(stage.querySelector('.dt-viewport-canvas'), _sceneFromParsedMesh(mesh)),
      );
      button.disabled = false;
      button.textContent = 'Mesh loaded';
    } catch (err) {
      button.disabled = false;
      button.textContent = 'Retry mesh';
      if (stage)
        stage.innerHTML = `<div class="dt-asset-error">${_escape(err?.message || 'Mesh could not be loaded')}</div>`;
    }
  }

  function _sceneFromParsedMesh(asset) {
    const mesh = _meshBuilder();
    const guide = _lineBuilder();
    const points = [];
    const positions = asset.positions;
    const indices = asset.indices;
    const point = (index) => {
      const offset = index * 3;
      return [positions[offset], positions[offset + 1], positions[offset + 2]];
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = point(indices[i]);
      const b = point(indices[i + 1]);
      const c = point(indices[i + 2]);
      points.push(a, b, c);
      mesh.tri(a, b, c, [116, 159, 218], 1);
    }
    const bounds = points.length ? _bounds(points) : { min: [-1, -1, -1], max: [1, 1, 1] };
    const center = bounds.min.map((item, index) => (item + bounds.max[index]) / 2);
    const extent = Math.max(...bounds.max.map((item, index) => item - bounds.min[index]), 1);
    _emitGuides(guide, bounds, center, extent);
    return {
      parts: [],
      assets: [],
      assetCount: 0,
      assetReady: 0,
      assetFailed: 0,
      omittedParts: 0,
      mesh: mesh.finish(),
      guide: guide.finish(),
      center,
      extent,
      bounds,
    };
  }

  async function _downloadAsset(asset, button) {
    if (!asset?.id) return;
    _log.info(`Download: id=${asset.id} kind=${asset.kind}`);

    const isMesh = asset.kind === 'Mesh';
    const ext = isMesh ? 'mesh' : asset.kind === 'Audio' ? 'mp3' : 'png';
    const filename = `${asset.id}.${ext}`;

    if (isMesh) {
      const card = button.closest('.dt-asset-card');
      let bar = card?.querySelector('.dt-download-progress');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dt-download-progress';
        bar.innerHTML = `
          <div class="dt-download-progress-inner" style="padding:6px 0 2px">
            <div class="dt-download-bar-track" style="height:4px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-bottom:4px">
              <div class="dt-download-bar-fill" style="height:100%;width:0%;background:var(--accent,#5b8dd9);border-radius:2px;transition:width 0.2s ease"></div>
            </div>
            <span class="dt-download-label" style="font-size:11px;opacity:0.72">Starting…</span>
          </div>`;
        card?.appendChild(bar);
      }
      const fill = bar.querySelector('.dt-download-bar-fill');
      const label = bar.querySelector('.dt-download-label');
      const setProgress = (pct, text) => {
        fill.style.width = `${Math.round(pct)}%`;
        label.textContent = text;
      };

      button.disabled = true;
      setProgress(10, 'Resolving CDN…');

      try {
        setProgress(30, 'Fetching mesh bytes…');
        const bytes = await _fetchMeshAssetBytes(asset.id);
        setProgress(80, `${(bytes.length / 1024).toFixed(0)} KB — saving…`);
        _triggerDownload(bytes, filename, 'application/octet-stream');
        setProgress(100, `✓ ${filename}`);
        _log.info(`Downloaded mesh ${filename} (${bytes.length}B)`);
        setTimeout(() => {
          bar.remove();
          button.disabled = false;
        }, 2800);
      } catch (err) {
        const msg = _errMsg(err);
        setProgress(0, `✗ ${msg}`);
        _log.error(`Download failed id=${asset.id}: ${msg}`);
        fill.style.background = 'var(--dt-error, #c0392b)';
        setTimeout(() => {
          bar.remove();
          button.disabled = false;
        }, 3500);
      }
    } else {
      const orig = button.textContent;
      button.disabled = true;
      button.textContent = '…';
      try {
        const hint = asset.kind === 'Audio' ? 'audio' : 'image';
        const blobUrl = await _fetchAssetBlob(asset.id, hint);
        if (!blobUrl) throw new Error('No blob returned');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        _log.info(`Downloaded ${filename}`);
        button.textContent = '✓';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = orig;
        }, 2000);
      } catch (err) {
        _log.error(`Download failed id=${asset.id}: ${_errMsg(err)}`);
        button.textContent = '✗';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = orig;
        }, 2500);
      }
    }
  }

  function _triggerDownload(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 6000);
  }

  function _assetCard(asset, index = 0) {
    const preview =
      asset.kind === 'Mesh'
        ? `<div class="dt-asset-image-frame dt-asset-image-frame--mesh" data-mesh-stage="${_escape(asset.id)}"><span>Mesh</span><strong>${_escape(asset.id || '?')}</strong><small>Fetches mesh bytes and renders geometry when Roblox allows delivery.</small></div>`
        : asset.localUrl
          ? `<div class="dt-asset-image-frame" data-local-image="${_escape(asset.localUrl)}"><span class="dt-asset-loading">Loading bundled preview…</span></div>`
          : asset.id
            ? asset.kind === 'Audio'
              ? `<div class="dt-asset-image-frame dt-asset-image-frame--audio" data-fetch-audio="${_escape(asset.id)}"><span class="dt-asset-loading">Loading audio…</span><span>${_escape(asset.kind)}</span></div>`
              : `<div class="dt-asset-image-frame" data-fetch-image="${_escape(asset.id)}"><span class="dt-asset-loading">Loading…</span><span>${_escape(asset.kind)}</span></div>`
            : '<div class="dt-asset-image-frame empty"><span>No preview</span></div>';
    const load =
      asset.kind === 'Mesh' && asset.id
        ? `<button class="dt-asset-open" type="button" data-load-mesh-asset="${index}">Load mesh</button>`
        : '';
    const downloadBtn = asset.id
      ? `<button class="dt-asset-download" type="button" data-download-asset="${index}" title="Download ${asset.kind || 'asset'} (id ${asset.id})">↓ Download</button>`
      : '';
    const link = asset.id
      ? `<a class="dt-asset-open" href="https://www.roblox.com/library/${_escape(asset.id)}" target="_blank" rel="noreferrer">Open asset</a>`
      : '';
    const source = asset.source
      ? `<div><span>Source</span><strong>${_escape(asset.source)}</strong></div>`
      : '';
    return `<div class="dt-asset-card">${preview}<div class="dt-asset-meta"><div><span>Property</span><strong>${_escape(asset.key)}</strong></div><div><span>Asset ID</span><strong>${_escape(asset.id || (asset.localUrl ? 'Bundled' : 'Not detected'))}</strong></div><div><span>Reference</span><code>${_escape(asset.value)}</code></div>${source}${load}${downloadBtn}${link}</div></div>`;
  }

  function _assetFromNode(node) {
    return _assetsFromNode(node)[0] || { key: '', value: '', id: '', kind: '' };
  }

  function _assetsFromNode(node) {
    const props = node.properties || {};

    const knownKeys = [
      'MeshId',
      'MeshID',
      'MeshContent',
      'Texture',
      'TextureID',
      'TextureId',
      'TextureContent',
      'Image',
      'ImageContent',
      'SoundId',
      'SoundID',
      'AnimationId',
      'AnimationID',
      'Graphic',
      'ShirtTemplate',
      'PantsTemplate',
      'Face',
      'SkyboxBk',
      'SkyboxDn',
      'SkyboxFt',
      'SkyboxLf',
      'SkyboxRt',
      'SkyboxUp',
      'BaseTextureId',
      'OverlayTextureId',
      'BaseTextureContent',
      'OverlayTextureContent',
    ];

    const seenKeys = new Set();
    const seenIds = new Set();
    const seenSigs = new Set();
    const assets = [];

    const push = (key, value, extra = {}) => {
      const id = extra.id ?? _assetId(value);
      const sig = `${key}:${id || value}:${extra.source || ''}:${extra.localUrl || ''}`;
      if (seenSigs.has(sig)) return;
      if (id && seenIds.has(id)) return;
      seenSigs.add(sig);
      if (id) seenIds.add(id);
      const entry = { key, value, id, kind: extra.kind || _assetKind(key, value), ...extra };
      _log.info(`  asset prop "${key}" id=${id || '(none)'} kind=${entry.kind}`);
      assets.push(entry);
    };

    const variantName = _firstProp(props, [
      'MaterialVariantSerialized',
      'MaterialVariant',
      'materialVariantSerialized',
    ]);
    const variant = _resolveMaterialVariant(activeSnapshot(), variantName);
    if (variantName) {
      const preview = _materialPreviewUrl(variant?.name || variantName);
      if (preview) {
        push('MaterialVariantPreview', variantName, {
          id: '',
          kind: 'Image',
          localUrl: preview,
          source: `Bundled material preview`,
        });
      }
      for (const [mapKey, mapValue] of Object.entries(variant?.maps || {})) {
        push(mapKey, mapValue.value, {
          id: mapValue.id,
          kind: mapValue.kind || 'Image',
          source: `MaterialService.${variant.name}`,
        });
      }
    } else {
      const material = _firstProp(props, ['Material', 'material']);
      const preview = _materialPreviewUrl(_materialKey(material));
      if (preview) {
        push('MaterialPreview', _materialKey(material), {
          id: '',
          kind: 'Image',
          localUrl: preview,
          source: 'Bundled Roblox material',
        });
      }
    }

    for (const key of knownKeys) {
      seenKeys.add(key.toLowerCase());
      const value = String(props[key] || '').trim();
      if (value) push(key, value);
    }

    for (const key of Object.keys(props)) {
      if (seenKeys.has(key.toLowerCase())) continue;
      if (
        !/asset|content|image|texture|mesh|sound|animation|template|skybox|graphic|face/i.test(key)
      )
        continue;
      const value = String(props[key] || '').trim();
      if (value) push(key, value);
    }

    return assets;
  }

  function _assetId(value) {
    return _extractAssetId(value);
  }

  function _assetKind(key, value) {
    const text = `${key} ${value}`.toLowerCase();
    if (text.includes('mesh')) return 'Mesh';
    if (text.includes('sound') || text.includes('audio')) return 'Audio';
    if (text.includes('animation')) return 'Animation';
    if (
      text.includes('image') ||
      text.includes('texture') ||
      text.includes('decal') ||
      text.includes('skybox')
    )
      return 'Image';
    return 'Asset';
  }

  function _thumbnailUrl(id) {
    return `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}`;
  }

  function _rawPanel(node) {
    const wrap = document.createElement('div');
    wrap.className = 'dt-workbench dt-workbench--single';
    if (!_nodeHasDetails(node)) {
      wrap.innerHTML =
        '<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Raw</span></div><div class="dt-empty-small">Loading stored values for this instance...</div></section>';
      return wrap;
    }
    wrap.innerHTML = `<section class="dt-inspector-panel"><div class="dt-inspector-head"><span>Raw</span><small>${_escape(_nodePath(activeSnapshot(), node))}</small></div><pre>${_escape(JSON.stringify(node, null, 2))}</pre></section>`;
    return wrap;
  }

  function _previewKind(node) {
    const klass = String(node.className || '').toLowerCase();
    const asset = _assetFromNode(node).value;
    if (/script|module/.test(klass))
      return {
        mode: 'script',
        label: 'Script',
        title: 'Script source',
        body: 'Source captured from the place file.',
      };
    if (_isViewportInstance(klass))
      return {
        mode: 'viewport',
        label: 'Viewport',
        title: 'Model preview',
        body: 'Interactive model viewport for parsed RBXLX geometry.',
      };
    if (asset || /decal|texture|image|sound|audio|animation|video/.test(klass))
      return {
        mode: 'asset',
        label: 'Asset',
        title: 'Asset preview',
        body: 'Captured asset references and preview thumbnails.',
      };
    return {
      mode: 'raw',
      label: 'Raw',
      title: 'Raw data',
      body: 'Readonly metadata for the selected instance.',
    };
  }

  function _isViewportInstance(klass) {
    return /^(workspace|worldmodel|model|part|meshpart|unionoperation|intersectoperation|negateoperation|wedgepart|cornerwedgepart|trusspart|seat|vehicleseat|spawnlocation|terrain)$/.test(
      klass,
    );
  }

  function _previewTabs(node, previewKind = _previewKind(node)) {
    if (previewKind.mode === 'script') return ['script'];
    if (previewKind.mode === 'asset') return ['asset', 'raw'];
    if (previewKind.mode === 'viewport') return ['viewport', 'raw'];
    return ['raw'];
  }

  function _preferredPreviewTab(node, previewKind = _previewKind(node)) {
    return _previewTabs(node, previewKind)[0] || 'raw';
  }

  function _detailsPane() {
    const snapshot = activeSnapshot();
    const pane = document.createElement('aside');
    pane.className = 'dt-details';
    if (snapshot?.storagePath && !snapshot.byId && !snapshot.nodes?.length) {
      pane.innerHTML = '<div class="dt-empty">Loading properties and attributes...</div>';
      return pane;
    }
    const node =
      snapshot?.byId?.get(state_.activeNodeId) ||
      (snapshot?.rootId ? snapshot.byId.get(snapshot.rootId) : null);
    if (!snapshot || !node) {
      pane.innerHTML = '<div class="dt-empty">Select an instance to inspect metadata.</div>';
      return pane;
    }
    const title = `${node.className || 'Instance'} "${node.name || 'Unnamed'}"`;
    const subtitle = `${Number(node.childCount || 0).toLocaleString()} children`;
    if (!_nodeHasDetails(node)) {
      pane.innerHTML = `<div class="dt-details-head"><div><span>${_escape(title)}</span><small>${_escape(subtitle)}</small></div></div><div class="dt-empty">Loading properties and attributes...</div>`;
      return pane;
    }
    pane.innerHTML = `<div class="dt-details-head"><div><span>${_escape(title)}</span><small>${_escape(subtitle)}</small></div></div><label class="dt-property-filter"><input placeholder="Filter properties" value="${_escape(state_.propertyQuery)}" spellcheck="false"></label>`;
    _wirePropertyFilter(pane);
    const query = state_.propertyQuery;
    const studioGroups = DataTreeStudioProperties.groupsFor(node, state_.propertyQuery);
    const groupedPropertyKeys = new Set();
    for (const group of studioGroups) {
      for (const entry of group.entries || []) {
        if (entry.sourceKey) groupedPropertyKeys.add(String(entry.sourceKey).toLowerCase());
      }
    }
    const body = document.createElement('div');
    body.className = 'dt-details-body';
    const studioWrap = document.createElement('div');
    studioWrap.className = 'dt-studio-properties';
    if (studioGroups.length) {
      studioWrap.append(...studioGroups.map((group) => _studioSection(group, node)));
      body.appendChild(studioWrap);
    }

    const extraProperties = _kvSection(
      'Additional Properties',
      node.properties,
      node,
      node.propertyTypes,
      {
        excludeKeys: groupedPropertyKeys,
        query,
        storageSection: 'Properties',
        presentationSection: 'Properties',
        hideWhenEmpty: studioGroups.length > 0 && !query,
      },
    );
    const itemMetadata = _kvSection('Item Metadata', node.itemAttributes, node, null, {
      query,
      storageSection: 'itemAttributes',
      hideWhenEmpty: !query,
    });
    const customAttributes = _kvSection(
      'Custom Attributes',
      node.attributes,
      node,
      node.attributeTypes,
      {
        query,
        storageSection: 'attributes',
        hideWhenEmpty: !query,
      },
    );
    const tags = _tagSection(node.tags, query, { hideWhenEmpty: !query });
    for (const section of [extraProperties, itemMetadata, customAttributes, tags]) {
      if (section) body.appendChild(section);
    }
    if (!body.childElementCount) {
      body.innerHTML = `<div class="dt-empty-small">${query ? 'No properties match this filter.' : 'No stored metadata for this instance.'}</div>`;
    }
    pane.appendChild(body);
    return pane;
  }

  function _filterEntries(title, data, typeMap = null, options = {}) {
    const query = String(options.query || '')
      .trim()
      .toLowerCase();
    const excludeKeys = options.excludeKeys || null;
    return Object.entries(data || {}).filter(([key, value]) => {
      if (excludeKeys?.has?.(String(key).toLowerCase())) return false;
      if (!query) return true;
      const type = String(typeMap?.[key] || '');
      const haystack = `${title} ${key} ${type} ${_formatValue(value)}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function _appendSectionCount(section, title, count) {
    section.innerHTML = `<span><strong>${_escape(title)}</strong><em>${count.toLocaleString()}</em></span>`;
  }

  function _kvSection(title, data, node, typeMap = null, options = {}) {
    const entries = _filterEntries(title, data, typeMap, options);
    if (!entries.length && options.hideWhenEmpty) return null;
    const section = document.createElement('section');
    section.className = 'dt-kv-section';
    _appendSectionCount(section, title, entries.length);
    if (!entries.length) {
      section.insertAdjacentHTML('beforeend', '<div class="dt-empty-small">None</div>');
      return section;
    }
    const storageSection = options.storageSection || title;
    const presentationSection = options.presentationSection || storageSection;
    for (const [key, value] of entries) {
      const type = String(typeMap?.[key] || '');
      const presentation = _valuePresentation(presentationSection, key, value, node);
      section.appendChild(
        _valueRow({
          label: key,
          text: presentation.text,
          preview: presentation.preview,
          swatch: presentation.swatch,
          type,
          ariaLabel: `${title}.${key}`,
          value,
          section: storageSection,
          key,
          node,
        }),
      );
    }
    return section;
  }

  function _wirePropertyFilter(pane) {
    const input = pane.querySelector('.dt-property-filter input');
    input?.addEventListener('input', () => {
      state_.propertyQuery = input.value;
      const start = input.selectionStart ?? state_.propertyQuery.length;
      const end = input.selectionEnd ?? start;
      _replace('.dt-details', _detailsPane());
      requestAnimationFrame(() => {
        const next = _container()?.querySelector('.dt-property-filter input');
        next?.focus();
        next?.setSelectionRange(start, end);
      });
    });
  }

  function _studioSection(group, node) {
    const section = document.createElement('section');
    section.className = 'dt-kv-section dt-studio-section';
    _appendSectionCount(section, group.title, group.entries.length);
    for (const entry of group.entries) {
      const presentation = _studioValuePresentation(entry);
      section.appendChild(
        _valueRow({
          label: entry.name,
          text: presentation.text,
          preview: presentation.preview,
          swatch: presentation.swatch,
          type: entry.valueType?.Name || entry.xmlType || '',
          ariaLabel: `${group.title}.${entry.name}`,
          value: entry.rawValue,
          section: 'Properties',
          key: entry.sourceKey,
          node,
        }),
      );
    }
    return section;
  }

  function _valueRow({
    label,
    text,
    preview = '',
    swatch = '',
    type = '',
    ariaLabel,
    value,
    section,
    key,
    node,
  }) {
    const row = document.createElement('div');
    row.className = 'dt-kv-row';
    row.innerHTML = `<span title="${_escape(label)}">${_escape(label)}</span><label class="dt-kv-value${preview ? ' dt-kv-value--material' : ''}${swatch ? ' dt-kv-value--color' : ''}">${preview ? `<img src="${_escape(preview)}" alt="">` : ''}${swatch ? `<i class="dt-kv-swatch" style="--dt-kv-swatch:${_escape(swatch)}" aria-hidden="true"></i>` : ''}<input readonly spellcheck="false" value="${_escape(text)}" aria-label="${_escape(ariaLabel)}"></label>${type ? `<em title="Value type">${_escape(type)}</em>` : ''}`;
    const input = row.querySelector('input');
    input?.addEventListener('focus', () =>
      _ensureInlineFullValue(input, section, key, value, node),
    );
    input?.addEventListener('pointerdown', () =>
      _ensureInlineFullValue(input, section, key, value, node),
    );
    return row;
  }

  function _studioValuePresentation(entry) {
    const swatch = _propertyColorSwatch(entry.name, entry.rawValue, entry.valueType?.Name);
    if (swatch) return { text: _formatValue(entry.value), preview: '', swatch };
    if (entry.name === 'Material') {
      return {
        text: _formatValue(entry.value),
        preview: _materialPreviewUrl(entry.value),
        swatch: '',
      };
    }
    if (entry.name === 'MaterialVariant') {
      const variant = _resolveMaterialVariant(activeSnapshot(), entry.rawValue);
      return {
        text: _formatValue(entry.value),
        preview:
          _materialPreviewUrl(variant?.name || '') ||
          _materialPreviewUrl(variant?.baseMaterial || ''),
        swatch: '',
      };
    }
    return { text: _formatValue(entry.value), preview: '', swatch: '' };
  }

  function _valuePresentation(section, key, value, node) {
    const text = _formatValue(value);
    if (section !== 'Properties') return { text, preview: '', swatch: '' };
    const keyText = String(key || '').toLowerCase();
    const swatch = _propertyColorSwatch(key, value, node?.propertyTypes?.[key]);
    if (swatch) return { text, preview: '', swatch };
    if (keyText === 'material') {
      const materialKey = _materialKey(value);
      const preview = _materialPreviewUrl(materialKey);
      const label =
        state_.meta.materials?.materials?.find(
          (item) => item.key === _materialVariantKey(materialKey),
        )?.name || materialKey;
      return {
        text: label && String(value) !== label ? `${label} · ${text}` : text,
        preview,
        swatch: '',
      };
    }
    if (keyText === 'materialvariant' || keyText === 'materialvariantserialized') {
      const variant = _resolveMaterialVariant(activeSnapshot(), value);
      const name = variant?.name || String(value || '');
      const preview = _materialPreviewUrl(name) || _materialPreviewUrl(variant?.baseMaterial || '');
      const base = variant?.baseMaterial ? ` · base ${variant.baseMaterial}` : '';
      return {
        text: `${name || text}${base}`,
        preview,
        swatch: '',
      };
    }
    return { text, preview: '', swatch: '' };
  }

  function _propertyColorSwatch(name = '', value = '', type = '') {
    const key = String(name || '').toLowerCase();
    const valueType = String(type || '').toLowerCase();
    const isColor =
      key === 'color' ||
      key === 'color3' ||
      key === 'color3uint8' ||
      key === 'brickcolor' ||
      key.endsWith('color') ||
      valueType.includes('color3') ||
      valueType.includes('brickcolor');
    if (!isColor) return '';
    const [r, g, b] = _parseColor(value);
    return `rgb(${r} ${g} ${b})`;
  }

  async function _ensureInlineFullValue(input, section, key, currentValue, node) {
    if (!input || input.dataset.fullLoaded === 'true') return;
    const currentText = _formatFullValue(currentValue);
    if (!/^__dt_heavy__:/i.test(currentText)) {
      input.dataset.fullLoaded = 'true';
      return;
    }
    const snapshot = activeSnapshot();
    if (!snapshot?.storagePath || !node?.id) return;
    if (snapshot?.storagePath && node?.id) {
      try {
        const value = await window.__TAURI__.core.invoke('datatree_node_value', {
          path: snapshot.storagePath,
          nodeId: node.id,
          section: _nodeValueSection(section),
          key,
        });
        input.value = _formatFullValue(value);
        input.dataset.fullLoaded = 'true';
      } catch (err) {
        toast.show(err?.message || 'Could not load full value', 'fail', 2400);
      }
    }
  }

  function _nodeValueSection(section) {
    const key = String(section || '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (key === 'itemattributes' || key === 'itemmetadata') return 'itemAttributes';
    if (key === 'attributes' || key === 'customattributes') return 'attributes';
    if (key === 'tags') return 'tags';
    return 'properties';
  }

  function _formatFullValue(value) {
    if (value == null) return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }

  function _tagSection(tags, query = '', options = {}) {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const entries = (Array.isArray(tags) ? tags : []).filter((tag) => {
      if (!q) return true;
      return `tags ${tag}`.toLowerCase().includes(q);
    });
    if (!entries.length && options.hideWhenEmpty) return null;
    const section = document.createElement('section');
    section.className = 'dt-kv-section';
    _appendSectionCount(section, 'Tags', entries.length);
    section.insertAdjacentHTML(
      'beforeend',
      entries.length
        ? `<div class="dt-tags">${entries.map((tag) => `<span>${_escape(tag)}</span>`).join('')}</div>`
        : '<div class="dt-empty-small">None</div>',
    );
    return section;
  }

  function _formatValue(value) {
    if (value == null) return String(value);
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  function ensureBridge() {
    return Promise.resolve(null);
  }
  function captureLiveTree() {
    toast.show('Import an RBXLX file to use DataTree.', 'warn', 2200);
  }
  function queueTask() {
    return Promise.resolve();
  }
  function handleBridgeEvent() {}
  function handleBridgeError() {}

  return {
    init,
    show,
    hide,
    render,
    openImportDialog,
    importRbxlx,
    ensureBridge,
    captureLiveTree,
    handleBridgeEvent,
    handleBridgeError,
    queueTask,
  };
})();
