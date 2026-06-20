const helpers = (() => {
  let _folderNames = null;
  let _fileNames = null;
  let _fileExts = null;
  let _fileCompound = null;
  let _builtinExts = null;
  let _builtinNames = null;
  let _builtinFolders = null;
  let _builtinCompound = null;
  let _loadPromise = null;
  let _styleEl = null;
  let _availableFolderSlugs = null;

  function _getOrCreateStyleEl() {
    if (!_styleEl) {
      _styleEl = document.createElement('style');
      _styleEl.id = 'velocityui-icon-theme';
      document.head.appendChild(_styleEl);
    }
    return _styleEl;
  }

  function _cssClass(stem) {
    return 'vico-' + stem.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function _cssUrl(url) {
    return String(url).replace(/["\\\n\r]/g, (ch) => (ch === '"' ? '%22' : ch === '\\' ? '/' : ''));
  }

  function _iconDecl(url) {
    return `background-image:url("${_cssUrl(url)}")`;
  }

  async function _buildIconStylesheet(iconDir) {
    const ICON_TYPES = ['.svg', '.png', '.jpg', '.jpeg'];
    const rules = new Map();

    const addRule = (stem, url) => {
      rules.set(_cssClass(stem), _iconDecl(url));
    };

    let entries = [];
    try {
      entries = await window.__TAURI__.core.invoke('read_dir', { path: iconDir });
    } catch {}

    const iconFiles = entries.filter((e) => ICON_TYPES.some((x) => e.entry.endsWith(x)));
    for (const e of iconFiles) {
      const extMatch = ICON_TYPES.find((x) => e.entry.endsWith(x));
      const stem = e.entry.slice(0, e.entry.length - extMatch.length);
      const filePath = `${iconDir}/${e.entry}`;
      addRule(stem, window.__TAURI__?.core?.convertFileSrc?.(filePath) ?? filePath);
    }

    for (const stem of ['folder', 'folder-open', 'file']) {
      const cls = _cssClass(stem);
      if (!rules.has(cls)) addRule(stem, `icons/default_icons/${stem}.svg`);
    }

    _availableFolderSlugs = new Set();
    for (const [cls] of rules.entries()) {
      const m = cls.match(/^vico-folder-(.+?)(?:-open)?$/);
      if (m) _availableFolderSlugs.add(m[1]);
    }

    const css = Array.from(rules.entries())
      .map(
        ([cls, decl]) =>
          `.${cls}{display:inline-block;width:16px;height:16px;background-size:16px 16px;background-repeat:no-repeat;background-position:center;image-rendering:auto;${decl}}`,
      )
      .join('\n');

    _getOrCreateStyleEl().textContent = css;
  }

  async function _buildBuiltinStylesheet() {
    let json = {};
    try {
      const res = await fetch('icons/icons.json');
      json = await res.json();
    } catch {}

    _builtinExts = json.fileExtensions ?? {};
    _builtinNames = json.fileNames ?? {};
    _builtinFolders = json.folderNames ?? {};
    _builtinCompound = json.fileCompound ?? {};

    const allStems = new Set([
      ...Object.values(_builtinExts),
      ...Object.values(_builtinNames),
      ...Object.values(_builtinCompound),
      'file',
      'folder',
      'folder-open',
    ]);

    let availableStems = null;
    try {
      const resourceDir = await window.__TAURI__.path.resourceDir();
      const iconFilesDir = await window.__TAURI__.path.join(resourceDir, 'icons', 'files');
      const entries = await window.__TAURI__.core.invoke('read_dir', { path: iconFilesDir });
      availableStems = new Set();
      for (const e of entries) {
        if (!e.entry.endsWith('.svg')) continue;
        const stem = e.entry.slice(0, -4);
        allStems.add(stem);
        availableStems.add(stem);
      }
    } catch {
      for (const slug of Object.values(_builtinFolders)) {
        allStems.add(`folder-${slug}`);
        allStems.add(`folder-${slug}-open`);
      }
    }

    const rules = new Map();
    for (const stem of allStems) {
      const cls = _cssClass(stem);
      if (availableStems && !availableStems.has(stem)) continue;
      rules.set(cls, _iconDecl(`icons/files/${stem}.svg`));
    }

    _availableFolderSlugs = new Set();
    for (const [cls] of rules.entries()) {
      const m = cls.match(/^vico-folder-(.+?)(?:-open)?$/);
      if (m) _availableFolderSlugs.add(m[1]);
    }

    const css = Array.from(rules.entries())
      .map(
        ([cls, decl]) =>
          `.${cls}{display:inline-block;width:16px;height:16px;background-size:16px 16px;background-repeat:no-repeat;background-position:center;image-rendering:auto;${decl}}`,
      )
      .join('\n');

    _getOrCreateStyleEl().textContent = css;
  }

  async function loadIcons() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = _doLoad();
    try {
      await _loadPromise;
    } finally {
      _loadPromise = null;
    }

    if (typeof ExplorerTree !== 'undefined') ExplorerTree.render();
  }

  async function _doLoad() {
    if (!_builtinExts) {
      try {
        const res = await fetch('icons/icons.json');
        const json = await res.json();
        _builtinExts = json.fileExtensions ?? {};
        _builtinNames = json.fileNames ?? {};
        _builtinFolders = json.folderNames ?? {};
        _builtinCompound = json.fileCompound ?? {};
      } catch {
        _builtinExts = {};
        _builtinNames = {};
        _builtinFolders = {};
        _builtinCompound = {};
      }
    }

    if (typeof iconThemeManager !== 'undefined') {
      const activeId = await iconThemeManager.getActive();
      if (activeId && activeId !== 'material') {
        const installed = await iconThemeManager.loadInstalledIcons(activeId);
        if (installed) {
          _folderNames = installed.iconsJson.folderNames ?? {};
          _fileNames = installed.iconsJson.fileNames ?? {};
          _fileExts = installed.iconsJson.fileExtensions ?? {};
          _fileCompound = installed.iconsJson.fileCompound ?? {};
          await _buildIconStylesheet(installed.iconDir);
          return;
        }
      }
    }

    _folderNames = _builtinFolders;
    _fileNames = _builtinNames;
    _fileExts = _builtinExts;
    _fileCompound = _builtinCompound;
    await _buildBuiltinStylesheet();
  }

  async function reloadIcons() {
    _folderNames = _fileNames = _fileExts = _fileCompound = null;
    _builtinExts = _builtinNames = _builtinFolders = _builtinCompound = null;
    await loadIcons();
  }

  function _folderStem(name, isOpen) {
    const lower = name.toLowerCase();
    const aliasedSlug = _folderNames?.[lower] ?? _builtinFolders?.[lower] ?? null;
    if (aliasedSlug) return `folder-${aliasedSlug}${isOpen ? '-open' : ''}`;
    if (_availableFolderSlugs?.has(lower)) return `folder-${lower}${isOpen ? '-open' : ''}`;
    return isOpen ? 'folder-open' : 'folder';
  }

  function _fileStem(filename) {
    const lower = filename.toLowerCase();
    const byName = _fileNames?.[lower] ?? _builtinNames?.[lower];
    if (byName) return byName;
    const firstDot = lower.indexOf('.');
    if (firstDot > 0) {
      const compound = lower.slice(firstDot + 1);
      const byCompound = _fileCompound?.[compound] ?? _builtinCompound?.[compound];
      if (byCompound) return byCompound;
    }
    const e = ext(lower);
    return _fileExts?.[e] ?? _builtinExts?.[e] ?? 'file';
  }

  function fileIconClass(filename, isFolder = false, isOpen = false) {
    const stem = isFolder ? _folderStem(filename, isOpen) : _fileStem(filename);
    return _cssClass(stem);
  }

  function fileIconFallbackClass(isFolder, isOpen) {
    return _cssClass(isFolder ? (isOpen ? 'folder-open' : 'folder') : 'file');
  }

  function fileIconEl(filename, isFolder = false, isOpen = false) {
    const el = document.createElement('span');
    el.className = fileIconClass(filename, isFolder, isOpen);
    return el;
  }

  function updateIconEl(el, filename, isFolder = false, isOpen = false) {
    el.className = fileIconClass(filename, isFolder, isOpen);
  }

  function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function ext(filename) {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  }

  function basename(path) {
    return path.replace(/\\/g, '/').split('/').pop();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timestamp() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last < ms) return;
      last = now;
      return fn.apply(this, args);
    };
  }

  return {
    loadIcons,
    reloadIcons,
    fileIconEl,
    fileIconClass,
    fileIconFallbackClass,
    updateIconEl,
    uid,
    ext,
    basename,
    escapeHtml,
    timestamp,
    debounce,
    throttle,
  };
})();
