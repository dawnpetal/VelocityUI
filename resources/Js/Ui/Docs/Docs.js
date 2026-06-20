const docsPanel = (() => {
  const DOCS_DIR = 'Assets/Docs/';
  const FILES = ['Sunc.md', 'SynapseX.md', 'RakNet.md', 'Bypasses.md', 'Privacy.md'];
  const DEBOUNCE = 80;

  let _view = 'home';
  let _libraries = [];
  let _activeLib = null;
  let _pages = [];
  let _tree = [];
  let _activePage = null;
  let _query = '';
  let _homeQuery = '';
  let _mounted = false;
  let _loading = false;
  let _error = '';
  let _contentSearch = '';
  let _contentMatchIdx = 0;

  const SVG = {
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    arrowL:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
    arrowUpR:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _parseMeta(raw) {
    const meta = { name: 'Unknown', desc: '', accent: 'var(--accent)', pages: 0 };
    const lines = raw.split('\n');
    for (const l of lines) {
      if (!l.startsWith('@@ ')) break;
      const eq = l.indexOf(':');
      if (eq === -1) continue;
      const k = l.slice(3, eq).trim();
      const v = l.slice(eq + 1).trim();
      if (k in meta) meta[k] = k === 'pages' ? parseInt(v) || 0 : v;
    }
    return meta;
  }

  function _parseDump(raw) {
    const pages = [];
    const lines = raw.split('\n');
    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('@@ ')) {
        i++;
        continue;
      }
      if (!lines[i].startsWith('>>> ')) {
        i++;
        continue;
      }
      const section = lines[i].slice(4).trim();
      i++;
      if (i >= lines.length || !lines[i].startsWith('>>> ')) continue;
      const title = lines[i].slice(4).trim();
      i++;
      const content = [];
      while (i < lines.length && !lines[i].startsWith('>>> ')) content.push(lines[i++]);
      pages.push({ section, title, content: content.join('\n').trim() });
    }
    return pages;
  }

  function _buildTree(pages) {
    const map = new Map();
    pages.forEach((p) => {
      if (!map.has(p.section)) map.set(p.section, []);
      map.get(p.section).push(p);
    });
    return [...map.entries()].map(([section, items]) => ({ section, items, open: true }));
  }

  function _inline(s) {
    s = s
      .replace(/`#![\w]+ /g, '`')
      .replace(/\[#![\w]+\]\([^)]*\)/g, '')
      .replace(/!!!\s+\w+/g, '');
    return _esc(s)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="docs-inline-code">$1</code>')
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_, t, h) => `<a class="docs-link" href="#" data-href="${_esc(h)}">${t}</a>`,
      );
  }

  const KW = new Set([
    'and',
    'break',
    'continue',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',
    'export',
    'type',
  ]);
  const BI = new Set([
    'print',
    'warn',
    'error',
    'assert',
    'tostring',
    'tonumber',
    'type',
    'typeof',
    'pairs',
    'ipairs',
    'next',
    'select',
    'unpack',
    'table',
    'string',
    'math',
    'bit32',
    'os',
    'task',
    'coroutine',
    'setmetatable',
    'getmetatable',
    'rawget',
    'rawset',
    'rawequal',
    'rawlen',
    'require',
    'pcall',
    'xpcall',
    'loadstring',
    'load',
    'collectgarbage',
    'gcinfo',
    'newproxy',
    'tick',
    'time',
    'wait',
    'delay',
    'spawn',
    'game',
    'workspace',
    'script',
    'plugin',
    'Enum',
    'Instance',
    'Vector2',
    'Vector3',
    'CFrame',
    'Color3',
    'UDim',
    'UDim2',
    'TweenInfo',
    'Ray',
    'Region3',
    'NumberRange',
    'NumberSequence',
    'ColorSequence',
    'Rect',
    'PhysicalProperties',
    'Random',
    'UTF8',
    'buffer',
  ]);

  function _highlight(code, lang) {
    if (lang && lang !== 'luau' && lang !== 'lua') return _esc(code);
    const out = [];
    let i = 0;
    const len = code.length;
    const peek = (n = 1) => code.slice(i, i + n);
    const eat = (n = 1) => {
      const s = code.slice(i, i + n);
      i += n;
      return s;
    };
    const span = (cls, t) => `<span style="color:var(${cls})">${_esc(t)}</span>`;
    while (i < len) {
      if (peek(2) === '--' && code[i + 2] === '[') {
        let eq = 0,
          j = i + 3;
        while (j < len && code[j] === '=') {
          eq++;
          j++;
        }
        if (code[j] === '[') {
          const cl = ']' + '='.repeat(eq) + ']';
          const e = code.indexOf(cl, j + 1);
          out.push(span('--syn-cmt', eat(e === -1 ? len - i : e - i + cl.length)));
          continue;
        }
      }
      if (peek(2) === '--') {
        let s = '';
        while (i < len && code[i] !== '\n') s += eat();
        out.push(span('--syn-cmt', s));
        continue;
      }
      if (peek() === '[' && (code[i + 1] === '[' || code[i + 1] === '=')) {
        let eq = 0,
          j = i + 1;
        while (j < len && code[j] === '=') {
          eq++;
          j++;
        }
        if (code[j] === '[') {
          const cl = ']' + '='.repeat(eq) + ']';
          const e = code.indexOf(cl, j + 1);
          out.push(span('--syn-str', eat(e === -1 ? len - i : e - i + cl.length)));
          continue;
        }
      }
      if (peek() === '"' || peek() === "'") {
        const q = eat();
        let s = q;
        while (i < len && code[i] !== q) {
          if (code[i] === '\\') s += eat();
          s += eat();
        }
        if (i < len) s += eat();
        out.push(span('--syn-str', s));
        continue;
      }
      if (/\d/.test(peek()) || (peek() === '.' && /\d/.test(code[i + 1] ?? ''))) {
        let s = '';
        if (peek(2) === '0x' || peek(2) === '0X') {
          s += eat(2);
          while (i < len && /[0-9a-fA-F_]/.test(code[i])) s += eat();
        } else if (peek(2) === '0b' || peek(2) === '0B') {
          s += eat(2);
          while (i < len && /[01_]/.test(code[i])) s += eat();
        } else {
          while (i < len && /[\d_]/.test(code[i])) s += eat();
          if (i < len && code[i] === '.') {
            s += eat();
            while (i < len && /[\d_]/.test(code[i])) s += eat();
          }
          if (i < len && (code[i] === 'e' || code[i] === 'E')) {
            s += eat();
            if (i < len && (code[i] === '+' || code[i] === '-')) s += eat();
            while (i < len && /\d/.test(code[i])) s += eat();
          }
        }
        out.push(span('--syn-num', s));
        continue;
      }
      if (/[a-zA-Z_]/.test(peek())) {
        let s = '';
        while (i < len && /[a-zA-Z0-9_]/.test(code[i])) s += eat();
        if (KW.has(s)) out.push(span('--syn-kw', s));
        else if (BI.has(s)) out.push(span('--syn-bi', s));
        else if (
          code[i] === '(' ||
          (code[i] === '.' && /[a-zA-Z_]/.test(code[i + 1] ?? '')) ||
          code[i] === ':'
        )
          out.push(span('--syn-fn', s));
        else out.push(_esc(s));
        continue;
      }
      const ch = eat();
      out.push(/[+\-*/%^#&|~<>=!;:,.()\[\]{}]/.test(ch) ? span('--syn-op', ch) : _esc(ch));
    }
    return out.join('');
  }

  function _renderMarkdown(raw) {
    raw = raw
      .replace(/^!!![^\n]*\n(    [^\n]*\n)*/gm, '')
      .replace(/^\?\?\?[^\n]*\n(    [^\n]*\n)*/gm, '');
    const lines = raw.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^(`{3,}|~{3,})/.test(line)) {
        const fence = line.match(/^(`{3,}|~{3,})/)[1];
        const lang = line.slice(fence.length).trim().replace(/\s.*$/, '');
        const code = [];
        i++;
        while (i < lines.length && !lines[i].startsWith(fence[0].repeat(fence.length)))
          code.push(lines[i++]);
        const raw = code.join('\n');
        const highlighted = _highlight(raw, lang || 'luau');
        const numberedLines = highlighted
          .split('\n')
          .map(
            (ln, idx) =>
              `<div class="docs-line"><span class="docs-ln">${idx + 1}</span><span class="docs-lc">${ln || ' '}</span></div>`,
          )
          .join('');
        out.push(
          `<div class="docs-code-block"><div class="docs-code-header"><span class="docs-code-lang">${_esc(lang) || 'luau'}</span><button class="docs-copy-btn" data-code="${_esc(raw)}">${SVG.copy}<span>Copy</span></button></div><pre class="docs-pre docs-pre--lined"><code>${numberedLines}</code></pre></div>`,
        );
        i++;
        continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        out.push(
          `<h${hm[1].length} class="docs-h docs-h${hm[1].length}">${_inline(hm[2])}</h${hm[1].length}>`,
        );
        i++;
        continue;
      }
      if (/^[-*_]{3,}\s*$/.test(line.trim())) {
        out.push('<hr class="docs-hr">');
        i++;
        continue;
      }
      if (
        /^\|.+\|$/.test(line.trim()) &&
        i + 1 < lines.length &&
        /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())
      ) {
        const parseRow = (r) =>
          r
            .split('|')
            .filter((_, j, a) => j > 0 && j < a.length - 1)
            .map((c) => c.trim());
        const headers = parseRow(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim()))
          rows.push(parseRow(lines[i++]));
        const th = headers.map((h) => `<th class="docs-th">${_inline(h)}</th>`).join('');
        const tb = rows
          .map(
            (r) =>
              `<tr class="docs-tr">${r.map((c) => `<td class="docs-td">${_inline(c)}</td>`).join('')}</tr>`,
          )
          .join('');
        out.push(
          `<div class="docs-table-wrap"><table class="docs-table"><thead><tr class="docs-tr">${th}</tr></thead><tbody>${tb}</tbody></table></div>`,
        );
        continue;
      }
      if (/^[-*+]\s/.test(line)) {
        const it = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i]) && !/^\|/.test(lines[i]))
          it.push(`<li>${_inline(lines[i++].replace(/^[-*+]\s/, ''))}</li>`);
        out.push(`<ul class="docs-ul">${it.join('')}</ul>`);
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        const it = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i]))
          it.push(`<li>${_inline(lines[i++].replace(/^\d+\.\s/, ''))}</li>`);
        out.push(`<ol class="docs-ol">${it.join('')}</ol>`);
        continue;
      }
      if (line.startsWith('> ')) {
        const bq = [];
        while (i < lines.length && lines[i].startsWith('> ')) bq.push(lines[i++].slice(2));
        out.push(`<blockquote class="docs-blockquote">${_inline(bq.join(' '))}</blockquote>`);
        continue;
      }
      if (line.trim() === '' || /^\s{4}/.test(line)) {
        i++;
        continue;
      }
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].startsWith('#') &&
        !/^(`{3,}|~{3,})/.test(lines[i]) &&
        !/^[-*_]{3,}\s*$/.test(lines[i].trim()) &&
        !/^\s{4}/.test(lines[i])
      )
        para.push(lines[i++]);
      if (para.length) out.push(`<p class="docs-p">${_inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  async function _loadAll() {
    _loading = true;
    _error = '';
    _render();
    try {
      const libs = await Promise.all(
        FILES.map(async (f) => {
          const raw = await fetch(DOCS_DIR + f).then((r) => {
            if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
            return r.text();
          });
          const meta = _parseMeta(raw);
          const pages = _parseDump(raw);
          const sections = [...new Set(pages.map((p) => p.section))];
          return { file: f, meta, pages, sections, pageCount: pages.length };
        }),
      );
      _libraries = libs;
      _loading = false;
    } catch (e) {
      _error = String(e);
      _loading = false;
    }
    _render();
  }

  async function _openLib(lib) {
    _activeLib = lib;
    _pages = lib.pages;
    _tree = _buildTree(_pages);
    _activePage = _pages[0] ?? null;
    _query = '';
    _view = 'reader';
    _render();
  }

  function _filtered() {
    if (!_query.trim()) return _tree;
    const q = _query.trim().toLowerCase();
    return _tree
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.section.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }

  function _filteredLibs() {
    if (!_homeQuery.trim()) return _libraries;
    const q = _homeQuery.trim().toLowerCase();
    return _libraries.filter(
      (l) => l.meta.name.toLowerCase().includes(q) || l.meta.desc.toLowerCase().includes(q),
    );
  }

  function _root() {
    return document.getElementById('docsView');
  }

  function _renderHome() {
    const root = _root();
    root.innerHTML = '';
    const wrap = DomHelpers.el('div', 'docs-home');

    const topbar = DomHelpers.el('div', 'docs-home-topbar');
    topbar.appendChild(DomHelpers.el('span', 'docs-home-topbar-title', 'Documentation'));
    const searchWrap = DomHelpers.el('label', 'docs-home-search');
    const sIcon = DomHelpers.el('span', 'docs-home-search-icon');
    sIcon.innerHTML = SVG.search;
    const sInput = document.createElement('input');
    sInput.className = 'docs-home-search-input';
    sInput.placeholder = 'Search...';
    sInput.addEventListener(
      'input',
      helpers.debounce(() => {
        _homeQuery = sInput.value;
        _renderGrid(grid);
      }, DEBOUNCE),
    );
    searchWrap.append(sIcon, sInput);
    topbar.appendChild(searchWrap);
    wrap.appendChild(topbar);

    const body = DomHelpers.el('div', 'docs-home-body');

    const grid = DomHelpers.el('div', 'docs-lib-grid');
    _renderGrid(grid);
    body.appendChild(grid);
    wrap.appendChild(body);
    root.appendChild(wrap);
  }

  function _renderGrid(grid) {
    grid.innerHTML = '';
    const libs = _filteredLibs();
    if (!libs.length) {
      grid.appendChild(DomHelpers.el('div', 'docs-home-empty', 'No results.'));
      return;
    }
    libs.forEach((lib, idx) => {
      const card = DomHelpers.el('div', 'docs-lib-card');
      card.style.setProperty('--lib-accent', lib.meta.accent);

      const cardTop = DomHelpers.el('div', 'docs-lib-card-top');
      const num = DomHelpers.el('span', 'docs-lib-num', String(idx + 1).padStart(2, '0'));
      const bookIcon = DomHelpers.el('span', 'docs-lib-book');
      bookIcon.innerHTML = SVG.book;
      cardTop.append(num, bookIcon);

      const cardTitle = DomHelpers.el('div', 'docs-lib-title', lib.meta.name);
      const cardDesc = DomHelpers.el('p', 'docs-lib-desc', lib.meta.desc);

      const cardFoot = DomHelpers.el('div', 'docs-lib-card-foot');
      const stats = DomHelpers.el(
        'span',
        'docs-lib-stats',
        `${lib.sections.length} sections · ${lib.pageCount} pages`,
      );
      const arrow = DomHelpers.el('span', 'docs-lib-arrow');
      arrow.innerHTML = SVG.arrowUpR;
      cardFoot.append(stats, arrow);

      card.append(cardTop, cardTitle, cardDesc, cardFoot);
      card.addEventListener('click', () => _openLib(lib));
      grid.appendChild(card);
    });
  }

  function _renderReader() {
    const root = _root();
    root.innerHTML = '';
    const wrap = DomHelpers.el('div', 'docs-reader');
    wrap.style.setProperty('--lib-accent', _activeLib?.meta?.accent ?? 'var(--accent)');

    const sidebar = DomHelpers.el('aside', 'docs-sidebar');

    const sideHead = DomHelpers.el('div', 'docs-sidebar-head');
    const backBtn = DomHelpers.el('button', 'docs-back-btn');
    backBtn.innerHTML = SVG.arrowL + '<span>All docs</span>';
    backBtn.addEventListener('click', () => {
      _view = 'home';
      _contentSearch = '';
      if (_handleFindShortcut) {
        document.removeEventListener('keydown', _handleFindShortcut);
        _handleFindShortcut = null;
      }
      _render();
    });
    const libName = DomHelpers.el('span', 'docs-sidebar-lib-name', _activeLib?.meta?.name ?? '');
    sideHead.append(backBtn, libName);
    sidebar.appendChild(sideHead);

    const searchWrap = DomHelpers.el('label', 'docs-sidebar-search');
    const icon = DomHelpers.el('span', 'docs-sidebar-search-icon');
    icon.innerHTML = SVG.search;
    const input = document.createElement('input');
    input.className = 'docs-sidebar-search-input';
    input.placeholder = 'Filter...';
    input.value = _query;
    input.addEventListener(
      'input',
      helpers.debounce(() => {
        _query = input.value;
        _renderTree(sidebar.querySelector('.docs-sidebar-tree'));
      }, DEBOUNCE),
    );
    searchWrap.append(icon, input);
    sidebar.appendChild(searchWrap);

    const tree = DomHelpers.el('div', 'docs-sidebar-tree');
    _renderTree(tree);
    sidebar.appendChild(tree);

    const contentWrap = DomHelpers.el('div', 'docs-content-wrap');
    contentWrap.appendChild(_buildContentSearch(contentWrap));

    const content = DomHelpers.el('div', 'docs-content');
    _renderContent(content);
    contentWrap.appendChild(content);

    wrap.append(sidebar, contentWrap);
    root.appendChild(wrap);
  }

  function _buildContentSearch(contentWrap) {
    const bar = DomHelpers.el('div', 'docs-find-bar');

    const left = DomHelpers.el('div', 'docs-find-left');
    const findIcon = DomHelpers.el('span', 'docs-find-icon');
    findIcon.innerHTML = SVG.search;
    const findInput = document.createElement('input');
    findInput.className = 'docs-find-input';
    findInput.placeholder = 'Find in page…';
    findInput.value = _contentSearch;

    const countEl = DomHelpers.el('span', 'docs-find-count', '');
    left.append(findIcon, findInput, countEl);

    const right = DomHelpers.el('div', 'docs-find-right');
    const prevBtn = document.createElement('button');
    prevBtn.className = 'docs-find-btn';
    prevBtn.title = 'Previous (Shift+Enter)';
    prevBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'docs-find-btn';
    nextBtn.title = 'Next (Enter)';
    nextBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'docs-find-btn docs-find-close';
    closeBtn.title = 'Close (Escape)';
    closeBtn.innerHTML = SVG.close;
    right.append(prevBtn, nextBtn, closeBtn);
    bar.append(left, right);

    const runSearch = () => {
      const content = contentWrap.querySelector('.docs-content');
      if (!content) return;
      const q = findInput.value.trim();
      _contentSearch = findInput.value;
      _applyHighlights(content, q, countEl);
    };

    const navigate = (dir) => {
      const marks = contentWrap.querySelectorAll('.docs-find-match');
      if (!marks.length) return;
      marks[_contentMatchIdx]?.classList.remove('docs-find-match--active');
      _contentMatchIdx = (_contentMatchIdx + dir + marks.length) % marks.length;
      const active = marks[_contentMatchIdx];
      active.classList.add('docs-find-match--active');
      active.scrollIntoView({ block: 'center' });
      countEl.textContent = `${_contentMatchIdx + 1}/${marks.length}`;
    };

    const close = () => {
      _contentSearch = '';
      findInput.value = '';
      const content = contentWrap.querySelector('.docs-content');
      if (content) _clearHighlights(content);
      countEl.textContent = '';
      bar.classList.remove('docs-find-bar--active');
    };

    findInput.addEventListener('input', helpers.debounce(runSearch, 120));
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(e.shiftKey ? -1 : 1);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    nextBtn.addEventListener('click', () => navigate(1));
    prevBtn.addEventListener('click', () => navigate(-1));
    closeBtn.addEventListener('click', close);

    if (_contentSearch) {
      bar.classList.add('docs-find-bar--active');
      requestAnimationFrame(() => {
        const content = contentWrap.querySelector('.docs-content');
        if (content) _applyHighlights(content, _contentSearch, countEl);
        findInput.focus();
      });
    }

    document.addEventListener(
      'keydown',
      (_handleFindShortcut = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          const reader = document.querySelector('.docs-reader');
          if (!reader) return;
          e.preventDefault();
          bar.classList.add('docs-find-bar--active');
          findInput.focus();
          findInput.select();
        }
      }),
    );

    return bar;
  }

  let _handleFindShortcut = null;

  function _applyHighlights(contentEl, q, countEl) {
    _clearHighlights(contentEl);
    _contentMatchIdx = 0;
    if (!q) {
      if (countEl) countEl.textContent = '';
      return;
    }
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement.closest('code, script, style')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let matchCount = 0;
    textNodes.forEach((tn) => {
      const text = tn.textContent;
      if (!re.test(text)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0,
        m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement('mark');
        mark.className = 'docs-find-match' + (matchCount === 0 ? ' docs-find-match--active' : '');
        mark.textContent = m[0];
        frag.appendChild(mark);
        matchCount++;
        last = re.lastIndex;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });

    if (countEl) countEl.textContent = matchCount ? `1/${matchCount}` : 'No results';
    if (matchCount) {
      const first = contentEl.querySelector('.docs-find-match--active');
      first?.scrollIntoView({ block: 'center' });
    }
  }

  function _clearHighlights(contentEl) {
    contentEl.querySelectorAll('.docs-find-match').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    contentEl.normalize();
  }

  function _renderTree(treeEl) {
    if (!treeEl) return;
    treeEl.innerHTML = '';
    const groups = _filtered();
    if (!groups.length) {
      treeEl.appendChild(DomHelpers.el('div', 'docs-sidebar-empty', 'No results.'));
      return;
    }
    groups.forEach((group) => {
      const section = DomHelpers.el('div', 'docs-sidebar-section');
      const chevron = DomHelpers.el('span', 'docs-sidebar-chevron' + (group.open ? ' open' : ''));
      chevron.innerHTML = SVG.chevron;
      const folderIcon = DomHelpers.el('span', 'docs-sidebar-folder-icon');
      folderIcon.innerHTML = SVG.folder;
      const header = DomHelpers.el('button', 'docs-sidebar-section-header');
      header.append(
        chevron,
        folderIcon,
        DomHelpers.el('span', 'docs-sidebar-section-label', group.section),
      );
      const itemList = DomHelpers.el('div', 'docs-sidebar-items');
      if (!group.open) itemList.style.display = 'none';
      header.addEventListener('click', () => {
        group.open = !group.open;
        chevron.className = 'docs-sidebar-chevron' + (group.open ? ' open' : '');
        itemList.style.display = group.open ? '' : 'none';
      });
      section.appendChild(header);
      group.items.forEach((page) => {
        const item = DomHelpers.el(
          'button',
          'docs-sidebar-item' + (_activePage === page ? ' active' : ''),
        );
        const fi = DomHelpers.el('span', 'docs-sidebar-file-icon');
        fi.innerHTML = SVG.file;
        item.append(fi, DomHelpers.el('span', 'docs-sidebar-item-label', page.title));
        item.addEventListener('click', () => {
          _activePage = page;
          treeEl
            .querySelectorAll('.docs-sidebar-item')
            .forEach((el) => el.classList.remove('active'));
          item.classList.add('active');
          _renderContent(_root()?.querySelector('.docs-content'));
        });
        itemList.appendChild(item);
      });
      section.appendChild(itemList);
      treeEl.appendChild(section);
    });
  }

  function _renderContent(contentEl) {
    if (!contentEl) return;
    if (!_activePage) {
      contentEl.innerHTML = '<div class="docs-content-empty">Select a page from the sidebar.</div>';
      return;
    }
    const breadcrumb = `<nav class="docs-breadcrumb" aria-label="breadcrumb"><span class="docs-breadcrumb-item">${_esc(_activeLib?.meta?.name ?? '')}</span><span class="docs-breadcrumb-sep">›</span><span class="docs-breadcrumb-item">${_esc(_activePage.section)}</span><span class="docs-breadcrumb-sep">›</span><span class="docs-breadcrumb-item docs-breadcrumb-item--active">${_esc(_activePage.title)}</span></nav>`;
    contentEl.innerHTML = `<div class="docs-article">${breadcrumb}<div class="docs-page-header"><span class="docs-page-title">${_esc(_activePage.title)}</span></div>${_renderMarkdown(_activePage.content)}</div>`;
    contentEl.scrollTop = 0;
    contentEl.querySelectorAll('.docs-copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await window.__TAURI__.core.invoke('write_clipboard', { text: btn.dataset.code });
          const orig = btn.innerHTML;
          btn.innerHTML = SVG.check + '<span>Copied</span>';
          btn.classList.add('docs-copy-btn--ok');
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.classList.remove('docs-copy-btn--ok');
          }, 1500);
        } catch {}
      });
    });
    contentEl.querySelectorAll('.docs-link[data-href]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const href = a.dataset.href;
        if (href.startsWith('http'))
          window.__TAURI__.core.invoke('open_external', { url: href }).catch(() => {});
      });
    });
  }

  function _render() {
    const root = _root();
    if (!root) return;
    if (_loading) {
      root.innerHTML = '';
      const wrap = DomHelpers.el('div', 'docs-state-screen');
      wrap.append(
        DomHelpers.el('div', 'docs-spinner'),
        DomHelpers.el('span', 'docs-state-text', 'Loading documentation...'),
      );
      root.appendChild(wrap);
      return;
    }
    if (_error) {
      root.innerHTML = '';
      const wrap = DomHelpers.el('div', 'docs-state-screen');
      const btn = document.createElement('button');
      btn.className = 'docs-retry-btn';
      btn.innerHTML = SVG.refresh + '<span>Retry</span>';
      btn.addEventListener('click', () => _loadAll());
      wrap.append(
        DomHelpers.el('p', 'docs-state-text docs-state-error', 'Failed to load docs.'),
        DomHelpers.el('p', 'docs-state-detail', _error),
        btn,
      );
      root.appendChild(wrap);
      return;
    }
    if (_view === 'home') _renderHome();
    else _renderReader();
  }

  function show() {
    if (!_mounted) {
      _mounted = true;
      _loadAll();
      return;
    }
    _render();
  }

  return { show };
})();
