const AiHelper = (() => {
  let _monaco = null;
  let _editor = null;
  let _config = null;
  let _hasCodexAuth = false;
  let _resolvedCodexPath = '';
  let _busy = false;
  let _activeRequestId = '';
  let _cancelPending = false;
  let _contextRatio = 0;
  let _aiSnapshotId = '';
  let _streamUnlisten = null;
  let _activeChatId = '';
  let _activeChatWorkspace = '';
  let _activeChatFolderId = '';
  let _chats = [];
  let _chatFolders = [];
  const _openChatRoots = new Set();
  const _openChatFolders = new Set();
  let _usage = null;
  let _rateLimits = null;
  const _streams = new Map();
  const _cancelledRequests = new Set();
  const _aiLockedPaths = new Map();
  let _aiLockTimer = null;
  let _workingTimer = null;
  const AI_LOCK_TTL = 15 * 60 * 1000;
  const CHAT_STORE_KEY = 'velocityui.codex.chats.v1';
  const CHAT_FOLDER_STORE_KEY = 'velocityui.codex.chatFolders.v1';
  const AI_MODELS = [
    { id: 'gpt-5.5', name: '5.5', intelligence: 'High', contextTokens: 400000 },
    { id: 'gpt-5.4', name: '5.4', intelligence: 'High', contextTokens: 400000 },
    { id: 'gpt-5.4-mini', name: '5.4 Mini', intelligence: 'Medium', contextTokens: 200000 },
    { id: 'gpt-5.2', name: '5.2', intelligence: 'Medium', contextTokens: 200000 },
  ];
  const _messages = [
    {
      role: 'assistant',
      text: 'Ask about the current file or folder. Select a DataTree when it matters.',
    },
  ];

  function _welcomeMessage() {
    return {
      role: 'assistant',
      text: 'Ask about the current file or folder. Select a DataTree when it matters.',
    };
  }

  function _chatFolder() {
    return state.workDir || 'Workspace';
  }

  function _chatTitle(messages = _messages) {
    const userText = messages.find((item) => item.role === 'user')?.text || '';
    return (userText.trim().replace(/\s+/g, ' ').slice(0, 48) || 'New chat').trim();
  }

  function _readChats() {
    try {
      const value = JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value.map((chat) => ({
        ...chat,
        workspace: chat.workspace || chat.folder || 'Workspace',
        folderId: chat.folderId || '',
      }));
    } catch {
      return [];
    }
  }

  function _readChatFolders() {
    try {
      const value = JSON.parse(localStorage.getItem(CHAT_FOLDER_STORE_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter((folder) => folder?.id && folder?.workspace && folder?.name)
        : [];
    } catch {
      return [];
    }
  }

  function _storedMessages(messages = _messages) {
    return messages
      .filter((item) => !item.streaming)
      .slice(-40)
      .map(({ role, text, tone, changes, events }) => ({ role, text, tone, changes, events }));
  }

  function _writeChatStorage() {
    try {
      localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(_chats));
      localStorage.setItem(CHAT_FOLDER_STORE_KEY, JSON.stringify(_chatFolders));
    } catch {}
    _renderChatTree();
  }

  function _captureDataTreeSelection(fallback = null) {
    try {
      if (typeof dataTree !== 'undefined' && dataTree.getAiSelection) {
        return dataTree.getAiSelection() || fallback || null;
      }
    } catch {}
    return fallback || null;
  }

  function _restoreChatDataTree(chat) {
    const selection = chat?.dataTreeSelection || null;
    _aiSnapshotId = selection?.snapshotId || '';
    if (!selection || typeof dataTree === 'undefined' || !dataTree.restoreAiSelection) {
      _renderSnapshotSelect().catch(() => {});
      return;
    }
    dataTree
      .restoreAiSelection(selection)
      .then((restored) => {
        if (!restored && _aiSnapshotId === selection.snapshotId) _aiSnapshotId = '';
        return _renderSnapshotSelect();
      })
      .catch(() => _renderSnapshotSelect().catch(() => {}));
  }

  function _saveChats() {
    if (!_activeChatId) return;
    const existing = _chats.find((chat) => chat.id === _activeChatId);
    const next = {
      ...existing,
      id: _activeChatId,
      workspace: _activeChatWorkspace || _chatFolder(),
      folderId: _activeChatFolderId || '',
      title: existing?.manualTitle ? existing.title : _chatTitle(),
      updatedAt: Date.now(),
      messages: _storedMessages(),
      dataTreeSelection: _captureDataTreeSelection(existing?.dataTreeSelection || null),
    };
    _chats = [next, ..._chats.filter((chat) => chat.id !== _activeChatId)]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 60);
    _writeChatStorage();
  }

  function _setMessages(messages) {
    _messages.splice(0, _messages.length, ...(messages?.length ? messages : [_welcomeMessage()]));
  }

  function _newChat({ workspace = _chatFolder(), folderId = '' } = {}) {
    _activeChatId = helpers.uid();
    _activeChatWorkspace = workspace;
    _activeChatFolderId = folderId;
    _openChatRoots.add(workspace);
    if (folderId) _openChatFolders.add(folderId);
    _setMessages([_welcomeMessage()]);
    _saveChats();
    _renderChat();
  }

  function _openNewChat(options) {
    _newChat(options);
    togglePanel(true);
  }

  function _loadChats() {
    _chats = _readChats();
    _chatFolders = _readChatFolders();
    const latest = _chats.find((chat) => chat.workspace === _chatFolder()) || _chats[0];
    if (!latest) {
      _newChat();
      return;
    }
    _activeChatId = latest.id;
    _activeChatWorkspace = latest.workspace || _chatFolder();
    _activeChatFolderId = latest.folderId || '';
    _openChatRoots.add(_activeChatWorkspace);
    if (_activeChatFolderId) _openChatFolders.add(_activeChatFolderId);
    _setMessages(latest.messages);
    _restoreChatDataTree(latest);
    _renderChatTree();
  }

  function _enabled() {
    return Boolean(_config?.enabled && _hasCodexAuth);
  }

  function _stripFences(text) {
    return String(text || '')
      .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  function _inlineMarkdown(text) {
    return helpers
      .escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function _renderMarkdownText(text) {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    return blocks
      .map((block) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
          return `<ul>${lines
            .map((line) => `<li>${_inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
            .join('')}</ul>`;
        }
        if (lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
          return `<ol>${lines
            .map((line) => `<li>${_inlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`)
            .join('')}</ol>`;
        }
        if (lines.length > 1) {
          return lines
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<p>${_inlineMarkdown(line)}</p>`)
            .join('');
        }
        return `<p>${_inlineMarkdown(block).replace(/\n/g, '<br>')}</p>`;
      })
      .join('');
  }

  function _renderRichText(text, streaming = false) {
    const source = String(text || '');
    const parts = [];
    let last = 0;
    const fence = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g;
    for (let match; (match = fence.exec(source)); ) {
      if (match.index > last) parts.push(_renderMarkdownText(source.slice(last, match.index)));
      const language = match[1] || 'code';
      const code = match[2] || '';
      parts.push(`
        <div class="ai-code-block">
          <div class="ai-code-head">
            <span>${helpers.escapeHtml(language)}</span>
            <button class="ai-code-copy" type="button">Copy</button>
          </div>
          <pre><code class="ai-code">${helpers.escapeHtml(code)}</code></pre>
        </div>
      `);
      last = fence.lastIndex;
    }
    if (last < source.length) parts.push(_renderMarkdownText(source.slice(last)));
    if (streaming) parts.push('<span class="ai-stream-cursor"></span>');
    return parts.join('') || (streaming ? '<span class="ai-stream-cursor"></span>' : '');
  }

  async function _loadConfig() {
    try {
      const next = await window.__TAURI__.core.invoke('ai_get_config');
      _config = next || {};
      _hasCodexAuth = !!next?.hasCodexAuth;
      _resolvedCodexPath = next?.resolvedCodexPath || '';
      _syncEditorOptions();
      _renderSettingsState();
      _renderChat();
      return next;
    } catch {
      _config = {
        enabled: false,
        model: 'gpt-5.5',
        dataTreeContext: true,
        codexPath: '',
        codexSandbox: 'read-only',
      };
      _hasCodexAuth = false;
      _resolvedCodexPath = '';
      return _config;
    }
  }

  function _syncEditorOptions() {
    if (!_editor) return;
    _editor.updateOptions({
      inlineSuggest: {
        enabled: false,
      },
    });
  }

  async function init(monaco, editorInstance) {
    _monaco = monaco;
    _editor = editorInstance;
    await _loadConfig();
  }

  function _clip(text, max) {
    const value = String(text || '');
    if (value.length <= max) return value;
    const head = Math.floor(max * 0.45);
    const tail = max - head;
    return `${value.slice(0, head)}\n-- ... clipped ...\n${value.slice(-tail)}`;
  }

  function _modelInfo(id = '') {
    return AI_MODELS.find((item) => item.id === id) || AI_MODELS[0];
  }

  function _renderModelSelect() {
    const select = document.getElementById('aiModelSelect');
    if (!select) return;
    if (!select.options.length) {
      select.innerHTML = AI_MODELS.map(
        (item) =>
          `<option value="${helpers.escapeHtml(item.id)}">${helpers.escapeHtml(
            `${item.name} ${item.intelligence}`,
          )}</option>`,
      ).join('');
    }
    select.value = _modelInfo(_config?.model).id;
  }

  async function _renderSnapshotSelect() {
    const select = document.getElementById('aiSnapshotSelect');
    if (!select) return;
    if (typeof dataTree === 'undefined' || !dataTree.getAiSnapshots) {
      select.innerHTML = '<option value="">No DataTree</option>';
      select.disabled = true;
      return;
    }
    const snapshots = await dataTree.getAiSnapshots().catch(() => []);
    select.disabled = false;
    select.innerHTML = [
      '<option value="">No DataTree</option>',
      ...(snapshots.length
        ? snapshots.map((snapshot) => {
            const count = snapshot.nodeCount ? ` (${snapshot.nodeCount.toLocaleString()})` : '';
            const label = `${snapshot.name}${count}`;
            return `<option value="${helpers.escapeHtml(snapshot.id)}">${helpers.escapeHtml(label)}</option>`;
          })
        : []),
    ].join('');
    if (!snapshots.some((snapshot) => snapshot.id === _aiSnapshotId)) _aiSnapshotId = '';
    select.value = _aiSnapshotId;
  }

  async function _saveSnapshotFromPanel() {
    const select = document.getElementById('aiSnapshotSelect');
    if (!select || typeof dataTree === 'undefined') return;
    _aiSnapshotId = select.value || '';
    if (_aiSnapshotId && dataTree.setAiSnapshot)
      await dataTree.setAiSnapshot(_aiSnapshotId).catch((err) => {
        toast.show(
          err?.message || String(err) || 'Could not switch DataTree snapshot',
          'fail',
          2600,
        );
      });
    await _renderSnapshotSelect();
  }

  function _estimateContextRatio(payload) {
    const model = _modelInfo(_config?.model);
    const raw = [
      payload.code,
      payload.selection,
      payload.prefix,
      payload.suffix,
      payload.instruction,
      JSON.stringify(payload.dataTreeReference || null),
    ].join('\n');
    const estimatedTokens = Math.ceil(raw.length / 4);
    return Math.max(0, Math.min(1, estimatedTokens / model.contextTokens));
  }

  function _updateContextMeter(ratio = _contextRatio) {
    _contextRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    const meter = document.getElementById('aiContextMeter');
    if (!meter) return;
    const percent = Math.round(_contextRatio * 100);
    meter.style.setProperty('--context-used', `${percent}%`);
    const limits = [
      `Context Window: ${percent}%`,
      `Daily Limit: ${_ratePercent(_rateLimits?.primary)}`,
      `Weekly Limit: ${_ratePercent(_rateLimits?.secondary)}`,
    ];
    meter.title = limits.join('\n');
    const tip = document.getElementById('aiContextTip');
    if (tip) {
      tip.innerHTML = limits
        .map((line) => {
          const [label, value] = line.split(': ');
          return `<span><b>${helpers.escapeHtml(label)}</b>${helpers.escapeHtml(value || '')}</span>`;
        })
        .join('');
    }
  }

  function _ratePercent(windowInfo) {
    const value = Number(windowInfo?.usedPercent ?? windowInfo?.used_percent);
    return Number.isFinite(value) ? `${Math.round(value)}%` : '--';
  }

  function _usageRatio(usage) {
    const windowSize = Number(usage?.modelContextWindow ?? usage?.model_context_window);
    const last = usage?.last || usage?.last_token_usage || {};
    const used =
      Number(last.totalTokens ?? last.total_tokens) ||
      Number(last.inputTokens ?? last.input_tokens ?? 0) +
        Number(last.outputTokens ?? last.output_tokens ?? 0);
    return windowSize > 0 && used >= 0 ? used / windowSize : null;
  }

  function _applyUsage(payload) {
    _usage = payload || _usage;
    const ratio = _usageRatio(_usage);
    if (ratio != null) _updateContextMeter(ratio);
  }

  function _applyRateLimits(payload) {
    _rateLimits = payload || _rateLimits;
    _updateContextMeter();
  }

  function _isEditorSurfaceVisible() {
    const view = document.querySelector('.activity-btn.active')?.dataset.view;
    return !view || view === 'explorer' || view === 'search';
  }

  function _panelWidth() {
    const panel = document.getElementById('aiSidePanel');
    const width = parseInt(panel?.style.width || uiState.aiPanelWidth || 340, 10);
    return Math.max(260, Math.min(520, Number.isFinite(width) ? width : 340));
  }

  function syncFabOffset() {
    const panel = document.getElementById('aiSidePanel');
    const visible =
      panel && !panel.classList.contains('hidden') && !panel.classList.contains('unavailable');
    document.documentElement.style.setProperty(
      '--ai-panel-offset',
      visible ? `${_panelWidth()}px` : '0px',
    );
  }

  function _selectionRange() {
    const selection = _editor?.getSelection?.();
    if (!selection || selection.isEmpty()) return null;
    return selection;
  }

  async function _buildPayload(task, options = {}) {
    const model = options.model || _editor?.getModel?.();
    const position = options.position || _editor?.getPosition?.() || { lineNumber: 1, column: 1 };
    const file = state.getActive?.();
    const lineStart = Math.max(1, position.lineNumber - 90);
    const lineEnd = Math.min(model?.getLineCount?.() || 1, position.lineNumber + 90);
    const prefix = model
      ? model.getValueInRange(new _monaco.Range(lineStart, 1, position.lineNumber, position.column))
      : '';
    const suffix = model
      ? model.getValueInRange(
          new _monaco.Range(
            position.lineNumber,
            position.column,
            lineEnd,
            model.getLineMaxColumn(lineEnd),
          ),
        )
      : '';
    const selection = _selectionRange();
    const dataTreeReference =
      _config?.dataTreeContext &&
      _aiSnapshotId &&
      typeof dataTree !== 'undefined' &&
      dataTree.getAiReference
        ? await dataTree.getAiReference(_aiSnapshotId).catch(() => null)
        : null;
    _renderSnapshotSelect().catch(() => {});
    const payload = {
      task,
      language: model?.getLanguageId?.() || file?.languageOverride || 'lua',
      filename: file?.name || 'Untitled',
      code: _clip(model?.getValue?.() || file?.content || '', 24000),
      selection: selection && model ? model.getValueInRange(selection) : '',
      prefix: _clip(prefix, 9000),
      suffix: _clip(suffix, 9000),
      instruction: options.instruction || '',
      dataTreeReference,
      workDir: state.workDir || '',
      workspaceRoots: [...new Set((state.roots || []).map((root) => root.path).filter(Boolean))],
    };
    _updateContextMeter(_estimateContextRatio(payload));
    return payload;
  }

  async function _ensureReady({ requireEditor = true } = {}) {
    if (!_config) await _loadConfig();
    if (!_config?.enabled) {
      toast.show('Enable AI Helper in Settings first', 'warn', 2200);
      return false;
    }
    if (!_hasCodexAuth) {
      toast.show('Codex auth is missing from ~/.codex/auth.json', 'warn', 3000);
      return false;
    }
    if (requireEditor && !_editor?.getModel?.()) {
      toast.show('Open a script before using this AI action', 'warn', 2200);
      return false;
    }
    return true;
  }

  async function generateAtCursor() {
    if (!(await _ensureReady())) return;
    const instruction = window.prompt('AI instruction', 'Use the current DataTree selection');
    if (!instruction?.trim()) return;
    toast.show('Codex is generating code...', 'info', 1800);
    try {
      const payload = await _buildPayload('generate_script', { instruction });
      const result = await window.__TAURI__.core.invoke('ai_generate', {
        request: { ...payload, maxOutputTokens: 900 },
      });
      const text = _stripFences(result?.text);
      const position = _editor.getPosition();
      _editor.executeEdits('ai-helper', [
        {
          range: new _monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          ),
          text,
          forceMoveMarkers: true,
        },
      ]);
      _editor.focus();
      toast.show('Codex code inserted', 'ok', 1600);
    } catch (err) {
      toast.show(err?.message || String(err) || 'Codex request failed', 'fail', 4200);
    }
  }

  async function replaceSelection(task = 'improve_selection') {
    if (!(await _ensureReady())) return;
    const selection = _selectionRange();
    if (!selection) {
      toast.show('Select code first', 'warn', 1800);
      return;
    }
    toast.show('Codex is editing the selection...', 'info', 1800);
    try {
      const payload = await _buildPayload(task);
      const result = await window.__TAURI__.core.invoke('ai_generate', {
        request: { ...payload, maxOutputTokens: 900 },
      });
      const text = _stripFences(result?.text);
      _editor.executeEdits('ai-helper', [{ range: selection, text, forceMoveMarkers: true }]);
      _editor.focus();
      toast.show('Codex edit applied', 'ok', 1600);
    } catch (err) {
      toast.show(err?.message || String(err) || 'Codex request failed', 'fail', 4200);
    }
  }

  function _chatTranscript(nextUserText = '') {
    const recent = _messages
      .filter((item) => item.role !== 'system')
      .slice(-10)
      .map((item) => `${item.role === 'user' ? 'User' : 'Codex'}: ${item.text}`)
      .join('\n\n');
    return `${recent}\n\nUser: ${nextUserText}`.trim();
  }

  async function _listenToStream() {
    if (_streamUnlisten || !window.__TAURI__?.event?.listen) return;
    _streamUnlisten = await window.__TAURI__.event.listen('ai-stream', ({ payload }) => {
      if (payload?.requestId && _cancelledRequests.has(payload.requestId)) return;
      const message = _streams.get(payload?.requestId);
      if (payload?.kind === 'usage') _applyUsage(payload.payload);
      if (payload?.kind === 'rate_limits') _applyRateLimits(payload.payload);
      if (!message) return;
      if (payload.kind === 'text_delta' && payload.delta) {
        message.streaming = true;
        message.text += payload.delta;
      } else if (payload.kind === 'message' && payload.text) {
        if (!message.text.trim()) message.text = payload.text;
        else if (!message.text.includes(payload.text)) message.text += `\n\n${payload.text}`;
      } else if (payload.kind === 'file_change' && Array.isArray(payload.payload)) {
        message.changes = [...(message.changes || []), ...payload.payload];
        _pushAssistantEvent(message, 'edit', _fileChangeEventText(payload.payload), {
          action: 'edit',
          count: new Set((payload.payload || []).map((change) => change.path).filter(Boolean)).size,
        });
        _applyCodexChangesLive(payload.payload).catch(() => {});
      } else if (payload.kind === 'status' && payload.text) {
        _pushAssistantEvent(message, 'status', payload.text);
      } else if (payload.kind === 'tool_event') {
        const event = _toolEvent(payload.payload);
        if (event) _pushAssistantEvent(message, event.kind, event.text, event);
      } else if (payload.kind === 'completed') {
        message.streaming = false;
      } else if (payload.kind === 'cancelled') {
        message.streaming = false;
        if (!message.text.trim()) message.text = 'Stopped.';
      }
      _renderChat();
    });
  }

  function _normalizePath(path = '') {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
  }

  function _cleanupAiLocks() {
    const now = Date.now();
    for (const [path, expiresAt] of _aiLockedPaths.entries()) {
      if (expiresAt <= now) _aiLockedPaths.delete(path);
    }
    if (!_aiLockedPaths.size && _aiLockTimer) {
      clearInterval(_aiLockTimer);
      _aiLockTimer = null;
    }
  }

  function _ensureAiLockTimer() {
    if (_aiLockTimer) return;
    _aiLockTimer = setInterval(() => {
      const before = _aiLockedPaths.size;
      _cleanupAiLocks();
      if (before && !_aiLockedPaths.size) editorController.renderEditor?.();
    }, 5000);
  }

  function _lockAiPaths(paths = []) {
    const normalized = paths.map(_normalizePath).filter(Boolean);
    if (!normalized.length) return;
    const expiresAt = Date.now() + AI_LOCK_TTL;
    normalized.forEach((path) => _aiLockedPaths.set(path, expiresAt));
    _ensureAiLockTimer();
    editorController.renderEditor?.();
  }

  function _lockOpenFiles() {
    const paths = (state.openTabIds || []).map((id) => state.getFile(id)?.path).filter(Boolean);
    _lockAiPaths(paths);
  }

  function _unlockAiPaths(paths = null) {
    if (Array.isArray(paths))
      paths.map(_normalizePath).forEach((path) => _aiLockedPaths.delete(path));
    else _aiLockedPaths.clear();
    if (!_aiLockedPaths.size && _aiLockTimer) {
      clearInterval(_aiLockTimer);
      _aiLockTimer = null;
    }
    editorController.renderEditor?.();
  }

  function isPathLocked(path) {
    _cleanupAiLocks();
    return _aiLockedPaths.has(_normalizePath(path));
  }

  function isFileLocked(file) {
    return !!file?.path && isPathLocked(file.path);
  }

  function isBusy() {
    return _busy;
  }

  function _newRequestId() {
    return `codex-${helpers.uid()}`;
  }

  function _pushAssistantEvent(message, kind, text, meta = null) {
    const clean = String(text || '').trim();
    if (!message || !clean) return;
    if (
      kind === 'status' &&
      /^(connected to codex|loaded rate limits|applied file edits)$/i.test(clean)
    )
      return;
    message.events = message.events || [];
    const last = message.events.at(-1);
    if (last?.kind === kind && last.text === clean) return;
    message.events.push({
      ...(meta || {}),
      kind,
      text: clean,
      at: Date.now(),
      textOffset: String(message.text || '').length,
    });
    if (message.events.length > 30) message.events.splice(0, message.events.length - 30);
  }

  function _compactActivityText(text = '') {
    let value = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    const roots = [...(state.roots || []).map((root) => root.path), state.workDir]
      .filter(Boolean)
      .sort((a, b) => String(b).length - String(a).length);
    for (const root of roots) {
      const normalized = String(root).replace(/\/+$/, '');
      if (normalized) value = value.split(normalized).join(helpers.basename(normalized) || '.');
    }
    try {
      const home = paths.home?.replace(/\/+$/, '');
      if (home) value = value.split(home).join('~');
    } catch {}
    return value;
  }

  function _fileChangeEventText(changes = []) {
    const count = new Set((changes || []).map((change) => change.path).filter(Boolean)).size;
    return count ? `Editing ${count} file${count === 1 ? '' : 's'}` : 'Editing files';
  }

  function _shellCommandText(label = '') {
    let text = String(label || '').trim();
    const shell = text.match(/(?:^|\s)(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+(.+)$/);
    if (shell) text = shell[1].trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1);
    }
    return _compactActivityText(text.replace(/\\"/g, '"'));
  }

  function _readTargetFromCommand(command = '') {
    const readfile = command.match(/\breadfile\s*\(\s*([^)]+)\s*\)/i);
    if (readfile) return helpers.basename(readfile[1].replace(/['",)]/g, '').trim());
    const text = command.replace(/['"]/g, ' ').split(/[;|&]/)[0].trim();
    if (!/\b(?:sed|cat|nl|head|tail)\b/.test(text)) return '';
    const token = text
      .split(/\s+/)
      .reverse()
      .find((part) => part && !part.startsWith('-') && !/^\d+(?:,\d+)?p?$/.test(part));
    return token ? helpers.basename(token.replace(/[,)]/g, '')) : '';
  }

  function _searchTargetFromCommand(command = '') {
    const text = command.replace(/\s+/g, ' ').trim();
    const rg = text.match(/\brg\b(?:\s+-[^\s]+)*\s+(.+?)(?:\s+([^\s]+))?$/);
    if (!rg) return null;
    const query = (rg[1] || '').replace(/^['"]|['"]$/g, '').trim();
    const target = (rg[2] || state.workDir || '').replace(/^['"]|['"]$/g, '').trim();
    return {
      query: _compactActivityText(query),
      target: target ? helpers.basename(_compactActivityText(target)) : '',
    };
  }

  function _toolEvent(payload = {}) {
    const rawType = String(payload?.type || payload?.kind || 'tool');
    const type = rawType.replace(/[_-]+/g, ' ');
    const label = String(
      payload?.label || payload?.title || payload?.command || payload?.name || '',
    ).trim();
    const status = String(payload?.status || payload?.state || '').trim();
    const lower = `${rawType} ${label}`.toLowerCase();
    if (lower.includes('reasoning')) return null;
    const command = _shellCommandText(label);
    const base = { status, type: rawType, label: _compactActivityText(label) };
    const toolkit = command.match(/\bAI_ToolKit\.mjs\s+([a-z-]+)\b\s*(.*)$/);
    if (toolkit) {
      const name = toolkit[1];
      const rest = _compactActivityText(toolkit[2] || '');
      if (['files', 'list', 'find'].includes(name)) {
        return {
          ...base,
          kind: 'list',
          action: 'list',
          text: rest ? `Listed ${rest}` : 'Listed files',
        };
      }
      if (['search', 'grep'].includes(name)) {
        return {
          ...base,
          kind: 'search',
          action: 'search',
          text: rest ? `Searched ${rest}` : 'Searched files',
        };
      }
      if (['read', 'head', 'tail', 'json', 'stat', 'exists', 'wc'].includes(name)) {
        return {
          ...base,
          kind: 'read',
          action: 'read',
          text: rest ? `Read ${rest}` : `Read ${name}`,
        };
      }
    }
    if (lower.includes('file') && lower.includes('search')) {
      return { ...base, kind: 'search', action: 'search', text: `Searched ${command || 'files'}` };
    }
    if (/\brg\s+--files\b|\bfind\b.+-type\s+f|\bls\b/.test(command)) {
      return {
        ...base,
        kind: 'list',
        action: 'list',
        text: 'Listed files',
        detail: `Listed files with ${command}`,
      };
    }
    if (/\brg\b|\bgrep\b/.test(command)) {
      const found = _searchTargetFromCommand(command);
      const detail = found
        ? `Searched for ${found.query}${found.target ? ` in ${found.target}` : ''}`
        : `Searched with ${command}`;
      return { ...base, kind: 'search', action: 'search', text: detail, detail };
    }
    if (/\b(?:sed|cat|nl|head|tail)\b|\breadfile\s*\(/i.test(command)) {
      const target = _readTargetFromCommand(command);
      const detail = target ? `Read ${target}` : `Read with ${command}`;
      return { ...base, kind: 'read', action: 'read', text: detail, detail };
    }
    if (rawType === 'commandExecution' || command) {
      return {
        ...base,
        kind: 'command',
        action: 'command',
        text: `Ran ${command || type}`,
        detail: `Ran ${command || label || type}`,
      };
    }
    return {
      ...base,
      kind: 'tool',
      action: 'tool',
      text: [type, _compactActivityText(label), status].filter(Boolean).join(' · '),
    };
  }

  function _activityIcon(action = 'tool') {
    if (action === 'search')
      return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3 3"/></svg>`;
    if (action === 'list')
      return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h11M2.5 8h11M2.5 10.5h11"/><path d="M2.5 3.5h7"/></svg>`;
    if (action === 'read')
      return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3M5.8 8h4.4M5.8 10.3h4.4"/></svg>`;
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="m5.2 6.2 2 1.8-2 1.8M8.4 10h2.4"/></svg>`;
  }

  function _plural(count, word, suffix = 's') {
    if (!count) return '';
    return `${count} ${word}${count === 1 ? '' : suffix}`;
  }

  function _activityStats(events = []) {
    const stats = { read: 0, search: 0, list: 0, command: 0, edit: 0, tool: 0 };
    const files = new Set();
    for (const event of events) {
      const action = event?.action || event?.kind;
      if (action === 'read') {
        stats.read++;
        const file = String(event.detail || event.text || '')
          .replace(/^Read\s+/i, '')
          .trim();
        if (file) files.add(file);
      } else if (action === 'search') stats.search++;
      else if (action === 'list') stats.list++;
      else if (action === 'command') stats.command++;
      else if (action === 'edit') stats.edit += Number(event.count) || 1;
      else if (action === 'tool') stats.tool++;
    }
    return { ...stats, files: files.size || stats.read };
  }

  function _activitySummaryText(events = []) {
    const stats = _activityStats(events);
    if (stats.edit && !stats.files && !stats.search && !stats.list && !stats.command) {
      return `Edited ${stats.edit} file${stats.edit === 1 ? '' : 's'}`;
    }
    const explored = [
      _plural(stats.files, 'file'),
      _plural(stats.search, 'search', 'es'),
      _plural(stats.list, 'list'),
    ].filter(Boolean);
    const ran = stats.command
      ? `ran ${stats.command} command${stats.command === 1 ? '' : 's'}`
      : '';
    if (explored.length) return `Explored ${[...explored, ran].filter(Boolean).join(', ')}`;
    if (ran) return ran[0].toUpperCase() + ran.slice(1);
    if (stats.tool) return `Used ${stats.tool} tool${stats.tool === 1 ? '' : 's'}`;
    return '';
  }

  function _liveActivity(events = []) {
    const latest = [...(events || [])].reverse().find((event) => event?.action || event?.kind);
    const action = latest?.action || latest?.kind;
    if (action === 'edit') return { action, text: latest.text || 'Editing files' };
    if (action === 'read')
      return { action, text: (latest.text || '').replace(/^Read\b/i, 'Reading') };
    if (action === 'search')
      return {
        action,
        text: (latest.text || '').replace(/^Searched\b/i, 'Searching') || 'Searching files',
      };
    if (action === 'list') return { action, text: 'Listing files' };
    if (action === 'command') return { action, text: 'Running command' };
    return { action: 'thinking', text: 'Thinking' };
  }

  function _formatElapsed(ms = 0) {
    const total = Math.max(0, Math.floor(ms / 1000));
    if (total < 60) return `${total}s`;
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
  }

  function _ensureWorkingTimer() {
    if (_workingTimer) return;
    _workingTimer = setInterval(() => {
      if (!_busy) {
        clearInterval(_workingTimer);
        _workingTimer = null;
        return;
      }
      _renderChat();
    }, 1000);
  }

  function _clearWorkingTimer() {
    if (!_workingTimer) return;
    clearInterval(_workingTimer);
    _workingTimer = null;
  }

  function _appendFinalText(message, text) {
    const finalText = String(text || '').trim();
    if (!finalText) return;
    if (!message.text.trim()) {
      message.text = finalText;
      return;
    }
    if (!message.text.includes(finalText)) message.text += `\n\n${finalText}`;
  }

  function _changePaths(changes = []) {
    return changes
      .map((change) => String(change?.path || '').trim())
      .filter(Boolean)
      .map((path) => {
        const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
        if (normalized.startsWith('/')) return normalized;
        return state.workDir ? `${state.workDir.replace(/\/+$/, '')}/${normalized}` : normalized;
      });
  }

  async function _refreshCodexChanges(changes = []) {
    const paths = _changePaths(changes);
    if (paths.length) await workspaceController.refreshChangedPaths?.(paths, { source: 'ai' });
  }

  async function _applyCodexChangesLive(changes = []) {
    const paths = _changePaths(changes);
    if (!paths.length) return;
    _lockAiPaths(paths);
    await workspaceController.refreshChangedPaths?.(paths, { source: 'ai' });
  }

  async function sendChat(text = '') {
    const prompt = String(text || document.getElementById('aiChatInput')?.value || '').trim();
    if (!prompt || _busy) return;
    if (!(await _ensureReady({ requireEditor: false }))) return;
    const input = document.getElementById('aiChatInput');
    if (input) input.value = '';
    _messages.push({ role: 'user', text: prompt });
    const assistantMessage = {
      role: 'assistant',
      text: '',
      streaming: true,
      events: [],
      startedAt: Date.now(),
    };
    _messages.push(assistantMessage);
    _busy = true;
    _cancelPending = false;
    _ensureWorkingTimer();
    _lockOpenFiles();
    _saveChats();
    _renderChat();
    let requestId = '';
    try {
      await _listenToStream();
      const payload = await _buildPayload('ai_chat', {
        instruction: _chatTranscript(prompt),
      });
      if (_cancelPending) throw new Error('Codex request cancelled');
      requestId = _newRequestId();
      _activeRequestId = requestId;
      _streams.set(requestId, assistantMessage);
      const result = await window.__TAURI__.core.invoke('ai_generate', {
        request: { ...payload, requestId, maxOutputTokens: 2200 },
      });
      if (_cancelledRequests.has(requestId)) return;
      _appendFinalText(assistantMessage, result?.text);
      if (!assistantMessage.changes?.length) assistantMessage.changes = result?.changes || [];
      _applyUsage(result?.usage);
      _applyRateLimits(result?.rateLimits);
      await _refreshCodexChanges(result?.changes);
      _streams.delete(requestId);
    } catch (err) {
      const message = err?.message || String(err) || 'Codex request failed';
      assistantMessage.text = message.includes('cancelled') ? 'Stopped.' : message;
      assistantMessage.tone = message.includes('cancelled') ? '' : 'error';
      assistantMessage.streaming = false;
    } finally {
      if (requestId) _streams.delete(requestId);
      _busy = false;
      _clearWorkingTimer();
      _activeRequestId = '';
      _cancelPending = false;
      _unlockAiPaths();
      assistantMessage.completedAt = Date.now();
      assistantMessage.streaming = false;
      if (requestId && _cancelledRequests.has(requestId)) {
        if (!assistantMessage.text.trim()) assistantMessage.text = 'Stopped.';
        setTimeout(() => _cancelledRequests.delete(requestId), 30000);
      }
      _saveChats();
      _renderChat();
    }
    return assistantMessage.text;
  }

  async function cancelChat() {
    if (!_busy) return;
    _cancelPending = true;
    const requestId = _activeRequestId;
    const assistantMessage =
      (requestId && _streams.get(requestId)) ||
      [..._messages].reverse().find((message) => message.role === 'assistant' && message.streaming);
    if (requestId) {
      _cancelledRequests.add(requestId);
      _streams.delete(requestId);
    }
    if (assistantMessage) {
      if (!assistantMessage.text.trim()) assistantMessage.text = 'Stopped.';
      assistantMessage.streaming = false;
      assistantMessage.completedAt = Date.now();
    }
    _busy = false;
    _activeRequestId = '';
    _clearWorkingTimer();
    _unlockAiPaths();
    _saveChats();
    _renderChat();
    if (!requestId) return;
    window.__TAURI__.core
      .invoke('ai_cancel_request', { requestId })
      .catch((err) =>
        toast.show(err?.message || String(err) || 'Could not stop Codex', 'fail', 2600),
      );
  }

  function clearChat() {
    _newChat({
      workspace: _activeChatWorkspace || _chatFolder(),
      folderId: _activeChatFolderId || '',
    });
    _renderChat();
  }

  function _syncSendButton() {
    const button = document.getElementById('aiChatSend');
    if (!button) return;
    button.disabled = false;
    button.classList.toggle('is-busy', _busy);
    button.title = _busy ? 'Stop response' : 'Send';
    button.setAttribute('aria-label', _busy ? 'Stop response' : 'Send');
    button.innerHTML = _busy
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`;
  }

  function _renderChat() {
    const body = document.getElementById('aiChatMessages');
    if (!body) return;
    body.innerHTML = _messages
      .map((item) => {
        const content =
          item.role === 'assistant'
            ? _renderAssistantTimeline(item)
            : _renderRichText(item.text, item.streaming);
        return `
          <div class="ai-msg ai-msg--${item.role}${item.tone ? ` ai-msg--${item.tone}` : ''}">
            <div class="ai-msg-role">${item.role === 'user' ? 'You' : 'Codex'}</div>
            <div class="ai-msg-text">${content}${_renderChangeSummary(item.changes)}</div>
          </div>
        `;
      })
      .join('');
    body.scrollTop = body.scrollHeight;
    _syncSendButton();
  }

  function _renderWorkedLabel(message) {
    if (!message?.startedAt) return 'Worked';
    const elapsed = _formatElapsed((message.completedAt || Date.now()) - message.startedAt);
    return `${message.streaming ? 'Working' : 'Worked'} for ${helpers.escapeHtml(elapsed)}`;
  }

  function _usefulActivityEvents(events = []) {
    return (Array.isArray(events) ? events : []).filter((event) => {
      const action = event?.action || event?.kind;
      return action && action !== 'status' && action !== 'thinking';
    });
  }

  function _activityGroups(events = [], textLength = 0) {
    const groups = [];
    const sorted = [...events].sort((a, b) => {
      const ao = Number.isFinite(Number(a.textOffset)) ? Number(a.textOffset) : textLength;
      const bo = Number.isFinite(Number(b.textOffset)) ? Number(b.textOffset) : textLength;
      return ao - bo || (a.at || 0) - (b.at || 0);
    });
    for (const event of sorted) {
      const offset = Math.max(
        0,
        Math.min(
          textLength,
          Number.isFinite(Number(event.textOffset)) ? Number(event.textOffset) : textLength,
        ),
      );
      const last = groups.at(-1);
      if (last && Math.abs(last.offset - offset) <= 2) {
        last.events.push(event);
      } else {
        groups.push({ offset, events: [event] });
      }
    }
    return groups;
  }

  function _renderAssistantTimeline(message) {
    const source = String(message?.text || '');
    const useful = _usefulActivityEvents(message?.events);
    if (!source && !useful.length) {
      return message?.streaming
        ? `${_renderWorkingHeader(message)}${_renderActivity([], true)}`
        : '';
    }
    const groups = _activityGroups(useful, source.length);
    if (!groups.length) {
      return message?.streaming
        ? `${_renderWorkingHeader(message)}${_renderRichText(source, false)}${_renderActivity([], true)}`
        : _renderRichText(source, false);
    }

    if (!message?.streaming) {
      const finalStart = groups.at(-1)?.offset ?? source.length;
      const workSource = source.slice(0, finalStart);
      const finalSource = source.slice(finalStart).trim() || source;
      const workHtml = _renderTimelineChunks(workSource, groups, false);
      return `${_renderWorkDetails(message, workHtml)}${_renderRichText(finalSource, false)}`;
    }

    return `${_renderWorkingHeader(message)}${_renderTimelineChunks(source, groups, true)}`;
  }

  function _renderTimelineChunks(source, groups, streaming = false) {
    let cursor = 0;
    let renderedLiveActivity = false;
    let html = '';
    groups.forEach((group, index) => {
      if (group.offset > source.length) return;
      const before = source.slice(cursor, group.offset);
      if (before) html += _renderRichText(before, false);
      const isLastGroup = index === groups.length - 1;
      const hasTrailingText = group.offset < source.length;
      const showLive = Boolean(streaming && isLastGroup && !hasTrailingText);
      if (showLive) renderedLiveActivity = true;
      html += _renderActivity(group.events, showLive);
      cursor = group.offset;
    });
    const tail = source.slice(cursor);
    if (tail) html += _renderRichText(tail, false);
    if (streaming && !renderedLiveActivity) html += _renderActivity([], true);
    return html;
  }

  function _renderWorkingHeader(message) {
    const label = _renderWorkedLabel(message);
    return `<div class="ai-working-header"><span>${label}</span></div>`;
  }

  function _renderWorkDetails(message, content) {
    const label = _renderWorkedLabel(message);
    return `<details class="ai-work-details"${message?.streaming ? ' open' : ''}><summary><span>${label}</span></summary><div class="ai-work-details-body">${content}</div></details>`;
  }

  function _renderActivity(events = [], streaming = false) {
    const useful = _usefulActivityEvents(events);
    const summary = _activitySummaryText(useful);
    const liveActivity = streaming ? _liveActivity(useful) : null;
    if (!summary && !liveActivity) return '';
    const rows = useful
      .slice(-16)
      .map((event) => {
        const action = event.action || event.kind || 'tool';
        const detail = event.detail || event.text || '';
        return `<div class="ai-activity-detail-row ai-activity-detail-row--${helpers.escapeHtml(
          action,
        )}"><span>${_activityIcon(action)}</span><b>${helpers.escapeHtml(_compactActivityText(detail))}</b></div>`;
      })
      .join('');
    const details = rows
      ? `<details class="ai-activity-details"><summary>${helpers.escapeHtml(
          summary || 'Working details',
        )}</summary><div>${rows}</div></details>`
      : '';
    const live = liveActivity
      ? `<div class="ai-activity-live ai-activity-live--${helpers.escapeHtml(
          liveActivity.action,
        )}"><span>${_activityIcon(liveActivity.action)}</span><b>${helpers.escapeHtml(
          liveActivity.text,
        )}</b></div>`
      : '';
    return `<section class="ai-activity${streaming ? ' ai-activity--live' : ''}">${details}${live}</section>`;
  }

  function _renderChangeSummary(changes = []) {
    if (!Array.isArray(changes) || !changes.length) return '';
    const byPath = new Map();
    for (const change of changes) {
      const existing = byPath.get(change.path) || { ...change, additions: 0, deletions: 0 };
      existing.additions += Number(change.additions) || 0;
      existing.deletions += Number(change.deletions) || 0;
      byPath.set(change.path, existing);
    }
    const rows = [...byPath.values()]
      .slice(0, 6)
      .map(
        (change) => `
          <div class="ai-change-row">
            <span>${helpers.escapeHtml(_displayChangePath(change.path))}</span>
            <b>+${change.additions}</b>
            <i>-${change.deletions}</i>
          </div>
        `,
      )
      .join('');
    const hidden = byPath.size > 6 ? `<small>${byPath.size - 6} more files</small>` : '';
    return `<section class="ai-change-summary"><strong>Edited ${byPath.size} file${
      byPath.size === 1 ? '' : 's'
    }</strong>${rows}${hidden}</section>`;
  }

  function _displayChangePath(rawPath = '') {
    const value = String(rawPath || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (!value) return 'Unknown file';
    const roots = [...(state.roots || []).map((root) => root.path), state.workDir]
      .filter(Boolean)
      .map((root) => String(root).replace(/\\/g, '/').replace(/\/+$/, ''))
      .sort((a, b) => b.length - a.length);
    for (const root of roots) {
      if (value !== root && !value.startsWith(`${root}/`)) continue;
      const name = helpers.basename(root) || 'Workspace';
      const rest = value.slice(root.length).replace(/^\/+/, '');
      return rest ? `${name}/${rest}` : name;
    }
    if (!value.startsWith('/')) {
      const name = helpers.basename(state.workDir || '') || 'Workspace';
      return `${name}/${value.replace(/^\.\//, '')}`;
    }
    const velocity = value.lastIndexOf('/VelocityUI/');
    if (velocity !== -1) return value.slice(velocity + 1);
    return helpers.basename(value) || value;
  }

  function _selectChat(id) {
    const chat = _chats.find((item) => item.id === id);
    if (!chat || _busy) return;
    _saveChats();
    _activeChatId = chat.id;
    _activeChatWorkspace = chat.workspace || _chatFolder();
    _activeChatFolderId = chat.folderId || '';
    _openChatRoots.add(_activeChatWorkspace);
    if (_activeChatFolderId) _openChatFolders.add(_activeChatFolderId);
    _setMessages(chat.messages);
    _restoreChatDataTree(chat);
    _renderChatTree();
    _renderChat();
    togglePanel(true);
  }

  const CHAT_TREE_ICONS = {
    arrow: `<svg viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    workspace: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 12.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5z"/></svg>`,
    folder: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 12.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5z"/></svg>`,
    chat: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 10.5A2.5 2.5 0 0 1 11 13H6l-3.5 2v-3.6A2.5 2.5 0 0 1 1.5 9.5v-5A2.5 2.5 0 0 1 4 2h7a2.5 2.5 0 0 1 2.5 2.5z"/></svg>`,
  };

  function _chatWorkspaces() {
    const all = new Set([_chatFolder()]);
    _chats.forEach((chat) => all.add(chat.workspace || chat.folder || 'Workspace'));
    _chatFolders.forEach((folder) => all.add(folder.workspace));
    return [...all].sort((a, b) => {
      if (a === _chatFolder()) return -1;
      if (b === _chatFolder()) return 1;
      return (helpers.basename(a) || a).localeCompare(helpers.basename(b) || b);
    });
  }

  function _treeRow(
    kind,
    { id = '', label = '', title = '', meta = '', depth = 0, open = false } = {},
  ) {
    const row = document.createElement('div');
    row.className = `ai-chat-tree-row ai-chat-tree-row--${kind}`;
    row.dataset.aiKind = kind;
    if (id) row.dataset.aiId = id;
    row.setAttribute('role', 'treeitem');
    row.title = title || label;
    row.style.paddingLeft = `${5 + depth * 13}px`;
    const arrow = document.createElement('span');
    arrow.className = `ai-chat-tree-arrow${kind === 'chat' ? ' leaf' : open ? ' open' : ''}`;
    arrow.innerHTML = CHAT_TREE_ICONS.arrow;
    const icon = document.createElement('span');
    icon.className = 'ai-chat-tree-icon';
    icon.innerHTML = CHAT_TREE_ICONS[kind === 'root' ? 'workspace' : kind] || CHAT_TREE_ICONS.chat;
    const text = document.createElement('span');
    text.className = 'ai-chat-tree-label';
    text.textContent = label || 'New chat';
    const time = document.createElement('span');
    time.className = 'ai-chat-tree-meta';
    time.textContent = meta;
    row.append(arrow, icon, text, time);
    return row;
  }

  function _dateLabel(at) {
    if (!at) return '';
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function _appendChatRow(tree, chat, depth) {
    const row = _treeRow('chat', {
      id: chat.id,
      label: chat.title || 'New chat',
      title: chat.title || 'New chat',
      meta: _dateLabel(chat.updatedAt),
      depth,
    });
    row.classList.toggle('active', chat.id === _activeChatId);
    row.addEventListener('click', () => _selectChat(chat.id));
    row.addEventListener('contextmenu', (event) => _showChatMenu(event, chat.id));
    tree.appendChild(row);
  }

  function _renderChatTree() {
    const tree = document.getElementById('aiChatTree');
    const count = document.getElementById('aiChatsCount');
    if (!tree) return;
    if (count) count.textContent = _chats.length ? String(_chats.length) : '';
    tree.innerHTML = '';
    tree.oncontextmenu = (event) => {
      if (event.target === tree || event.target.closest('.ai-chats-empty'))
        _showChatRootMenu(event, _chatFolder());
    };
    for (const workspace of _chatWorkspaces()) {
      const rootOpen = _openChatRoots.has(workspace) || workspace === _chatFolder();
      const workspaceChats = _chats.filter((chat) => chat.workspace === workspace);
      const folders = _chatFolders
        .filter((folder) => folder.workspace === workspace)
        .sort((a, b) => a.name.localeCompare(b.name));
      const root = _treeRow('root', {
        id: workspace,
        label: helpers.basename(workspace) || workspace,
        title: workspace,
        meta: String(workspaceChats.length),
        open: rootOpen,
      });
      root.addEventListener('click', () => {
        if (rootOpen) _openChatRoots.delete(workspace);
        else _openChatRoots.add(workspace);
        _renderChatTree();
      });
      root.addEventListener('contextmenu', (event) => _showChatRootMenu(event, workspace));
      tree.appendChild(root);
      if (!rootOpen) continue;
      for (const folder of folders) {
        const folderOpen = _openChatFolders.has(folder.id);
        const rows = workspaceChats.filter((chat) => chat.folderId === folder.id);
        const row = _treeRow('folder', {
          id: folder.id,
          label: folder.name,
          title: folder.name,
          meta: String(rows.length),
          depth: 1,
          open: folderOpen,
        });
        row.addEventListener('click', () => {
          if (folderOpen) _openChatFolders.delete(folder.id);
          else _openChatFolders.add(folder.id);
          _renderChatTree();
        });
        row.addEventListener('contextmenu', (event) => _showChatFolderMenu(event, folder.id));
        tree.appendChild(row);
        if (folderOpen) rows.forEach((chat) => _appendChatRow(tree, chat, 2));
      }
      workspaceChats
        .filter(
          (chat) => !chat.folderId || !_chatFolders.some((folder) => folder.id === chat.folderId),
        )
        .forEach((chat) => _appendChatRow(tree, chat, 1));
    }
    if (!_chats.length) tree.innerHTML = '<div class="ai-chats-empty">No chats yet</div>';
  }

  function _nextFolderName(workspace) {
    const used = new Set(
      _chatFolders
        .filter((folder) => folder.workspace === workspace)
        .map((folder) => folder.name.toLowerCase()),
    );
    if (!used.has('new folder')) return 'New Folder';
    let suffix = 2;
    while (used.has(`new folder ${suffix}`)) suffix += 1;
    return `New Folder ${suffix}`;
  }

  function _createChatFolder(workspace = _chatFolder()) {
    const folder = {
      id: helpers.uid(),
      workspace,
      name: _nextFolderName(workspace),
      updatedAt: Date.now(),
    };
    _chatFolders.push(folder);
    _openChatRoots.add(workspace);
    _openChatFolders.add(folder.id);
    uiState.setAiChatsCollapsed?.(false);
    _syncChatChrome();
    _writeChatStorage();
    requestAnimationFrame(() => _startChatRename('folder', folder.id));
  }

  function _startChatRename(kind, id) {
    const tree = document.getElementById('aiChatTree');
    const row = [...(tree?.querySelectorAll(`.ai-chat-tree-row--${kind}`) || [])].find(
      (item) => item.dataset.aiId === id,
    );
    const label = row?.querySelector('.ai-chat-tree-label');
    const record =
      kind === 'folder'
        ? _chatFolders.find((folder) => folder.id === id)
        : _chats.find((chat) => chat.id === id);
    if (!row || !label || !record) return;
    const input = document.createElement('input');
    input.className = 'tree-rename-input ai-chat-tree-rename';
    input.value = record.name || record.title || 'New chat';
    label.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const next = input.value.trim();
      if (next) {
        if (kind === 'folder') {
          record.name = next;
          record.updatedAt = Date.now();
        } else {
          record.title = next;
          record.manualTitle = true;
        }
      }
      _writeChatStorage();
    };
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        input.removeEventListener('blur', commit);
        _renderChatTree();
      }
    });
  }

  function _replaceAfterChatDelete(workspace) {
    const fallback =
      _chats.find((chat) => chat.workspace === workspace) ||
      _chats.find((chat) => chat.workspace === _chatFolder()) ||
      _chats[0];
    if (fallback) {
      _activeChatId = fallback.id;
      _activeChatWorkspace = fallback.workspace;
      _activeChatFolderId = fallback.folderId || '';
      _setMessages(fallback.messages);
      _renderChat();
      _writeChatStorage();
      return;
    }
    _newChat({ workspace: _chatFolder() });
  }

  async function _deleteChat(id) {
    const chat = _chats.find((item) => item.id === id);
    if (!chat) return;
    const confirmed = await modal.confirm(
      'Delete Chat',
      `Delete <strong>${helpers.escapeHtml(chat.title || 'New chat')}</strong>?`,
    );
    if (!confirmed) return;
    _chats = _chats.filter((item) => item.id !== id);
    if (id === _activeChatId) _replaceAfterChatDelete(chat.workspace);
    else _writeChatStorage();
  }

  async function _deleteChatFolder(id) {
    const folder = _chatFolders.find((item) => item.id === id);
    if (!folder) return;
    const size = _chats.filter((chat) => chat.folderId === id).length;
    const suffix = size ? ` and ${size} chat${size === 1 ? '' : 's'}` : '';
    const confirmed = await modal.confirm(
      'Delete Chat Folder',
      `Delete <strong>${helpers.escapeHtml(folder.name)}</strong>${suffix}?`,
    );
    if (!confirmed) return;
    const activeRemoved = _activeChatFolderId === id;
    _chats = _chats.filter((chat) => chat.folderId !== id);
    _chatFolders = _chatFolders.filter((item) => item.id !== id);
    _openChatFolders.delete(id);
    if (activeRemoved) _replaceAfterChatDelete(folder.workspace);
    else _writeChatStorage();
  }

  async function _deleteWorkspaceChats(workspace) {
    const size = _chats.filter((chat) => chat.workspace === workspace).length;
    if (!size && !_chatFolders.some((folder) => folder.workspace === workspace)) return;
    const name = helpers.basename(workspace) || workspace;
    const confirmed = await modal.confirm(
      'Delete Workspace Chats',
      `Delete saved chats for <strong>${helpers.escapeHtml(name)}</strong>?`,
    );
    if (!confirmed) return;
    const activeRemoved = _activeChatWorkspace === workspace;
    _chats = _chats.filter((chat) => chat.workspace !== workspace);
    _chatFolders = _chatFolders.filter((folder) => folder.workspace !== workspace);
    _openChatRoots.delete(workspace);
    if (activeRemoved) _replaceAfterChatDelete(_chatFolder());
    else _writeChatStorage();
  }

  function _showChatRootMenu(event, workspace) {
    ctxMenu.showItems(event, [
      { label: 'New Chat', action: () => _openNewChat({ workspace }) },
      { label: 'New Folder', action: () => _createChatFolder(workspace) },
      { separator: true },
      { label: 'Delete Workspace Chats', action: () => _deleteWorkspaceChats(workspace) },
    ]);
  }

  function _showChatFolderMenu(event, id) {
    const folder = _chatFolders.find((item) => item.id === id);
    if (!folder) return;
    ctxMenu.showItems(event, [
      {
        label: 'New Chat',
        action: () => _openNewChat({ workspace: folder.workspace, folderId: id }),
      },
      { separator: true },
      { label: 'Rename', action: () => _startChatRename('folder', id) },
      { label: 'Delete', action: () => _deleteChatFolder(id) },
    ]);
  }

  function _showChatMenu(event, id) {
    const chat = _chats.find((item) => item.id === id);
    if (!chat) return;
    ctxMenu.showItems(event, [
      { label: 'Open', action: () => _selectChat(id) },
      { separator: true },
      { label: 'Rename', action: () => _startChatRename('chat', id) },
      { label: 'Delete', action: () => _deleteChat(id) },
    ]);
  }

  function togglePanel(force) {
    const panel = document.getElementById('aiSidePanel');
    if (!panel) return;
    if (!_isEditorSurfaceVisible()) {
      panel.classList.add('hidden');
      document.getElementById('btnToggleAiPanel')?.classList.remove('active');
      syncFabOffset();
      return;
    }
    const visible = force == null ? panel.classList.contains('hidden') : !!force;
    panel.classList.toggle('hidden', !visible);
    document.getElementById('btnToggleAiPanel')?.classList.toggle('active', visible);
    uiState.setAiPanelVisible?.(visible);
    syncFabOffset();
    setTimeout(() => editor.relayout(), 160);
    eventBus.emit('ui:ai-panel-toggled', { visible });
  }

  function syncAvailability(available) {
    const panel = document.getElementById('aiSidePanel');
    const toggle = document.getElementById('btnToggleAiPanel');
    toggle?.classList.toggle('unavailable', !available);
    toggle?.toggleAttribute('disabled', !available);
    if (!available && panel) {
      panel.classList.add('hidden');
      panel.classList.add('unavailable');
      toggle?.classList.remove('active');
    } else {
      panel?.classList.remove('unavailable');
      if (uiState.aiPanelVisible && panel) {
        panel.classList.remove('hidden');
        toggle?.classList.add('active');
      }
    }
    syncFabOffset();
  }

  async function _saveModelFromPanel() {
    const select = document.getElementById('aiModelSelect');
    if (!select) return;
    if (!_config) await _loadConfig();
    _config = {
      ...(_config || {}),
      model: _modelInfo(select.value).id,
    };
    _renderModelSelect();
    _updateContextMeter();
    try {
      const next = await window.__TAURI__.core.invoke('ai_save_config', { config: _config });
      _config = next || _config;
      _hasCodexAuth = !!next?.hasCodexAuth;
      _resolvedCodexPath = next?.resolvedCodexPath || '';
      _renderSettingsState();
      _renderModelSelect();
    } catch (err) {
      toast.show(err?.message || String(err) || 'Could not save Codex model', 'fail', 3000);
    }
  }

  function _setupPanel() {
    document.getElementById('btnToggleAiPanel')?.addEventListener('click', () => togglePanel());
    document.getElementById('aiChatClose')?.addEventListener('click', () => togglePanel(false));
    document.getElementById('aiChatClear')?.addEventListener('click', clearChat);
    document.getElementById('aiChatNew')?.addEventListener('click', _newChat);
    document.getElementById('aiChatSend')?.addEventListener('click', () => {
      if (_busy) cancelChat();
      else sendChat();
    });
    document.getElementById('aiModelSelect')?.addEventListener('change', _saveModelFromPanel);
    document.getElementById('aiSnapshotSelect')?.addEventListener('change', _saveSnapshotFromPanel);
    document.getElementById('aiChatMessages')?.addEventListener('click', (event) => {
      const button = event.target.closest('.ai-code-copy');
      if (!button) return;
      const code = button.closest('.ai-code-block')?.querySelector('.ai-code')?.textContent || '';
      const write = navigator.clipboard?.writeText?.(code);
      if (!write?.then) return;
      write.then(() => {
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 900);
      });
    });
    document.getElementById('aiChatInput')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      sendChat();
    });
  }

  function _syncChatChrome() {
    const header = document.getElementById('aiChatsHeader');
    const body = document.getElementById('aiChatsBody');
    const arrow = document.getElementById('aiChatsArrow');
    const section = header?.closest('.sb-section');
    const panel = document.getElementById('sidebarBottom');
    const expanded = !uiState.aiChatsCollapsed;
    if (!header || !body) return;
    body.hidden = !expanded;
    section?.classList.toggle('is-collapsed', !expanded);
    arrow?.classList.toggle('open', expanded);
    header.setAttribute('aria-expanded', String(expanded));
    if (expanded && panel && !panel.dataset.userResized) {
      const height = Number.parseInt(panel.style.height, 10) || panel.offsetHeight;
      if (height < 240) panel.style.height = '360px';
    }
  }

  function _toggleChatSection() {
    uiState.setAiChatsCollapsed?.(!uiState.aiChatsCollapsed);
    _syncChatChrome();
    const panel = document.getElementById('sidebarBottom');
    if (!panel) return;
    if (!uiState.aiChatsCollapsed && !panel.dataset.userResized) panel.style.height = '360px';
    if (!panel.querySelector('.sb-section:not(.is-collapsed)')) {
      panel.style.height = '';
      delete panel.dataset.userResized;
    }
  }

  function _setupChatTree() {
    const header = document.getElementById('aiChatsHeader');
    if (!header || header.dataset.aiChatsBound) return;
    header.dataset.aiChatsBound = 'true';
    header.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      _toggleChatSection();
    });
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      _toggleChatSection();
    });
    document.getElementById('btnAiChatNew')?.addEventListener('click', (event) => {
      event.stopPropagation();
      _openNewChat({ workspace: _chatFolder() });
    });
    document.getElementById('btnAiChatFolder')?.addEventListener('click', (event) => {
      event.stopPropagation();
      _createChatFolder(_chatFolder());
    });
    _syncChatChrome();
  }

  function _renderSettingsState() {
    const setChecked = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!value;
    };
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    setChecked('aiEnabledToggle', _config?.enabled);
    setChecked('aiDataTreeToggle', _config?.dataTreeContext);
    setValue('aiCodexSandboxSelect', _config?.codexSandbox || 'read-only');
    _renderModelSelect();
  }

  async function saveSettingsFromPanel() {
    const config = {
      enabled: !!document.getElementById('aiEnabledToggle')?.checked,
      model: _modelInfo(_config?.model).id,
      dataTreeContext: !!document.getElementById('aiDataTreeToggle')?.checked,
      inlineSuggestions: false,
      codexPath: null,
      codexSandbox: document.getElementById('aiCodexSandboxSelect')?.value || 'read-only',
    };
    try {
      const next = await window.__TAURI__.core.invoke('ai_save_config', { config });
      _config = next || config;
      _hasCodexAuth = !!next?.hasCodexAuth;
      _resolvedCodexPath = next?.resolvedCodexPath || '';
      _renderSettingsState();
      _syncEditorOptions();
      _renderChat();
      toast.show('Codex settings saved', 'ok', 1600);
    } catch (err) {
      toast.show(err?.message || String(err) || 'Could not save Codex settings', 'fail', 3600);
    }
  }

  async function mountSettings() {
    if (!document.getElementById('aiEnabledToggle')) return;
    await _loadConfig();
    _renderSettingsState();
    document.getElementById('aiSaveBtn')?.addEventListener('click', saveSettingsFromPanel);
  }

  function mountPanel() {
    _setupPanel();
    _setupChatTree();
    if (!_config) _loadConfig().catch(() => {});
    _loadChats();
    eventBus.on('workspace:loaded', () => {
      if (_busy) return;
      _loadChats();
      _renderChat();
    });
    _renderModelSelect();
    _renderSnapshotSelect().catch(() => {});
    _updateContextMeter();
    syncAvailability(_isEditorSurfaceVisible());
    _renderChat();
    _listenToStream().catch(() => {});
  }

  function commandItems() {
    return [
      { label: 'Toggle Codex panel', hint: 'Right sidebar', run: () => togglePanel() },
      { label: 'Codex generate at cursor', hint: 'DataTree aware', run: () => generateAtCursor() },
      {
        label: 'Codex improve selection',
        hint: 'DataTree aware',
        run: () => replaceSelection('improve_selection'),
      },
      {
        label: 'Codex fix selection',
        hint: 'DataTree aware',
        run: () => replaceSelection('fix_selection'),
      },
    ];
  }

  const api = {
    init,
    mountSettings,
    mountPanel,
    togglePanel,
    syncAvailability,
    syncFabOffset,
    syncChatChrome: _syncChatChrome,
    isPathLocked,
    isFileLocked,
    isBusy,
    sendChat,
    generateAtCursor,
    replaceSelection,
    commandItems,
  };
  try {
    globalThis.AiHelper = api;
  } catch {}
  return api;
})();
