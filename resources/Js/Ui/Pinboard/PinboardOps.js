const PinboardOps = (() => {
  const FLASH = 1000;

  async function run(snippet, showOutput, context) {
    const card = document.querySelector(`.pb-card[data-id="${snippet.id}"]`);
    const runBtn = card?.querySelector('.pb-btn-run');

    if (runBtn) runBtn.classList.add('pb-btn-running');
    if (showOutput) {
      const panel = document.getElementById('bottomPanel');
      if (panel) {
        panel.classList.add('visible');
        panel.classList.remove('hidden');
      }
    }

    try {
      eventBus.emit('script:executing', { filename: snippet.label, source: 'pinboard' });
      await injector.execute(snippet.code);
      if (runBtn) {
        runBtn.classList.remove('pb-btn-running');
        runBtn.classList.add('pb-btn-ok');
        setTimeout(() => runBtn.classList.remove('pb-btn-ok'), FLASH);
      }
      toast.show(snippet.label + ' executed', 'ok', 1500);
    } catch (err) {
      if (runBtn) {
        runBtn.classList.remove('pb-btn-running');
        runBtn.classList.add('pb-btn-fail');
        setTimeout(() => runBtn.classList.remove('pb-btn-fail'), FLASH);
      }
      toast.show(err.message ?? 'Execution failed', 'warn');
    }
  }

  function openInEditor(snippet, context) {
    const { activeEditorIds, onRender } = context;
    const existing = activeEditorIds.get(snippet.id);
    if (existing && state.getFile(existing)) {
      state.setActive(existing);
    } else {
      const id = helpers.uid();
      const name = (snippet.label.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'snippet') + '.lua';
      state.addFile(id, name, 'pinboard:' + snippet.id, snippet.code);
      state.setActive(id);
      activeEditorIds.set(snippet.id, id);
    }
    tabs.render();
    eventBus.emit('ui:render-editor');
    onRender();
  }

  function handleEditorSave(fileId, context) {
    for (const [sid, tid] of context.activeEditorIds.entries()) {
      if (tid !== fileId) continue;
      const file = state.getFile(fileId);
      const idx = context.findIdx(sid);
      if (!file || idx === -1) {
        context.activeEditorIds.delete(sid);
        return false;
      }
      context.snippets[idx].code = file.content;
      context.onSave().catch(() => {});
      PinboardCard.updatePreview(sid, file.content);
      return true;
    }
    return false;
  }

  return {
    run,
    openInEditor,
    handleEditorSave,
    handleTabClose: (fid, ctx) => {
      for (const [sid, tid] of ctx.activeEditorIds.entries()) {
        if (tid === fid) {
          ctx.activeEditorIds.delete(sid);
          break;
        }
      }
    },
    isSnippetFile: (fid, ctx) => Array.from(ctx.activeEditorIds.values()).includes(fid),
    pinFile: (node, context) => {
      const file = state.getFile(node.id);
      if (!file) return;
      const snippet = {
        id: helpers.uid(),
        label: node.name.replace(/\.[^.]+$/, ''),
        tags: [],
        code: file.content ?? '',
        createdAt: Date.now(),
      };
      context.snippets.unshift(snippet);
      context.onSave().catch(() => {});
      context.onRender();
    },
  };
})();
