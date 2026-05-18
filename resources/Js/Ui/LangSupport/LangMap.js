const LangMap = (() => {
  const EXT_TO_LANG = {
    lua: 'lua',
    luau: 'lua',
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
  const ext = (name) => name.split('.').pop().toLowerCase();
  function monacoLang(filename) {
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
  };
})();
