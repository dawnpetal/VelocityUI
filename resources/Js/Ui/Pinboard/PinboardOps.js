const PinboardOps = (() => {
  const RUN_OK_FLASH_DURATION = 1000;
  const RUN_FAIL_FLASH_DURATION = 1200;
  const RUN_STATUS_OK_CLEAR_DELAY = 3000;
  const RUN_STATUS_FAIL_CLEAR_DELAY = 4000;
  const ACTIVITY_PULSE_DURATION = 800;
  const EDITOR_TOAST_DURATION = 3000;
  const PIN_TOAST_DURATION = 1800;
  async function run(snippet, showOutput, context) {
    const { snippets, findIdx, onSave } = context;
    const card = document.querySelector(`.pb-card[data-id="${snippet.id}"]`);
    const statusEl = card?.querySelector('.pb-status-bar');
    const runBtn = card?.querySelector('.pb-btn-run');
    if (runBtn) runBtn.classList.add('pb-btn-running');
    if (statusEl) {
      statusEl.textContent = 'Running\u2026';
      statusEl.className = 'pb-status-bar pb-status-running';
    }
    if (showOutput) {
      const panel = document.getElementById('bottomPanel');
      if (panel) {
        panel.classList.add('visible');
        panel.classList.remove('hidden');
      }
    }
    const startTime = Date.now();
    try {
      eventBus.emit('script:executing', {
        filename: snippet.label,
        source: 'pinboard',
      });
      await injector.execute(snippet.code);
      const elapsed = Date.now() - startTime;
      const idx = findIdx(snippet.id);
      if (idx !== -1) {
        snippets[idx].runCount = (snippets[idx].runCount ?? 0) + 1;
        snippets[idx].lastRun = Date.now();
        onSave().catch(() => {});
      }
      if (runBtn) {
        runBtn.classList.remove('pb-btn-running');
        runBtn.classList.add('pb-btn-ok');
        setTimeout(() => runBtn.classList.remove('pb-btn-ok'), RUN_OK_FLASH_DURATION);
      }
      if (statusEl) {
        statusEl.textContent = `OK \u00b7 ${elapsed}ms`;
        statusEl.className = 'pb-status-bar pb-status-ok';
        setTimeout(() => {
          if (statusEl.classList.contains('pb-status-ok')) {
            statusEl.className = 'pb-status-bar';
          }
        }, RUN_STATUS_OK_CLEAR_DELAY);
      }
      toast.show(snippet.label + ' executed', 'ok', 1500);
    } catch (err) {
      if (runBtn) {
        runBtn.classList.remove('pb-btn-running');
        runBtn.classList.add('pb-btn-fail');
        setTimeout(() => runBtn.classList.remove('pb-btn-fail'), RUN_FAIL_FLASH_DURATION);
      }
      if (statusEl) {
        statusEl.textContent = err.message ?? 'Failed';
        statusEl.className = 'pb-status-bar pb-status-fail';
        setTimeout(() => {
          if (statusEl.classList.contains('pb-status-fail')) {
            statusEl.className = 'pb-status-bar';
          }
        }, RUN_STATUS_FAIL_CLEAR_DELAY);
      }
      toast.show(err.message ?? 'Execute failed', 'warn');
    }
  }
  function openInEditor(snippet, context) {
    const { activeEditorIds, onRender } = context;
    const existingTabId = activeEditorIds.get(snippet.id);
    if (existingTabId && state.getFile(existingTabId)) {
      state.setActive(existingTabId);
    } else {
      const tabId = helpers.uid();
      const safeName =
        (snippet.label.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'snippet') + '.lua';
      state.addFile(tabId, safeName, 'pinboard:' + snippet.id, snippet.code);
      state.setActive(tabId);
      activeEditorIds.set(snippet.id, tabId);
    }
    const explorerBtn = document.querySelector('.activity-btn[data-view="explorer"]');
    if (explorerBtn) explorerBtn.click();
    tabs.render();
    eventBus.emit('ui:render-editor');
    onRender();
    toast.show(`Editing "${snippet.label}"`, 'info', EDITOR_TOAST_DURATION);
  }
  function handleEditorSave(fileId, context) {
    const { snippets, activeEditorIds, findIdx, onSave } = context;
    for (const [snippetId, tabId] of activeEditorIds.entries()) {
      if (tabId !== fileId) continue;
      const file = state.getFile(fileId);
      const idx = findIdx(snippetId);
      if (!file || idx === -1) {
        activeEditorIds.delete(snippetId);
        return false;
      }
      snippets[idx].code = file.content;
      onSave().catch(() => {});
      PinboardCard.updatePreview(snippetId, file.content);
      return true;
    }
    return false;
  }
  function handleTabClose(fileId, context) {
    const { activeEditorIds } = context;
    for (const [snippetId, tabId] of activeEditorIds.entries()) {
      if (tabId === fileId) {
        activeEditorIds.delete(snippetId);
        break;
      }
    }
  }
  function isSnippetFile(fileId, context) {
    return Array.from(context.activeEditorIds.values()).includes(fileId);
  }
  function pinFile(node, context) {
    const { snippets, onSave, onRender } = context;
    const file = state.getFile(node.id);
    if (!file) {
      toast.show('File not loaded', 'warn', 1500);
      return;
    }
    const snippet = {
      id: helpers.uid(),
      label: node.name.replace(/\.[^.]+$/, ''),
      tags: [],
      code: file.content ?? '',
      runCount: 0,
      lastRun: null,
      createdAt: Date.now(),
    };
    snippets.unshift(snippet);
    onSave().catch(() => {});
    if (onRender) onRender();
    const activityBtn = document.querySelector('.activity-btn[data-view="pinboard"]');
    if (activityBtn) {
      activityBtn.classList.add('pb-activity-pulse');
      setTimeout(() => activityBtn.classList.remove('pb-activity-pulse'), ACTIVITY_PULSE_DURATION);
    }
    toast.show(`Pinned "${snippet.label}"`, 'ok', PIN_TOAST_DURATION);
  }
  return {
    run,
    openInEditor,
    handleEditorSave,
    handleTabClose,
    isSnippetFile,
    pinFile,
  };
})();
