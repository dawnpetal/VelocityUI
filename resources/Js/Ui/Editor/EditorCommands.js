const EditorCommands = (() => {
  function register(monaco, editorInstance) {
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const id = state.activeFileId;
      if (!id) return;
      const file = state.getFile(id);
      if (file?.deleted) return;
      if (pinboard.isSnippetFile(id)) {
        pinboard.handleEditorSave(id);
        state.markSaved(id);
        tabs.render();
        toast.show('Saved to pinboard', 'ok', 1200);
        return;
      }
      try {
        if (state.previewTabId === id) state.previewTabId = null;
        const saved = await fileManager.save(id);
        if (!saved) return;
        tabs.render();
        eventBus.emit('ui:file-saved', {
          id,
        });
      } catch {
        if (file) {
          file.deleted = true;
          tabs.render();
          eventBus.emit('ui:render-editor');
          toast.show(`${file.name} no longer exists on disk, refresh files`, 'fail', 4000);
        }
      }
    });
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      const id = state.activeFileId;
      if (id) tabs.closeTab(id);
    });
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      document.getElementById('btnExecute')?.click();
    });
    editorInstance.onDidFocusEditorText(() => keyboardManager.setScope('editor'));
    editorInstance.onDidBlurEditorText(() => {
      const active = document.querySelector('.activity-btn.active');
      const view = active?.dataset.view ?? 'explorer';
      keyboardManager.setScope(view);
    });
  }
  return {
    register,
  };
})();
