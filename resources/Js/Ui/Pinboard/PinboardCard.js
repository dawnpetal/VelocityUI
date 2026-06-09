const PinboardCard = (() => {
  const COPY_FLASH = 700;
  const PREVIEW_LINES = 6;

  const SVG = {
    run: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    delete:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    duplicate:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  };

  function buildCard(snippet, context) {
    const { onRun, onFilterByTag, onOpenInEditor } = context;
    const lines = (snippet.code ?? '').split('\n');
    const previewLines = lines.slice(0, PREVIEW_LINES);
    const overflow = lines.length - PREVIEW_LINES;

    const card = document.createElement('div');
    card.className = 'pb-card';
    card.dataset.id = snippet.id;
    card.addEventListener('contextmenu', (e) => showCardMenu(e, snippet, context));

    const header = DomHelpers.el('div', 'pb-card-header');
    const labelWrap = DomHelpers.el('div', 'pb-label-wrap');
    const labelEl = DomHelpers.el('span', 'pb-card-label', snippet.label);
    labelEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineRename(labelEl, snippet, context);
    });

    const tagsEl = DomHelpers.el('div', 'pb-tags');
    (snippet.tags ?? []).forEach((tag) => {
      const t = DomHelpers.el('span', 'pb-tag', tag);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        onFilterByTag(tag);
      });
      tagsEl.appendChild(t);
    });
    labelWrap.append(labelEl, tagsEl);

    if (context.activeEditorIds.has(snippet.id)) {
      const badge = DomHelpers.el('span', 'pb-editing-badge', 'editing');
      labelWrap.appendChild(badge);
    }

    header.appendChild(labelWrap);

    const preview = document.createElement('pre');
    preview.className = 'pb-code-preview';
    preview.textContent = previewLines.join('\n');
    preview.addEventListener('click', () => onOpenInEditor(snippet));
    preview.title = 'Click to edit';

    if (overflow > 0) {
      const moreLines = DomHelpers.el(
        'div',
        'pb-preview-more',
        `+${overflow} line${overflow === 1 ? '' : 's'}`,
      );
      preview.appendChild(moreLines);
    }

    const actions = DomHelpers.el('div', 'pb-card-actions');
    const runBtn = document.createElement('button');
    runBtn.className = 'pb-btn-run';
    runBtn.title = 'Run · Shift+click for output';
    runBtn.innerHTML = SVG.run + '<span>Run</span>';
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRun(snippet, e.shiftKey);
    });

    const actionsBtns = DomHelpers.el('div', 'pb-card-actions-btns');
    const editBtn = _iconBtn(SVG.edit, 'Open in editor', () => onOpenInEditor(snippet));
    const copyBtn = _iconBtn(SVG.copy, 'Copy code', async () => {
      try {
        await window.__TAURI__.core.invoke('write_clipboard', { text: snippet.code });
        copyBtn.innerHTML = SVG.check;
        copyBtn.classList.add('pb-btn--ok');
        setTimeout(() => {
          copyBtn.innerHTML = SVG.copy;
          copyBtn.classList.remove('pb-btn--ok');
        }, COPY_FLASH);
        toast.show('Copied', 'ok', 900);
      } catch {}
    });
    const moreBtn = _iconBtn(SVG.dots, 'More options', (e) => showCardMenu(e, snippet, context));

    actionsBtns.append(editBtn, copyBtn, moreBtn);
    actions.append(runBtn, actionsBtns);

    card.append(header, preview, actions);
    return card;
  }

  function _iconBtn(icon, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'pb-btn';
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return btn;
  }

  function buildEmpty(onAddNew) {
    const el = document.createElement('div');
    el.className = 'pb-empty';
    el.innerHTML = [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>',
      '<polyline points="14 2 14 8 20 8"/>',
      '<line x1="12" y1="18" x2="12" y2="12"/>',
      '<line x1="9" y1="15" x2="15" y2="15"/>',
      '</svg>',
      '<span>No snippets pinned</span>',
      '<small>Pin the active file or create a new snippet.</small>',
      '<button class="pb-empty-btn">New Snippet</button>',
    ].join('');
    el.querySelector('.pb-empty-btn').addEventListener('click', onAddNew);
    return el;
  }

  function updatePreview(snippetId, newCode) {
    const card = document.querySelector(`.pb-card[data-id="${snippetId}"]`);
    if (!card) return;
    const pre = card.querySelector('.pb-code-preview');
    if (pre) {
      const lines = (newCode ?? '').split('\n');
      pre.textContent = lines.slice(0, PREVIEW_LINES).join('\n');
      const overflow = lines.length - PREVIEW_LINES;
      if (overflow > 0) {
        const moreLines = DomHelpers.el(
          'div',
          'pb-preview-more',
          `+${overflow} line${overflow === 1 ? '' : 's'}`,
        );
        pre.appendChild(moreLines);
      }
    }
    card.querySelector('.pb-editing-badge')?.remove();
  }

  function showCardMenu(e, snippet, context) {
    const { snippets, findIdx, onSave, onRender, activeEditorIds } = context;
    const rename = () => {
      const labelEl = document.querySelector(`.pb-card[data-id="${snippet.id}"] .pb-card-label`);
      if (labelEl) startInlineRename(labelEl, snippet, context);
    };
    const duplicate = () => {
      const dup = {
        ...snippet,
        id: helpers.uid(),
        label: snippet.label + ' copy',
        createdAt: Date.now(),
      };
      snippets.splice(findIdx(snippet.id) + 1, 0, dup);
      onSave().catch(() => {});
      onRender();
    };
    const copyCode = async () => {
      try {
        await window.__TAURI__.core.invoke('write_clipboard', { text: snippet.code });
        toast.show('Copied', 'ok', 1200);
      } catch {}
    };
    const remove = () => {
      const idx = findIdx(snippet.id);
      if (idx !== -1) {
        activeEditorIds.delete(snippet.id);
        snippets.splice(idx, 1);
        onSave().catch(() => {});
        onRender();
      }
    };
    const nativeItems = [
      { label: 'Rename', action: rename },
      { label: 'Edit Tags', action: () => editTags(snippet, context) },
      { label: 'Duplicate', action: duplicate },
      { separator: true },
      { label: 'Copy Code', action: copyCode },
      { separator: true },
      { label: 'Delete', action: remove },
    ];
    if (typeof ctxMenu !== 'undefined' && ctxMenu.showItems) {
      ctxMenu.showItems(e, nativeItems);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById('ctxMenu');
    if (!menu) return;
    menu.innerHTML = '';
    const addItem = (label, icon, cb, isDanger) => {
      const btn = document.createElement('button');
      btn.className = 'ctx-item' + (isDanger ? ' danger' : '');
      btn.innerHTML = icon + '<span>' + label + '</span>';
      btn.addEventListener('click', () => {
        menu.classList.remove('open');
        cb();
      });
      menu.appendChild(btn);
    };
    addItem('Rename', SVG.edit, rename);
    addItem('Edit Tags', SVG.tag, () => editTags(snippet, context));
    addItem('Duplicate', SVG.duplicate, duplicate);
    menu.appendChild(DomHelpers.sep());
    addItem('Copy Code', SVG.copy, copyCode);
    menu.appendChild(DomHelpers.sep());
    addItem('Delete', SVG.delete, remove, true);
    menu.classList.add('open');
    menu.style.left = '0';
    menu.style.top = '0';
    requestAnimationFrame(() => {
      const { width, height } = menu.getBoundingClientRect();
      menu.style.left = Math.min(e.clientX, window.innerWidth - width - 4) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - height - 4) + 'px';
    });
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('open');
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  function startInlineRename(labelEl, snippet, context) {
    const { snippets, findIdx, onSave, onRender } = context;
    const input = document.createElement('input');
    input.className = 'pb-rename-input';
    input.value = snippet.label;
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) {
        const idx = findIdx(snippet.id);
        if (idx !== -1) snippets[idx].label = v;
        onSave().catch(() => {});
      }
      onRender();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', commit);
        onRender();
      }
    });
  }

  function editTags(snippet, context) {
    const { snippets, findIdx, onSave, onRender } = context;
    const box = document.getElementById('modal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const actionsEl = document.getElementById('modalActions');
    titleEl.textContent = 'Edit Tags';
    bodyEl.innerHTML =
      '<p style="font-size:12px;color:var(--text2);margin:0 0 8px">Comma-separated tags</p><input id="pbTagInput" class="pb-tag-input" value="' +
      helpers.escapeHtml((snippet.tags ?? []).join(', ')) +
      '" placeholder="debug, movement">';
    actionsEl.innerHTML = '';
    box.classList.add('open');
    const input = document.getElementById('pbTagInput');
    input.focus();
    input.select();
    const save = () => {
      const idx = findIdx(snippet.id);
      if (idx !== -1)
        snippets[idx].tags = input.value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      onSave().catch(() => {});
      box.classList.remove('open');
      onRender();
    };
    const cancel = () => box.classList.remove('open');
    actionsEl.append(
      DomHelpers.btn('Cancel', 'modal-btn secondary', cancel),
      DomHelpers.btn('Save', 'modal-btn primary', save),
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });
  }

  return { buildCard, buildEmpty, showCardMenu, startInlineRename, editTags, updatePreview };
})();
