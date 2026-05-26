const editor = (() => {
  let _monaco = null;
  let _editorInstance = null;
  let _symbolProviders = null;
  let _settings = {
    fontSize: 12,
    wordWrap: true,
    minimap: false,
    lineNumbers: true,
  };
  let _ready = false;
  let _pendingFile = null;
  let _diffEditor = null;
  let _diffTabId = null;
  let _runtimeDecorations = [];
  let _inlineHintDecorations = [];
  let _inlineHintTimer = null;
  let _suspendContentChange = false;
  function _setPane(which) {
    const ids = {
      placeholder: 'editorPlaceholder',
      monaco: 'monacoEditor',
      preview: 'previewPane',
      diff: 'diffEditor',
    };
    Object.entries(ids).forEach(([name, id]) => {
      const el = document.getElementById(id);
      if (el)
        el.style.display =
          name === which
            ? name === 'preview' || name === 'placeholder'
              ? 'flex'
              : 'block'
            : 'none';
    });
    const crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.style.display = which === 'monaco' ? '' : 'none';
  }
  const LARGE_FILE_LIMIT = 20 * 1024 * 1024;
  const LARGE_LINE_LIMIT = 300 * 1000;
  function _countLines(text) {
    if (!text) return 1;
    let lines = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines += 1;
    return lines;
  }
  function _fileProfile(file) {
    const text = file?.content ?? '';
    const size = file?.size ?? new Blob([text]).size;
    const lines = file?._lineCount ?? _countLines(text);
    if (file) file._lineCount = lines;
    return {
      size,
      lines,
      large: file?.largePreview || size > LARGE_FILE_LIMIT || lines > LARGE_LINE_LIMIT,
      readonly: !!file?.largePreview || !!file?.readonly,
    };
  }
  function _applyFileProfile(file) {
    if (!_editorInstance || !file) return;
    const profile = _fileProfile(file);
    const opts = profile.large
      ? {
          readOnly: profile.readonly,
          minimap: { enabled: false },
          folding: false,
          wordBasedSuggestions: 'off',
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          codeLens: false,
          colorDecorators: false,
          links: false,
          bracketPairColorization: { enabled: false },
          guides: { indentation: true, bracketPairs: false, bracketPairsHorizontal: false },
          stickyScroll: { enabled: false },
          quickSuggestions: false,
          hover: { enabled: false },
        }
      : {
          readOnly: !!file?.readonly,
          minimap: { enabled: _settings.minimap },
          folding: true,
          wordBasedSuggestions: 'matchingDocuments',
          occurrencesHighlight: 'singleFile',
          selectionHighlight: true,
          codeLens: false,
          colorDecorators: true,
          links: true,
          bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
          guides: {
            indentation: true,
            highlightActiveIndentation: true,
            bracketPairs: false,
            bracketPairsHorizontal: false,
          },
          quickSuggestions: { other: true, comments: false, strings: false },
          hover: { enabled: true, delay: 300, sticky: true, above: false },
        };
    _editorInstance.updateOptions(opts);
    const fileSize = document.getElementById('statusFileSize');
    if (fileSize) {
      fileSize.textContent = file.largePreview
        ? `${FormatHelpers.fmtBytes(profile.size)} preview`
        : FormatHelpers.fmtBytes(profile.size);
      fileSize.title = file.largePreview
        ? 'Huge file preview. Only the first 5 MB are loaded to keep the UI responsive.'
        : `${profile.lines.toLocaleString()} lines`;
    }
    const fileEl = document.getElementById('statusFile');
    if (fileEl) fileEl.classList.toggle('status-file-large', profile.large);
  }
  function _syncStatusDetails(file, position = null) {
    const pos = position ?? _editorInstance?.getPosition() ?? { lineNumber: 1, column: 1 };
    const cursor = document.getElementById('statusCursor');
    if (cursor) cursor.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    const lang = document.getElementById('statusLang');
    if (lang)
      lang.textContent =
        file?.languageOverrideLabel ??
        (file ? helpers.ext(file.name).toUpperCase() || 'Plain' : 'Plain');
    const encoding = document.getElementById('statusEncoding');
    if (encoding) encoding.textContent = file?.encoding ?? 'UTF-8';
    const eol = document.getElementById('statusEol');
    if (eol) eol.textContent = file?.eol ?? 'LF';
    const indent = document.getElementById('statusIndent');
    if (indent)
      indent.textContent =
        file?.insertSpaces === false
          ? `Tab Size ${file?.indentSize ?? 2}`
          : `Spaces: ${file?.indentSize ?? 2}`;
  }
  function _linkAtPosition(model, position) {
    if (!model || !position) return '';
    const line = model.getLineContent(position.lineNumber);
    const re = /\b(?:https?:\/\/|file:\/\/|mailto:)[^\s"'`<>)}\]]+/gi;
    let match;
    while ((match = re.exec(line))) {
      const start = match.index + 1;
      const end = start + match[0].length;
      if (position.column >= start && position.column <= end) {
        return match[0].replace(/[.,;:!?]+$/, '');
      }
    }
    return '';
  }
  function _wireMonacoLinkOpen() {
    _editorInstance.onMouseDown((event) => {
      const browserEvent = event.event?.browserEvent;
      if (!browserEvent || browserEvent.button !== 0) return;
      if (!browserEvent.metaKey && !browserEvent.ctrlKey) return;
      const target = event.target?.position;
      const model = _editorInstance.getModel();
      const href = _linkAtPosition(model, target);
      if (!href) return;
      browserEvent.preventDefault();
      browserEvent.stopPropagation();
      event.event.preventDefault?.();
      event.event.stopPropagation?.();
      window.__TAURI__.core.invoke('open_external', { url: href }).catch((err) => {
        toast.show(err?.message || 'Could not open link', 'fail', 2400);
      });
    });
  }

  async function _ensureReady() {
    if (_ready) return;
    const container = document.getElementById('monacoEditor');
    const result = await EditorMount.create(container, _settings);
    _monaco = result.monaco;
    _editorInstance = result.editorInstance;
    _symbolProviders = result.symbolProviders;
    Breadcrumb.init(_editorInstance, _symbolProviders);
    EditorCommands.register(_monaco, _editorInstance);
    _wireMonacoLinkOpen();
    _editorInstance.onContextMenu(async (e) => {
      e.event.preventDefault();
      e.event.stopPropagation();
      const selection = _editorInstance.getSelection();
      const hasSelection = selection && !selection.isEmpty();

      const { Menu, MenuItem, PredefinedMenuItem, Image } = window.__TAURI__.menu;
      const sep = () => PredefinedMenuItem.new({ item: 'Separator' });

      async function iconItem(text, svgStr, action, accelerator) {
        let icon;
        try {
          const size = 28;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
          await new Promise((res, rej) => {
            const img = new window.Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, size, size);
              res();
            };
            img.onerror = rej;
            img.src = dataUrl;
          });
          const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) =>
            c.charCodeAt(0),
          );
          icon = await Image.fromBytes(bytes);
        } catch {}
        return MenuItem.new({
          text,
          action,
          ...(accelerator ? { accelerator } : {}),
          ...(icon ? { icon } : {}),
        });
      }

      const SVG = {
        format: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="28" height="28"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
        comment: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="28" height="28"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        goTo: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="28" height="28"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        ai: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="28" height="28"><path d="M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
      };

      const items = [];
      if (hasSelection) {
        items.push(await PredefinedMenuItem.new({ item: 'Cut' }));
        items.push(await PredefinedMenuItem.new({ item: 'Copy' }));
        items.push(await PredefinedMenuItem.new({ item: 'Paste' }));
        items.push(await sep());
      } else {
        items.push(await PredefinedMenuItem.new({ item: 'Paste' }));
        items.push(await sep());
      }
      items.push(await PredefinedMenuItem.new({ item: 'SelectAll' }));
      items.push(await sep());
      if (hasSelection) {
        items.push(
          await iconItem('Format Selection', SVG.format, () =>
            _editorInstance.trigger('keyboard', 'editor.action.formatSelection'),
          ),
        );
      } else {
        items.push(
          await iconItem('Format Document', SVG.format, () =>
            _editorInstance.trigger('keyboard', 'editor.action.formatDocument'),
          ),
        );
      }
      items.push(
        await iconItem(
          'Toggle Comment',
          SVG.comment,
          () => _editorInstance.trigger('keyboard', 'editor.action.commentLine'),
          'CmdOrCtrl+/',
        ),
      );
      items.push(await sep());
      items.push(
        await iconItem('Codex Generate at Cursor', SVG.ai, () => AiHelper.generateAtCursor?.()),
      );
      if (hasSelection) {
        items.push(
          await iconItem('Codex Improve Selection', SVG.ai, () =>
            AiHelper.replaceSelection?.('improve_selection'),
          ),
        );
        items.push(
          await iconItem('Codex Fix Selection', SVG.ai, () =>
            AiHelper.replaceSelection?.('fix_selection'),
          ),
        );
      }
      items.push(await sep());
      items.push(
        await iconItem(
          'Go to Definition',
          SVG.goTo,
          () => _editorInstance.trigger('keyboard', 'editor.action.revealDefinition'),
          'F12',
        ),
      );

      const menu = await Menu.new({ items });
      await menu.popup();
    });

    _editorInstance.onDidChangeCursorPosition((e) => {
      _syncStatusDetails(state.getActive(), e.position);
      Breadcrumb.update(e.position);
    });
    _editorInstance.onDidChangeModelContent(() => {
      if (_suspendContentChange) return;
      const id = state.activeFileId;
      if (!id) return;
      const file = state.getFile(id);
      if (file?.largePreview) return;
      if (file?.readonly) return;
      if (typeof AiHelper !== 'undefined' && AiHelper.isFileLocked?.(file)) return;
      state.updateContent(id, _editorInstance.getValue());
      _applyFileProfile(state.getFile(id));
      _syncStatusDetails(state.getFile(id));
      tabs.render();
      Breadcrumb.update(
        _editorInstance.getPosition() ?? {
          lineNumber: 1,
          column: 1,
        },
      );
    });
    _ready = true;
    if (_pendingFile) {
      const f = _pendingFile;
      _pendingFile = null;
      await _showTextFile(f);
    }
  }
  async function _showTextFile(file) {
    if (file.content === null) await fileManager.ensureContent(file.id);
    _setPane('monaco');
    document.getElementById('_velocityuiDeletedOverlay')?.remove();
    if (file.deleted) {
      const overlay = document.createElement('div');
      overlay.id = '_velocityuiDeletedOverlay';
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:var(--bg2);pointer-events:none';
      overlay.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        <span style="color:var(--text2);font-size:13px">This file no longer exists on disk</span>
        <span style="color:var(--text3);font-size:11px">The file was moved or deleted externally</span>`;
      const monacoEl = document.getElementById('monacoEditor');
      monacoEl.style.position = 'relative';
      monacoEl.appendChild(overlay);
      _editorInstance?.updateOptions({
        readOnly: true,
      });
      return;
    }
    const aiLocked = typeof AiHelper !== 'undefined' && AiHelper.isFileLocked?.(file);
    _editorInstance?.updateOptions({
      readOnly: !!file.largePreview || !!file.readonly || !!aiLocked,
    });
    EditorModels.saveViewState(
      EditorModels.fileIdForModel(_editorInstance?.getModel?.()),
      _editorInstance,
    );
    const model = EditorModels.getOrCreate(_monaco, file);
    if (model.getValue() !== file.content) {
      _suspendContentChange = true;
      try {
        model.setValue(file.content);
      } finally {
        _suspendContentChange = false;
      }
    }
    _monaco.editor.setModelLanguage(model, LangMap.monacoLang(file.name, file.languageOverride));
    model.updateOptions({
      tabSize: file.indentSize ?? 2,
      insertSpaces: file.insertSpaces !== false,
    });
    _editorInstance.setModel(model);
    EditorModels.restoreViewState(file.id, _editorInstance);
    _editorInstance.focus();
    timeline.refreshSize();
    _applyFileProfile(file);
    _syncStatusDetails(file);
    StatusBarControls.refresh?.();
    EditorModels.trimCold({
      activeId: file.id,
      isDirty: (id) => state.isUnsaved(id),
      canRelease: (id) => {
        const item = state.getFile(id);
        return !!item?.path && !item.preview && !item.path.startsWith('pinboard:');
      },
      releasePayload: (id) => state.releasePayload(id),
    });
    if (file.largePreview) toast.show('Huge file opened as a read-only preview', 'info', 3000);
    Breadcrumb.closePicker();
    Breadcrumb.update(
      _editorInstance.getPosition() ?? {
        lineNumber: 1,
        column: 1,
      },
    );
  }
  function _showPreviewFile(file) {
    _setPane('preview');
    const pane = document.getElementById('previewPane');
    if (!pane) return;
    pane.innerHTML = '';
    const langEl = document.getElementById('statusLang');
    if (langEl) langEl.textContent = LangMap.extOf(file.name).toUpperCase() + ' Preview';
    _syncStatusDetails(file);
    switch (file.previewType) {
      case 'image':
        Preview.renderImage(pane, file);
        break;
      case 'svg':
        Preview.renderSvg(pane, file);
        break;
      case 'markdown':
        Preview.renderMarkdown(pane, file);
        break;
      case 'html':
        Preview.renderHtml(pane, file);
        break;
      case 'video':
        Preview.renderVideo(pane, file);
        break;
      default:
        pane.textContent = 'No preview available.';
    }
  }
  async function openPreview(sourceFile) {
    const pt = LangMap.previewType(sourceFile.name);
    if (!pt) {
      toast.show('No preview available for this file type', 'warn');
      return;
    }
    const existingId = state.findPreviewByPath(sourceFile.path)?.id;
    if (existingId) {
      state.setActive(existingId);
      tabs.render();
      eventBus.emit('ui:render-editor');
      return;
    }
    const id = helpers.uid();
    const isBinary = pt === 'image' || pt === 'video';
    if (!isBinary && sourceFile.content === null) await fileManager.ensureContent(sourceFile.id);
    state.addFile(
      id,
      sourceFile.name + ' (Preview)',
      sourceFile.path,
      isBinary ? '' : (sourceFile.content ?? ''),
      {
        preview: true,
        previewType: pt,
      },
    );
    state.setActive(id);
    tabs.render();
    eventBus.emit('ui:render-editor');
  }
  function render() {
    const active = state.getActive();
    if (!active) {
      _setPane('placeholder');
      return;
    }
    if (active.preview) {
      if (active.previewType === 'diff') {
        _setPane('diff');
        return;
      }
      _showPreviewFile(active);
      return;
    }
    const pt = LangMap.previewType(active.name);
    if (pt === 'image') {
      active.previewType = 'image';
      _showPreviewFile(active);
      return;
    }
    if (pt === 'svg') {
      if (active.content === null) {
        window.__TAURI__.core
          .invoke('read_text_file', {
            path: active.path,
          })
          .then((content) => {
            active.content = content;
            active.previewType = 'svg';
            _showPreviewFile(active);
          })
          .catch((err) => toast.show('Could not read SVG: ' + (err.message ?? err), 'fail'));
      } else {
        active.previewType = 'svg';
        _showPreviewFile(active);
      }
      return;
    }
    if (pt === 'video') {
      active.previewType = 'video';
      _showPreviewFile(active);
      return;
    }
    if (!_ready) {
      _pendingFile = active;
      _ensureReady();
      return;
    }
    _showTextFile(active);
  }
  function applyTheme() {
    if (!_ready || !_monaco) return;
    EditorTheme.apply(_monaco);
    if (_diffEditor) _monaco.editor.setTheme('velocityui');
  }
  function updateSettings(key, value) {
    _settings[key] = value;
    if (!_ready || !_editorInstance) return;
    const opts = {};
    if (key === 'fontSize') opts.fontSize = value;
    if (key === 'wordWrap') opts.wordWrap = value ? 'on' : 'off';
    if (key === 'minimap')
      opts.minimap = {
        enabled: value,
      };
    if (key === 'lineNumbers') opts.lineNumbers = value ? 'on' : 'off';
    _editorInstance.updateOptions(opts);
    _applyFileProfile(state.getActive());
  }
  function destroyTab(id) {
    EditorModels.destroyTab(id);
  }
  function destroyAllTabs() {
    EditorModels.destroyAll?.();
    const model = _diffEditor?.getModel?.();
    model?.original?.dispose?.();
    model?.modified?.dispose?.();
    _diffEditor?.setModel?.(null);
    _diffTabId = null;
  }
  function focus() {
    _editorInstance?.focus();
  }
  function jumpToLine(fileId, lineNum) {
    state.setActive(fileId);
    tabs.render();
    eventBus.emit('ui:render-editor');
    ExplorerTree.render();
    requestAnimationFrame(() => {
      if (!_editorInstance) return;
      _editorInstance.revealLineInCenter(lineNum);
      _editorInstance.setPosition({
        lineNumber: lineNum,
        column: 1,
      });
      _editorInstance.focus();
    });
  }
  function getContent() {
    return _editorInstance?.getValue() ?? '';
  }
  function canPreview(filename) {
    return LangMap.canPreview(filename);
  }
  async function showDiff(filename, oldContent, newContent) {
    if (!_ready) await _ensureReady();
    const lang = LangMap.monacoLang(filename);
    if (_diffTabId) {
      state.closeTab(_diffTabId);
      _diffTabId = null;
    }
    const tabId = helpers.uid();
    state.addFile(tabId, filename + ' (Diff)', '', '', {
      preview: true,
      previewType: 'diff',
    });
    state.setActive(tabId);
    _diffTabId = tabId;
    tabs.render();
    _setPane('diff');
    if (!_diffEditor) {
      _diffEditor = _monaco.editor.createDiffEditor(document.getElementById('diffEditor'), {
        theme: 'velocityui',
        fontSize: _settings.fontSize,
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        fontLigatures: true,
        readOnly: true,
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: {
          top: 12,
          bottom: 12,
        },
        minimap: {
          enabled: false,
        },
        folding: false,
        lineNumbers: 'on',
        stickyScroll: {
          enabled: false,
        },
        occurrencesHighlight: 'off',
        colorDecorators: false,
        smoothScrolling: false,
        renderWhitespace: 'none',
      });
    }
    const prev = _diffEditor.getModel();
    const origModel = _monaco.editor.createModel(oldContent, lang);
    const modModel = _monaco.editor.createModel(newContent, lang);
    _diffEditor.setModel({
      original: origModel,
      modified: modModel,
    });
    if (prev) {
      prev.original?.dispose();
      prev.modified?.dispose();
    }
  }
  function hideDiff() {
    if (_diffTabId) {
      state.closeTab(_diffTabId);
      _diffTabId = null;
      tabs.render();
    }
    const active = state.getActive();
    if (active && !active.preview) _showTextFile(active).catch(() => {});
    else _setPane('placeholder');
  }
  function isDiffTab(id) {
    return id === _diffTabId;
  }
  function restoreTimelineContent(fileId, content) {
    const file = state.getFile(fileId);
    if (!file || file.preview) return;
    if (state.activeFileId !== fileId) state.setActive(fileId, { permanent: true });
    state.updateContent(fileId, content);
    const model = EditorModels.getOrCreate(_monaco, file);
    if (model.getValue() !== content) model.setValue(content);
    _editorInstance?.setModel(model);
    hideDiff();
    tabs.render();
    eventBus.emit('ui:render-editor');
  }
  function relayout() {
    _editorInstance?.layout();
  }

  function getSelectionText() {
    if (!_editorInstance) return '';
    const selection = _editorInstance.getSelection();
    const model = _editorInstance.getModel();
    if (!selection || !model || selection.isEmpty()) return '';
    return model.getValueInRange(selection);
  }
  function clearRuntimeMarkers() {
    if (!_editorInstance) return;
    _runtimeDecorations = _editorInstance.deltaDecorations(_runtimeDecorations, []);
    _inlineHintDecorations = _editorInstance.deltaDecorations(_inlineHintDecorations, []);
    clearTimeout(_inlineHintTimer);
    _inlineHintTimer = null;
  }
  function markRuntimeError(line, message = 'Runtime error') {
    if (!_editorInstance || !_monaco) return;
    const model = _editorInstance.getModel();
    if (!model) return;
    const lineNumber = Math.max(1, Math.min(Number(line) || 1, model.getLineCount()));
    _runtimeDecorations = _editorInstance.deltaDecorations(_runtimeDecorations, [
      {
        range: new _monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
        options: {
          isWholeLine: true,
          className: 'runtime-error-line',
          glyphMarginClassName: 'runtime-error-glyph',
          hoverMessage: { value: message },
        },
      },
    ]);
    _editorInstance.revealLineInCenterIfOutsideViewport(lineNumber);
  }
  function showInlineHint(text, tone = 'ok') {
    if (!_editorInstance || !_monaco || !text) return;
    const model = _editorInstance.getModel();
    const position = _editorInstance.getPosition();
    if (!model || !position) return;
    const lineNumber = Math.max(1, Math.min(position.lineNumber, model.getLineCount()));
    const column = model.getLineMaxColumn(lineNumber);
    _inlineHintDecorations = _editorInstance.deltaDecorations(_inlineHintDecorations, [
      {
        range: new _monaco.Range(lineNumber, column, lineNumber, column),
        options: {
          after: {
            contentText: '  ' + text,
            inlineClassName: `runtime-inline-hint runtime-inline-hint--${tone}`,
          },
        },
      },
    ]);
    clearTimeout(_inlineHintTimer);
    _inlineHintTimer = setTimeout(() => {
      _inlineHintDecorations = _editorInstance.deltaDecorations(_inlineHintDecorations, []);
    }, 6000);
  }
  function getInstance() {
    return _editorInstance;
  }
  function goToLineColumn(line, column = 1) {
    if (!_editorInstance) return;
    const model = _editorInstance.getModel();
    if (!model) return;
    const lineNumber = Math.max(1, Math.min(Number(line) || 1, model.getLineCount()));
    const col = Math.max(1, Math.min(Number(column) || 1, model.getLineMaxColumn(lineNumber)));
    _editorInstance.setPosition({ lineNumber, column: col });
    _editorInstance.revealLineInCenterIfOutsideViewport(lineNumber);
    _editorInstance.focus();
    _syncStatusDetails(state.getActive(), { lineNumber, column: col });
  }
  function setLanguageMode(languageId, label) {
    const file = state.getActive();
    const model = _editorInstance?.getModel();
    if (!file || !model || !_monaco) return;
    state.setMeta(file.id, { languageOverride: languageId, languageOverrideLabel: label });
    _monaco.editor.setModelLanguage(model, languageId);
    _syncStatusDetails(state.getActive());
  }
  function setEol(kind) {
    const file = state.getActive();
    const model = _editorInstance?.getModel();
    if (!file || !model || !_monaco) return;
    model.pushEOL(
      kind === 'CRLF' ? _monaco.editor.EndOfLineSequence.CRLF : _monaco.editor.EndOfLineSequence.LF,
    );
    state.setMeta(file.id, { eol: kind });
    _syncStatusDetails(state.getActive());
  }
  function setIndentation(indentSize, insertSpaces) {
    const file = state.getActive();
    const model = _editorInstance?.getModel();
    if (!file || !model) return;
    model.updateOptions({ tabSize: indentSize, insertSpaces });
    state.setMeta(file.id, { indentSize, insertSpaces });
    _syncStatusDetails(state.getActive());
  }
  function setEncoding(encoding) {
    const file = state.getActive();
    if (!file) return;
    state.setMeta(file.id, { encoding });
    _syncStatusDetails(state.getActive());
  }
  function getInfo() {
    const file = state.getActive();
    const model = _editorInstance?.getModel();
    return {
      file,
      lineCount: model?.getLineCount?.() ?? 0,
      position: _editorInstance?.getPosition?.() ?? null,
    };
  }

  return {
    render,
    focus,
    relayout,
    destroyTab,
    destroyAllTabs,
    applyTheme,
    updateSettings,
    jumpToLine,
    getContent,
    openPreview,
    canPreview,
    showDiff,
    hideDiff,
    isDiffTab,
    restoreTimelineContent,
    getSelectionText,
    clearRuntimeMarkers,
    markRuntimeError,
    showInlineHint,
    getInstance,
    goToLineColumn,
    setLanguageMode,
    setEol,
    setIndentation,
    setEncoding,
    getInfo,
  };
})();
