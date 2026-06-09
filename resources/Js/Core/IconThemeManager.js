const iconThemeManager = (() => {
  const invoke = window.__TAURI__.core.invoke;
  const BUILTIN_ID = 'material';

  async function load() {
    await invoke('icon_theme_load');
  }

  async function getActive() {
    return BUILTIN_ID;
  }

  async function getInstalled() {
    return new Set([BUILTIN_ID]);
  }

  function getRegistry() {
    return [];
  }

  async function isInstalled(id) {
    return id === BUILTIN_ID;
  }

  async function isActive(id) {
    return id === BUILTIN_ID;
  }

  function resolveIconDir(id) {
    return 'icons/files/';
  }

  async function activate(id) {
    return false;
  }

  async function loadInstalledIcons(themeId) {
    return null;
  }

  async function install(pack, onProgress) {
    return false;
  }

  async function uninstall(id) {
    return false;
  }

  function renderList() {}

  return {
    load,
    activate,
    install,
    uninstall,
    getActive,
    getInstalled,
    getRegistry,
    isInstalled,
    isActive,
    resolveIconDir,
    loadInstalledIcons,
    renderList,
  };
})();
