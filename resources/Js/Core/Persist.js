const persist = (() => {
  const invoke = window.__TAURI__.core.invoke;

  async function saveTreeState(workDir) {
    if (!workDir || !state.roots.length) return;
    const openPaths = [];
    const collect = (node) => {
      if (node?.type === 'folder' && node.open) {
        openPaths.push(node.path);
        node.children?.forEach(collect);
      }
    };
    state.roots.forEach(collect);
    try {
      await invoke('save_tree_state_cmd', {
        workDir,
        state: {
          openPaths: [...new Set(openPaths)],
          activeFile: state.getActive()?.path ?? null,
        },
      });
    } catch {}
  }

  async function loadTreeState(workDir) {
    if (!workDir) return null;
    try {
      return await invoke('load_tree_state_cmd', { workDir });
    } catch {
      return null;
    }
  }

  async function saveTimeline(workDir) {
    if (!workDir) return;
    const histories = {};
    state.files.forEach((f) => {
      const h = timeline.getHistory(f.id);
      if (h?.length) histories[f.path] = h;
    });
    try {
      await invoke('save_timeline_cmd', { workDir, histories });
    } catch {}
  }

  async function loadTimeline(workDir) {
    if (!workDir) return;
    try {
      const data = await invoke('load_timeline_cmd', { workDir });
      if (!data) return;
      state.files.forEach((f) => {
        if (data[f.path]?.length) timeline.restoreHistory(f.id, data[f.path]);
      });
    } catch {}
  }

  async function saveSession(workDir) {
    if (!workDir) return;
    const rootPaths = [...new Set(state.roots.map((root) => root.path).filter(Boolean))];
    const activeFile = state.getActive()?.path ?? null;
    try {
      await invoke('save_session_cmd', {
        data: { workDir, lastFolder: workDir, rootPaths, activeFile },
      });
    } catch {}
  }

  async function loadSession() {
    try {
      return await invoke('load_session_cmd');
    } catch {
      return null;
    }
  }

  async function saveUI(snapshot) {
    if (!snapshot) return;
    try {
      await invoke('save_ui_state_cmd', { state: snapshot });
    } catch {}
  }

  async function loadUI() {
    try {
      return await invoke('load_ui_state_cmd');
    } catch {
      return null;
    }
  }

  return {
    saveTreeState,
    loadTreeState,
    saveTimeline,
    loadTimeline,
    saveSession,
    loadSession,
    saveUI,
    loadUI,
  };
})();
