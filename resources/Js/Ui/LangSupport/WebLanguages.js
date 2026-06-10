const WebLanguages = (() => {
  function buildJsTsProvider(monaco) {
    const K = monaco.languages.SymbolKind;
    return {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        const total = lines.length;
        const root = [];
        const stack = [];
        const cur = () => stack[stack.length - 1] ?? null;
        const rClass = /^(?:export\s+(?:default\s+)?)?class\s+([\w$]+)/;
        const rFnDecl = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s+([\w$]+)\s*\(/;
        const rArrow =
          /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>/;
        const rFnExpr = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?function/;
        const rObj = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*\{/;
        const rMethod =
          /^(\s+)(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([\w$#]+)\s*\([^)]*\)\s*\{/;
        const rOpen = /\{\s*$/;
        let depth = 0;
        const depthAtPush = [];
        lines.forEach((raw, i) => {
          const ln = i + 1;
          const trimmed = raw.trimStart();
          let m, name, kind;
          if ((m = rClass.exec(trimmed))) {
            name = m[1];
            kind = K.Class;
          } else if ((m = rFnDecl.exec(trimmed))) {
            name = m[1];
            kind = K.Function;
          } else if ((m = rArrow.exec(trimmed))) {
            name = m[1];
            kind = K.Function;
          } else if ((m = rFnExpr.exec(trimmed))) {
            name = m[1];
            kind = K.Function;
          } else if (cur() && (m = rMethod.exec(raw)) && !['if', 'for', 'while'].includes(m[2])) {
            name = m[2];
            kind = K.Method;
          } else if ((m = rObj.exec(trimmed))) {
            name = m[1];
            kind = K.Module;
          }
          const opens = (raw.match(/\{/g) ?? []).length;
          const closes = (raw.match(/\}/g) ?? []).length;
          if (name && rOpen.test(raw)) {
            const r = {
              startLineNumber: ln,
              startColumn: 1,
              endLineNumber: ln,
              endColumn: raw.length + 1,
            };
            const sym = {
              name,
              detail: '',
              kind,
              range: {
                ...r,
              },
              selectionRange: r,
              children: [],
            };
            depthAtPush.push(depth);
            stack.push(sym);
          }
          depth += opens - closes;
          while (stack.length && depth <= depthAtPush[depthAtPush.length - 1]) {
            const top = stack.pop();
            depthAtPush.pop();
            top.range = {
              ...top.range,
              endLineNumber: ln,
            };
            (cur()?.children ?? root).push(top);
          }
        });
        while (stack.length) {
          const top = stack.pop();
          depthAtPush.pop();
          top.range = {
            ...top.range,
            endLineNumber: total,
          };
          (cur()?.children ?? root).push(top);
        }
        return root;
      },
    };
  }
  function buildHtmlProvider(monaco) {
    const K = monaco.languages.SymbolKind;
    const VOID = new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);
    const labelFromTag = (tag, attrs) => {
      let label = tag;
      const id = attrs.match(/id=["']([^"']+)["']/);
      const cls = attrs.match(/class=["']([^"']+)["']/);
      if (id) label += '#' + id[1].split(' ')[0];
      else if (cls) label += '.' + cls[1].trim().split(/\s+/)[0];
      return label;
    };
    return {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        const root = [];
        const stack = [];
        const cur = () => stack[stack.length - 1] ?? null;
        lines.forEach((raw, i) => {
          const ln = i + 1;
          for (const t of raw.match(/<\/?[a-zA-Z][^>]*>/g) ?? []) {
            let m;
            if ((m = t.match(/^<([a-zA-Z][a-zA-Z0-9-]*)([^>]*[^\/])?>$/))) {
              const tag = m[1].toLowerCase();
              if (VOID.has(tag)) continue;
              const r = {
                startLineNumber: ln,
                startColumn: 1,
                endLineNumber: ln,
                endColumn: raw.length + 1,
              };
              stack.push({
                name: labelFromTag(tag, m[2]),
                detail: '',
                kind: K.Module,
                range: {
                  ...r,
                },
                selectionRange: r,
                children: [],
              });
            } else if ((m = t.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)>$/))) {
              const tag = m[1].toLowerCase();
              for (let j = stack.length - 1; j >= 0; j--) {
                const sym = stack[j];
                const symTag = sym.name.replace(/[#.].*/, '').toLowerCase();
                if (symTag === tag) {
                  sym.range = {
                    ...sym.range,
                    endLineNumber: ln,
                  };
                  const popped = stack.splice(j);
                  const matched = popped.shift();
                  stack.push(...popped);
                  (cur()?.children ?? root).push(matched);
                  break;
                }
              }
            }
          }
        });
        while (stack.length) {
          const top = stack.pop();
          (cur()?.children ?? root).push(top);
        }
        return root;
      },
    };
  }
  function buildCssProvider(monaco) {
    const K = monaco.languages.SymbolKind;
    const rSel = /^([.#:\[w@&][^{]+)\{\s*$/;
    const rClose = /^\s*\}\s*$/;
    return {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        const root = [];
        const stack = [];
        const cur = () => stack[stack.length - 1] ?? null;
        lines.forEach((raw, i) => {
          const ln = i + 1;
          const trimmed = raw.trim();
          let m;
          if ((m = rSel.exec(trimmed))) {
            const r = {
              startLineNumber: ln,
              startColumn: 1,
              endLineNumber: ln,
              endColumn: raw.length + 1,
            };
            stack.push({
              name: m[1].trim(),
              detail: '',
              kind: K.Class,
              range: {
                ...r,
              },
              selectionRange: r,
              children: [],
            });
          } else if (rClose.test(trimmed) && stack.length) {
            const top = stack.pop();
            top.range = {
              ...top.range,
              endLineNumber: ln,
            };
            (cur()?.children ?? root).push(top);
          }
        });
        while (stack.length) {
          const t = stack.pop();
          (cur()?.children ?? root).push(t);
        }
        return root;
      },
    };
  }
  function buildJsonProvider(monaco) {
    const K = monaco.languages.SymbolKind;
    const rKey = /^\s+"([^"]+)"\s*:/;
    return {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        const root = [];
        lines.forEach((raw, i) => {
          const m = rKey.exec(raw);
          if (!m) return;
          const ln = i + 1;
          const r = {
            startLineNumber: ln,
            startColumn: 1,
            endLineNumber: ln,
            endColumn: raw.length + 1,
          };
          root.push({
            name: m[1],
            detail: '',
            kind: K.Property,
            range: r,
            selectionRange: r,
            children: [],
          });
        });
        return root;
      },
    };
  }
  function registerAll(monaco) {
    const providers = new Map();
    const js = buildJsTsProvider(monaco);
    const html = buildHtmlProvider(monaco);
    const css = buildCssProvider(monaco);
    const json = buildJsonProvider(monaco);
    for (const lang of ['javascript', 'typescript']) {
      monaco.languages.registerDocumentSymbolProvider(lang, js);
      providers.set(lang, js);
    }
    monaco.languages.registerDocumentSymbolProvider('html', html);
    providers.set('html', html);
    for (const lang of ['css', 'scss', 'less']) {
      monaco.languages.registerDocumentSymbolProvider(lang, css);
      providers.set(lang, css);
    }
    monaco.languages.registerDocumentSymbolProvider('json', json);
    providers.set('json', json);
    return providers;
  }
  return {
    registerAll,
  };
})();
