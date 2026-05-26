const LangMap = (() => {
  const EXT_TO_LANG = {
    lua: 'lua',
    luau: 'lua',
    module: 'lua',
    modulescript: 'lua',
    localscript: 'lua',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    c: 'c',
    cpp: 'cpp',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    xml: 'xml',
    sql: 'sql',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    dart: 'dart',
    toml: 'ini',
  };
  const PREVIEW_IMAGE = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'ico',
    'tiff',
    'tif',
    'avif',
  ]);
  const PREVIEW_SVG = new Set(['svg']);
  const PREVIEW_MD = new Set(['md', 'markdown']);
  const PREVIEW_HTML = new Set(['html', 'htm']);
  const PREVIEW_VIDEO = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mkv', 'avi', 'm4v']);
  const MIME = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
  };
  const LUA_SCRIPT_EXT = new Set(['lua', 'luau', 'script', 'localscript', 'modulescript']);
  const ext = (name) => {
    const value = String(name || '');
    const dot = value.lastIndexOf('.');
    return dot === -1 ? '' : value.slice(dot + 1).toLowerCase();
  };
  function isLuaScriptFile(filename = '', path = '') {
    const value = String(filename || path || '');
    const e = ext(value);
    if (LUA_SCRIPT_EXT.has(e)) return true;
    const base = value
      .split(/[\\/]/)
      .pop()
      .replace(/\.[^.]+$/, '')
      .toLowerCase();
    return /(?:^|[._\s-])(script|localscript|modulescript|server|client|module)$/.test(base);
  }
  function looksLikeLuaSource(content = '') {
    const text = String(content || '').slice(0, 12000);
    if (!text.trim()) return false;
    let score = 0;
    if (/--!(strict|nonstrict|native|optimize)\b/.test(text)) score += 3;
    if (/\b(game|workspace):GetService\s*\(/.test(text)) score += 3;
    if (/\b(local\s+function|function\s+[A-Za-z_]|local\s+[A-Za-z_]\w*\s*=|return\s+)/.test(text))
      score += 2;
    if (/\b(end|then|do)\b/.test(text)) score += 1;
    if (/\bInstance\.new|Enum\.|Vector3\.new|CFrame\.new|require\s*\(/.test(text)) score += 2;
    return score >= 3;
  }
  function inferOverride(filename = '', path = '', content = '') {
    const e = ext(filename || path);
    if (e && EXT_TO_LANG[e] && EXT_TO_LANG[e] !== 'lua') return {};
    if (isLuaScriptFile(filename, path) || looksLikeLuaSource(content)) {
      return { languageOverride: 'lua', languageOverrideLabel: 'Lua' };
    }
    return {};
  }
  function monacoLang(filename, override = '') {
    if (override) return override;
    return EXT_TO_LANG[ext(filename)] ?? 'plaintext';
  }
  function previewType(filename) {
    const e = ext(filename);
    if (PREVIEW_IMAGE.has(e)) return 'image';
    if (PREVIEW_SVG.has(e)) return 'svg';
    if (PREVIEW_MD.has(e)) return 'markdown';
    if (PREVIEW_HTML.has(e)) return 'html';
    if (PREVIEW_VIDEO.has(e)) return 'video';
    return null;
  }
  function canPreview(filename) {
    const pt = previewType(filename);
    return pt === 'markdown' || pt === 'html';
  }
  function mimeFor(filename) {
    return MIME[ext(filename)] ?? 'application/octet-stream';
  }
  function extOf(filename) {
    return ext(filename);
  }
  return {
    monacoLang,
    previewType,
    canPreview,
    mimeFor,
    extOf,
    isLuaScriptFile,
    looksLikeLuaSource,
    inferOverride,
  };
})();
