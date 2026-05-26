const EditorModels = (() => {
  const _models = new Map();
  const _viewStates = new Map();
  const _blobUrls = new Map();
  const _lastUsed = new Map();
  let _tick = 0;
  function _touch(fileId) {
    _lastUsed.set(fileId, ++_tick);
  }
  function getOrCreate(monaco, file) {
    _touch(file.id);
    if (_models.has(file.id)) return _models.get(file.id);
    const uri = monaco.Uri.parse(`file:///${file.id}/${file.name}`);
    const model = monaco.editor.createModel(
      file.content,
      LangMap.monacoLang(file.name, file.languageOverride),
      uri,
    );
    model.__velocityuiFileId = file.id;
    model.onWillDispose(() => _models.delete(file.id));
    _models.set(file.id, model);
    return model;
  }
  function saveViewState(fileId, editorInstance) {
    if (fileId && editorInstance?.getModel()) {
      _touch(fileId);
      _viewStates.set(fileId, editorInstance.saveViewState());
    }
  }
  function restoreViewState(fileId, editorInstance) {
    _touch(fileId);
    const saved = _viewStates.get(fileId);
    if (saved) editorInstance.restoreViewState(saved);
  }
  function fileIdForModel(model) {
    return model?.__velocityuiFileId ?? null;
  }
  function discardModel(fileId) {
    const model = _models.get(fileId);
    if (model) {
      model.dispose();
      _models.delete(fileId);
    }
    const blob = _blobUrls.get(fileId);
    if (blob) {
      URL.revokeObjectURL(blob);
      _blobUrls.delete(fileId);
    }
  }
  function destroyTab(fileId) {
    _viewStates.delete(fileId);
    _lastUsed.delete(fileId);
    discardModel(fileId);
  }
  function setBlobUrl(fileId, url) {
    const old = _blobUrls.get(fileId);
    if (old) URL.revokeObjectURL(old);
    _blobUrls.set(fileId, url);
  }
  function getBlobUrl(fileId) {
    return _blobUrls.get(fileId) ?? null;
  }
  function trimCold({
    activeId,
    keep = 14,
    isDirty = () => false,
    canRelease = () => true,
    releasePayload = null,
  } = {}) {
    const candidates = [..._models.keys()].filter(
      (id) => id !== activeId && !isDirty(id) && canRelease(id),
    );
    if (candidates.length <= keep) return;
    candidates.sort((a, b) => (_lastUsed.get(a) ?? 0) - (_lastUsed.get(b) ?? 0));
    for (const id of candidates.slice(0, candidates.length - keep)) {
      discardModel(id);
      releasePayload?.(id);
      _lastUsed.delete(id);
    }
  }
  function destroyAll() {
    const ids = new Set([..._models.keys(), ..._viewStates.keys(), ..._blobUrls.keys()]);
    for (const id of ids) destroyTab(id);
    _viewStates.clear();
  }
  return {
    getOrCreate,
    saveViewState,
    restoreViewState,
    destroyTab,
    setBlobUrl,
    getBlobUrl,
    destroyAll,
    discardModel,
    trimCold,
    fileIdForModel,
  };
})();
