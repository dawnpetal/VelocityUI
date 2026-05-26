const EditorMount = (() => {
  const MONACO_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs';
  const EDITOR_OPTIONS = (settings) => ({
    value: '',
    language: 'lua',
    fontSize: settings.fontSize,
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
    fontLigatures: true,
    lineNumbers: settings.lineNumbers ? 'on' : 'off',
    minimap: {
      enabled: settings.minimap,
      autohide: true,
      showSlider: 'mouseover',
      renderCharacters: true,
      maxColumn: 120,
    },
    wordWrap: settings.wordWrap ? 'on' : 'off',
    wordWrapColumn: 120,
    wrappingIndent: 'same',
    wrappingStrategy: 'simple',
    renderWhitespace: 'selection',
    renderControlCharacters: false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'off',
    cursorBlinking: 'blink',
    cursorStyle: 'line',
    cursorWidth: 2,
    cursorSurroundingLines: 0,
    bracketPairColorization: {
      enabled: true,
      independentColorPoolPerBracketType: true,
    },
    guides: {
      indentation: true,
      highlightActiveIndentation: true,
      bracketPairs: false,
      bracketPairsHorizontal: false,
    },
    wordBasedSuggestions: 'matchingDocuments',
    wordBasedSuggestionsOnlySameLanguage: true,
    suggestOnTriggerCharacters: true,
    suggestSelection: 'first',
    suggest: {
      insertMode: 'insert',
      filterGraceful: true,
      showKeywords: true,
      showSnippets: true,
      showWords: true,
      showIcons: true,
      showStatusBar: false,
      preview: false,
      previewMode: 'subwordSmart',
      showInlineDetails: true,
      snippetsPreventQuickSuggestions: false,
      selectionMode: 'always',
      localityBonus: true,
      matchOnWordStartOnly: true,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'smart',
    tabCompletion: 'on',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    autoIndent: 'advanced',
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoClosingDelete: 'auto',
    autoClosingOvertype: 'auto',
    autoSurround: 'languageDefined',
    scrollBeyondLastLine: false,
    scrollBeyondLastColumn: 5,
    padding: {
      top: 12,
      bottom: 12,
    },
    automaticLayout: true,
    renderLineHighlight: 'line',
    renderLineHighlightOnlyWhenFocus: false,
    occurrencesHighlight: 'singleFile',
    selectionHighlight: true,
    codeLens: false,
    colorDecorators: true,
    colorDecoratorsActivatedOn: 'clickAndHover',
    folding: true,
    foldingStrategy: 'auto',
    foldingHighlight: true,
    foldingMaximumRegions: 5000,
    showFoldingControls: 'always',
    links: true,
    matchBrackets: 'always',
    find: {
      seedSearchStringFromSelection: 'selection',
      autoFindInSelection: 'multiline',
      addExtraSpaceOnTop: false,
      loop: true,
    },
    contextmenu: false,
    stickyScroll: {
      enabled: false,
    },
    hover: {
      enabled: true,
      delay: 300,
      sticky: true,
      above: false,
    },
    parameterHints: {
      enabled: true,
      cycle: true,
    },
    lightbulb: {
      enabled: 'off',
    },
    inlayHints: {
      enabled: 'off',
    },
    inlineSuggest: {
      enabled: false,
    },
    largeFileOptimizations: true,
    multiCursorModifier: 'alt',
    multiCursorMergeOverlapping: true,
    mouseWheelZoom: false,
    overviewRulerBorder: false,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
    },
  });
  function _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.monaco) {
        resolve(window.monaco);
        return;
      }
      window.MonacoEnvironment = {
        getWorkerUrl: function (_moduleId, label) {
          return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: '${MONACO_CDN}/../' };
            importScripts('${MONACO_CDN}/base/worker/workerMain.js');
          `)}`;
        },
      };
      const script = document.createElement('script');
      script.src = `${MONACO_CDN}/loader.js`;
      script.onload = () => {
        window.require.config({
          paths: {
            vs: MONACO_CDN,
          },
        });
        window.require(['vs/editor/editor.main'], () => {
          resolve(window.monaco);
        });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  async function create(containerEl, settings) {
    const monaco = await _loadScript();
    const luaProvider = LuaLanguage.register(monaco);
    const webProviders = WebLanguages.registerAll(monaco);
    const symbolProviders = new Map([['lua', luaProvider], ...webProviders]);
    EditorTheme.build(monaco);
    const editorInstance = monaco.editor.create(containerEl, {
      ...EDITOR_OPTIONS(settings),
      theme: 'velocityui',
    });
    LuaIntelligence.register(monaco, editorInstance);
    AiHelper.init(monaco, editorInstance).catch(() => {});
    return {
      monaco,
      editorInstance,
      symbolProviders,
    };
  }
  return {
    create,
  };
})();
