const console_ = (() => {
  const outputEl = () => document.getElementById('consoleOutput');
  const robloxOutputEl = () => document.getElementById('robloxOutput');
  const panelEl = () => document.getElementById('bottomPanel');
  const MAX_LINES = 500;
  const _pendingOutput = new Map();
  let _outputFlushRaf = 0;
  function _trimOutput(output) {
    while (output.childElementCount > MAX_LINES) output.firstChild.remove();
  }
  function _queueOutput(output, nodes) {
    if (!output) return;
    const list = _pendingOutput.get(output) ?? [];
    list.push(...nodes);
    _pendingOutput.set(output, list);
    if (_outputFlushRaf) return;
    _outputFlushRaf = requestAnimationFrame(() => {
      _outputFlushRaf = 0;
      for (const [target, queuedNodes] of _pendingOutput) {
        const fragment = document.createDocumentFragment();
        queuedNodes.forEach((node) => fragment.appendChild(node));
        target.appendChild(fragment);
        _trimOutput(target);
        target.scrollTop = target.scrollHeight;
      }
      _pendingOutput.clear();
    });
  }
  function _showPanel() {
    const panel = panelEl();
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('visible');
  }
  let _monitoring = false;
  let _logPath = null;
  let _nativeListenersReady = false;
  let _nativeListenersPromise = null;
  function _parseRichText(raw) {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '\x00LT\x00')
      .replace(/>/g, '\x00GT\x00')
      .replace(/\x00LT\x00(\/?( b|i|u|s))\x00GT\x00/gi, '<$1>')
      .replace(
        /\x00LT\x00font\s+color="(#[0-9a-fA-F]{3,8}|rgb\(\d+,\s*\d+,\s*\d+\)|[a-zA-Z]+)"(?:\s+size="\d+")?(?:\s*\/)?\x00GT\x00/gi,
        (_, c) => `<span style="color:${c}">`,
      )
      .replace(/\x00LT\x00\/font\x00GT\x00/gi, '</span>')
      .replace(/\x00LT\x00[^]*?\x00GT\x00/g, '')
      .replace(/\x00LT\x00/g, '&lt;')
      .replace(/\x00GT\x00/g, '&gt;');
  }
  function _appendLine(output, text, type) {
    if (!output) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.innerHTML = `<span class="log-ts">${helpers.timestamp()}</span><span class="log-text">${helpers.escapeHtml(String(text))}</span>`;
    _queueOutput(output, [line]);
  }
  function _appendRobloxLine({ time, type, channel, message }) {
    const output = robloxOutputEl();
    if (!output) return;
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = time;
    const tag = document.createElement('span');
    tag.className = 'log-channel';
    tag.textContent = channel.replace('FLog::', '');
    const msg = document.createElement('span');
    msg.className = 'log-text';
    msg.innerHTML = _parseRichText(message);
    line.append(ts, tag, msg);
    _queueOutput(output, [line]);
    _showPanel();
  }
  function _appendOutputError(type, headerText, stackLines) {
    const output = outputEl();
    if (!output) return;
    const header = document.createElement('div');
    header.className = `log-line ${type}`;
    header.innerHTML = `<span class="log-ts">${helpers.timestamp()}</span><span class="log-text">${helpers.escapeHtml(headerText)}</span>`;
    const rows = [header];
    for (const sl of stackLines) {
      const row = document.createElement('div');
      row.className = 'log-line log-stack';
      row.innerHTML = `<span class="log-ts"></span><span class="log-text">${helpers.escapeHtml(sl)}</span>`;
      rows.push(row);
    }
    _queueOutput(output, rows);
    _showPanel();
  }
  function log(text, type = 'info') {
    _appendLine(outputEl(), text, type);
    _showPanel();
  }
  function robloxLog(text, type = 'rbx') {
    _appendLine(robloxOutputEl(), text, type);
    _showPanel();
  }
  async function startErrorWatch() {
    await initNativeMonitor().catch(() => {});
    await window.__TAURI__.core.invoke('console_monitor_watch_errors').catch(() => {});
  }
  async function initNativeMonitor() {
    if (_nativeListenersReady) return;
    if (_nativeListenersPromise) return _nativeListenersPromise;
    _nativeListenersPromise = Promise.all([
      window.__TAURI__.event.listen('console-monitor:batch', (event) => {
        if (!_monitoring) return;
        const entries = Array.isArray(event.payload) ? event.payload : [];
        entries.forEach((entry) => {
          if (!entry?.message) return;
          _appendRobloxLine({
            time: entry.time || helpers.timestamp(),
            type: entry.type || 'rbx',
            channel: entry.channel || 'Output',
            message: entry.message,
          });
        });
      }),
      window.__TAURI__.event.listen('console-monitor:script-error', (event) => {
        const payload = event.payload || {};
        _appendOutputError('fail', payload.header || 'Error: Opiumware', payload.stack || []);
      }),
      window.__TAURI__.event.listen('console-monitor:status', (event) => {
        if (event.payload?.path) _logPath = event.payload.path;
      }),
    ])
      .then(() => {
        _nativeListenersReady = true;
      })
      .catch((err) => {
        _nativeListenersPromise = null;
        throw err;
      });
    return _nativeListenersPromise;
  }
  function _updateControls() {
    const start = document.getElementById('btnRbxStart');
    const stop = document.getElementById('btnRbxStop');
    if (start) start.disabled = _monitoring;
    if (stop) stop.disabled = !_monitoring;
  }
  async function startMonitoring() {
    if (_monitoring) return;
    await initNativeMonitor().catch(() => {});
    _monitoring = true;
    _showPanel();
    const robloxTab = document.querySelector('.panel-tab[data-panel="roblox"]');
    if (robloxTab && !robloxTab.classList.contains('active')) robloxTab.click();
    try {
      const status = await window.__TAURI__.core.invoke('console_monitor_set_streaming', {
        enabled: true,
        showRawLogs: false,
      });
      _logPath = status?.path || null;
    } catch (err) {
      robloxLog(`[VelocityUI] Could not start console stream: ${err.message ?? err}`, 'fail');
      toast.show('Failed to start console monitoring', 'fail', 4000);
      _monitoring = false;
      _updateControls();
      return;
    }
    if (!_logPath) {
      robloxLog('[VelocityUI] Console monitor started. Waiting for a Roblox log file...', 'warn');
    } else {
      robloxLog(`[VelocityUI] Watching: ${_logPath.split('/').pop()}`, 'info');
    }
    toast.show('Monitoring started', 'ok', 2000);
    _updateControls();
  }
  function stopMonitoring() {
    window.__TAURI__.core
      .invoke('console_monitor_set_streaming', { enabled: false, showRawLogs: false })
      .catch(() => {});
    _monitoring = false;
    _logPath = null;
    _updateControls();
  }
  return {
    log,
    robloxLog,
    startMonitoring,
    stopMonitoring,
    startErrorWatch,
    initNativeMonitor,
  };
})();
document.addEventListener('DOMContentLoaded', async () => {
  RobloxAPI.init();
  appController.init();
  console_.initNativeMonitor();
  eventBus.on('script:executing', () => console_.startErrorWatch());
  eventBus.on('script:executed', () => console_.startErrorWatch());
});
