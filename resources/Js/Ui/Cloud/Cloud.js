const cloud = (() => {
  const SEARCH_DEBOUNCE_MS = 500;
  const SKELETON_COUNT = 9;
  let _mode = 'recent';
  let _query = '';
  let _filters = {};
  let _page = 1;
  let _total = 1;
  let _loading = false;
  let _searchDebounce = null;
  let _loadId = 0;
  const SVG = {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    recent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    execute: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5l9 5.5-9 5.5V2.5z"/></svg>`,
    verified: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    universal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
    patched: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  };
  async function _load() {
    const loadId = ++_loadId;
    _loading = true;
    _renderLoading();
    const sourceKeys = Object.keys(CloudSources.SOURCES);
    const perSource = sourceKeys.map(() => []);
    let settled = 0;
    let anySuccess = false;
    function _merge() {
      const maxLen = Math.max(...perSource.map((a) => a.length), 0);
      const merged = [];
      for (let i = 0; i < maxLen; i++)
        perSource.forEach((arr) => {
          if (arr[i]) merged.push(arr[i]);
        });
      return merged;
    }
    const promises = sourceKeys.map((sourceKey, index) => {
      const src = CloudSources.SOURCES[sourceKey];
      const fetch =
        _mode === 'trending'
          ? src.fetchTrending(_page, _filters)
          : _mode === 'search' && _query.trim()
            ? src.fetchSearch(_query, _page, _filters)
            : src.fetchRecent(_page, _filters);
      return fetch
        .then((result) => {
          if (loadId !== _loadId) return;
          perSource[index] = CloudSources.sanitize(result.scripts);
          _total = Math.max(_total, result.totalPages ?? 1);
          anySuccess = true;
          settled++;
          _renderScripts(_merge());
        })
        .catch((err) => {
          if (loadId !== _loadId) return;
          console_.log(`[cloud] ${sourceKey} failed: ${err?.message}`, 'fail');
          settled++;
          if (settled === sourceKeys.length && !anySuccess) _renderError(err.message);
        });
    });
    await Promise.allSettled(promises);
    if (loadId === _loadId) _loading = false;
  }
  async function _getContent(script) {
    if (script.content) return script.content;
    return CloudSources.SOURCES[script._src].fetchRaw(script._slug, script._rawUrl);
  }
  function _renderLoading() {
    const list = document.getElementById('cloudList');
    if (!list) return;
    let html = '';
    for (let i = 0; i < SKELETON_COUNT; i++) {
      html += `<div class="cloud-skeleton"><div class="sk-banner"></div><div class="sk-body"><div class="sk-line sk-title"></div><div class="sk-line sk-game"></div><div class="sk-line sk-tags"></div><div class="sk-footer"><div class="sk-line sk-meta"></div><div class="sk-btns"><div class="sk-btn"></div><div class="sk-btn"></div></div></div></div></div>`;
    }
    list.innerHTML = html;
  }
  function _renderError(msg) {
    const list = document.getElementById('cloudList');
    if (!list) return;
    list.innerHTML = `<div class="cloud-error"><span>Failed to load scripts</span><small>${helpers.escapeHtml(msg)}</small><button class="cloud-retry-btn" id="cloudRetryBtn">Retry</button></div>`;
    document.getElementById('cloudRetryBtn')?.addEventListener('click', _load);
  }
  function _cardHtml(script, index) {
    const badges = [];
    if (script.verified)
      badges.push(`<span class="cloud-badge verified">${SVG.verified} Verified</span>`);
    if (script.isUniversal)
      badges.push(`<span class="cloud-badge universal">${SVG.universal} Universal</span>`);
    if (script.hasKey) badges.push(`<span class="cloud-badge key">${SVG.key} Key</span>`);
    if (script.isPatched)
      badges.push(`<span class="cloud-badge patched">${SVG.patched} Patched</span>`);
    if (script.scriptType)
      badges.push(`<span class="cloud-badge type">${helpers.escapeHtml(script.scriptType)}</span>`);
    const viewCount = FormatHelpers.fmtViews(script.views);
    const dateLabel = script.createdAt
      ? new Date(script.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
    const gameHtml = script.gameName
      ? `<div class="cloud-card-game">${helpers.escapeHtml(script.gameName)}</div>`
      : '';
    return `<div class="cloud-card${script.isPatched ? ' patched' : ''}" data-idx="${index}">
      <div class="cloud-card-banner${script.gameImg ? '' : ' no-img'}">
        ${script.gameImg ? `<img src="${helpers.escapeHtml(script.gameImg)}" referrerpolicy="no-referrer" alt="" loading="lazy">` : ''}
        <span class="cloud-card-provider">${helpers.escapeHtml(CloudSources.SOURCES[script._src]?.tag ?? script._src)}</span>
      </div>
      <div class="cloud-card-body">
        <div class="cloud-card-title">${helpers.escapeHtml(script.title)}</div>
        ${gameHtml}
        <div class="cloud-card-badges">${badges.join('') || '<span class="cloud-badge type">Script</span>'}</div>
        <div class="cloud-card-footer">
          <span class="cloud-card-meta">${viewCount} views${dateLabel ? ` · ${dateLabel}` : ''}</span>
          <div class="cloud-card-actions">
            <button class="cloud-action-btn" data-action="copy" title="Open in editor">${SVG.copy}</button>
            <button class="cloud-action-btn execute" data-action="execute" title="Execute">${SVG.execute}</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function _renderScripts(scripts) {
    const list = document.getElementById('cloudList');
    if (!list) return;
    if (!scripts.length) {
      list.innerHTML = '<div class="cloud-empty"><span>No scripts found</span></div>';
      _renderPagination();
      return;
    }
    list.innerHTML = '';
    const CHUNK = 10;
    let idx = 0;
    function _insertChunk() {
      const frag = document.createDocumentFragment();
      const end = Math.min(idx + CHUNK, scripts.length);
      for (let i = idx; i < end; i++) {
        const script = scripts[i];
        const div = document.createElement('div');
        div.innerHTML = _cardHtml(script, i);
        const card = div.firstElementChild;
        if (!card) continue;
        const img = card.querySelector('img');
        if (img) {
          img.addEventListener('error', () => {
            img.remove();
            img.closest('.cloud-card-banner')?.classList.add('no-img');
          });
        }
        card.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          btn.classList.add('loading');
          try {
            await _openInEditor(script.title, await _getContent(script));
          } catch {
            toast.show('Failed to load script', 'fail');
          } finally {
            btn.classList.remove('loading');
          }
        });
        card.querySelector('[data-action="execute"]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          btn.classList.add('loading');
          try {
            const content = await _getContent(script);
            eventBus.emit('script:executing', {
              filename: script.title,
              source: 'cloud',
            });
            const result = await injector.execute(content);
            const port = await injector.getPort();
            toast.show(port ? `Executed on :${port}` : 'Executed', 'ok');
            if (result) console_.log(result, 'ok');
          } catch (err) {
            toast.show(err.message ?? 'Execution failed', 'fail', 3000);
          } finally {
            btn.classList.remove('loading');
          }
        });
        frag.appendChild(card);
      }
      list.appendChild(frag);
      idx = end;
      if (idx < scripts.length) {
        requestAnimationFrame(_insertChunk);
      } else {
        _renderPagination();
      }
    }
    requestAnimationFrame(_insertChunk);
  }
  async function _openInEditor(title, scriptContent) {
    if (!state.workDir) {
      toast.show('Open a folder first to save cloud scripts', 'warn');
      return;
    }
    const safeName =
      title
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .toLowerCase()
        .slice(0, 40) + '.lua';
    const result = await fileManager.createFile(state.workDir, safeName);
    const file = state.getFile(result.id);
    if (file) {
      file.content = scriptContent;
      state.updateContent(result.id, scriptContent);
      await fileManager.save(result.id).catch(() => {});
    }
    state.setActive(result.id);
    eventBus.emit('ui:refresh-tree');
    document.querySelector('.activity-btn[data-view="explorer"]')?.click();
    toast.show(`Opened ${safeName}`, 'ok', 2000);
  }
  function _renderPagination() {
    const pag = document.getElementById('cloudPagination');
    if (!pag) return;
    if (_mode === 'trending' || _total <= 1) {
      pag.innerHTML = '';
      return;
    }
    pag.innerHTML = `
      <button class="cloud-page-btn" id="cloudPrev" ${_page <= 1 ? 'disabled' : ''}>←</button>
      <span class="cloud-page-info">${_page} / ${_total}</span>
      <button class="cloud-page-btn" id="cloudNext" ${_page >= _total ? 'disabled' : ''}>→</button>`;
    pag.querySelector('#cloudPrev')?.addEventListener('click', () => {
      _page--;
      _load();
      document.getElementById('cloudGridWrap').scrollTop = 0;
    });
    pag.querySelector('#cloudNext')?.addEventListener('click', () => {
      _page++;
      _load();
      document.getElementById('cloudGridWrap').scrollTop = 0;
    });
  }
  function _setMode(mode) {
    _mode = mode;
    _page = 1;
    _total = 1;
    document
      .querySelectorAll('.cloud-filter-btn')
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    _load();
  }
  function _toggleFilterPanel(view) {
    view.querySelector('#cloudFilterPanel').classList.toggle('open');
  }
  function _buildFilterPanel(view) {
    const panel = view.querySelector('#cloudFilterPanel');
    const FILTER_DEFS = [
      {
        key: 'verified',
        label: 'Verified',
      },
      {
        key: 'universal',
        label: 'Universal',
      },
      {
        key: 'noKey',
        label: 'No Key',
      },
      {
        key: 'notPatched',
        label: 'Not Patched',
      },
    ];
    panel.innerHTML = FILTER_DEFS.map(
      (f) => `
      <label class="cloud-filter-tag ${_filters[f.key] ? 'active' : ''}" data-key="${f.key}">
        ${f.label}
      </label>`,
    ).join('');
    panel.querySelectorAll('.cloud-filter-tag').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        _filters[key] = !_filters[key];
        el.classList.toggle('active', !!_filters[key]);
        _page = 1;
        _total = 1;
        _load();
      });
    });
  }
  function init() {
    const view = document.getElementById('cloudView');
    if (!view) return;
    view.innerHTML = `
      <div class="cloud-topbar">
        <div class="cloud-topbar-left">
          <span class="cloud-topbar-title">Cloud Scripts</span>
        </div>
        <div class="cloud-topbar-right">
          <div class="cloud-search-wrap">
            <span class="cloud-search-icon">${SVG.search}</span>
            <input class="cloud-search-input" id="cloudSearchInput" placeholder="Search scripts\u2026" autocomplete="off" spellcheck="false">
          </div>
          <button class="cloud-filter-toggle" id="cloudFilterToggle" title="Filters">${SVG.filter}</button>
          <div class="cloud-filters">
            <button class="cloud-filter-btn" data-mode="trending">${SVG.trending}<span>Trending</span></button>
            <button class="cloud-filter-btn active" data-mode="recent">${SVG.recent}<span>Recent</span></button>
          </div>
        </div>
      </div>
      <div class="cloud-filter-panel" id="cloudFilterPanel"></div>
      <div class="cloud-grid-wrap" id="cloudGridWrap">
        <div class="cloud-list" id="cloudList"></div>
        <div class="cloud-attribution">${Object.values(CloudSources.SOURCES)
          .map((s) => helpers.escapeHtml(s.label))
          .join(' \u00b7 ')}</div>
      </div>
      <div class="cloud-pagination" id="cloudPagination"></div>`;
    _buildFilterPanel(view);
    view
      .querySelector('#cloudFilterToggle')
      .addEventListener('click', () => _toggleFilterPanel(view));
    view.querySelector('#cloudSearchInput').addEventListener('input', (e) => {
      _query = e.target.value;
      clearTimeout(_searchDebounce);
      if (_query.trim()) {
        _mode = 'search';
        view.querySelectorAll('.cloud-filter-btn').forEach((btn) => btn.classList.remove('active'));
        _searchDebounce = setTimeout(() => {
          _page = 1;
          _total = 1;
          _load();
        }, SEARCH_DEBOUNCE_MS);
      } else {
        _setMode('recent');
      }
    });
    view.querySelectorAll('.cloud-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.querySelector('#cloudSearchInput').value = '';
        _query = '';
        _setMode(btn.dataset.mode);
      });
    });
    _setMode('recent');
  }
  return {
    init,
  };
})();
