const updateChecker = (() => {
  const invoke = window.__TAURI__.core.invoke;
  let _busy = false;
  let _busyMessage = '';
  let _staged = null;
  let _lastInfo = null;
  let _lastError = '';

  function _setStatus(msg, type) {
    const el = document.getElementById('aboutUpdateStatus');
    if (!el) return;
    el.textContent = msg;
    el.title = msg || '';
    el.dataset.statusType = type || '';
  }

  function _errorText(err, fallback) {
    if (typeof err === 'string' && err.trim()) return err;
    if (err?.message) return err.message;
    return fallback;
  }

  function _setButton(label, disabled = false) {
    const btn = document.getElementById('btnCheckUpdate');
    if (!btn) return;
    btn.textContent = label || 'Check for updates';
    btn.disabled = disabled;
  }

  function syncAutoUpdateUi() {
    const toggle = document.getElementById('autoUpdateToggle');
    if (toggle) toggle.checked = uiState.autoUpdate !== false;
    _syncManualControls();
  }

  function _manualEls() {
    return {
      row: document.getElementById('manualUpdateRow'),
      hint: document.getElementById('manualUpdateHint'),
      download: document.getElementById('btnManualDownloadUpdate'),
      apply: document.getElementById('btnManualApplyUpdate'),
    };
  }

  function _manualHint(info = _lastInfo) {
    if (_busy) return _busyMessage || 'Working on update...';
    if (_lastError) return _lastError;
    if (_staged) return `v${_staged.version} downloaded and ready to apply`;
    if (!info) return 'Check for updates to enable download';
    if (info.update_available && info.asset_url) return `v${info.latest} available to download`;
    if (info.update_available && info.asset_error)
      return `v${info.latest} available; download metadata unavailable`;
    if (info.update_available) return `v${info.latest} is available from the release page`;
    return `No update available (v${info.current})`;
  }

  function _syncManualControls(info = _lastInfo) {
    const els = _manualEls();
    const manual = uiState.autoUpdate === false;
    if (els.row) els.row.hidden = !manual;
    if (els.hint) els.hint.textContent = _manualHint(info);
    if (els.download) {
      els.download.disabled =
        !manual || _busy || !!_staged || !info?.update_available || !info?.asset_url;
      els.download.title = els.download.disabled
        ? _staged
          ? 'Update already downloaded'
          : info?.asset_error || 'No update available to download'
        : `Download VelocityUI v${info.latest}`;
    }
    if (els.apply) {
      els.apply.disabled = !manual || _busy || !_staged;
      els.apply.textContent = _staged ? `Apply v${_staged.version}` : 'Apply update';
    }
  }

  function _applyInfo(info, showToast = false) {
    _lastError = '';
    _lastInfo = info;
    if (info.update_available) {
      const hasAsset = !!info.asset_url;
      _setStatus(
        hasAsset
          ? `v${info.latest} available`
          : info.asset_error
            ? `v${info.latest} available; download unavailable`
            : `v${info.latest} available (manual)`,
        'update',
      );
      const status = document.getElementById('aboutUpdateStatus');
      if (status && info.asset_error) status.title = info.asset_error;
      _setButton(
        uiState.autoUpdate === false
          ? 'Check for updates'
          : _staged
            ? 'Apply update'
            : hasAsset
              ? 'Download update'
              : 'Check for updates',
        false,
      );
      if (showToast && typeof toast !== 'undefined') {
        toast.show(`Update available: v${info.latest}`, 'update', 10000, {
          label: hasAsset ? 'Download' : 'View release',
        });
      }
    } else {
      _setStatus(`Up to date (v${info.current})`, 'ok');
      _setButton('Check for updates', false);
    }
    _syncManualControls(info);
  }

  async function _populateVersion() {
    try {
      const v = await invoke('get_app_version');
      const el = document.getElementById('aboutVersion');
      if (el) el.textContent = `v${v}`;
    } catch {}
  }

  async function _offerReload(download) {
    _staged = download;
    _setStatus(`v${download.version} ready`, 'ok');
    _setButton('Apply update', false);
    _syncManualControls();
    const choice = await modal.ask(
      'Update Ready',
      `VelocityUI v${helpers.escapeHtml(download.version)} has been downloaded and staged. Reload now to apply it?`,
      ['Reload now', 'Later'],
    );
    if (choice !== 'Reload now') return;
    await applyStagedUpdate();
  }

  async function _downloadAndOffer(options = {}) {
    if (_busy) return;
    const prompt = options.prompt !== false;
    _busy = true;
    _lastError = '';
    _busyMessage = 'Downloading update...';
    _setButton('Downloading...', true);
    _setStatus('Downloading update...', 'loading');
    _syncManualControls();
    try {
      const download = await invoke('download_update');
      _busy = false;
      _busyMessage = '';
      if (prompt) {
        await _offerReload(download);
      } else {
        _staged = download;
        _setStatus(`v${download.version} ready`, 'ok');
        _setButton('Apply update', false);
        _syncManualControls();
        if (typeof toast !== 'undefined') {
          toast.show(`Update downloaded: v${download.version}`, 'success');
        }
      }
    } catch (err) {
      const message = _errorText(err, 'Update download failed');
      _lastError = message;
      _setStatus(message, 'error');
      _setButton('Check for updates', false);
      if (typeof toast !== 'undefined') toast.show(message, 'error');
      _busy = false;
      _busyMessage = '';
    } finally {
      if (_busy) _busy = false;
      _busyMessage = '';
      _syncManualControls();
    }
  }

  async function applyStagedUpdate() {
    if (!_staged?.stagedAppPath || _busy) return;
    _busy = true;
    _lastError = '';
    _busyMessage = 'Applying update...';
    _setButton('Applying...', true);
    _setStatus('Applying update...', 'loading');
    _syncManualControls();
    try {
      await invoke('install_update_and_restart', { stagedAppPath: _staged.stagedAppPath });
    } catch (err) {
      const message = _errorText(err, 'Could not apply update');
      _lastError = message;
      _setStatus(message, 'error');
      _setButton('Apply update', false);
      if (typeof toast !== 'undefined') toast.show(message, 'error');
      _busy = false;
      _busyMessage = '';
      _syncManualControls();
    }
  }

  async function _run(showFeedback = false, options = {}) {
    if (_busy) return;
    _busy = true;
    _lastError = '';
    _busyMessage = 'Checking for updates...';
    if (showFeedback) _setStatus('Checking...', 'loading');
    _syncManualControls();
    try {
      const info = await invoke('check_for_update');
      _busy = false;
      _busyMessage = '';
      _applyInfo(info, true);
      if (info.update_available && info.asset_url && options.download !== false) {
        await _downloadAndOffer({ prompt: true });
      }
    } catch (err) {
      const message = _errorText(err, 'Could not check for updates');
      _lastError = message;
      if (showFeedback) _setStatus(message, 'error');
      _setButton('Check for updates', false);
      if (showFeedback && typeof toast !== 'undefined') toast.show(message, 'error');
      _busy = false;
      _busyMessage = '';
      _syncManualControls();
    } finally {
      if (_busy) _busy = false;
      _busyMessage = '';
      _syncManualControls();
    }
  }

  async function check() {
    await _populateVersion();
    if (uiState.autoUpdate === false) {
      _setStatus('Auto update off', '');
      _setButton('Check for updates', false);
      const cached = await invoke('get_last_update_result').catch(() => null);
      if (cached) _applyInfo(cached, false);
      else _syncManualControls();
      return;
    }
    const cached = await invoke('get_last_update_result').catch(() => null);
    if (cached) {
      _applyInfo(cached, false);
      if (cached.update_available && cached.asset_url) await _downloadAndOffer({ prompt: true });
      return;
    }
    await _run(false, { download: true });
  }

  async function checkManual() {
    await _run(true, { download: uiState.autoUpdate !== false });
  }

  const DISCORD_URL = 'https://discord.gg/opiumware';

  eventBus.on('settings:opened', () => {
    _populateVersion();
    syncAutoUpdateUi();
    invoke('get_last_update_result')
      .then((cached) => {
        if (cached) _applyInfo(cached);
      })
      .catch(() => {});
    const btn = document.getElementById('btnCheckUpdate');
    if (btn && !btn._ucBound) {
      btn._ucBound = true;
      btn.addEventListener('click', async () => {
        if (_staged && uiState.autoUpdate !== false) await applyStagedUpdate();
        else await checkManual();
      });
    }
    const manualDownloadBtn = document.getElementById('btnManualDownloadUpdate');
    if (manualDownloadBtn && !manualDownloadBtn._ucBound) {
      manualDownloadBtn._ucBound = true;
      manualDownloadBtn.addEventListener('click', () => _downloadAndOffer({ prompt: false }));
    }
    const manualApplyBtn = document.getElementById('btnManualApplyUpdate');
    if (manualApplyBtn && !manualApplyBtn._ucBound) {
      manualApplyBtn._ucBound = true;
      manualApplyBtn.addEventListener('click', applyStagedUpdate);
    }
    const discordBtn = document.getElementById('btnDiscord');
    if (discordBtn && !discordBtn._ucBound) {
      discordBtn._ucBound = true;
      discordBtn.addEventListener('click', () => {
        invoke('open_external', { url: DISCORD_URL }).catch(() => {});
      });
    }
  });

  return { check, checkManual, populateVersion: _populateVersion, syncAutoUpdateUi };
})();
