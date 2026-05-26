const LuaIntelligence = (() => {
  const KEYWORDS = new Set([
    'and',
    'break',
    'continue',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'goto',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',
  ]);
  const KNOWN_GLOBALS = new Set([
    '_G',
    '_VERSION',
    'assert',
    'bit32',
    'collectgarbage',
    'coroutine',
    'debug',
    'error',
    'game',
    'getfenv',
    'getmetatable',
    'ipairs',
    'io',
    'loadstring',
    'math',
    'next',
    'newproxy',
    'os',
    'pairs',
    'package',
    'pcall',
    'plugin',
    'print',
    'rawequal',
    'rawget',
    'rawlen',
    'rawset',
    'require',
    'script',
    'select',
    'setfenv',
    'setmetatable',
    'shared',
    'string',
    'table',
    'task',
    'tick',
    'time',
    'tonumber',
    'tostring',
    'type',
    'typeof',
    'utf8',
    'unpack',
    'wait',
    'warn',
    'workspace',
    'xpcall',
    'Instance',
    'Vector2',
    'Vector3',
    'CFrame',
    'Color3',
    'BrickColor',
    'UDim',
    'UDim2',
    'Rect',
    'Ray',
    'NumberRange',
    'NumberSequence',
    'NumberSequenceKeypoint',
    'ColorSequence',
    'ColorSequenceKeypoint',
    'PhysicalProperties',
    'Random',
    'DateTime',
    'Enum',
    'RaycastParams',
    'OverlapParams',
    'TweenInfo',
    'Drawing',
    'buffer',
    'vector',
    'request',
    'getgenv',
    'getrenv',
    'getgc',
    'getreg',
    'readfile',
    'writefile',
    'appendfile',
    'isfile',
    'isfolder',
    'makefolder',
    'delfile',
    'delfolder',
    'identifyexecutor',
    'hookfunction',
    'hookmetamethod',
    'newcclosure',
    'getrawmetatable',
    'setrawmetatable',
    'setreadonly',
    'isreadonly',
    'getnamecallmethod',
    'getconnections',
    'firesignal',
    'gcinfo',
    'syn',
    'protect_gui',
    'gethui',
    'spawn',
    'delay',
  ]);
  const BLOCK_OPENERS = new Set(['function', 'do', 'then', 'repeat']);
  const STATEMENT_OPENERS = new Set(['if', 'for', 'while']);
  const VALUE_TYPES = {
    Vector3: {
      p: [
        ['X', 'number'],
        ['Y', 'number'],
        ['Z', 'number'],
        ['Magnitude', 'number'],
        ['Unit', 'Vector3'],
      ],
      m: [
        ['Dot', 'number', '(other: Vector3)'],
        ['Cross', 'Vector3', '(other: Vector3)'],
        ['Lerp', 'Vector3', '(goal: Vector3, alpha: number)'],
        ['FuzzyEq', 'boolean', '(other: Vector3, epsilon: number)'],
      ],
    },
    Vector2: {
      p: [
        ['X', 'number'],
        ['Y', 'number'],
        ['Magnitude', 'number'],
        ['Unit', 'Vector2'],
      ],
      m: [
        ['Dot', 'number', '(other: Vector2)'],
        ['Cross', 'number', '(other: Vector2)'],
        ['Lerp', 'Vector2', '(goal: Vector2, alpha: number)'],
        ['FuzzyEq', 'boolean', '(other: Vector2, epsilon: number)'],
      ],
    },
    CFrame: {
      p: [
        ['Position', 'Vector3'],
        ['LookVector', 'Vector3'],
        ['RightVector', 'Vector3'],
        ['UpVector', 'Vector3'],
        ['X', 'number'],
        ['Y', 'number'],
        ['Z', 'number'],
      ],
      m: [
        ['Inverse', 'CFrame', '()'],
        ['Lerp', 'CFrame', '(goal: CFrame, alpha: number)'],
        ['ToObjectSpace', 'CFrame', '(cf: CFrame)'],
        ['ToWorldSpace', 'CFrame', '(cf: CFrame)'],
        ['PointToObjectSpace', 'Vector3', '(point: Vector3)'],
        ['PointToWorldSpace', 'Vector3', '(point: Vector3)'],
        ['VectorToObjectSpace', 'Vector3', '(vector: Vector3)'],
        ['VectorToWorldSpace', 'Vector3', '(vector: Vector3)'],
      ],
    },
    Color3: {
      p: [
        ['R', 'number'],
        ['G', 'number'],
        ['B', 'number'],
      ],
      m: [
        ['Lerp', 'Color3', '(goal: Color3, alpha: number)'],
        ['ToHSV', '(number, number, number)', '()'],
        ['ToHex', 'string', '()'],
      ],
    },
    UDim2: {
      p: [
        ['X', 'UDim'],
        ['Y', 'UDim'],
      ],
      m: [['Lerp', 'UDim2', '(goal: UDim2, alpha: number)']],
    },
    UDim: {
      p: [
        ['Scale', 'number'],
        ['Offset', 'number'],
      ],
      m: [],
    },
    TweenInfo: {
      p: [
        ['Time', 'number'],
        ['EasingStyle', 'Enum.EasingStyle'],
        ['EasingDirection', 'Enum.EasingDirection'],
        ['RepeatCount', 'number'],
        ['Reverses', 'boolean'],
        ['DelayTime', 'number'],
      ],
      m: [],
    },
    Random: {
      p: [],
      m: [
        ['NextInteger', 'number', '(min: number, max: number)'],
        ['NextNumber', 'number', '(min: number?, max: number?)'],
        ['NextUnitVector', 'Vector3', '()'],
        ['Clone', 'Random', '()'],
      ],
    },
    DateTime: {
      p: [
        ['UnixTimestamp', 'number'],
        ['UnixTimestampMillis', 'number'],
      ],
      m: [
        ['ToIsoDate', 'string', '()'],
        ['ToUniversalTime', 'DateTimeParts', '()'],
        ['ToLocalTime', 'DateTimeParts', '()'],
        ['FormatUniversalTime', 'string', '(format: string, locale: string)'],
        ['FormatLocalTime', 'string', '(format: string, locale: string)'],
      ],
    },
    Drawing: {
      p: [
        ['Visible', 'boolean'],
        ['ZIndex', 'number'],
        ['Transparency', 'number'],
        ['Color', 'Color3'],
        ['Position', 'Vector2'],
        ['Size', 'number'],
        ['Radius', 'number'],
        ['Thickness', 'number'],
        ['Filled', 'boolean'],
        ['Text', 'string'],
        ['Font', 'number'],
        ['Center', 'boolean'],
        ['Outline', 'boolean'],
        ['NumSides', 'number'],
        ['Data', 'string'],
      ],
      m: [
        ['Destroy', '()', '()'],
        ['Remove', '()', '()'],
      ],
    },
  };
  const CACHE = new WeakMap();
  const DIAG_TIMERS = new WeakMap();

  const BACKGROUND_ANALYSIS_MIN_LENGTH = 180_000;
  const BACKGROUND_ANALYSIS_MIN_LINES = 4000;
  const INITIAL_DIAGNOSTIC_DELAY_MS = 0;
  const SYNC_DIAGNOSTIC_DELAY_MS = 140;
  const ASYNC_DIAGNOSTIC_DELAY_MS = 240;
  const VIEWPORT_CONTEXT_BEFORE_LINES = 600;
  const VIEWPORT_CONTEXT_AFTER_LINES = 200;
  let _monaco = null;
  let _editorInstance = null;
  let _documentWorker = null;
  let _viewportWorker = null;
  let _workerPending = new Map();
  let _workerIdCounter = 0;
  const VIEWPORT_TIMERS = new WeakMap();

  function _createWorker() {
    const kwJSON = JSON.stringify([...KEYWORDS]);
    const glJSON = JSON.stringify([...KNOWN_GLOBALS]);

    const src = `
      const KEYWORDS = new Set(${kwJSON});
      const KNOWN_GLOBALS = new Set(${glJSON});
      ${strip.toString()}
      ${_wordAt.toString()}
      ${_buildLineOffsets.toString()}
      ${_offsetFromLineOffsets.toString()}
      ${_lexLua.toString()}
      ${_validateBracketPairs.toString()}
      ${_validateDeclarations.toString()}
      ${_validateAssignmentValues.toString()}
      ${_syntaxBlock.toString()}
      ${_recordSyntaxStatement.toString()}
      ${_insideLoopSinceFunction.toString()}
      ${_nearestOpenBlock.toString()}
      ${_functionParams.toString()}
      const RETURN_CONTINUATION_PREFIX = new Set(${JSON.stringify([
        'and',
        'or',
        '+',
        '-',
        '*',
        '/',
        '//',
        '%',
        '^',
        '..',
        '==',
        '~=',
        '<=',
        '>=',
        '<',
        '>',
        ',',
      ])});
      const RETURN_CONTINUATION_SUFFIX = new Set([...RETURN_CONTINUATION_PREFIX, '(', '[', '{']);
      ${_lineContinuesReturnExpression.toString()}
      ${_returnExpressionEndLine.toString()}
      ${_nextTokenIndex.toString()}
      ${_matchingTokenIndex.toString()}
      ${_nextSiblingBranchToken.toString()}
      ${_isLikelyStatementStart.toString()}
      ${_isStructuralToken.toString()}
      ${_collectFlowDiagnostics.toString()}
      ${_collectDuplicateTableKeyMarkers.toString()}
      ${_validateBlocksAndControlFlow.toString()}
      ${_analyzeSyntax.toString()}
      ${_isTypeAliasStart.toString()}
      ${_isTypeAliasEquals.toString()}
      ${_isMemberSeparator.toString()}
      ${_isTypeToken.toString()}
      ${_typeAnnotationEndIndex.toString()}
      ${_statementEndIndex.toString()}
      ${_inRanges.toString()}
      ${_isDefinitionToken.toString()}
      ${_isNonReferenceName.toString()}
      ${_isKnownGlobal.toString()}
      ${_looksLikeTableKey.toString()}
      ${_buildBraceDepths.toString()}
      ${_insideBraces.toString()}
      ${_looksLikeMethodCall.toString()}
      ${_skipUntil.toString()}
      ${_isAssignmentStart.toString()}
      ${_assignmentEqualsIndex.toString()}
      ${_countTopLevelCommaGroups.toString()}
      ${_assignmentHasOpenArity.toString()}
      ${_bodyStartIndex.toString()}
      ${_scope.toString()}
      ${_defineLocal.toString()}
      ${_resolveDefinition.toString()}
      ${_functionParamTokens.toString()}
      ${_isColonFunction.toString()}
      ${_loopVariableTokens.toString()}
      ${_localVariableTokens.toString()}
      ${_collectLuauTypeInfo.toString()}
      ${_collectScopeDiagnostics.toString()}
      ${_collectAssignmentDiagnostics.toString()}
      ${_collectEmptyBlockDiagnostics.toString()}
      ${_collectLiteralBranchDiagnostics.toString()}
      ${_analyzeSemantics.toString()}
      ${_splitParams.toString()}
      ${_methodSignature.toString()}
      ${_memberParameters.toString()}
      ${_tableFieldDetail.toString()}
      ${_tableFieldRaw.toString()}
      ${_parseTableFieldsRaw.toString()}
      ${_findMatchingBrace.toString()}
      ${_findFunctionEndOffset.toString()}
      ${_docFieldType.toString()}
      ${_docFunctionSignature.toString()}
      ${_offsetToPos.toString()}
      ${_collectSymbolsRaw.toString()}
      ${_collectTableMembersRaw.toString()}
      ${_collectObjectMembersRaw.toString()}
      ${_collectSelfMembersRaw.toString()}
      ${_collectDocClassMembersRaw.toString()}
      ${_modernLuauHintsRaw.toString()}

      self.onmessage = function(e) {
        const { id, text } = e.data;
        try {
          const stripped = strip(text);
          const lineOffsets = _buildLineOffsets(text);
          const syntax = _analyzeSyntax(text);
          const syntaxBlocks = syntax.blocks.map(function(b) {
            return { kind: b.kind, loop: b.loop, vararg: b.vararg, statements: b.statements,
              openerStart: b.opener ? b.opener.start : null, openerEnd: b.opener ? b.opener.end : null,
              closerStart: b.closer ? b.closer.start : null, closerEnd: b.closer ? b.closer.end : null };
          });
          self.postMessage({
            id,
            ok: true,
            phase: 'syntax',
            stripped,
            lineOffsets,
            syntaxMarkers: syntax.markers,
            syntaxTokens: syntax.tokens,
            syntaxBlocks,
          });
          const rawSymbols = _collectSymbolsRaw(stripped, lineOffsets);
          const rawTableMembers = _collectTableMembersRaw(text, stripped, lineOffsets);
          const rawObjectMembers = _collectObjectMembersRaw(stripped, lineOffsets);
          _collectSelfMembersRaw(stripped, lineOffsets, rawObjectMembers);
          _collectDocClassMembersRaw(text, lineOffsets, rawObjectMembers);
          self.postMessage({
            id,
            ok: true,
            phase: 'structure',
            stripped,
            lineOffsets,
            syntaxMarkers: syntax.markers,
            syntaxTokens: syntax.tokens,
            syntaxBlocks,
            rawSymbols,
            rawTableMembers,
            rawObjectMembers,
          });
          const semantics = _analyzeSemantics(text, syntax);
          self.postMessage({
            id,
            ok: true,
            phase: 'done',
            stripped,
            lineOffsets,
            syntaxMarkers: syntax.markers,
            syntaxTokens: syntax.tokens,
            syntaxBlocks,
            semanticMarkers: semantics.markers.concat(_modernLuauHintsRaw(stripped)),
            rawSymbols,
            rawTableMembers,
            rawObjectMembers,
          });
        } catch(err) {
          self.postMessage({ id, ok: false, error: err.message });
        }
      };
    `;
    const blob = new Blob([src], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = function (e) {
      const { id, ok, error, phase, ...result } = e.data;
      const pending = _workerPending.get(id);
      if (!pending) return;
      if (!ok) {
        _workerPending.delete(id);
        pending.reject(new Error(error));
        return;
      }
      if (phase !== 'done') {
        pending.onPhase?.(phase, result);
        return;
      }
      _workerPending.delete(id);
      pending.resolve(result);
    };
    worker.onerror = function (e) {
      for (const [, pending] of _workerPending) pending.reject(e);
      _workerPending.clear();
      if (_documentWorker === worker) _documentWorker = null;
      if (_viewportWorker === worker) _viewportWorker = null;
    };
    return worker;
  }

  function _getDocumentWorker() {
    if (!_documentWorker) _documentWorker = _createWorker();
    return _documentWorker;
  }

  function _getViewportWorker() {
    if (!_viewportWorker) _viewportWorker = _createWorker();
    return _viewportWorker;
  }

  function _analyzeInWorker(text, onPhase) {
    return new Promise(function (resolve, reject) {
      const id = ++_workerIdCounter;
      _workerPending.set(id, { resolve, reject, onPhase });
      _getDocumentWorker().postMessage({ id, text });
    });
  }

  function _analyzeViewportInWorker(text) {
    return new Promise(function (resolve, reject) {
      const id = ++_workerIdCounter;
      _workerPending.set(id, { resolve, reject });
      _getViewportWorker().postMessage({ id, text });
    });
  }

  function register(monaco, editorInstance) {
    _monaco = monaco;
    _editorInstance = editorInstance;
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.', ':'],
      provideCompletionItems(model, position) {
        const intelligence = analyze(model);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const context = _memberContext(model, position);
        if (context) return { suggestions: _memberSuggestions(context, range) };
        if (_isMemberAccess(model, position)) return { suggestions: [] };
        return { suggestions: _scopeSuggestions(intelligence, position, range, model) };
      },
    });

    monaco.languages.registerHoverProvider('lua', {
      provideHover(model, position) {
        const member = memberAt(model, position);
        if (member) {
          return {
            range: member.range,
            contents: [
              { value: '```lua\n' + _memberDisplaySignature(member) + '\n```' },
              { value: _memberDoc(member) },
            ],
          };
        }
        const sym = symbolAt(model, position);
        if (!sym) return null;
        return {
          range: sym.range,
          contents: [
            { value: '```lua\n' + _symbolSignature(sym) + '\n```' },
            { value: sym.detail || _symbolDoc(sym) },
          ],
        };
      },
    });

    monaco.languages.registerSignatureHelpProvider('lua', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp(model, position) {
        const call = _activeCall(model, position);
        if (!call) return null;
        const member = _resolveCallableMember(call.expr, model, position);
        if (!member) return null;
        const params = _memberParameters(member);
        return {
          value: {
            signatures: [
              {
                label: _memberDisplaySignature(member),
                documentation: _memberDoc(member),
                parameters: params.map((label) => ({ label })),
              },
            ],
            activeSignature: 0,
            activeParameter: Math.min(call.activeParameter, Math.max(0, params.length - 1)),
          },
          dispose() {},
        };
      },
    });

    monaco.languages.registerDefinitionProvider('lua', {
      provideDefinition(model, position) {
        const member = memberAt(model, position);
        if (member) {
          const target = _memberDefinitionTarget(member, model);
          if (target) return target;
        }
        const sym = symbolAt(model, position);
        if (!sym) return null;
        return {
          uri: model.uri,
          range: sym.range,
        };
      },
    });

    monaco.languages.registerReferenceProvider('lua', {
      provideReferences(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return [];
        const sym = symbolAt(model, position);
        if (!sym && !KNOWN_GLOBALS.has(word.word)) return [];
        return sym ? _symbolLocations(model, sym) : _wordLocations(model, word.word);
      },
    });

    monaco.languages.registerRenameProvider?.('lua', {
      prepareRename(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word || KEYWORDS.has(word.word) || KNOWN_GLOBALS.has(word.word))
          throw new Error('This symbol cannot be renamed.');
        const sym = symbolAt(model, position);
        if (!sym) throw new Error('No renameable symbol found.');
        return sym.range;
      },
      provideRenameEdits(model, position, newName) {
        if (!/^[A-Za-z_]\w*$/.test(newName) || KEYWORDS.has(newName))
          return { edits: [], rejectReason: 'Invalid Luau identifier.' };
        const word = model.getWordAtPosition(position);
        const sym = word ? symbolAt(model, position) : null;
        if (!word || !sym || KEYWORDS.has(word.word) || KNOWN_GLOBALS.has(word.word))
          return { edits: [], rejectReason: 'No renameable symbol found.' };
        return {
          edits: _symbolLocations(model, sym).map((loc) => ({
            resource: model.uri,
            edit: { range: loc.range, text: newName },
          })),
        };
      },
    });

    monaco.languages.registerDocumentHighlightProvider('lua', {
      provideDocumentHighlights(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return [];
        return _wordLocations(model, word.word).map((loc) => ({
          range: loc.range,
          kind: monaco.languages.DocumentHighlightKind.Text,
        }));
      },
    });

    monaco.languages.registerCodeActionProvider('lua', {
      provideCodeActions(model, range) {
        const line = model.getLineContent(range.startLineNumber);
        const actions = [];
        const fixes = [
          ['wait', 'task.wait'],
          ['spawn', 'task.spawn'],
          ['delay', 'task.delay'],
        ];
        for (const [oldName, newName] of fixes) {
          const re = new RegExp('\\b' + oldName + '\\s*\\(');
          const m = line.match(re);
          if (!m) continue;
          const col = line.indexOf(oldName) + 1;
          actions.push({
            title: `Replace ${oldName} with ${newName}`,
            kind: 'quickfix',
            diagnostics: [],
            edit: {
              edits: [
                {
                  resource: model.uri,
                  edit: {
                    range: new monaco.Range(
                      range.startLineNumber,
                      col,
                      range.startLineNumber,
                      col + oldName.length,
                    ),
                    text: newName,
                  },
                },
              ],
            },
          });
        }
        return { actions, dispose() {} };
      },
    });

    for (const model of monaco.editor.getModels()) _wireModel(model);
    monaco.editor.onDidCreateModel(_wireModel);
    editorInstance?.onDidChangeModel(() => {
      const model = editorInstance.getModel();
      _scheduleViewportDiagnostics(model, true);
      _scheduleDiagnostics(model, true);
    });
    editorInstance?.onDidScrollChange(() =>
      _scheduleViewportDiagnostics(editorInstance.getModel()),
    );
    _scheduleDiagnostics(editorInstance?.getModel?.(), true);
    _scheduleViewportDiagnostics(editorInstance?.getModel?.(), true);
  }

  function _wireModel(model) {
    if (model.getLanguageId() !== 'lua') return;
    _scheduleDiagnostics(model, true);
    model.onDidChangeContent(() => {
      _scheduleViewportDiagnostics(model);
      _scheduleDiagnostics(model);
    });
  }

  function _scheduleDiagnostics(model, immediate = false) {
    if (!model || model.isDisposed?.()) return;
    const oldTimer = DIAG_TIMERS.get(model);
    if (oldTimer) clearTimeout(oldTimer);
    const delay = immediate
      ? INITIAL_DIAGNOSTIC_DELAY_MS
      : _shouldUseBackgroundAnalysis(model)
        ? ASYNC_DIAGNOSTIC_DELAY_MS
        : SYNC_DIAGNOSTIC_DELAY_MS;
    DIAG_TIMERS.set(
      model,
      setTimeout(() => {
        DIAG_TIMERS.delete(model);
        _runDiagnostics(model);
      }, delay),
    );
  }

  async function _runDiagnostics(model) {
    if (!model || model.isDisposed?.() || model.getLanguageId() !== 'lua') return;

    if (!_shouldUseBackgroundAnalysis(model)) {
      const info = analyze(model, true);
      _monaco.editor.setModelMarkers(model, 'velocityui-luau', info.markers);
      return;
    }

    const text = model.getValue();
    const version = model.getVersionId();
    let workerResult;
    try {
      workerResult = await _analyzeInWorker(text, (phase, result) => {
        if (model.isDisposed?.() || model.getVersionId() !== version) return;
        if (phase === 'syntax') _applyAsyncSyntaxPhase(model, version, result);
        if (phase === 'structure') _applyAsyncStructurePhase(model, version, result);
      });
    } catch (err) {
      console.warn('[LuaIntelligence] worker error, falling back to inline analysis', err);
      if (model.isDisposed?.() || model.getVersionId() !== version) return;
      const info = _analyzeSynchronously(model, true);
      _monaco.editor.setModelMarkers(model, 'velocityui-luau', info.markers);
      return;
    }
    if (model.isDisposed?.() || model.getVersionId() !== version) return;

    _applyAsyncSemanticPhase(model, version, workerResult);
  }

  function _scheduleViewportDiagnostics(model, immediate = false) {
    if (
      !model ||
      model.isDisposed?.() ||
      model.getLanguageId() !== 'lua' ||
      !_shouldUseBackgroundAnalysis(model)
    )
      return;
    const oldTimer = VIEWPORT_TIMERS.get(model);
    if (oldTimer) clearTimeout(oldTimer);
    VIEWPORT_TIMERS.set(
      model,
      setTimeout(
        () => {
          VIEWPORT_TIMERS.delete(model);
          _runViewportDiagnostics(model);
        },
        immediate ? 0 : 100,
      ),
    );
  }

  async function _runViewportDiagnostics(model) {
    if (
      !model ||
      model.isDisposed?.() ||
      model.getLanguageId() !== 'lua' ||
      !_shouldUseBackgroundAnalysis(model)
    )
      return;
    const existing = CACHE.get(model);
    if (existing?.version === model.getVersionId() && existing.info._documentComplete) return;
    const visible = _visibleModelRange(model);
    if (!visible) return;

    const contextStartLine = Math.max(1, visible.startLineNumber - VIEWPORT_CONTEXT_BEFORE_LINES);
    const contextEndLine = Math.min(
      model.getLineCount(),
      visible.endLineNumber + VIEWPORT_CONTEXT_AFTER_LINES,
    );
    const sliceRange = new _monaco.Range(
      contextStartLine,
      1,
      contextEndLine,
      model.getLineMaxColumn(contextEndLine),
    );
    const slice = model.getValueInRange(sliceRange);
    const baseOffset = model.getOffsetAt({ lineNumber: contextStartLine, column: 1 });
    const version = model.getVersionId();
    let result;
    try {
      result = await _analyzeViewportInWorker(slice);
    } catch (err) {
      console.warn('[LuaIntelligence] viewport worker error', err);
      return;
    }
    if (model.isDisposed?.() || model.getVersionId() !== version) return;

    const markers = _viewportMarkers(model, result, baseOffset, visible);
    const cached = CACHE.get(model);
    if (cached?.version === version && cached.info._documentComplete) return;
    if (!cached || cached.version !== version) {
      CACHE.set(model, {
        version,
        info: _viewportInfo(model, result, baseOffset, markers),
      });
    }
    _monaco.editor.setModelMarkers(model, 'velocityui-luau', markers);
  }

  function _visibleModelRange(model) {
    const ranges = _editorInstance?.getVisibleRanges?.() || [];
    if (_editorInstance?.getModel?.() !== model || !ranges.length) return null;
    return ranges.reduce(
      (acc, range) => ({
        startLineNumber: Math.min(acc.startLineNumber, range.startLineNumber),
        endLineNumber: Math.max(acc.endLineNumber, range.endLineNumber),
      }),
      {
        startLineNumber: ranges[0].startLineNumber,
        endLineNumber: ranges[0].endLineNumber,
      },
    );
  }

  function _viewportMarkers(model, result, baseOffset, visible) {
    const safe = [...(result.semanticMarkers || [])]
      .filter((item) => _isSafeViewportMarker(item))
      .map((item) => ({
        ...item,
        start: item.start + baseOffset,
        end: item.end + baseOffset,
      }))
      .filter((item) => {
        const pos = model.getPositionAt(item.start);
        return pos.lineNumber >= visible.startLineNumber && pos.lineNumber <= visible.endLineNumber;
      });
    return _rawMarkers(model, safe);
  }

  function _isSafeViewportMarker(item) {
    return (
      /already defined in this scope\.$/.test(item.message) ||
      /^Assignment has \d+ variables? but \d+ values?\.$/.test(item.message) ||
      /^Duplicate table field /.test(item.message)
    );
  }

  function _viewportInfo(model, result, baseOffset, markers) {
    const shiftedSymbols = (result.rawSymbols || []).map((symbol) => ({
      ...symbol,
      offset: symbol.offset + baseOffset,
    }));
    const shiftedTables = _shiftRawTableMembers(result.rawTableMembers || {}, baseOffset);
    const shiftedObjects = _shiftRawObjectMembers(result.rawObjectMembers || {}, baseOffset);
    const symbols = [];
    const byName = new Map();
    const tableMembers = new Map();
    const objectMembers = new Map();
    _rehydrateViewportSymbols(model, shiftedSymbols, symbols, byName);
    _rehydrateViewportTableMembers(model, shiftedTables, tableMembers);
    _rehydrateViewportObjectMembers(model, shiftedObjects, objectMembers);
    return {
      symbols,
      byName,
      tableMembers,
      objectMembers,
      syntax: { tokens: [], markers: [], blocks: [] },
      semantics: { markers: [], definitions: [], references: [], typeRanges: [] },
      folds: [],
      markers,
      _viewportOnly: true,
      _documentComplete: false,
    };
  }

  function _applyAsyncSyntaxPhase(model, version, workerResult) {
    const previousEntry = CACHE.get(model);
    const previous = previousEntry?.version === version ? previousEntry.info : null;
    const markers = [
      ..._rawMarkers(model, workerResult.syntaxMarkers),
      ...(previous?._viewportOnly ? previous.markers : []),
    ];
    _monaco.editor.setModelMarkers(model, 'velocityui-luau', markers);

    CACHE.set(model, {
      version,
      info: {
        ...(previous || _emptyInfo()),
        syntax: {
          tokens: workerResult.syntaxTokens,
          markers: workerResult.syntaxMarkers,
          blocks: workerResult.syntaxBlocks,
        },
        semantics: previous?.semantics || {
          markers: [],
          definitions: [],
          references: [],
          typeRanges: [],
        },
        markers,
        _partial: !!previous?._partial,
        _workerResult: previous?._workerResult || null,
        _documentComplete: false,
      },
    });
  }

  function _applyAsyncStructurePhase(model, version, workerResult) {
    const previousEntry = CACHE.get(model);
    const previous = previousEntry?.version === version ? previousEntry.info : null;
    const markers = [
      ..._rawMarkers(model, workerResult.syntaxMarkers),
      ...(previous?._viewportOnly ? previous.markers : []),
    ];
    _monaco.editor.setModelMarkers(model, 'velocityui-luau', markers);
    CACHE.set(model, {
      version,
      info: {
        symbols: [],
        byName: new Map(),
        tableMembers: new Map(),
        objectMembers: new Map(),
        syntax: {
          tokens: workerResult.syntaxTokens,
          markers: workerResult.syntaxMarkers,
          blocks: workerResult.syntaxBlocks,
        },
        semantics: { markers: [], definitions: [], references: [], typeRanges: [] },
        folds: [],
        markers,
        _partial: true,
        _workerResult: workerResult,
        _documentComplete: false,
      },
    });
  }

  function _applyAsyncSemanticPhase(model, version, workerResult) {
    const markers = _rawMarkers(model, [
      ...workerResult.syntaxMarkers,
      ...workerResult.semanticMarkers,
    ]);
    _monaco.editor.setModelMarkers(model, 'velocityui-luau', markers);

    const previousEntry = CACHE.get(model);
    const previous = previousEntry?.version === version ? previousEntry.info : null;
    const hasCurrentStructure = !!previous && !previous._partial;
    CACHE.set(model, {
      version,
      info: {
        symbols: hasCurrentStructure ? previous.symbols : [],
        byName: hasCurrentStructure ? previous.byName : new Map(),
        tableMembers: hasCurrentStructure ? previous.tableMembers : new Map(),
        objectMembers: hasCurrentStructure ? previous.objectMembers : new Map(),
        syntax: {
          tokens: workerResult.syntaxTokens,
          markers: workerResult.syntaxMarkers,
          blocks: workerResult.syntaxBlocks,
        },
        semantics: {
          markers: workerResult.semanticMarkers,
          definitions: [],
          references: [],
          typeRanges: [],
        },
        folds: [],
        markers,
        _partial: !hasCurrentStructure,
        _workerResult: hasCurrentStructure ? null : workerResult,
        _documentComplete: true,
      },
    });
  }

  function _rawMarkers(model, rawMarkers) {
    return rawMarkers.map((item) =>
      _markerFromOffsets(model, item.start, item.end, item.message, item.severity),
    );
  }

  function analyze(model, force = false) {
    if (!model || model.isDisposed?.()) return _emptyInfo();

    if (_shouldUseBackgroundAnalysis(model)) {
      const cached = CACHE.get(model);
      if (!cached) return _emptyInfo();
      if (cached.info._partial) _fillPartialCache(cached.info);
      return cached.info;
    }

    return _analyzeSynchronously(model, force);
  }

  function _analyzeSynchronously(model, force = false) {
    const cached = CACHE.get(model);
    const version = model.getVersionId();
    if (!force && cached?.version === version) {
      if (cached.info._partial) _fillPartialCache(cached.info);
      return cached.info;
    }

    const text = model.getValue();
    const stripped = strip(text);
    const syntax = _analyzeSyntax(text);
    const semantics = _analyzeSemantics(text, syntax);
    const symbols = [];
    const byName = new Map();
    const tableMembers = new Map();
    const objectMembers = new Map();
    const markers = [];
    _collectSymbols(model, stripped, symbols, byName);
    _collectTableMembers(model, text, stripped, tableMembers);
    _collectObjectMembers(model, stripped, objectMembers);
    _collectSelfMembers(model, stripped, objectMembers);
    _collectDocClassMembers(model, text, objectMembers);
    _collectSyntaxDiagnostics(model, text, syntax, markers);
    _collectSemanticDiagnostics(model, semantics, markers);
    _collectDiagnostics(model, stripped, symbols, byName, markers);
    const info = {
      symbols,
      byName,
      tableMembers,
      objectMembers,
      syntax,
      semantics,
      folds: [],
      markers,
      _documentComplete: true,
    };
    CACHE.set(model, { version, info });
    return info;
  }

  function _fillPartialCache(info) {
    const wr = info._workerResult;
    if (!wr) return;
    _rehydrateSymbols(wr.rawSymbols, wr.lineOffsets, null, info.symbols, info.byName);
    _rehydrateTableMembers(wr.rawTableMembers, wr.lineOffsets, info.tableMembers);
    _rehydrateObjectMembers(wr.rawObjectMembers, wr.lineOffsets, info.objectMembers);
    info._partial = false;
    info._workerResult = null;
  }

  function _emptyInfo() {
    return {
      symbols: [],
      byName: new Map(),
      tableMembers: new Map(),
      objectMembers: new Map(),
      syntax: { tokens: [], markers: [], blocks: [] },
      semantics: { markers: [], definitions: [], references: [], typeRanges: [] },
      folds: [],
      markers: [],
      _documentComplete: false,
    };
  }

  function _shouldUseBackgroundAnalysis(model) {
    if (!model || model.isDisposed?.()) return true;
    const length = Number(model.getValueLength?.() ?? 0);
    return (
      length > BACKGROUND_ANALYSIS_MIN_LENGTH ||
      model.getLineCount() > BACKGROUND_ANALYSIS_MIN_LINES
    );
  }

  function strip(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '-' && next === '-') {
        const longCommentOpen = text.slice(i).match(/^--\[(=*)\[/);
        if (longCommentOpen) {
          const close = `]${longCommentOpen[1]}]`;
          out += ' '.repeat(longCommentOpen[0].length);
          i += longCommentOpen[0].length;
          while (i < text.length && text.slice(i, i + close.length) !== close) {
            out += text[i] === '\n' ? '\n' : ' ';
            i++;
          }
          if (i < text.length) {
            out += ' '.repeat(close.length);
            i += close.length - 1;
          }
        } else {
          out += '  ';
          i += 2;
          while (i < text.length && text[i] !== '\n') {
            out += ' ';
            i++;
          }
          if (i < text.length) out += '\n';
        }
        continue;
      }
      if (ch === '/' && next === '*') {
        out += '  ';
        i += 2;
        while (i < text.length && text.slice(i, i + 2) !== '*/') {
          out += text[i] === '\n' ? '\n' : ' ';
          i++;
        }
        if (i < text.length) {
          out += '  ';
          i++;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        out += ' ';
        i++;
        while (i < text.length) {
          if (text[i] === '\\') {
            out += ' ';
            i++;
            if (i < text.length) out += text[i] === '\n' ? '\n' : ' ';
          } else if (text[i] === quote) {
            out += ' ';
            break;
          } else {
            out += text[i] === '\n' ? '\n' : ' ';
          }
          i++;
        }
        continue;
      }
      const longStringOpen = text.slice(i).match(/^\[(=*)\[/);
      if (longStringOpen) {
        const close = `]${longStringOpen[1]}]`;
        out += ' '.repeat(longStringOpen[0].length);
        i += longStringOpen[0].length;
        while (i < text.length && text.slice(i, i + close.length) !== close) {
          out += text[i] === '\n' ? '\n' : ' ';
          i++;
        }
        if (i < text.length) {
          out += ' '.repeat(close.length);
          i += close.length - 1;
        }
        continue;
      }
      out += ch;
    }
    return out;
  }

  function _collectSymbols(model, stripped, symbols, byName) {
    const patterns = [
      { re: /\blocal\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g, kind: 'function', local: true },
      { re: /\bfunction\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(([^)]*)\)/g, kind: 'function' },
      {
        re: /\blocal\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?::\s*([A-Za-z_]\w*))?\s*(?:=|$)/g,
        kind: 'variable',
        local: true,
      },
      {
        re: /\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:=|in)\b/g,
        kind: 'variable',
        local: true,
      },
    ];
    for (const pat of patterns) {
      let match;
      while ((match = pat.re.exec(stripped))) {
        if (pat.kind === 'variable') {
          const names = match[1]
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean);
          for (const name of names)
            _pushSymbol(
              model,
              stripped,
              symbols,
              byName,
              name,
              match.index + match[0].indexOf(name),
              pat.kind,
              match[2] || '',
              pat.local,
            );
        } else {
          _pushSymbol(
            model,
            stripped,
            symbols,
            byName,
            match[1],
            match.index + match[0].indexOf(match[1]),
            pat.kind,
            match[2] || '',
            pat.local,
          );
          const params = (match[2] || '')
            .split(',')
            .map((p) => p.trim().replace(/:.*/, ''))
            .filter(Boolean);
          const bodyStart = model.getPositionAt(match.index).lineNumber;
          for (const param of params)
            if (param !== '...')
              _pushSymbol(
                model,
                stripped,
                symbols,
                byName,
                param,
                match.index + match[0].lastIndexOf(param),
                'parameter',
                '',
                true,
                bodyStart,
              );
        }
      }
    }
  }

  function _buildLineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
  }

  function _offsetToPos(lineOffsets, offset) {
    let lo = 0,
      hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { lineNumber: lo + 1, column: offset - lineOffsets[lo] + 1 };
  }

  function _rehydrateRange(raw, model) {
    if (raw.range) return raw.range;
    const pos = model.getPositionAt(raw.offset);
    raw.range = new _monaco.Range(
      pos.lineNumber,
      pos.column,
      pos.lineNumber,
      pos.column + raw.nameLength,
    );
    raw.line = pos.lineNumber;
    raw.scopeLine =
      raw._scopeOffset != null ? model.getPositionAt(raw._scopeOffset).lineNumber : pos.lineNumber;
    return raw.range;
  }

  function _shiftRawTableMembers(rawTableMembers, baseOffset) {
    const shifted = {};
    for (const [name, records] of Object.entries(rawTableMembers)) {
      shifted[name] = records.map((record) => ({
        ...record,
        offset: record.offset + baseOffset,
        closeOffset: record.closeOffset + baseOffset,
        members: record.members.map((member) => ({
          ...member,
          offset: member.offset + baseOffset,
        })),
      }));
    }
    return shifted;
  }

  function _shiftRawObjectMembers(rawObjectMembers, baseOffset) {
    const shifted = {};
    for (const [owner, members] of Object.entries(rawObjectMembers)) {
      shifted[owner] = members.map((member) => ({
        ...member,
        offset: member.offset + baseOffset,
      }));
    }
    return shifted;
  }

  function _rangeAtOffset(model, offset, length) {
    const pos = model.getPositionAt(offset);
    return new _monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + length);
  }

  function _rehydrateViewportSymbols(model, rawSymbols, symbols, byName) {
    for (const raw of rawSymbols) {
      const pos = model.getPositionAt(raw.offset);
      const symbol = {
        ...raw,
        line: pos.lineNumber,
        scopeLine: pos.lineNumber,
        range: _rangeAtOffset(model, raw.offset, raw.nameLength),
      };
      symbols.push(symbol);
      if (!byName.has(symbol.name)) byName.set(symbol.name, []);
      byName.get(symbol.name).push(symbol);
    }
  }

  function _rehydrateViewportTableMembers(model, rawTableMembers, tableMembers) {
    for (const [name, records] of Object.entries(rawTableMembers)) {
      tableMembers.set(
        name,
        records.map((record) => ({
          ...record,
          members: record.members.map((member) => ({
            ...member,
            range: _rangeAtOffset(model, member.offset, member.nameLength),
          })),
        })),
      );
    }
  }

  function _rehydrateViewportObjectMembers(model, rawObjectMembers, objectMembers) {
    for (const [owner, members] of Object.entries(rawObjectMembers)) {
      objectMembers.set(
        owner,
        members.map((member) => ({
          ...member,
          range: _rangeAtOffset(model, member.offset, member.nameLength),
        })),
      );
    }
  }

  function _collectSymbolsRaw(stripped, lineOffsets) {
    const patterns = [
      { re: /\blocal\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g, kind: 'function', local: true },
      { re: /\bfunction\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*\(([^)]*)\)/g, kind: 'function' },
      {
        re: /\blocal\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?::\s*([A-Za-z_]\w*))?\s*(?:=|$)/g,
        kind: 'variable',
        local: true,
      },
      {
        re: /\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:=|in)\b/g,
        kind: 'variable',
        local: true,
      },
    ];
    const rawSymbols = [];
    for (const pat of patterns) {
      let match;
      while ((match = pat.re.exec(stripped))) {
        if (pat.kind === 'variable') {
          const names = match[1]
            .split(',')
            .map((n) => n.trim())
            .filter(Boolean);
          for (const name of names) {
            if (!name || KEYWORDS.has(name)) continue;
            const offset = match.index + match[0].indexOf(name);
            const pos = _offsetToPos(lineOffsets, offset);
            rawSymbols.push({
              name,
              kind: pat.kind,
              detail: match[2] || '',
              local: true,
              offset,
              nameLength: name.length,
              line: pos.lineNumber,
              scopeLine: pos.lineNumber,
            });
          }
        } else {
          const name = match[1];
          if (!name || KEYWORDS.has(name)) continue;
          const offset = match.index + match[0].indexOf(name);
          const pos = _offsetToPos(lineOffsets, offset);
          rawSymbols.push({
            name,
            kind: pat.kind,
            detail: match[2] || '',
            local: !!pat.local,
            offset,
            nameLength: name.length,
            line: pos.lineNumber,
            scopeLine: pos.lineNumber,
          });
          const params = (match[2] || '')
            .split(',')
            .map((p) => p.trim().replace(/:.*/, ''))
            .filter(Boolean);
          const bodyLine = pos.lineNumber;
          for (const param of params) {
            if (param === '...') continue;
            const pOffset = match.index + match[0].lastIndexOf(param);
            rawSymbols.push({
              name: param,
              kind: 'parameter',
              detail: '',
              local: true,
              offset: pOffset,
              nameLength: param.length,
              line: bodyLine,
              scopeLine: bodyLine,
            });
          }
        }
      }
    }
    return rawSymbols;
  }

  function _collectTableMembersRaw(text, stripped, lineOffsets) {
    const re = /(?:^|[^.:A-Za-z0-9_])(?:local\s+)?([A-Za-z_]\w*)\s*=\s*\{/g;
    const rawTableMembers = {};
    let match;
    while ((match = re.exec(stripped))) {
      const name = match[1];
      if (KEYWORDS.has(name)) continue;
      const brace = match.index + match[0].lastIndexOf('{');
      const close = _findMatchingBrace(stripped, brace);
      if (close < 0) continue;
      const members = _parseTableFieldsRaw(
        text.slice(brace + 1, close),
        stripped.slice(brace + 1, close),
        lineOffsets,
        brace + 1,
      );
      if (members.length) {
        const offset = match.index + match[0].indexOf(name);
        const pos = _offsetToPos(lineOffsets, offset);
        if (!rawTableMembers[name]) rawTableMembers[name] = [];
        rawTableMembers[name].push({ members, offset, closeOffset: close, line: pos.lineNumber });
      }
      re.lastIndex = close + 1;
    }
    return rawTableMembers;
  }

  function _parseTableFieldsRaw(body, strippedBody, lineOffsets, baseOffset) {
    const members = [];
    const seen = new Set();
    let start = 0,
      depth = 0,
      blockDepth = 0;
    for (let i = 0; i <= strippedBody.length; i++) {
      if (_wordAt(strippedBody, i, 'function')) {
        blockDepth++;
        i += 7;
        continue;
      }
      if (_wordAt(strippedBody, i, 'end')) {
        blockDepth = Math.max(0, blockDepth - 1);
        i += 2;
        continue;
      }
      const ch = strippedBody[i] || ',';
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if (
        (ch === ',' || ch === ';' || i === strippedBody.length) &&
        depth === 0 &&
        blockDepth === 0
      ) {
        const member = _tableFieldRaw(
          body.slice(start, i),
          strippedBody.slice(start, i),
          lineOffsets,
          baseOffset + start,
        );
        if (member && !seen.has(member.name)) {
          seen.add(member.name);
          members.push(member);
        }
        start = i + 1;
      }
    }
    return members;
  }

  function _tableFieldRaw(segment, strippedSegment, lineOffsets, offset) {
    const trimmed = strippedSegment.trimStart();
    const leading = strippedSegment.length - trimmed.length;
    const key =
      trimmed.match(/^([A-Za-z_]\w*)\s*=/) ||
      segment.trimStart().match(/^\[\s*["']([A-Za-z_]\w*)["']\s*\]\s*=/);
    if (!key || KEYWORDS.has(key[1])) return null;
    const name = key[1];
    const nameIndex = segment.indexOf(name);
    const fieldOffset = offset + (nameIndex >= 0 ? nameIndex : leading);
    const value = segment.slice(segment.indexOf('=') + 1).trim();
    const strippedValue = strippedSegment.slice(strippedSegment.indexOf('=') + 1).trim();
    const fn = strippedValue.match(/^function\s*\(([^)]*)\)/);
    const params = fn ? _splitParams(fn[1]) : [];
    const pos = _offsetToPos(lineOffsets, fieldOffset);
    return {
      name,
      offset: fieldOffset,
      nameLength: name.length,
      detail: _tableFieldDetail(value),
      isMethod: !!fn && params[0] === 'self',
      memberKind: fn ? 'method' : 'property',
      signature: fn ? _methodSignature(fn[1], false) : undefined,
      line: pos.lineNumber,
    };
  }

  function _collectObjectMembersRaw(stripped, lineOffsets) {
    const rawObjectMembers = {};
    const push = (owner, member) => {
      if (!rawObjectMembers[owner]) rawObjectMembers[owner] = [];
      rawObjectMembers[owner].push(member);
    };
    const assignmentRe =
      /(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*=\s*([^\n;]*)/g;
    let match;
    while ((match = assignmentRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const propOffset = match.index + match[0].lastIndexOf(name);
      const pos = _offsetToPos(lineOffsets, propOffset);
      push(owner, {
        name,
        offset: propOffset,
        nameLength: name.length,
        detail: _tableFieldDetail((match[4] || '').trim()),
        isMethod: match[2] === ':',
        owner,
        memberKind: match[2] === ':' ? 'method' : 'property',
        line: pos.lineNumber,
      });
    }
    const functionRe =
      /(?:^|[^A-Za-z0-9_])function\s+([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
    while ((match = functionRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      const params = _splitParams(match[4] || '');
      const pos = _offsetToPos(lineOffsets, nameOffset);
      push(owner, {
        name,
        offset: nameOffset,
        nameLength: name.length,
        detail: 'function',
        isMethod: match[2] === ':' || params[0] === 'self',
        owner,
        memberKind: 'method',
        signature: _methodSignature(match[4] || '', match[2] === ':'),
        line: pos.lineNumber,
      });
    }
    const fnAssignRe =
      /(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*=\s*function\s*\(([^)]*)\)/g;
    while ((match = fnAssignRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      const params = _splitParams(match[4] || '');
      const pos = _offsetToPos(lineOffsets, nameOffset);
      push(owner, {
        name,
        offset: nameOffset,
        nameLength: name.length,
        detail: 'function',
        isMethod: match[2] === ':' || params[0] === 'self',
        owner,
        memberKind: 'method',
        signature: _methodSignature(match[4] || '', match[2] === ':'),
        line: pos.lineNumber,
      });
    }
    return rawObjectMembers;
  }

  function _collectSelfMembersRaw(stripped, lineOffsets, rawObjectMembers) {
    const functionRe =
      /(?:^|[^A-Za-z0-9_])function\s+([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
    let match;
    while ((match = functionRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      if (!owner || /^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const args = _splitParams(match[4] || '');
      const selfNames = new Set(match[2] === ':' ? ['self'] : []);
      if (args[0] === 'self') selfNames.add('self');
      const bodyStart = match.index + match[0].length;
      const bodyEnd = _findFunctionEndOffset(stripped, bodyStart);
      if (bodyEnd < 0) continue;
      const body = stripped.slice(bodyStart, bodyEnd);
      const ownerSafe = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (
        new RegExp(
          `\\b(?:local\\s+)?self\\s*=\\s*setmetatable\\s*\\([^\\n]*,\\s*${ownerSafe}\\s*\\)`,
        ).test(body)
      )
        selfNames.add('self');
      if (!selfNames.size) continue;
      const selfMemberRe = /\b(self)\s*[.:]\s*([A-Za-z_]\w*)\s*=\s*([^\n;]*)/g;
      let field;
      while ((field = selfMemberRe.exec(body))) {
        if (!selfNames.has(field[1])) continue;
        const name = field[2];
        if (!name || KEYWORDS.has(name)) continue;
        const fieldOffset = bodyStart + field.index + field[0].lastIndexOf(name);
        const detail = _tableFieldDetail((field[3] || '').trim());
        const pos = _offsetToPos(lineOffsets, fieldOffset);
        if (!rawObjectMembers[owner]) rawObjectMembers[owner] = [];
        rawObjectMembers[owner].push({
          name,
          offset: fieldOffset,
          nameLength: name.length,
          detail,
          isMethod: detail === 'function',
          owner,
          memberKind: detail === 'function' ? 'method' : 'property',
          inferredFromSelf: true,
          definedIn: match[3],
          line: pos.lineNumber,
        });
      }
    }
  }

  function _collectDocClassMembersRaw(text, lineOffsets, rawObjectMembers) {
    const lines = text.split('\n');
    let currentClass = null,
      offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cls = line.match(/^\s*---\s*@class\s+([A-Za-z_]\w*)/);
      if (cls) currentClass = cls[1];
      const field = line.match(/^\s*---\s*@field\s+([A-Za-z_]\w*)\s*(.*?)\s*$/);
      if (currentClass && field) {
        const name = field[1];
        const fieldType = _docFieldType(field[2] || '');
        const fieldOffset = offset + line.indexOf(name);
        const signature = _docFunctionSignature(fieldType);
        const params = _memberParameters({ signature });
        const pos = _offsetToPos(lineOffsets, fieldOffset);
        if (!rawObjectMembers[currentClass]) rawObjectMembers[currentClass] = [];
        rawObjectMembers[currentClass].push({
          name,
          offset: fieldOffset,
          nameLength: name.length,
          detail: fieldType || 'field',
          isMethod: /^fun\(/.test(fieldType),
          owner: currentClass,
          memberKind: /^fun\(/.test(fieldType) ? 'method' : 'property',
          signature,
          explicitSelf: params[0]?.startsWith('self') || false,
          line: pos.lineNumber,
        });
      }
      if (line.trim() && !line.trim().startsWith('---')) currentClass = null;
      offset += line.length + 1;
    }
  }

  function _rehydrateSymbols(rawSymbols, lineOffsets, model, symbols, byName) {
    for (const raw of rawSymbols) {
      if (!raw.name || KEYWORDS.has(raw.name)) continue;

      if (!raw.range) {
        const pos = _offsetFromLineOffsets(lineOffsets, raw.offset);
        raw.range = new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + raw.nameLength,
        );
        raw.line = pos.lineNumber;
        raw.scopeLine = raw.scopeLine ?? pos.lineNumber;
      }
      symbols.push(raw);
      if (!byName.has(raw.name)) byName.set(raw.name, []);
      byName.get(raw.name).push(raw);
    }
  }

  function _offsetFromLineOffsets(lineOffsets, offset) {
    let lo = 0,
      hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { lineNumber: lo + 1, column: offset - lineOffsets[lo] + 1 };
  }

  function _rehydrateTableMembers(rawTableMembers, lineOffsets, tableMembers) {
    for (const [name, records] of Object.entries(rawTableMembers)) {
      tableMembers.set(
        name,
        records.map((rec) => ({
          ...rec,
          members: rec.members.map((m) => _attachMemberRange(m, lineOffsets)),
        })),
      );
    }
  }

  function _rehydrateObjectMembers(rawObjectMembers, lineOffsets, objectMembers) {
    for (const [owner, members] of Object.entries(rawObjectMembers)) {
      objectMembers.set(
        owner,
        members.map((m) => _attachMemberRange(m, lineOffsets)),
      );
    }
  }

  function _attachMemberRange(m, lineOffsets) {
    if (m.range) return m;
    const pos = _offsetFromLineOffsets(lineOffsets, m.offset);
    return {
      ...m,
      range: new _monaco.Range(
        pos.lineNumber,
        pos.column,
        pos.lineNumber,
        pos.column + m.nameLength,
      ),
    };
  }

  function _pushSymbol(
    model,
    stripped,
    symbols,
    byName,
    name,
    offset,
    kind,
    detail = '',
    local = false,
    scopeLine = null,
  ) {
    if (!name || KEYWORDS.has(name)) return;
    const pos = model.getPositionAt(offset);
    const range = new _monaco.Range(
      pos.lineNumber,
      pos.column,
      pos.lineNumber,
      pos.column + name.length,
    );
    const symbol = {
      name,
      kind,
      detail,
      local,
      range,
      line: pos.lineNumber,
      offset,
      scopeLine: scopeLine ?? pos.lineNumber,
    };
    symbols.push(symbol);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(symbol);
  }

  function _collectTableMembers(model, text, stripped, tableMembers) {
    const re = /(?:^|[^.:A-Za-z0-9_])(?:local\s+)?([A-Za-z_]\w*)\s*=\s*\{/g;
    let match;
    while ((match = re.exec(stripped))) {
      const name = match[1];
      if (KEYWORDS.has(name)) continue;
      const brace = match.index + match[0].lastIndexOf('{');
      const close = _findMatchingBrace(stripped, brace);
      if (close < 0) continue;
      const members = _parseTableFields(
        text.slice(brace + 1, close),
        stripped.slice(brace + 1, close),
        model,
        brace + 1,
      );
      if (members.length) {
        const offset = match.index + match[0].indexOf(name);
        if (!tableMembers.has(name)) tableMembers.set(name, []);
        tableMembers.get(name).push({
          members,
          offset,
          closeOffset: close,
          line: model.getPositionAt(offset).lineNumber,
        });
      }
      re.lastIndex = close + 1;
    }
  }

  function _collectObjectMembers(model, stripped, objectMembers) {
    const assignmentRe =
      /(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*=\s*([^\n;]*)/g;
    let match;
    while ((match = assignmentRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const propOffset = match.index + match[0].lastIndexOf(name);
      const pos = model.getPositionAt(propOffset);
      const member = {
        name,
        offset: propOffset,
        detail: _tableFieldDetail((match[4] || '').trim()),
        isMethod: match[2] === ':',
        owner,
        memberKind: match[2] === ':' ? 'method' : 'property',
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
        ),
      };
      if (!objectMembers.has(owner)) objectMembers.set(owner, []);
      objectMembers.get(owner).push(member);
    }

    const functionRe =
      /(?:^|[^A-Za-z0-9_])function\s+([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
    while ((match = functionRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      const pos = model.getPositionAt(nameOffset);
      const params = _splitParams(match[4] || '');
      const member = {
        name,
        offset: nameOffset,
        detail: 'function',
        isMethod: match[2] === ':' || params[0] === 'self',
        owner,
        memberKind: 'method',
        signature: _methodSignature(match[4] || '', match[2] === ':'),
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
        ),
      };
      if (!objectMembers.has(owner)) objectMembers.set(owner, []);
      objectMembers.get(owner).push(member);
    }

    const functionAssignmentRe =
      /(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*=\s*function\s*\(([^)]*)\)/g;
    while ((match = functionAssignmentRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      const name = match[3];
      if (!owner || KEYWORDS.has(owner) || KEYWORDS.has(name)) continue;
      if (/^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const nameOffset = match.index + match[0].lastIndexOf(name);
      const pos = model.getPositionAt(nameOffset);
      const params = _splitParams(match[4] || '');
      const member = {
        name,
        offset: nameOffset,
        detail: 'function',
        isMethod: match[2] === ':' || params[0] === 'self',
        owner,
        memberKind: 'method',
        signature: _methodSignature(match[4] || '', match[2] === ':'),
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + name.length,
        ),
      };
      if (!objectMembers.has(owner)) objectMembers.set(owner, []);
      objectMembers.get(owner).push(member);
    }
  }

  function _collectSelfMembers(model, stripped, objectMembers) {
    const functionRe =
      /(?:^|[^A-Za-z0-9_])function\s+([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*([.:])\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
    let match;
    while ((match = functionRe.exec(stripped))) {
      const owner = match[1].replace(/\s*([.:])\s*/g, '$1');
      if (!owner || /^(Enum|game|workspace|script)$/i.test(owner)) continue;
      const args = _splitParams(match[4] || '');
      const selfNames = new Set(match[2] === ':' ? ['self'] : []);
      if (args[0] === 'self') selfNames.add('self');
      const bodyStart = match.index + match[0].length;
      const bodyEnd = _findFunctionEndOffset(stripped, bodyStart);
      if (bodyEnd < 0) continue;
      const body = stripped.slice(bodyStart, bodyEnd);
      const ownerSafe = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const constructsSelf = new RegExp(
        `\\b(?:local\\s+)?self\\s*=\\s*setmetatable\\s*\\([^\\n]*,\\s*${ownerSafe}\\s*\\)`,
      ).test(body);
      if (constructsSelf) selfNames.add('self');
      if (!selfNames.size) continue;
      const selfMemberRe = /\b(self)\s*[.:]\s*([A-Za-z_]\w*)\s*=\s*([^\n;]*)/g;
      let field;
      while ((field = selfMemberRe.exec(body))) {
        if (!selfNames.has(field[1])) continue;
        const name = field[2];
        if (!name || KEYWORDS.has(name)) continue;
        const fieldOffset = bodyStart + field.index + field[0].lastIndexOf(name);
        const pos = model.getPositionAt(fieldOffset);
        const detail = _tableFieldDetail((field[3] || '').trim());
        const member = {
          name,
          offset: fieldOffset,
          detail,
          isMethod: detail === 'function',
          owner,
          memberKind: detail === 'function' ? 'method' : 'property',
          inferredFromSelf: true,
          definedIn: match[3],
          range: new _monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + name.length,
          ),
        };
        if (!objectMembers.has(owner)) objectMembers.set(owner, []);
        objectMembers.get(owner).push(member);
      }
    }
  }

  function _collectDocClassMembers(model, text, objectMembers) {
    const lines = text.split('\n');
    let currentClass = null;
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cls = line.match(/^\s*---\s*@class\s+([A-Za-z_]\w*)/);
      if (cls) currentClass = cls[1];
      const field = line.match(/^\s*---\s*@field\s+([A-Za-z_]\w*)\s*(.*?)\s*$/);
      if (currentClass && field) {
        const name = field[1];
        const fieldType = _docFieldType(field[2] || '');
        const fieldOffset = offset + line.indexOf(name);
        const pos = model.getPositionAt(fieldOffset);
        const signature = _docFunctionSignature(fieldType);
        const params = _memberParameters({ signature });
        if (!objectMembers.has(currentClass)) objectMembers.set(currentClass, []);
        objectMembers.get(currentClass).push({
          name,
          offset: fieldOffset,
          detail: fieldType || 'field',
          isMethod: /^fun\(/.test(fieldType),
          owner: currentClass,
          memberKind: /^fun\(/.test(fieldType) ? 'method' : 'property',
          signature,
          explicitSelf: params[0]?.startsWith('self') || false,
          range: new _monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + name.length,
          ),
        });
      }
      if (line.trim() && !line.trim().startsWith('---')) currentClass = null;
      offset += line.length + 1;
    }
  }

  function _findMatchingBrace(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function _findFunctionEndOffset(stripped, startOffset) {
    const stack = ['function'];
    const tokenRe = /\b(function|do|then|repeat|end|until)\b/g;
    tokenRe.lastIndex = startOffset;
    let match;
    while ((match = tokenRe.exec(stripped))) {
      const token = match[1];
      if (token === 'function' || token === 'do' || token === 'then' || token === 'repeat') {
        stack.push(token);
        continue;
      }
      if (token === 'until') {
        for (let i = stack.length - 1; i >= 0; i--) {
          const item = stack.pop();
          if (item === 'repeat') break;
        }
      } else if (token === 'end') {
        for (let i = stack.length - 1; i >= 0; i--) {
          const item = stack.pop();
          if (item !== 'repeat') break;
        }
      }
      if (!stack.length) return match.index;
    }
    return -1;
  }

  function _parseTableFields(body, strippedBody, model, baseOffset) {
    const members = [];
    const seen = new Set();
    let start = 0;
    let depth = 0;
    let blockDepth = 0;
    for (let i = 0; i <= strippedBody.length; i++) {
      if (_wordAt(strippedBody, i, 'function')) {
        blockDepth++;
        i += 'function'.length - 1;
        continue;
      }
      if (_wordAt(strippedBody, i, 'end')) {
        blockDepth = Math.max(0, blockDepth - 1);
        i += 'end'.length - 1;
        continue;
      }
      const ch = strippedBody[i] || ',';
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if (
        (ch === ',' || ch === ';' || i === strippedBody.length) &&
        depth === 0 &&
        blockDepth === 0
      ) {
        const member = _tableField(
          body.slice(start, i),
          strippedBody.slice(start, i),
          model,
          baseOffset + start,
        );
        if (member && !seen.has(member.name)) {
          seen.add(member.name);
          members.push(member);
        }
        start = i + 1;
      }
    }
    return members;
  }

  function _tableField(segment, strippedSegment, model, offset) {
    const trimmed = strippedSegment.trimStart();
    const leading = strippedSegment.length - trimmed.length;
    const key =
      trimmed.match(/^([A-Za-z_]\w*)\s*=/) ||
      segment.trimStart().match(/^\[\s*["']([A-Za-z_]\w*)["']\s*\]\s*=/);
    if (!key || KEYWORDS.has(key[1])) return null;
    const name = key[1];
    const nameIndex = segment.indexOf(name);
    const fieldOffset = offset + (nameIndex >= 0 ? nameIndex : leading);
    const pos = model.getPositionAt(fieldOffset);
    const value = segment.slice(segment.indexOf('=') + 1).trim();
    const strippedValue = strippedSegment.slice(strippedSegment.indexOf('=') + 1).trim();
    const fn = strippedValue.match(/^function\s*\(([^)]*)\)/);
    const params = fn ? _splitParams(fn[1]) : [];
    return {
      name,
      offset: fieldOffset,
      detail: _tableFieldDetail(value),
      isMethod: !!fn && params[0] === 'self',
      memberKind: fn ? 'method' : 'property',
      signature: fn ? _methodSignature(fn[1], false) : undefined,
      range: new _monaco.Range(
        pos.lineNumber,
        pos.column,
        pos.lineNumber,
        pos.column + name.length,
      ),
    };
  }

  function _tableFieldDetail(value) {
    if (!value) return 'table field';
    const instance = value.match(/Instance\.new\(\s*["'](\w+)["']/);
    if (instance) return instance[1];
    const ctor = value.match(/^([A-Z][A-Za-z0-9_]*)\s*(?:[.:]\s*new|\.)/);
    if (ctor) return ctor[1];
    if (/^function\b/.test(value)) return 'function';
    if (/^\{/.test(value)) return 'table';
    if (/^["']/.test(value)) return 'string';
    if (/^\d/.test(value)) return 'number';
    if (/^(true|false)\b/.test(value)) return 'boolean';
    return 'table field';
  }

  function _docFunctionSignature(type) {
    const match = String(type || '').match(/^fun\s*\(([^)]*)\)/);
    return match ? _methodSignature(match[1], false) : undefined;
  }

  function _docFieldType(type) {
    const value = String(type || '').trim();
    if (!value) return '';
    if (/^fun\s*\(/.test(value)) return value;
    return value.split(/\s+/)[0];
  }

  function _wordAt(text, index, word) {
    if (text.slice(index, index + word.length) !== word) return false;
    const before = text[index - 1];
    const after = text[index + word.length];
    return !/[A-Za-z0-9_]/.test(before || '') && !/[A-Za-z0-9_]/.test(after || '');
  }

  function _analyzeSyntax(text) {
    const lexed = _lexLua(text);
    const state = {
      tokens: lexed.tokens,
      markers: [...lexed.markers],
      blocks: [],
    };
    _validateBracketPairs(state.tokens, state.markers);
    _validateDeclarations(state.tokens, state.markers);
    _validateAssignmentValues(state.tokens, state.markers);
    _validateBlocksAndControlFlow(state.tokens, state.markers, state.blocks);
    _collectFlowDiagnostics(state.tokens, state.markers);
    _collectDuplicateTableKeyMarkers(state.tokens, state.markers);
    return state;
  }

  function _lexLua(text) {
    const tokens = [];
    const markers = [];
    let line = 1;
    let lineStart = 0;
    let i = 0;
    const push = (type, value, start, end, startLine = line, startLineStart = lineStart) => {
      tokens.push({
        type,
        value,
        start,
        end,
        line: startLine,
        column: start - startLineStart + 1,
      });
    };
    const advance = (count = 1) => {
      for (let n = 0; n < count; n++) {
        if (text[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
    };
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) {
        advance();
        continue;
      }
      if (ch === '-' && text[i + 1] === '-') {
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        const long = text.slice(i).match(/^--\[(=*)\[/);
        if (long) {
          const close = `]${long[1]}]`;
          advance(long[0].length);
          while (i < text.length && text.slice(i, i + close.length) !== close) advance();
          if (i >= text.length) {
            markers.push({
              start,
              end: Math.min(text.length, start + long[0].length),
              message: 'Unterminated long comment.',
              severity: 'error',
            });
          } else {
            advance(close.length);
          }
          push('comment', text.slice(start, i), start, i, startLine, startLineStart);
          continue;
        }
        while (i < text.length && text[i] !== '\n') advance();
        push('comment', text.slice(start, i), start, i, startLine, startLineStart);
        continue;
      }
      if (ch === '/' && text[i + 1] === '*') {
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        advance(2);
        while (i < text.length && text.slice(i, i + 2) !== '*/') advance();
        if (i >= text.length) {
          markers.push({
            start,
            end: Math.min(text.length, start + 2),
            message: 'Unterminated block comment.',
            severity: 'error',
          });
        } else {
          advance(2);
        }
        push('comment', text.slice(start, i), start, i, startLine, startLineStart);
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        advance();
        let closed = false;
        while (i < text.length) {
          if (text[i] === '\\') {
            advance(Math.min(2, text.length - i));
            continue;
          }
          if (text[i] === quote) {
            advance();
            closed = true;
            break;
          }
          if (text[i] === '\n' && quote !== '`') break;
          advance();
        }
        if (!closed) {
          markers.push({
            start,
            end: Math.min(text.length, Math.max(start + 1, i)),
            message: 'Unterminated string literal.',
            severity: 'error',
          });
        }
        push('string', text.slice(start, i), start, i, startLine, startLineStart);
        continue;
      }
      const longString = text.slice(i).match(/^\[(=*)\[/);
      if (longString) {
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        const close = `]${longString[1]}]`;
        advance(longString[0].length);
        while (i < text.length && text.slice(i, i + close.length) !== close) advance();
        if (i >= text.length) {
          markers.push({
            start,
            end: Math.min(text.length, start + longString[0].length),
            message: 'Unterminated long string literal.',
            severity: 'error',
          });
        } else {
          advance(close.length);
        }
        push('string', text.slice(start, i), start, i, startLine, startLineStart);
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        advance();
        while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) advance();
        const value = text.slice(start, i);
        push(KEYWORDS.has(value) ? 'keyword' : 'name', value, start, i, startLine, startLineStart);
        continue;
      }
      if (/\d/.test(ch)) {
        const start = i;
        const startLine = line;
        const startLineStart = lineStart;
        const number = text
          .slice(i)
          .match(
            /^(?:0[xX][0-9A-Fa-f]+(?:\.[0-9A-Fa-f]*)?(?:[pP][+-]?\d+)?|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/,
          )?.[0];
        advance(number?.length || 1);
        push('number', text.slice(start, i), start, i, startLine, startLineStart);
        continue;
      }
      const start = i;
      const startLine = line;
      const startLineStart = lineStart;
      const symbol =
        ['...', '::', '==', '~=', '<=', '>=', '..', '//', '<<', '>>', '+=', '-=', '*=', '/='].find(
          (value) => text.startsWith(value, i),
        ) || ch;
      advance(symbol.length);
      push('symbol', symbol, start, i, startLine, startLineStart);
    }
    return { tokens: tokens.filter((token) => token.type !== 'comment'), markers };
  }

  function _validateBracketPairs(tokens, markers) {
    const opens = { '(': ')', '[': ']', '{': '}' };
    const closes = new Set(Object.values(opens));
    const stack = [];
    for (const token of tokens) {
      if (token.type !== 'symbol') continue;
      if (opens[token.value]) {
        stack.push(token);
        continue;
      }
      if (!closes.has(token.value)) continue;
      const top = stack.pop();
      if (!top || opens[top.value] !== token.value) {
        markers.push({
          start: token.start,
          end: token.end,
          message: `Unexpected '${token.value}'.`,
          severity: 'error',
        });
      }
    }
    for (const token of stack.slice(-30)) {
      markers.push({
        start: token.start,
        end: token.end,
        message: `Missing '${opens[token.value]}' to close '${token.value}'.`,
        severity: 'error',
      });
    }
  }

  function _validateDeclarations(tokens, markers) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'local') {
        let next = tokens[i + 1];
        if (next?.value === 'function') next = tokens[i + 2];
        if (!next || next.type !== 'name') {
          markers.push({
            start: next?.start ?? token.end,
            end: next?.end ?? token.end,
            message: 'Expected a local name.',
            severity: 'error',
          });
        }
      }
      if (token.value === 'function') {
        const next = tokens[i + 1];
        const prev = tokens[i - 1];
        const anonymous = next?.value === '(';
        const assignmentFunction = prev?.value === '=';
        if (!anonymous && !assignmentFunction && next?.type !== 'name') {
          markers.push({
            start: next?.start ?? token.end,
            end: next?.end ?? token.end,
            message: 'Expected a function name.',
            severity: 'error',
          });
        }
        const open = _nextTokenIndex(tokens, i + 1, '(');
        const close = open >= 0 ? _matchingTokenIndex(tokens, open, '(', ')') : -1;
        if (open < 0) {
          markers.push({
            start: token.start,
            end: token.end,
            message: "Expected '(' after function name.",
            severity: 'error',
          });
          continue;
        }
        if (close < 0) continue;
        let expectName = true;
        let sawVararg = false;
        for (let p = open + 1; p < close; p++) {
          const param = tokens[p];
          if (param.value === ',') {
            expectName = true;
            continue;
          }
          if (!expectName) continue;
          if (param.value === '...') {
            sawVararg = true;
            expectName = false;
            continue;
          }
          if (param.type !== 'name') {
            markers.push({
              start: param.start,
              end: param.end,
              message: 'Expected a parameter name.',
              severity: 'error',
            });
          }
          if (sawVararg) {
            markers.push({
              start: param.start,
              end: param.end,
              message: 'No parameters may follow varargs.',
              severity: 'error',
            });
          }
          expectName = false;
        }
      }
      if (token.value === 'for') {
        const next = tokens[i + 1];
        if (!next || next.type !== 'name') {
          markers.push({
            start: next?.start ?? token.end,
            end: next?.end ?? token.end,
            message: 'Expected a loop variable name.',
            severity: 'error',
          });
        }
      }
      if (token.value === 'goto') {
        const next = tokens[i + 1];
        if (!next || next.type !== 'name') {
          markers.push({
            start: next?.start ?? token.end,
            end: next?.end ?? token.end,
            message: 'Expected a label name after goto.',
            severity: 'error',
          });
        }
      }
    }
  }

  function _validateAssignmentValues(tokens, markers) {
    const invalidValueKeywords = new Set([
      'local',
      'if',
      'for',
      'while',
      'repeat',
      'do',
      'return',
      'break',
      'continue',
      'goto',
      'end',
      'else',
      'elseif',
      'until',
      'then',
    ]);
    const invalidValueSymbols = new Set([',', ';', ')', ']', '}']);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value !== '=' || _isTypeAliasEquals(tokens, i)) continue;
      const next = tokens[i + 1];
      if (!next) {
        markers.push({
          start: token.end,
          end: token.end,
          message: "Expected a value after '='.",
          severity: 'error',
        });
        continue;
      }
      if (invalidValueKeywords.has(next.value) || invalidValueSymbols.has(next.value)) {
        markers.push({
          start: token.start,
          end: token.end,
          message: `Expected a value after '='${next.value ? ` before '${next.value}'` : ''}.`,
          severity: 'error',
        });
      }
    }
  }

  function _validateBlocksAndControlFlow(tokens, markers, blocks) {
    const root = _syntaxBlock('root', null, false, false);
    const stack = [root];
    const functionStack = [root];
    const labelsByBlock = new Map([[root, new Map()]]);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const current = stack.at(-1);
      _recordSyntaxStatement(current, token);
      if (token.value === 'function') {
        const params = _functionParams(tokens, i);
        const block = _syntaxBlock('function', token, false, params.includes('...'));
        stack.push(block);
        functionStack.push(block);
        labelsByBlock.set(block, new Map());
        blocks.push(block);
        continue;
      }
      if (token.value === 'if') {
        const block = _syntaxBlock('if', token, false, false);
        block.waitingFor = 'then';
        stack.push(block);
        blocks.push(block);
        continue;
      }
      if (token.value === 'for' || token.value === 'while') {
        const block = _syntaxBlock(token.value, token, true, false);
        block.waitingFor = 'do';
        stack.push(block);
        blocks.push(block);
        continue;
      }
      if (token.value === 'repeat') {
        const block = _syntaxBlock('repeat', token, true, false);
        stack.push(block);
        blocks.push(block);
        continue;
      }
      if (token.value === 'do') {
        if (current?.waitingFor === 'do') {
          current.waitingFor = null;
          continue;
        }
        const block = _syntaxBlock('do', token, false, false);
        stack.push(block);
        blocks.push(block);
        continue;
      }
      if (token.value === 'then') {
        if (current?.waitingFor === 'then') current.waitingFor = null;
        else
          markers.push({
            start: token.start,
            end: token.end,
            message: "Unexpected 'then'.",
            severity: 'error',
          });
        continue;
      }
      if (token.value === 'else' || token.value === 'elseif') {
        const owner = _nearestOpenBlock(stack, 'if');
        if (!owner) {
          markers.push({
            start: token.start,
            end: token.end,
            message: `Unexpected '${token.value}'.`,
            severity: 'error',
          });
        } else if (token.value === 'elseif') {
          owner.waitingFor = 'then';
        }
        continue;
      }
      if (token.value === 'end') {
        const block = stack.at(-1);
        if (!block || block.kind === 'root' || block.kind === 'repeat') {
          markers.push({
            start: token.start,
            end: token.end,
            message: "Unexpected 'end'.",
            severity: 'error',
          });
          continue;
        }
        if (block.waitingFor) {
          markers.push({
            start: block.opener.start,
            end: block.opener.end,
            message: `Missing '${block.waitingFor}' for '${block.kind}'.`,
            severity: 'error',
          });
        }
        block.closer = token;
        stack.pop();
        if (block.kind === 'function') functionStack.pop();
        continue;
      }
      if (token.value === 'until') {
        const block = stack.at(-1);
        if (!block || block.kind !== 'repeat') {
          markers.push({
            start: token.start,
            end: token.end,
            message: "Unexpected 'until'.",
            severity: 'error',
          });
          continue;
        }
        block.closer = token;
        stack.pop();
        continue;
      }
      if (
        (token.value === 'break' || token.value === 'continue') &&
        !_insideLoopSinceFunction(stack)
      ) {
        markers.push({
          start: token.start,
          end: token.end,
          message: `'${token.value}' may only be used inside a loop.`,
          severity: 'error',
        });
      }
      if (token.value === '...' && !functionStack.at(-1)?.vararg) {
        markers.push({
          start: token.start,
          end: token.end,
          message: 'Varargs are only valid inside a vararg function.',
          severity: 'error',
        });
      }
      if (token.value === '::') {
        const name = tokens[i + 1];
        const close = tokens[i + 2];
        if (name?.type !== 'name' || close?.value !== '::') {
          markers.push({
            start: token.start,
            end: close?.end ?? name?.end ?? token.end,
            message: 'Malformed label declaration.',
            severity: 'error',
          });
          continue;
        }
        const blockLabels = labelsByBlock.get(current) || new Map();
        if (blockLabels.has(name.value)) {
          markers.push({
            start: name.start,
            end: name.end,
            message: `Label '${name.value}' is already defined in this block.`,
            severity: 'error',
          });
        } else {
          blockLabels.set(name.value, name);
          labelsByBlock.set(current, blockLabels);
        }
      }
    }
    for (const block of stack.slice(1)) {
      if (block.waitingFor) {
        markers.push({
          start: block.opener.start,
          end: block.opener.end,
          message: `Missing '${block.waitingFor}' for '${block.kind}'.`,
          severity: 'error',
        });
      }
      markers.push({
        start: block.opener.start,
        end: block.opener.end,
        message: `Missing closing '${block.kind === 'repeat' ? 'until' : 'end'}'.`,
        severity: 'error',
      });
    }
  }

  function _syntaxBlock(kind, opener, loop, vararg) {
    return {
      kind,
      opener,
      closer: null,
      loop,
      vararg,
      waitingFor: null,
      statements: 0,
    };
  }

  function _recordSyntaxStatement(block, token) {
    if (!block || token.type === 'symbol') return;
    if (
      token.value === 'end' ||
      token.value === 'until' ||
      token.value === 'else' ||
      token.value === 'elseif' ||
      token.value === 'then' ||
      token.value === 'do'
    )
      return;
    block.statements++;
  }

  function _insideLoopSinceFunction(stack) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const block = stack[i];
      if (block.kind === 'function') return false;
      if (block.loop) return true;
    }
    return false;
  }

  function _nearestOpenBlock(stack, kind) {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === kind) return stack[i];
    return null;
  }

  function _functionParams(tokens, functionIndex) {
    const open = _nextTokenIndex(tokens, functionIndex + 1, '(');
    const close = open >= 0 ? _matchingTokenIndex(tokens, open, '(', ')') : -1;
    if (open < 0 || close < 0) return [];
    return tokens.slice(open + 1, close).map((token) => token.value);
  }

  function _nextTokenIndex(tokens, start, value) {
    for (let i = start; i < tokens.length; i++) if (tokens[i].value === value) return i;
    return -1;
  }

  function _matchingTokenIndex(tokens, openIndex, openValue, closeValue) {
    let depth = 0;
    for (let i = openIndex; i < tokens.length; i++) {
      if (tokens[i].value === openValue) depth++;
      else if (tokens[i].value === closeValue) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function _collectDuplicateTableKeyMarkers(tokens, markers) {
    const stack = [];
    let functionDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'function') {
        functionDepth++;
        continue;
      }
      if (token.value === 'end' && functionDepth > 0) {
        functionDepth--;
        continue;
      }
      if (token.value === '{') {
        stack.push({ keys: new Map(), functionDepth });
        continue;
      }
      if (token.value === '}') {
        stack.pop();
        continue;
      }
      const table = stack.at(-1);
      if (
        !table ||
        table.functionDepth !== functionDepth ||
        token.type !== 'name' ||
        tokens[i + 1]?.value !== '='
      )
        continue;
      if (table.keys.has(token.value)) {
        markers.push({
          start: token.start,
          end: token.end,
          message: `Duplicate table field '${token.value}'.`,
          severity: 'warning',
        });
      } else {
        table.keys.set(token.value, token);
      }
    }
  }

  function _collectFlowDiagnostics(tokens, markers) {
    const root = { kind: 'root', waitingFor: null, terminatedBy: null };
    const stack = [root];
    let bracketDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'symbol') {
        if (token.value === '(' || token.value === '[' || token.value === '{') bracketDepth++;
        else if (token.value === ')' || token.value === ']' || token.value === '}')
          bracketDepth = Math.max(0, bracketDepth - 1);
      }
      const current = stack.at(-1);
      if (
        current?.terminatedBy &&
        token.line > (current.terminatedBy.endLine ?? current.terminatedBy.line) &&
        bracketDepth <= current.terminatedBy.depth &&
        _isLikelyStatementStart(tokens, i)
      ) {
        markers.push({
          start: token.start,
          end: token.end,
          message:
            current.terminatedBy.value === 'return'
              ? 'Code after return is not allowed in the same block.'
              : `Code after ${current.terminatedBy.value} is unreachable in this block.`,
          severity: current.terminatedBy.value === 'return' ? 'error' : 'warning',
        });
        current.terminatedBy = null;
      }
      if (token.value === 'function') {
        stack.push({ kind: 'function', waitingFor: null, terminatedBy: null });
        continue;
      }
      if (token.value === 'if') {
        stack.push({ kind: 'if', waitingFor: 'then', terminatedBy: null });
        continue;
      }
      if (token.value === 'for' || token.value === 'while') {
        stack.push({ kind: token.value, waitingFor: 'do', terminatedBy: null });
        continue;
      }
      if (token.value === 'repeat') {
        stack.push({ kind: 'repeat', waitingFor: null, terminatedBy: null });
        continue;
      }
      if (token.value === 'do') {
        if (current?.waitingFor === 'do') current.waitingFor = null;
        else stack.push({ kind: 'do', waitingFor: null, terminatedBy: null });
        continue;
      }
      if (token.value === 'then') {
        if (current?.waitingFor === 'then') current.waitingFor = null;
        continue;
      }
      if (token.value === 'else' || token.value === 'elseif') {
        const owner = _nearestOpenBlock(stack, 'if');
        if (owner) {
          owner.terminatedBy = null;
          if (token.value === 'elseif') owner.waitingFor = 'then';
        }
        continue;
      }
      if (token.value === 'end') {
        if (stack.length > 1 && current.kind !== 'repeat') stack.pop();
        continue;
      }
      if (token.value === 'until') {
        if (current?.kind === 'repeat') stack.pop();
        continue;
      }
      if (
        (token.value === 'return' || token.value === 'break' || token.value === 'continue') &&
        !current?.terminatedBy
      ) {
        current.terminatedBy = {
          value: token.value,
          line: token.line,
          endLine: token.value === 'return' ? _returnExpressionEndLine(tokens, i) : token.line,
          depth: bracketDepth,
        };
      }
    }
  }

  const RETURN_CONTINUATION_PREFIX = new Set([
    'and',
    'or',
    '+',
    '-',
    '*',
    '/',
    '//',
    '%',
    '^',
    '..',
    '==',
    '~=',
    '<=',
    '>=',
    '<',
    '>',
    ',',
  ]);
  const RETURN_CONTINUATION_SUFFIX = new Set([...RETURN_CONTINUATION_PREFIX, '(', '[', '{']);

  function _returnExpressionEndLine(tokens, returnIndex) {
    const start = tokens[returnIndex];
    if (!start) return 0;
    let endLine = start.line;
    let depth = 0;
    let previous = null;
    for (let i = returnIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (depth === 0 && token.value === ';') break;
      if (
        depth === 0 &&
        token.line > endLine &&
        !_lineContinuesReturnExpression(tokens, i, previous)
      ) {
        break;
      }
      if (token.type === 'symbol') {
        if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
        else if (token.value === ')' || token.value === ']' || token.value === '}')
          depth = Math.max(0, depth - 1);
      }
      endLine = Math.max(endLine, token.line);
      previous = token;
    }
    return endLine;
  }

  function _lineContinuesReturnExpression(tokens, index, previous) {
    const token = tokens[index];
    if (!token) return false;
    if (previous && RETURN_CONTINUATION_SUFFIX.has(previous.value)) return true;
    let firstOnLine = index;
    while (firstOnLine > 0 && tokens[firstOnLine - 1]?.line === token.line) firstOnLine--;
    return RETURN_CONTINUATION_PREFIX.has(tokens[firstOnLine]?.value);
  }

  function _isLikelyStatementStart(tokens, index) {
    const token = tokens[index];
    if (!token) return false;
    if (
      [
        'local',
        'function',
        'if',
        'for',
        'while',
        'repeat',
        'do',
        'return',
        'break',
        'continue',
      ].includes(token.value)
    )
      return true;
    if (token.type !== 'name') return false;
    if (tokens[index - 1]?.value === '.' || tokens[index - 1]?.value === ':') return false;
    const next = tokens[index + 1];
    return ['=', '('].includes(next?.value);
  }

  function _collectSyntaxDiagnostics(model, text, syntax, markers) {
    for (const item of syntax.markers)
      markers.push(_markerFromOffsets(model, item.start, item.end, item.message, item.severity));
    _collectTrailingWhitespaceDiagnostics(model, text, markers);
  }

  function _collectTrailingWhitespaceDiagnostics(model, text, markers) {
    let offset = 0;
    for (const line of text.split('\n')) {
      const trailing = line.match(/[ \t]+$/)?.[0];
      if (trailing) {
        const start = offset + line.length - trailing.length;
        markers.push(
          _markerFromOffsets(
            model,
            start,
            offset + line.length,
            line.trim() ? 'Trailing whitespace.' : 'Line contains only whitespace.',
            'hint',
          ),
        );
      }
      offset += line.length + 1;
    }
  }

  function _collectSemanticDiagnostics(model, semantics, markers) {
    for (const item of semantics.markers)
      markers.push(_markerFromOffsets(model, item.start, item.end, item.message, item.severity));
  }

  function _analyzeSemantics(text, syntax) {
    const tokens = syntax.tokens;
    const luauTypes = _collectLuauTypeInfo(tokens);
    const semantics = {
      markers: [...luauTypes.markers],
      definitions: [],
      references: [],
      typeRanges: luauTypes.ranges,
    };
    _collectScopeDiagnostics(tokens, luauTypes, semantics);
    _collectAssignmentDiagnostics(tokens, semantics);
    _collectEmptyBlockDiagnostics(tokens, syntax.blocks, semantics);
    _collectLiteralBranchDiagnostics(tokens, semantics);
    return semantics;
  }

  function _collectLuauTypeInfo(tokens) {
    const ranges = [];
    const typeNames = new Set();
    const markers = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'type' && _isTypeAliasStart(tokens, i)) {
        const name = tokens[i + 1];
        if (name?.type === 'name') typeNames.add(name.value);
        const eq = tokens.findIndex((candidate, index) => index > i && candidate.value === '=');
        if (eq > i) {
          const end = _statementEndIndex(tokens, eq + 1);
          if (tokens[eq + 1] && tokens[end - 1])
            ranges.push({ start: tokens[eq + 1].start, end: tokens[end - 1].end });
        }
      }
      if (token.value !== ':') continue;
      if (_isMemberSeparator(tokens, i)) continue;
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (!prev || prev.type !== 'name') continue;
      if (!next || !_isTypeToken(next)) {
        markers.push({
          start: token.start,
          end: token.end,
          message: 'Expected a type annotation after colon.',
          severity: 'error',
        });
        continue;
      }
      const end = _typeAnnotationEndIndex(tokens, i + 1);
      ranges.push({ start: next.start, end: tokens[Math.max(i + 1, end - 1)].end });
    }
    return { ranges, typeNames, markers };
  }

  function _collectScopeDiagnostics(tokens, luauTypes, semantics) {
    const root = _scope(null);
    const scopes = [root];
    const definitions = semantics.definitions;
    const references = semantics.references;
    const functionScopeOpeners = new Map();
    const unresolved = new Set();
    const declarationStarts = new Set();
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'function') {
        const localName = tokens[i - 1]?.value === 'local' ? tokens[i + 1] : null;
        if (localName?.type === 'name')
          _defineLocal(scopes.at(-1), localName, 'function', semantics, declarationStarts);
        const fnScope = _scope(scopes.at(-1));
        scopes.push(fnScope);
        functionScopeOpeners.set(token, fnScope);
        if (_isColonFunction(tokens, i)) {
          _defineLocal(
            fnScope,
            { ...token, value: 'self' },
            'implicit-self',
            semantics,
            declarationStarts,
          );
        }
        const params = _functionParamTokens(tokens, i, luauTypes.ranges);
        for (const param of params) {
          if (param.value === '...') continue;
          _defineLocal(fnScope, param, 'parameter', semantics, declarationStarts);
        }
        continue;
      }
      if (token.value === 'for') {
        const loopScope = _scope(scopes.at(-1));
        scopes.push(loopScope);
        for (const local of _loopVariableTokens(tokens, i))
          _defineLocal(loopScope, local, 'loop', semantics, declarationStarts);
        continue;
      }
      if (token.value === 'do' || token.value === 'then' || token.value === 'repeat') {
        if (token.value === 'do' && tokens[i - 1]?.value === 'for') continue;
        scopes.push(_scope(scopes.at(-1)));
        continue;
      }
      if (token.value === 'else' || token.value === 'elseif') {
        if (scopes.length > 1) scopes.pop();
        scopes.push(_scope(scopes.at(-1)));
        continue;
      }
      if (token.value === 'end' || token.value === 'until') {
        if (scopes.length > 1) scopes.pop();
        continue;
      }
      if (token.value === 'local') {
        if (tokens[i + 1]?.value === 'function') continue;
        for (const local of _localVariableTokens(tokens, i))
          _defineLocal(scopes.at(-1), local, 'local', semantics, declarationStarts);
        continue;
      }
      if (token.type !== 'name') continue;
      if (_inRanges(token, luauTypes.ranges)) continue;
      if (declarationStarts.has(token.start) || _isDefinitionToken(tokens, i)) continue;
      if (_isNonReferenceName(tokens, i)) continue;
      const def = _resolveDefinition(scopes.at(-1), token.value);
      if (def) {
        def.uses++;
        references.push({ token, definition: def });
        continue;
      }
      if (_isKnownGlobal(token.value)) continue;
      if (/^[A-Z]/.test(token.value)) continue;
      if (_looksLikeTableKey(tokens, i)) continue;
      if (unresolved.has(token.value)) continue;
      unresolved.add(token.value);
      semantics.markers.push({
        start: token.start,
        end: token.end,
        message: `Undefined global '${token.value}'.`,
        severity: 'hint',
      });
    }
    for (const def of definitions) {
      if (def.name === '_' || def.uses > 0 || def.kind === 'implicit-self') continue;
      semantics.markers.push({
        start: def.token.start,
        end: def.token.end,
        message:
          def.kind === 'function'
            ? `Local function '${def.name}' is never used.`
            : def.kind === 'parameter'
              ? `Parameter '${def.name}' is never used.`
              : `Local '${def.name}' is never used.`,
        severity: 'hint',
      });
    }
  }

  function _scope(parent) {
    return { parent, locals: new Map() };
  }

  function _defineLocal(scope, token, kind, semantics, declarationStarts = null) {
    const existing = scope.locals.get(token.value);
    if (existing && token.value !== '_') {
      semantics.markers.push({
        start: token.start,
        end: token.end,
        message: `${kind === 'parameter' ? 'Parameter' : 'Local'} '${token.value}' is already defined in this scope.`,
        severity: 'warning',
      });
    }
    const def = { name: token.value, token, kind, uses: 0 };
    scope.locals.set(token.value, def);
    semantics.definitions.push(def);
    declarationStarts?.add(token.start);
    return def;
  }

  function _resolveDefinition(scope, name) {
    let current = scope;
    while (current) {
      if (current.locals.has(name)) return current.locals.get(name);
      current = current.parent;
    }
    return null;
  }

  function _functionParamTokens(tokens, functionIndex, typeRanges = []) {
    const open = _nextTokenIndex(tokens, functionIndex + 1, '(');
    const close = open >= 0 ? _matchingTokenIndex(tokens, open, '(', ')') : -1;
    if (open < 0 || close < 0) return [];
    const params = [];
    for (let i = open + 1; i < close; i++) {
      const token = tokens[i];
      if (token.type === 'name' && !_inRanges(token, typeRanges)) params.push(token);
      else if (token.value === '...') params.push(token);
    }
    return params;
  }

  function _isColonFunction(tokens, functionIndex) {
    const open = _nextTokenIndex(tokens, functionIndex + 1, '(');
    if (open < 0) return false;
    for (let i = functionIndex + 1; i < open; i++) if (tokens[i].value === ':') return true;
    return false;
  }

  function _loopVariableTokens(tokens, forIndex) {
    const locals = [];
    for (let i = forIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === '=' || token.value === 'in' || token.value === 'do') break;
      if (token.type === 'name') locals.push(token);
    }
    return locals;
  }

  function _localVariableTokens(tokens, localIndex) {
    const locals = [];
    for (let i = localIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === '=' || token.value === ';' || token.line !== tokens[localIndex].line)
        break;
      if (token.value === '<') {
        i = _skipUntil(tokens, i + 1, '>');
        continue;
      }
      if (token.value === ':') {
        i = _typeAnnotationEndIndex(tokens, i + 1) - 1;
        continue;
      }
      if (token.type === 'name') locals.push(token);
    }
    return locals;
  }

  function _collectAssignmentDiagnostics(tokens, semantics) {
    const braceDepths = _buildBraceDepths(tokens);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].value !== 'local' && !_isAssignmentStart(tokens, i, braceDepths)) continue;
      const start = tokens[i].value === 'local' ? i + 1 : i;
      const eq = _assignmentEqualsIndex(tokens, start);
      if (eq < 0) continue;
      const end = _statementEndIndex(tokens, eq + 1);
      const lhs = _countTopLevelCommaGroups(tokens, start, eq, { lhs: true });
      const rhs = _countTopLevelCommaGroups(tokens, eq + 1, end, { lhs: false });
      if (!lhs || !rhs || lhs === rhs) continue;
      if (_assignmentHasOpenArity(tokens, eq + 1, end)) continue;
      semantics.markers.push({
        start: tokens[start].start,
        end: tokens[Math.max(start, eq - 1)].end,
        message: `Assignment has ${lhs} variable${lhs === 1 ? '' : 's'} but ${rhs} value${rhs === 1 ? '' : 's'}.`,
        severity: 'hint',
      });
    }
  }

  function _collectEmptyBlockDiagnostics(tokens, blocks, semantics) {
    for (const block of blocks) {
      if (!block.closer || !['if', 'for', 'while', 'do'].includes(block.kind)) continue;
      const startIndex = _bodyStartIndex(tokens, block);
      const endIndex = tokens.indexOf(block.closer);
      if (startIndex < 0 || endIndex < 0) continue;
      const body = tokens.slice(startIndex, endIndex).filter((token) => !_isStructuralToken(token));
      if (body.length) continue;
      semantics.markers.push({
        start: block.opener.start,
        end: block.opener.end,
        message: `Empty ${block.kind} block.`,
        severity: 'hint',
      });
    }
  }

  function _collectLiteralBranchDiagnostics(tokens, semantics) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'if') {
        const thenIndex = _nextTokenIndex(tokens, i + 1, 'then');
        if (thenIndex < 0) continue;
        const condition = tokens
          .slice(i + 1, thenIndex)
          .filter((item) => item.value !== '(' && item.value !== ')');
        if (condition.length !== 1) continue;
        if (condition[0].value === 'false' || condition[0].value === 'nil') {
          semantics.markers.push({
            start: token.start,
            end: tokens[thenIndex].end,
            message: 'This branch is never reached because the condition is always false.',
            severity: 'hint',
          });
        }
        if (condition[0].value === 'true') {
          const elseToken = _nextSiblingBranchToken(tokens, thenIndex + 1);
          if (elseToken) {
            semantics.markers.push({
              start: elseToken.start,
              end: elseToken.end,
              message:
                'This branch is never reached because the previous condition is always true.',
              severity: 'hint',
            });
          }
        }
      }
      if (token.value === 'elseif') {
        const thenIndex = _nextTokenIndex(tokens, i + 1, 'then');
        if (thenIndex < 0) continue;
        const condition = tokens
          .slice(i + 1, thenIndex)
          .filter((item) => item.value !== '(' && item.value !== ')');
        if (condition.length !== 1) continue;
        if (condition[0].value === 'false' || condition[0].value === 'nil') {
          semantics.markers.push({
            start: token.start,
            end: tokens[thenIndex].end,
            message: 'This branch is never reached because the condition is always false.',
            severity: 'hint',
          });
        }
        if (condition[0].value === 'true') {
          const elseToken = _nextSiblingBranchToken(tokens, thenIndex + 1);
          if (elseToken) {
            semantics.markers.push({
              start: elseToken.start,
              end: elseToken.end,
              message:
                'This branch is never reached because the previous condition is always true.',
              severity: 'hint',
            });
          }
        }
      }
      if (token.value === 'while') {
        const doIndex = _nextTokenIndex(tokens, i + 1, 'do');
        if (doIndex < 0) continue;
        const condition = tokens
          .slice(i + 1, doIndex)
          .filter((item) => item.value !== '(' && item.value !== ')');
        if (
          condition.length === 1 &&
          (condition[0].value === 'false' || condition[0].value === 'nil')
        ) {
          semantics.markers.push({
            start: token.start,
            end: tokens[doIndex].end,
            message: 'Loop body is never reached because the condition is always false.',
            severity: 'hint',
          });
        }
      }
    }
  }

  function _isTypeAliasStart(tokens, index) {
    return (
      tokens[index]?.value === 'type' &&
      tokens[index - 1]?.value !== '.' &&
      tokens[index - 1]?.value !== ':' &&
      (tokens[index + 1]?.type === 'name' || tokens[index - 1]?.value === 'export')
    );
  }

  function _isTypeAliasEquals(tokens, equalsIndex) {
    const line = tokens[equalsIndex]?.line;
    for (let i = equalsIndex - 1; i >= 0 && tokens[i].line === line; i--) {
      if (tokens[i].value === 'type' && _isTypeAliasStart(tokens, i)) return true;
    }
    return false;
  }

  function _isMemberSeparator(tokens, index) {
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    return prev?.type === 'name' && next?.type === 'name' && tokens[index + 2]?.value === '(';
  }

  function _isTypeToken(token) {
    return !!token && (token.type === 'name' || token.value === '{' || token.value === '(');
  }

  function _typeAnnotationEndIndex(tokens, start) {
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === '<') depth++;
      else if (token.value === '>') depth = Math.max(0, depth - 1);
      if (
        depth === 0 &&
        (token.value === ',' ||
          token.value === ')' ||
          token.value === '=' ||
          token.value === ';' ||
          token.line !== tokens[start].line)
      )
        return i;
    }
    return tokens.length;
  }

  function _statementEndIndex(tokens, start) {
    if (!tokens[start]) return start;
    const line = tokens[start].line;
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'symbol') {
        if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
        else if (token.value === ')' || token.value === ']' || token.value === '}')
          depth = Math.max(0, depth - 1);
      }
      if (i > start && depth === 0 && (token.value === ';' || token.line !== line)) return i;
    }
    return tokens.length;
  }

  function _inRanges(token, ranges) {
    return ranges.some((range) => token.start >= range.start && token.end <= range.end);
  }

  function _isDefinitionToken(tokens, index) {
    const token = tokens[index];
    const prev = tokens[index - 1];
    const prev2 = tokens[index - 2];
    const next = tokens[index + 1];
    if (!token || token.type !== 'name') return false;
    if (prev?.value === 'local') return true;
    if (prev?.value === 'function' && prev2?.value === 'local') return true;
    if (prev?.value === 'function') return true;
    if (prev?.value === 'for') return true;
    if (prev?.value === '::' || next?.value === '::') return true;
    if (prev?.value === 'goto') return true;
    if (prev?.value === 'type' || (prev?.value === 'export' && next?.value === 'type')) return true;
    return false;
  }

  function _isNonReferenceName(tokens, index) {
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    if (tokens[index].value === 'export' && next?.value === 'type') return true;
    if (prev?.value === '.' || prev?.value === ':') return true;
    if (next?.value === ':' && !_looksLikeMethodCall(tokens, index)) return false;
    return false;
  }

  function _isKnownGlobal(name) {
    if (KNOWN_GLOBALS.has(name)) return true;
    if (typeof RobloxAPI !== 'undefined' && RobloxAPI.resolveGlobal?.(name)) return true;
    return false;
  }

  function _looksLikeTableKey(tokens, index) {
    const token = tokens[index];
    return (
      token?.type === 'name' && tokens[index + 1]?.value === '=' && _insideBraces(tokens, index)
    );
  }

  function _buildBraceDepths(tokens) {
    const depths = new Array(tokens.length);
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      depths[i] = depth;
      if (tokens[i].value === '{') depth++;
      else if (tokens[i].value === '}') depth = Math.max(0, depth - 1);
    }
    return depths;
  }

  function _insideBraces(tokens, index, braceDepths = null) {
    if (braceDepths) return (braceDepths[index] || 0) > 0;
    let depth = 0;
    for (let i = 0; i < index; i++) {
      if (tokens[i].value === '{') depth++;
      else if (tokens[i].value === '}') depth = Math.max(0, depth - 1);
    }
    return depth > 0;
  }

  function _looksLikeMethodCall(tokens, index) {
    return tokens[index + 1]?.value === ':' && tokens[index + 2]?.type === 'name';
  }

  function _nearestKeywordOnLine(tokens, index, names) {
    const line = tokens[index]?.line;
    for (let i = index - 1; i >= 0 && tokens[i].line === line; i--)
      if (names.includes(tokens[i].value)) return tokens[i];
    return null;
  }

  function _skipUntil(tokens, start, value) {
    for (let i = start; i < tokens.length; i++) if (tokens[i].value === value) return i;
    return tokens.length - 1;
  }

  function _isAssignmentStart(tokens, index, braceDepths = null) {
    const token = tokens[index];
    if (!token || token.type !== 'name') return false;
    if (tokens[index - 1]?.value === '.' || tokens[index - 1]?.value === ':') return false;
    if (_insideBraces(tokens, index, braceDepths)) return false;
    const prev = tokens[index - 1];
    if (prev && prev.line === token.line && ![';', 'then', 'do', 'else'].includes(prev.value))
      return false;
    const eq = _assignmentEqualsIndex(tokens, index);
    return eq > index;
  }

  function _assignmentEqualsIndex(tokens, start) {
    const end = _statementEndIndex(tokens, start);
    let depth = 0;
    for (let i = start; i < end; i++) {
      const token = tokens[i];
      if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
      else if (token.value === ')' || token.value === ']' || token.value === '}')
        depth = Math.max(0, depth - 1);
      else if (depth === 0 && token.value === '=') return i;
    }
    return -1;
  }

  function _countTopLevelCommaGroups(tokens, start, end, { lhs }) {
    if (start >= end) return 0;
    let depth = 0;
    let count = 1;
    let sawName = false;
    for (let i = start; i < end; i++) {
      const token = tokens[i];
      if (lhs && (token.value === 'local' || token.value === '<')) continue;
      if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
      else if (token.value === ')' || token.value === ']' || token.value === '}')
        depth = Math.max(0, depth - 1);
      else if (depth === 0 && token.value === ',') count++;
      if (lhs && token.type === 'name') sawName = true;
    }
    return lhs && !sawName ? 0 : count;
  }

  function _assignmentHasOpenArity(tokens, start, end) {
    for (let i = start; i < end; i++) {
      if (tokens[i].value === '...') return true;
      if (tokens[i].type === 'name' && tokens[i + 1]?.value === '(') return true;
    }
    return false;
  }

  function _bodyStartIndex(tokens, block) {
    const openerIndex = tokens.indexOf(block.opener);
    if (openerIndex < 0) return -1;
    if (block.kind === 'if') {
      const thenIndex = _nextTokenIndex(tokens, openerIndex + 1, 'then');
      return thenIndex < 0 ? -1 : thenIndex + 1;
    }
    if (block.kind === 'for' || block.kind === 'while') {
      const doIndex = _nextTokenIndex(tokens, openerIndex + 1, 'do');
      return doIndex < 0 ? -1 : doIndex + 1;
    }
    return openerIndex + 1;
  }

  function _isStructuralToken(token) {
    return ['then', 'do', 'end', 'else', 'elseif', 'until'].includes(token.value);
  }

  function _nextSiblingBranchToken(tokens, start) {
    let depth = 0;
    for (let i = start; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.value === 'if') depth++;
      else if (token.value === 'end') {
        if (depth === 0) return null;
        depth--;
      } else if (depth === 0 && (token.value === 'else' || token.value === 'elseif')) return token;
    }
    return null;
  }

  function _markerFromOffsets(model, start, end, message, severity) {
    const begin = model.getPositionAt(Math.max(0, start));
    const finish = model.getPositionAt(Math.max(start, end));
    const level =
      severity === 'error'
        ? _monaco.MarkerSeverity.Error
        : severity === 'warning'
          ? _monaco.MarkerSeverity.Warning
          : _monaco.MarkerSeverity.Hint;
    return _marker(
      model,
      begin.lineNumber,
      begin.column,
      finish.lineNumber,
      finish.column,
      message,
      level,
    );
  }

  function _collectFolds(model, lines, folds, markers) {
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) continue;
      const first = line.match(/^[A-Za-z_]+/)?.[0];
      if (/--\[(=*)\[/.test(line)) stack.push({ token: 'comment', line: i + 1 });
      if (STATEMENT_OPENERS.has(first) && /\b(do|then)\b/.test(line))
        stack.push({ token: first, line: i + 1 });
      else if (BLOCK_OPENERS.has(first)) stack.push({ token: first, line: i + 1 });
      else if (/\bfunction\b/.test(line) && !/^end\b/.test(line))
        stack.push({ token: 'function', line: i + 1 });
      if (/\bend\b/.test(line))
        _closeFold(
          model,
          folds,
          markers,
          stack,
          i + 1,
          new Set(['function', 'do', 'then', 'if', 'for', 'while']),
        );
      if (/\buntil\b/.test(line))
        _closeFold(model, folds, markers, stack, i + 1, new Set(['repeat']));
      if (/\]=*\]/.test(line) && stack.some((item) => item.token === 'comment'))
        _closeFold(
          model,
          folds,
          markers,
          stack,
          i + 1,
          new Set(['comment']),
          _monaco.languages.FoldingRangeKind.Comment,
        );
    }
    for (const item of stack) {
      if (item.token === 'comment') continue;
      markers.push(
        _marker(
          model,
          item.line,
          1,
          item.line,
          model.getLineMaxColumn(item.line),
          `Missing closing '${item.token === 'repeat' ? 'until' : 'end'}'`,
          _monaco.MarkerSeverity.Warning,
        ),
      );
    }
  }

  function _closeFold(model, folds, markers, stack, endLine, accepted, kind = undefined) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const item = stack.pop();
      if (!item) break;
      if (accepted.has(item.token)) {
        if (endLine > item.line) folds.push({ start: item.line, end: endLine, kind });
        return;
      }
    }
    markers.push(
      _marker(
        model,
        endLine,
        1,
        endLine,
        model.getLineMaxColumn(endLine),
        'Unmatched block closer',
        _monaco.MarkerSeverity.Warning,
      ),
    );
  }

  function _collectDiagnostics(model, stripped, symbols, byName, markers) {
    _modernLuauHints(model, stripped, markers);
  }

  function _modernLuauHints(model, stripped, markers) {
    for (const item of _modernLuauHintsRaw(stripped))
      markers.push(_markerFromOffsets(model, item.start, item.end, item.message, item.severity));
  }

  function _modernLuauHintsRaw(stripped) {
    const markers = [];
    const hints = [
      ['wait', 'Prefer task.wait for scheduler consistency.'],
      ['spawn', 'Prefer task.spawn for scheduler consistency.'],
      ['delay', 'Prefer task.delay for scheduler consistency.'],
    ];
    for (const [name, message] of hints) {
      const re = new RegExp('(?:^|[^.:A-Za-z0-9_])(' + name + ')\\s*\\(', 'g');
      let match;
      while ((match = re.exec(stripped))) {
        const start = match.index + match[0].indexOf(match[1]);
        markers.push({
          start,
          end: start + name.length,
          message,
          severity: 'hint',
        });
      }
    }
    return markers;
  }

  function _marker(
    model,
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn,
    message,
    severity,
  ) {
    return {
      severity,
      message,
      source: 'VelocityUI Luau',
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    };
  }

  function _scopeSuggestions(info, position, range, model = null) {
    const K = _monaco.languages.CompletionItemKind;
    const localLine = position.lineNumber;
    const cursorOffset = _positionOffset(model, position);
    const suggestions = [];
    const seen = new Set();
    const ordered = [...info.symbols].sort(
      (a, b) => Math.abs(a.line - localLine) - Math.abs(b.line - localLine),
    );
    for (const sym of ordered) {
      if (seen.has(sym.name) || sym.offset >= cursorOffset || sym.line > localLine + 200) continue;
      seen.add(sym.name);
      suggestions.push({
        label: sym.name,
        kind:
          sym.kind === 'function' ? K.Function : sym.kind === 'parameter' ? K.Variable : K.Variable,
        detail: _symbolSignature(sym),
        documentation: { value: _symbolDoc(sym) },
        insertText: sym.kind === 'function' ? `${sym.name}($0)` : sym.name,
        insertTextRules:
          sym.kind === 'function'
            ? _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
        sortText: (sym.local ? '0_' : '1_') + sym.name,
        range,
      });
    }
    return suggestions;
  }

  function _memberContext(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const match = line.match(/([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*([.:])\s*\w*$/);
    if (!match) return null;
    const tableMembers = _resolveTableMembers(match[1], model, position);
    const objectMembers = _resolveObjectMembers(match[1], model, position);
    const localMembers = _mergeLocalMembers(tableMembers, objectMembers);
    if (localMembers.length)
      return {
        kind: 'object',
        tableName: match[1],
        members: localMembers,
        sep: match[2],
      };
    const valueType = _resolveValueType(match[1], model, position.lineNumber);
    if (valueType) return { kind: 'value', typeName: valueType, sep: match[2] };
    const className = _resolveType(match[1], model, position.lineNumber);
    return className ? { kind: 'class', className, sep: match[2] } : null;
  }

  function _mergeLocalMembers(...groups) {
    const byName = new Map();
    for (const group of groups) {
      for (const member of group || []) {
        if (!member?.name) continue;
        byName.set(member.name, member);
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function _isMemberAccess(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    return /[A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*\s*[.:]\s*\w*$/.test(line);
  }

  function _memberSuggestions(context, range) {
    const K = _monaco.languages.CompletionItemKind;
    const InsertAsSnippet = _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    if (context.kind === 'table') {
      return _dedupeSuggestions(
        context.members.map((member) => ({
          label: member.name,
          kind: member.detail === 'function' ? K.Function : K.Property,
          detail: member.detail || `field of ${context.tableName}`,
          documentation: { value: `Field from ${context.tableName}.` },
          insertText: member.name,
          range,
          sortText: '0_' + member.name,
        })),
      );
    }
    if (context.kind === 'object') {
      return _dedupeSuggestions(
        context.members
          .filter((member) => context.sep !== ':' || _isCallableMember(member))
          .map((member) => ({
            label: member.name,
            kind: _isCallableMember(member)
              ? member.isMethod
                ? K.Method
                : K.Function
              : K.Property,
            detail: _memberSuggestionDetail(member),
            documentation: { value: _memberDoc(member) },
            insertText: _memberInsertText(member, context.sep),
            insertTextRules: _isCallableMember(member) ? InsertAsSnippet : undefined,
            range,
            sortText:
              (context.sep === ':' && member.isMethod
                ? '0_'
                : context.sep === ':' && _isCallableMember(member)
                  ? '1_'
                  : _isCallableMember(member)
                    ? '1_'
                    : '0_') + member.name,
          })),
      );
    }
    if (context.kind === 'value') return _valueTypeSuggestions(context, range);
    if (typeof RobloxAPI === 'undefined') return [];
    const cls = RobloxAPI.getClass(context.className);
    if (!cls) return [];

    const suggestions = [];
    if (context.sep === '.') {
      for (const [name, type] of cls.p)
        suggestions.push({
          label: name,
          kind: K.Property,
          detail: type,
          insertText: name,
          range,
          sortText: '0_' + name,
        });
      for (const [name, sig] of cls.e)
        suggestions.push({
          label: name,
          kind: K.Event,
          detail: 'RBXScriptSignal ' + sig,
          insertText: name,
          range,
          sortText: '2_' + name,
        });
    }
    for (const [name, ret, args] of cls.m) {
      suggestions.push({
        label: name,
        kind: K.Method,
        detail: `${args || '()'} -> ${ret}`,
        insertText: args ? `${name}(${_snippetArgs(args)})` : `${name}()`,
        insertTextRules: args ? InsertAsSnippet : undefined,
        range,
        sortText: '1_' + name,
      });
    }
    return _dedupeSuggestions(suggestions);
  }

  function _dedupeSuggestions(suggestions) {
    const seen = new Set();
    return suggestions.filter((item) => {
      const key = String(item.label ?? item.insertText ?? '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _isCallableMember(member) {
    return member?.detail === 'function' || member?.isMethod || /^fun\(/.test(member?.detail || '');
  }

  function memberAt(model, position) {
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    const lineBefore = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
    const ownerMatch = lineBefore.match(/([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)\s*([.:])\s*$/);
    if (!ownerMatch) return null;
    const members = _mergeLocalMembers(
      _resolveTableMembers(ownerMatch[1], model, position),
      _resolveObjectMembers(ownerMatch[1], model, position),
    );
    const member = members.find((candidate) => candidate.name === word.word);
    if (!member) return null;
    return {
      ...member,
      sourceRange: member.sourceRange || member.range,
      range: new _monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      ),
    };
  }

  function _resolveCallableMember(expr, model, position) {
    const normalized = expr.trim().replace(/\s*([.:])\s*/g, '$1');
    const match = normalized.match(/^(.+)([.:])([A-Za-z_]\w*)$/);
    if (!match) return null;
    const members = _mergeLocalMembers(
      _resolveTableMembers(match[1], model, position),
      _resolveObjectMembers(match[1], model, position),
    );
    return members.find((member) => member.name === match[3] && _isCallableMember(member)) ?? null;
  }

  function _activeCall(model, position) {
    const textBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    let depth = 0;
    let callStart = -1;
    for (let i = textBefore.length - 1; i >= 0; i--) {
      const ch = textBefore[i];
      if (ch === ')' || ch === '}') {
        depth++;
        continue;
      }
      if (ch === '(') {
        if (depth > 0) {
          depth--;
          continue;
        }
        callStart = i;
        break;
      }
    }
    if (callStart < 0) return null;
    const expr = textBefore
      .slice(0, callStart)
      .trim()
      .match(/[A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*$/)?.[0];
    if (!expr) return null;
    const args = textBefore.slice(callStart + 1);
    let activeParameter = 0;
    let nested = 0;
    for (const ch of args) {
      if (ch === '(' || ch === '{' || ch === '[') {
        nested++;
        continue;
      }
      if (ch === ')' || ch === '}' || ch === ']') {
        nested = Math.max(0, nested - 1);
        continue;
      }
      if (ch === ',' && nested === 0) activeParameter++;
    }
    return { expr, activeParameter };
  }

  function _methodSignature(args, includeSelf) {
    const params = _splitParams(args);
    if (includeSelf && params[0] !== 'self') params.unshift('self');
    return `(${params.join(', ')})`;
  }

  function _splitParams(args) {
    return String(args || '')
      .split(',')
      .map((param) => param.trim())
      .filter(Boolean);
  }

  function _memberParameters(member) {
    const signature = member.signature || '';
    const inner = signature.match(/^\((.*)\)$/)?.[1] ?? '';
    return _splitParams(inner);
  }

  function _memberDisplaySignature(member) {
    if (_isCallableMember(member)) return `${member.name}${member.signature || '()'}`;
    return `${member.name}: ${member.detail || 'field'}`;
  }

  function _memberSuggestionDetail(member) {
    if (_isCallableMember(member)) return _memberDisplaySignature(member);
    return member.detail || `member of ${member.owner || 'object'}`;
  }

  function _memberInsertText(member, sep) {
    if (!_isCallableMember(member)) return member.name;
    const params = _memberParameters(member);
    const visible =
      sep === ':' && params[0]?.replace(/:.*/, '').trim() === 'self' ? params.slice(1) : params;
    return `${member.name}(${_snippetParams(visible)})`;
  }

  function _snippetParams(params) {
    return params
      .map((param, index) => {
        const clean = param.trim().replace(/:.*/, '').replace(/[?]/g, '');
        return '${' + (index + 1) + ':' + clean + '}';
      })
      .join(', ');
  }

  function _memberDoc(member) {
    if (member.inferredFromSelf) {
      return `Inferred from \`self.${member.name}\` inside \`${member.owner}:${member.definedIn}()\` on line ${member.range.startLineNumber}.`;
    }
    if (_isCallableMember(member)) {
      return `Defined on line ${member.range.startLineNumber}${member.owner ? ` as a member of \`${member.owner}\`` : ''}.`;
    }
    return `Assigned on line ${member.range.startLineNumber}${member.owner ? ` as a member of \`${member.owner}\`` : ''}.`;
  }

  function symbolAt(model, position) {
    const word = model.getWordAtPosition(position);
    if (!word) return null;
    const candidates = analyze(model).byName.get(word.word) ?? [];
    if (!candidates.length) return null;
    const cursorOffset = _positionOffset(model, position);
    return candidates.filter((sym) => sym.offset <= cursorOffset).at(-1) ?? null;
  }

  function _wordLocations(model, word) {
    const stripped = strip(model.getValue());
    const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    const locations = [];
    let match;
    while ((match = re.exec(stripped))) {
      const pos = model.getPositionAt(match.index);
      locations.push({
        uri: model.uri,
        range: new _monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column + word.length,
        ),
      });
      if (locations.length > 500) break;
    }
    return locations;
  }

  function _symbolLocations(model, sym) {
    const candidates = analyze(model).byName.get(sym.name) ?? [];
    const next = candidates
      .filter((candidate) => candidate.offset > sym.offset)
      .sort((a, b) => a.offset - b.offset)[0];
    const endOffset = next?.offset ?? Number.POSITIVE_INFINITY;
    return _wordLocations(model, sym.name).filter((loc) => {
      const offset = _positionOffset(model, {
        lineNumber: loc.range.startLineNumber,
        column: loc.range.startColumn,
      });
      return offset >= sym.offset && offset < endOffset;
    });
  }

  function _symbolSignature(sym) {
    if (sym.kind === 'function')
      return `${sym.local ? 'local ' : ''}function ${sym.name}(${sym.detail || ''})`;
    if (sym.kind === 'parameter') return `${sym.name}: parameter`;
    return `${sym.local ? 'local ' : ''}${sym.name}${sym.detail ? ': ' + sym.detail : ''}`;
  }

  function _symbolDoc(sym) {
    if (sym.kind === 'function') return `Defined on line ${sym.line}.`;
    if (sym.kind === 'parameter') return `Function parameter near line ${sym.scopeLine}.`;
    return `Defined on line ${sym.line}.`;
  }

  function _valueTypeSuggestions(context, range) {
    const type = VALUE_TYPES[context.typeName];
    if (!type) return [];
    const K = _monaco.languages.CompletionItemKind;
    const InsertAsSnippet = _monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    const suggestions = [];
    if (context.sep === '.') {
      for (const [name, detail] of type.p)
        suggestions.push({
          label: name,
          kind: K.Property,
          detail,
          insertText: name,
          range,
          sortText: '0_' + name,
        });
    }
    for (const [name, ret, args] of type.m) {
      suggestions.push({
        label: name,
        kind: K.Method,
        detail: `${args || '()'} -> ${ret}`,
        insertText: args && args !== '()' ? `${name}(${_snippetArgs(args)})` : `${name}()`,
        insertTextRules: args && args !== '()' ? InsertAsSnippet : undefined,
        range,
        sortText: '1_' + name,
      });
    }
    return _dedupeSuggestions(suggestions);
  }

  function _resolveValueType(expr, model, lineNumber, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim();
    const directCtor = value.match(
      /^([A-Za-z_]\w*)\s*[.:]\s*(?:new|from\w+|Angles|lookAt|now|palette|random)\s*\(/,
    );
    if (directCtor && VALUE_TYPES[directCtor[1]]) return directCtor[1];
    if (/^Drawing\s*\.\s*new\s*\(/.test(value)) return 'Drawing';
    const local = _resolveLocalValueType(value, model, lineNumber, depth);
    if (local) return local;
    return null;
  }

  function _resolveLocalValueType(name, model, lineNumber, depth) {
    if (!/^[A-Za-z_]\w*$/.test(name)) return null;
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let lineNo = lineNumber; lineNo >= Math.max(1, lineNumber - 240); lineNo--) {
      const line = model.getLineContent(lineNo);
      const annotation = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*:\\s*([A-Za-z_]\\w*)'),
      );
      if (annotation && VALUE_TYPES[annotation[1]]) return annotation[1];
      const ctor = line.match(
        new RegExp(
          '(?:local\\s+)?' +
            safe +
            '\\s*=\\s*([A-Za-z_]\\w*)\\s*[.:]\\s*(?:new|from\\w+|Angles|lookAt|now|palette|random)\\s*\\(',
        ),
      );
      if (ctor && VALUE_TYPES[ctor[1]]) return ctor[1];
      const drawing = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*Drawing\\s*\\.\\s*new\\s*\\('),
      );
      if (drawing) return 'Drawing';
      const alias = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*([A-Za-z_]\\w*)\\b'));
      if (!alias || alias[1] === name) continue;
      const resolved = _resolveValueType(alias[1], model, lineNo, depth + 1);
      if (resolved) return resolved;
    }
    return null;
  }

  function _resolveTableMembers(expr, model, position, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim();
    if (!/^[A-Za-z_]\w*$/.test(value)) return null;
    const info = analyze(model);
    const cursorOffset = _positionOffset(model, position);
    const direct = _latestTableRecord(info.tableMembers.get(value), cursorOffset);
    if (direct) {
      const members = direct.members.filter(
        (member) => direct.closeOffset < cursorOffset || member.offset < cursorOffset,
      );
      return members.length ? members : null;
    }
    const safe = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (
      let lineNo = position.lineNumber;
      lineNo >= Math.max(1, position.lineNumber - 240);
      lineNo--
    ) {
      const raw = model.getLineContent(lineNo);
      const line =
        lineNo === position.lineNumber ? raw.slice(0, Math.max(0, position.column - 1)) : raw;
      const alias = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*([A-Za-z_]\\w*)\\b'));
      if (!alias || alias[1] === value) continue;
      const resolved = _resolveTableMembers(
        alias[1],
        model,
        { lineNumber: lineNo, column: line.length + 1 },
        depth + 1,
      );
      if (resolved) return resolved;
    }
    return null;
  }

  function _resolveObjectMembers(expr, model, position, depth = 0) {
    if (!expr || depth > 4) return null;
    const value = expr.trim().replace(/\s*([.:])\s*/g, '$1');
    const info = analyze(model);
    const cursorOffset = _positionOffset(model, position);
    const direct = _visibleObjectMembers(info.objectMembers.get(value), cursorOffset);
    if (direct.length) return direct;
    const constructed = _constructedObjectOwner(value);
    if (constructed && constructed !== value) {
      const members = _resolveObjectMembers(constructed, model, position, depth + 1);
      if (members?.length) return members;
    }
    if (!/^[A-Za-z_]\w*$/.test(value)) return null;
    const safe = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (
      let lineNo = position.lineNumber;
      lineNo >= Math.max(1, position.lineNumber - 240);
      lineNo--
    ) {
      const raw = model.getLineContent(lineNo);
      const line =
        lineNo === position.lineNumber ? raw.slice(0, Math.max(0, position.column - 1)) : raw;
      const alias = line.match(
        new RegExp(
          '(?:local\\s+)?' +
            safe +
            '\\s*=\\s*([A-Za-z_]\\w*(?:\\s*[.:]\\s*[A-Za-z_]\\w*)*(?:\\s*\\([^\\n)]*\\))?|setmetatable\\s*\\([^\\n)]*\\))',
        ),
      );
      if (!alias || alias[1] === value) continue;
      const target = _constructedObjectOwner(alias[1]) || alias[1];
      const resolved = _resolveObjectMembers(
        target,
        model,
        { lineNumber: lineNo, column: line.length + 1 },
        depth + 1,
      );
      if (resolved?.length) return resolved;
    }
    return null;
  }

  function _constructedObjectOwner(expr) {
    const value = expr.trim().replace(/\s*([.:])\s*/g, '$1');
    const setmeta = value.match(/setmetatable\s*\([^,]+,\s*([A-Za-z_]\w*)\s*\)/);
    if (setmeta) return setmeta[1];
    const ctor = value.match(/^([A-Za-z_]\w*)[.:](?:new|create|init|New|Create)\s*(?:\(|$)/);
    if (ctor) return ctor[1];
    return null;
  }

  function _visibleObjectMembers(records, cursorOffset) {
    if (!records?.length) return [];
    const byName = new Map();
    for (const member of records) {
      if (member.offset < cursorOffset) byName.set(member.name, member);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function _latestTableRecord(records, cursorOffset) {
    if (!records?.length) return null;
    return (
      records
        .filter((record) => record.offset < cursorOffset)
        .sort((a, b) => b.offset - a.offset)[0] || null
    );
  }

  function _memberDefinitionTarget(member, currentModel) {
    const range = member.sourceRange || member.range;
    if (!range) return null;
    return { uri: currentModel.uri, range };
  }

  function _resolveType(expr, model, lineNumber, depth = 0) {
    if (!expr || depth > 6 || typeof RobloxAPI === 'undefined') return null;
    const value = expr.trim();
    const global = RobloxAPI.resolveGlobal(value);
    if (global) return global;
    const instance = value.match(/Instance\.new\(\s*["'](\w+)["']/);
    if (instance) return instance[1];
    const service = value.match(/(?:game|Game)\s*:\s*GetService\(\s*["'](\w+)["']/);
    if (service) return RobloxAPI.resolveService(service[1]) || service[1];
    const gameDot = value.match(/(?:game|Game)\.(\w+)$/);
    if (gameDot) return RobloxAPI.resolveService(gameDot[1]);
    const local = _resolveLocalType(value, model, lineNumber);
    if (local) return local;
    const chain = value.match(/^(.+?)[.:](\w+)(?:\([^)]*\))?$/);
    if (!chain) return null;
    const lhs = _resolveType(chain[1], model, lineNumber, depth + 1);
    const cls = lhs ? RobloxAPI.getClass(lhs) : null;
    if (!cls) return null;
    const method = cls.m.find((m) => m[0] === chain[2]);
    if (method) return _cleanType(method[1]);
    const prop = cls.p.find((p) => p[0] === chain[2]);
    if (prop) return _cleanType(prop[1]);
    return null;
  }

  function _resolveLocalType(name, model, lineNumber) {
    if (!/^[A-Za-z_]\w*$/.test(name) || typeof RobloxAPI === 'undefined') return null;
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let lineNo = lineNumber; lineNo >= Math.max(1, lineNumber - 240); lineNo--) {
      const line = model.getLineContent(lineNo);
      const annotation = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*:\\s*(\\w+)'));
      if (annotation && RobloxAPI.getClass(annotation[1])) return annotation[1];
      const instance = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*Instance\\.new\\(["\'](\\w+)["\']'),
      );
      if (instance) return instance[1];
      const service = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*game\\s*:\\s*GetService\\(["\'](\\w+)["\']'),
      );
      if (service) return RobloxAPI.resolveService(service[1]) || service[1];
      const global = line.match(
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*(game|workspace|script)\\b'),
      );
      if (global) return RobloxAPI.resolveGlobal(global[1]);
      const gameDot = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*game\\.(\\w+)'));
      if (gameDot) return RobloxAPI.resolveService(gameDot[1]);
    }
    return null;
  }

  function _cleanType(type) {
    if (!type || type.startsWith('(')) return null;
    const clean = type.replace(/[?{}]/g, '').trim();
    if (typeof RobloxAPI !== 'undefined' && RobloxAPI.getClass(clean)) return clean;
    return clean === 'Instance' ? 'Instance' : null;
  }

  function _snippetArgs(args) {
    const inner = args.replace(/^\(|\)$/g, '').trim();
    if (!inner) return '';
    return inner
      .split(',')
      .map(
        (param, index) =>
          '${' + (index + 1) + ':' + param.trim().split(':')[0].replace(/[?]/g, '').trim() + '}',
      )
      .join(', ');
  }

  function _lineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') offsets.push(i + 1);
    return offsets;
  }

  function _positionOffset(model, position, text = null) {
    if (model?.getOffsetAt) return model.getOffsetAt(position);
    const value = text ?? model?.getValue?.() ?? '';
    let line = 1;
    let column = 1;
    for (let i = 0; i < value.length; i++) {
      if (line === position.lineNumber && column === position.column) return i;
      if (value[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return value.length;
  }

  return { register, analyze };
})();
