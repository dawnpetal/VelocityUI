const tabs = (() => {
  const SVG_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
  const stripEl = () => document.getElementById('tabStrip');

  function _tabIconEl(filename) {
    const icon = document.createElement('span');
    _updateTabIcon(icon, filename);
    return icon;
  }

  function _updateTabIcon(icon, filename) {
    icon.className = `tab-icon ${helpers.fileIconClass(filename, false, false)}`;
    icon.innerHTML = '';
  }

  function render() {
    const strip = stripEl();
    if (!strip) return;
    const renderedTabs = new Map();
    strip.querySelectorAll('.tab[data-id]').forEach((el) => renderedTabs.set(el.dataset.id, el));
    const toKeep = new Set(state.openTabIds);
    renderedTabs.forEach((el, id) => {
      if (!toKeep.has(id)) el.remove();
    });
    state.openTabIds.forEach((id) => {
      const file = state.getFile(id);
      if (!file) return;
      const isActive = id === state.activeFileId;
      const isDirty = state.isUnsaved(id);
      let tab = renderedTabs.get(id);
      if (!tab) {
        tab = _createTab(id, file);
        strip.appendChild(tab);
      }
      const isPreviewTab = state.previewTabId === id && !isDirty;
      const isDeleted = file.deleted === true;
      tab.className =
        'tab' +
        (isActive ? ' active' : '') +
        (isDirty ? ' modified' : '') +
        (isPreviewTab ? ' preview' : '') +
        (isDeleted ? ' deleted' : '');
      tab.querySelector('.tab-label').textContent = file.name;
      const existingIcon = tab.querySelector('.tab-icon');
      if (existingIcon) _updateTabIcon(existingIcon, file.name);
      if (isActive)
        requestAnimationFrame(() =>
          tab.scrollIntoView({
            inline: 'nearest',
            behavior: 'smooth',
          }),
        );
    });
  }
  function _createTab(id, file) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = id;
    const icon = _tabIconEl(file.name);
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = file.name;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = SVG_CLOSE;
    closeBtn.title = 'Close';
    tab.append(icon, label, closeBtn);
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      state.setActive(id);
      render();
      eventBus.emit('ui:render-editor');
      const activeView = document.querySelector('.activity-btn.active')?.dataset.view;
      if (activeView === 'explorer') {
        ExplorerTree.revealFile(id);
      } else {
        ExplorerTree.render();
      }
    });
    tab.addEventListener('contextmenu', (e) => ctxMenu.showForTab(e, id));
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(id);
      }
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });
    return tab;
  }
  async function closeTab(id) {
    const file = state.getFile(id);
    if (!file) return;
    if (editor.isDiffTab(id)) {
      editor.hideDiff();
      return;
    }
    if (pinboard.isSnippetFile(id)) {
      if (state.isUnsaved(id)) {
        const choice = await modal.ask(
          'Unsaved Snippet',
          `Save changes to <strong>${helpers.escapeHtml(file.name)}</strong> back to pinboard?`,
          ['Save', 'Discard'],
        );
        if (choice === 'Save') pinboard.handleEditorSave(id);
        else state.markSaved(id);
      }
      pinboard.handleTabClose(id);
      editor.destroyTab(id);
      state.closeTab(id);
      state.removeFile(id);
      render();
      eventBus.emit('ui:render-editor');
      return;
    }
    if (state.isUnsaved(id)) {
      const choice = await modal.ask(
        'Unsaved Changes',
        `Save <strong>${helpers.escapeHtml(file.name)}</strong> before closing?`,
        ['Save', 'Discard'],
      );
      if (choice === 'Save') await fileManager.save(id).catch(console.error);
      else state.markSaved(id);
    }
    if (file.path) workspaceHistory.recordTabClose?.(file.path);
    editor.destroyTab(id);
    state.closeTab(id);
    render();
    ExplorerTree.render();
    eventBus.emit('ui:render-editor');
  }
  return {
    render,
    closeTab,
  };
})();
