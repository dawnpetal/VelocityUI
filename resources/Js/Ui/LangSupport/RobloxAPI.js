const RobloxAPI = (() => {
  let _ready = false;
  let _initPromise = null;
  let _resolve;
  const _promise = new Promise((r) => (_resolve = r));
  let CLASSES = {};
  let ENUM_MAP = {};
  let SERVICE_MAP = {};
  let RAW_API = null;
  const SERVICE_ALIASES = {
    Workspace: 'Workspace',
    Players: 'Players',
    ReplicatedStorage: 'ReplicatedStorage',
    ServerStorage: 'ServerStorage',
    StarterGui: 'StarterGui',
    StarterPack: 'StarterPack',
    StarterPlayer: 'StarterPlayer',
    Lighting: 'Lighting',
    SoundService: 'SoundService',
    HttpService: 'HttpService',
    TextService: 'TextService',
    MarketplaceService: 'MarketplaceService',
    DataStoreService: 'DataStoreService',
    RunService: 'RunService',
    TweenService: 'TweenService',
    UserInputService: 'UserInputService',
    ContextActionService: 'ContextActionService',
    CollectionService: 'CollectionService',
    PathfindingService: 'PathfindingService',
    PhysicsService: 'PhysicsService',
    Teams: 'Teams',
    Chat: 'Chat',
    GuiService: 'GuiService',
    HapticService: 'HapticService',
    KeyframeSequenceProvider: 'KeyframeSequenceProvider',
    LocalizationService: 'LocalizationService',
    VirtualInputManager: 'VirtualInputManager',
  };
  const GLOBAL_TYPES = {
    game: 'DataModel',
    workspace: 'Workspace',
    script: 'LocalScript',
  };
  const BAD_MEMBER_TAGS = new Set();
  const BAD_SECURITY = new Set();
  const BAD_CLASS_TAGS = new Set(['Deprecated', 'NotBrowsable']);
  const SKIP_CLASSES = new Set();
  function normType(t) {
    if (!t) return 'any';
    const n = t.Name || 'any';
    const map = {
      bool: 'boolean',
      int: 'number',
      int64: 'number',
      float: 'number',
      double: 'number',
      string: 'string',
      null: '()',
      void: '()',
      Variant: 'any',
      Function: 'function',
      Instances: '{Instance}',
      Array: 'table',
      Dictionary: 'table',
      Tuple: '...',
      Map: 'table',
    };
    return map[n] || n;
  }
  function isMemberClean(member) {
    const tags = member.Tags || [];
    if (tags.some((t) => BAD_MEMBER_TAGS.has(t))) return false;
    const sec = member.Security;
    if (typeof sec === 'string') {
      if (BAD_SECURITY.has(sec)) return false;
    } else if (sec && typeof sec === 'object') {
      if (BAD_SECURITY.has(sec.Read) || BAD_SECURITY.has(sec.Write)) return false;
    }
    return true;
  }
  function _build(RAW) {
    const rawMap = new Map();
    for (const cls of RAW.Classes || []) {
      if (SKIP_CLASSES.has(cls.Name)) continue;
      const classTags = cls.Tags || [];
      if (classTags.some((t) => BAD_CLASS_TAGS.has(t))) continue;
      rawMap.set(cls.Name, cls);
    }
    function getAncestors(name) {
      const chain = [];
      let cur = name;
      const visited = new Set();
      while (cur && cur !== '<<<ROOT>>>' && !visited.has(cur)) {
        visited.add(cur);
        const entry = rawMap.get(cur) || RAW.Classes.find((c) => c.Name === cur);
        if (!entry) break;
        chain.push(cur);
        cur = entry.Superclass;
      }
      return chain;
    }
    for (const [name] of rawMap) {
      const ancestors = getAncestors(name);
      const p = [],
        m = [],
        e = [];
      const seenProps = new Set(),
        seenMethods = new Set(),
        seenEvents = new Set();
      for (const ancestorName of ancestors) {
        const entry = rawMap.get(ancestorName) || RAW.Classes.find((c) => c.Name === ancestorName);
        if (!entry) continue;
        for (const member of entry.Members || []) {
          if (!isMemberClean(member)) continue;
          const mn = member.Name;
          if (member.MemberType === 'Property' && !seenProps.has(mn)) {
            seenProps.add(mn);
            p.push([mn, normType(member.ValueType)]);
          } else if (member.MemberType === 'Function' && !seenMethods.has(mn)) {
            seenMethods.add(mn);
            const params = (member.Parameters || []).map((p) => p.Name + ': ' + normType(p.Type));
            const ret = normType(member.ReturnType);
            const argStr = params.length ? '(' + params.join(', ') + ')' : null;
            m.push([mn, ret, argStr]);
          } else if (member.MemberType === 'Event' && !seenEvents.has(mn)) {
            seenEvents.add(mn);
            const params = (member.Parameters || []).map((p) => p.Name + ': ' + normType(p.Type));
            e.push([mn, '(' + params.join(', ') + ')']);
          }
        }
      }
      CLASSES[name] = {
        p,
        m,
        e,
      };
    }
    for (const e of RAW.Enums || []) {
      ENUM_MAP[e.Name] = (e.Items || []).map((i) => i.Name);
    }
    for (const cls of RAW.Classes || []) {
      const tags = cls.Tags || [];
      if (tags.includes('Service') && rawMap.has(cls.Name)) {
        SERVICE_MAP[cls.Name] = cls.Name;
      }
    }
    Object.assign(SERVICE_MAP, SERVICE_ALIASES);
  }
  async function init() {
    if (_ready) return;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      try {
        const res = await fetch('Json/RobloxAPI.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const RAW = await res.json();
        RAW_API = RAW;
        _build(RAW);
      } catch (err) {
        console.error('[RobloxAPI] Failed to load API dump:', err);
      }
      _ready = true;
      _resolve();
    })();
    return _initPromise;
  }
  function ready() {
    return _promise;
  }
  function getClass(name) {
    return CLASSES[name] || null;
  }
  function raw() {
    return RAW_API;
  }
  function resolveGlobal(name) {
    return GLOBAL_TYPES[name] || null;
  }
  function resolveService(name) {
    return SERVICE_MAP[name] || null;
  }
  return {
    init,
    ready,
    getClass,
    raw,
    resolveGlobal,
    resolveService,
    CLASSES,
    ENUM_MAP,
    SERVICE_MAP,
    GLOBAL_TYPES,
  };
})();
