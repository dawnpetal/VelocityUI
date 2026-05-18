const LuaLanguage = (() => {
  const KEYWORDS = [
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
  ];
  const VANILLA_LUA_CONTROL_KEYWORDS = [
    'break',
    'continue',
    'do',
    'else',
    'for',
    'if',
    'elseif',
    'goto',
    'return',
    'then',
    'repeat',
    'while',
    'until',
    'end',
    'in',
  ];
  const VANILLA_LUA_LOGICAL_KEYWORDS = ['and', 'or', 'not'];
  const VANILLA_LUA_CONSTANTS = ['false', 'nil', 'true', '_ENV', '_G', '_VERSION'];
  const VANILLA_LUA_GLOBAL_FUNCTIONS = [
    'assert',
    'collectgarbage',
    'dofile',
    'error',
    'getfenv',
    'getmetatable',
    'ipairs',
    'load',
    'loadfile',
    'loadstring',
    'module',
    'next',
    'pairs',
    'pcall',
    'print',
    'rawequal',
    'rawget',
    'rawlen',
    'rawset',
    'require',
    'select',
    'setfenv',
    'setmetatable',
    'tonumber',
    'tostring',
    'type',
    'unpack',
    'xpcall',
  ];
  const VANILLA_LUA_DOTTED_CONSTANTS = [
    'math.pi',
    'math.huge',
    'math.maxinteger',
    'math.mininteger',
    'utf8.charpattern',
    'io.stdin',
    'io.stdout',
    'io.stderr',
    'package.config',
    'package.cpath',
    'package.loaded',
    'package.loaders',
    'package.path',
    'package.preload',
    'package.searchers',
  ];
  const VANILLA_LUA_LIBRARY_FUNCTIONS = [
    'coroutine.create',
    'coroutine.isyieldable',
    'coroutine.close',
    'coroutine.resume',
    'coroutine.running',
    'coroutine.status',
    'coroutine.wrap',
    'coroutine.yield',
    'string.byte',
    'string.char',
    'string.dump',
    'string.find',
    'string.format',
    'string.gmatch',
    'string.gsub',
    'string.len',
    'string.lower',
    'string.match',
    'string.pack',
    'string.packsize',
    'string.rep',
    'string.reverse',
    'string.sub',
    'string.unpack',
    'string.upper',
    'table.concat',
    'table.create',
    'table.insert',
    'table.maxn',
    'table.move',
    'table.pack',
    'table.remove',
    'table.sort',
    'table.unpack',
    'math.abs',
    'math.acos',
    'math.asin',
    'math.atan',
    'math.atan2',
    'math.ceil',
    'math.cos',
    'math.cosh',
    'math.deg',
    'math.exp',
    'math.floor',
    'math.fmod',
    'math.frexp',
    'math.ldexp',
    'math.log',
    'math.log10',
    'math.max',
    'math.min',
    'math.modf',
    'math.pow',
    'math.rad',
    'math.random',
    'math.randomseed',
    'math.sin',
    'math.sinh',
    'math.sqrt',
    'math.tan',
    'math.tanh',
    'math.tointeger',
    'math.type',
    'io.close',
    'io.flush',
    'io.input',
    'io.lines',
    'io.open',
    'io.output',
    'io.popen',
    'io.read',
    'io.tmpfile',
    'io.type',
    'io.write',
    'os.clock',
    'os.date',
    'os.difftime',
    'os.execute',
    'os.exit',
    'os.getenv',
    'os.remove',
    'os.rename',
    'os.setlocale',
    'os.time',
    'os.tmpname',
    'package.loadlib',
    'package.seeall',
    'package.searchpath',
    'debug.debug',
    'debug.getfenv',
    'debug.gethook',
    'debug.getinfo',
    'debug.getlocal',
    'debug.getmetatable',
    'debug.getregistry',
    'debug.getupvalue',
    'debug.getuservalue',
    'debug.setcstacklimit',
    'debug.setfenv',
    'debug.sethook',
    'debug.setlocal',
    'debug.setmetatable',
    'debug.setupvalue',
    'debug.setuservalue',
    'debug.traceback',
    'debug.upvalueid',
    'debug.upvaluejoin',
    'bit32.arshift',
    'bit32.band',
    'bit32.bnot',
    'bit32.bor',
    'bit32.btest',
    'bit32.bxor',
    'bit32.extract',
    'bit32.replace',
    'bit32.lrotate',
    'bit32.lshift',
    'bit32.rrotate',
    'bit32.rshift',
    'utf8.char',
    'utf8.codes',
    'utf8.codepoint',
    'utf8.len',
    'utf8.offset',
  ];
  const VANILLA_LUA_DOC_TAGS = [
    'alias',
    'cast',
    'class',
    'deprecated',
    'diagnostic',
    'enum',
    'field',
    'generic',
    'meta',
    'module',
    'operator',
    'overload',
    'package',
    'param',
    'private',
    'protected',
    'return',
    'see',
    'type',
    'vararg',
    'version',
  ];
  const VANILLA_LUA_LDOC_TAGS = [
    'alias',
    'annotation',
    'author',
    'charset',
    'class',
    'classmod',
    'comment',
    'constructor',
    'copyright',
    'description',
    'example',
    'export',
    'factory',
    'field',
    'file',
    'fixme',
    'function',
    'include',
    'lfunction',
    'license',
    'local',
    'module',
    'name',
    'param',
    'pragma',
    'private',
    'raise',
    'release',
    'return',
    'script',
    'section',
    'see',
    'set',
    'static',
    'submodule',
    'summary',
    'tfield',
    'thread',
    'todo',
    'topic',
    'tparam',
    'treturn',
    'type',
    'usage',
    'warning',
    'within',
  ];
  const _escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const _wordListRegex = (values) => new RegExp(`\\b(?:${values.map(_escapeRegex).join('|')})\\b`);
  const _dottedListRegex = (values) =>
    new RegExp(`\\b(?:${values.map(_escapeRegex).join('|')})\\b`);
  const VANILLA_CONTROL_RE = _wordListRegex(VANILLA_LUA_CONTROL_KEYWORDS);
  const VANILLA_LOGICAL_RE = _wordListRegex(VANILLA_LUA_LOGICAL_KEYWORDS);
  const VANILLA_CONSTANT_RE = _wordListRegex(VANILLA_LUA_CONSTANTS);
  const VANILLA_GLOBAL_FUNCTION_RE = _wordListRegex(VANILLA_LUA_GLOBAL_FUNCTIONS);
  const VANILLA_DOTTED_CONSTANT_RE = _dottedListRegex(VANILLA_LUA_DOTTED_CONSTANTS);
  const VANILLA_LIBRARY_FUNCTION_RE = _dottedListRegex(VANILLA_LUA_LIBRARY_FUNCTIONS);
  const VANILLA_DOC_TAG_RE = new RegExp(
    `@(?:${VANILLA_LUA_DOC_TAGS.map(_escapeRegex).join('|')})\\b`,
  );
  const VANILLA_LDOC_TAG_RE = new RegExp(
    `@(?:${VANILLA_LUA_LDOC_TAGS.map(_escapeRegex).join('|')})\\b`,
  );
  const BUILTINS = [
    'print',
    'type',
    'typeof',
    'tostring',
    'tonumber',
    'pairs',
    'ipairs',
    'next',
    'select',
    'unpack',
    'table',
    'string',
    'math',
    'io',
    'os',
    'coroutine',
    'package',
    'require',
    'pcall',
    'xpcall',
    'error',
    'assert',
    'rawget',
    'rawset',
    'rawequal',
    'setmetatable',
    'getmetatable',
    'load',
    'loadstring',
    'dofile',
    'loadfile',
    'collectgarbage',
    'rawlen',
    'warn',
    'setfenv',
    'getfenv',
    'newproxy',
    'gcinfo',
  ];
  const EXECUTOR_GLOBALS = [
    'checkcaller',
    'clonefunction',
    'getfunctionhash',
    'hookfunction',
    'hookmetamethod',
    'iscclosure',
    'islclosure',
    'isexecutorclosure',
    'newcclosure',
    'restorefunction',
    'debug',
    'Drawing',
    'cleardrawcache',
    'getrenderproperty',
    'isrenderobj',
    'setrenderproperty',
    'base64encode',
    'base64decode',
    'lz4compress',
    'lz4decompress',
    'getgenv',
    'getrenv',
    'getgc',
    'filtergc',
    'getreg',
    'writefile',
    'readfile',
    'appendfile',
    'listfiles',
    'delfile',
    'delfolder',
    'isfile',
    'isfolder',
    'makefolder',
    'getcustomasset',
    'getinstances',
    'getnilinstances',
    'compareinstances',
    'cloneref',
    'gethui',
    'getcallbackvalue',
    'fireclickdetector',
    'fireproximityprompt',
    'firetouchinterest',
    'getrawmetatable',
    'setrawmetatable',
    'setreadonly',
    'isreadonly',
    'getnamecallmethod',
    'identifyexecutor',
    'request',
    'gethiddenproperty',
    'sethiddenproperty',
    'setscriptable',
    'isscriptable',
    'getthreadidentity',
    'setthreadidentity',
    'getscriptbytecode',
    'getscripthash',
    'getscriptclosure',
    'getsenv',
    'getscripts',
    'getrunningscripts',
    'getloadedmodules',
    'getcallingscript',
    'getconnections',
    'firesignal',
    'replicatesignal',
    'WebSocket',
    'task',
  ];
  const ROBLOX_GLOBALS = [
    'game',
    'workspace',
    'script',
    'plugin',
    'shared',
    '_G',
    'Instance',
    'Vector2',
    'Vector3',
    'CFrame',
    'Color3',
    'BrickColor',
    'UDim',
    'UDim2',
    'Rect',
    'Region3',
    'Ray',
    'Axes',
    'Faces',
    'NumberSequence',
    'NumberSequenceKeypoint',
    'ColorSequence',
    'ColorSequenceKeypoint',
    'NumberRange',
    'PhysicalProperties',
    'Random',
    'TweenInfo',
    'DateTime',
    'Enum',
    'RaycastParams',
    'OverlapParams',
    'RaycastResult',
    'Vector3int16',
    'Vector2int16',
  ];
  const STATIC_NAMESPACES = {
    Instance: ['new'],
    Vector3: ['new', 'fromNormalId', 'fromAxis', 'zero', 'one', 'xAxis', 'yAxis', 'zAxis'],
    Vector2: ['new', 'zero', 'one', 'xAxis', 'yAxis'],
    CFrame: [
      'new',
      'fromEulerAnglesXYZ',
      'fromEulerAnglesYXZ',
      'Angles',
      'fromAxisAngle',
      'lookAt',
      'identity',
    ],
    Color3: ['new', 'fromRGB', 'fromHSV', 'fromHex'],
    UDim2: ['new', 'fromScale', 'fromOffset'],
    UDim: ['new'],
    TweenInfo: ['new'],
    Ray: ['new'],
    Rect: ['new'],
    NumberRange: ['new'],
    NumberSequence: ['new'],
    ColorSequence: ['new'],
    NumberSequenceKeypoint: ['new'],
    ColorSequenceKeypoint: ['new'],
    PhysicalProperties: ['new'],
    RaycastParams: ['new'],
    OverlapParams: ['new'],
    Random: ['new'],
    DateTime: ['now', 'fromUnixTimestamp', 'fromUnixTimestampMillis', 'fromIsoDate'],
    Vector3int16: ['new'],
    Vector2int16: ['new'],
    Drawing: ['new'],
    BrickColor: ['new', 'palette', 'random', 'White', 'Black', 'Red', 'Yellow', 'Green', 'Blue'],
  };
  const STD_MEMBERS = {
    string: {
      methods: [
        {
          name: 'byte',
          sig: '(s: string, f: number?, t: number?) -> ...number',
          doc: 'Returns the numeric byte codes of characters in s[f..t]. f defaults to 1, t defaults to f.',
        },
        {
          name: 'char',
          sig: '(...number) -> string',
          doc: 'Returns a string formed from the numeric byte values passed as arguments.',
        },
        {
          name: 'find',
          sig: '(s: string, p: string, init: number?, plain: boolean?) -> (number?, number?, ...string)',
          doc: 'Finds pattern p in s starting at init. Returns start, end, and any captures, or nil.',
        },
        {
          name: 'format',
          sig: '(s: string, ...any) -> string',
          doc: 'Returns a formatted string using printf-style format specifiers: %s %d %f %q %x etc.',
        },
        {
          name: 'gmatch',
          sig: '(s: string, p: string) -> iterator',
          doc: 'Returns an iterator over all matches of pattern p in s.',
        },
        {
          name: 'gsub',
          sig: '(s: string, p: string, f: string|table|function, maxs: number?) -> (string, number)',
          doc: 'Replaces all matches of pattern p in s using f. Returns the new string and the substitution count.',
        },
        {
          name: 'len',
          sig: '(s: string) -> number',
          doc: 'Returns the number of bytes in the string. Equivalent to #s.',
        },
        {
          name: 'lower',
          sig: '(s: string) -> string',
          doc: 'Returns a copy of s with all ASCII uppercase letters converted to lowercase.',
        },
        {
          name: 'match',
          sig: '(s: string, p: string, init: number?) -> ...string?',
          doc: 'Finds pattern p in s starting at init. Returns captures, or the full match if no captures, or nil.',
        },
        {
          name: 'rep',
          sig: '(s: string, n: number) -> string',
          doc: 'Returns s repeated n times. Returns empty string if n <= 0.',
        },
        {
          name: 'reverse',
          sig: '(s: string) -> string',
          doc: 'Returns s with byte order reversed. Only works correctly for binary/ASCII strings.',
        },
        {
          name: 'sub',
          sig: '(s: string, f: number, t: number?) -> string',
          doc: 'Returns the substring s[f..t]. t defaults to #s. Negative indices count from end.',
        },
        {
          name: 'upper',
          sig: '(s: string) -> string',
          doc: 'Returns a copy of s with all ASCII lowercase letters converted to uppercase.',
        },
        {
          name: 'split',
          sig: '(s: string, sep: string?) -> {string}',
          doc: "Splits s by sep (default ',') and returns the resulting substrings as a table.",
        },
        {
          name: 'pack',
          sig: '(f: string, ...any) -> string',
          doc: 'Packs values into a binary string using a pack format string.',
        },
        {
          name: 'packsize',
          sig: '(f: string) -> number',
          doc: 'Returns the size in bytes of a packed string produced by the given format.',
        },
        {
          name: 'unpack',
          sig: '(f: string, s: string, pos: number?) -> (...any, number)',
          doc: 'Unpacks values from binary string s using a pack format string, starting at pos.',
        },
      ],
    },
    math: {
      props: [
        {
          name: 'pi',
          doc: 'The mathematical constant π ≈ 3.14159265358979',
        },
        {
          name: 'huge',
          doc: 'Positive infinity (math.huge > any number)',
        },
        {
          name: 'maxinteger',
          doc: 'Maximum integer value representable as a number',
        },
        {
          name: 'mininteger',
          doc: 'Minimum integer value representable as a number',
        },
      ],
      methods: [
        {
          name: 'abs',
          sig: '(n: number) -> number',
          doc: 'Returns the absolute value of n.',
        },
        {
          name: 'acos',
          sig: '(n: number) -> number',
          doc: 'Returns the arc cosine of n in radians. Input must be in [-1, 1].',
        },
        {
          name: 'asin',
          sig: '(n: number) -> number',
          doc: 'Returns the arc sine of n in radians. Input must be in [-1, 1].',
        },
        {
          name: 'atan',
          sig: '(n: number) -> number',
          doc: 'Returns the arc tangent of n in radians.',
        },
        {
          name: 'atan2',
          sig: '(y: number, x: number) -> number',
          doc: 'Returns the arc tangent of y/x, using both signs to determine the quadrant.',
        },
        {
          name: 'ceil',
          sig: '(n: number) -> number',
          doc: 'Rounds n up to the next integer boundary.',
        },
        {
          name: 'clamp',
          sig: '(n: number, min: number, max: number) -> number',
          doc: 'Returns n clamped to [min, max].',
        },
        {
          name: 'cos',
          sig: '(n: number) -> number',
          doc: 'Returns the cosine of angle n (radians).',
        },
        {
          name: 'cosh',
          sig: '(n: number) -> number',
          doc: 'Returns the hyperbolic cosine of n.',
        },
        {
          name: 'deg',
          sig: '(n: number) -> number',
          doc: 'Converts n from radians to degrees.',
        },
        {
          name: 'exp',
          sig: '(n: number) -> number',
          doc: 'Returns e^n.',
        },
        {
          name: 'floor',
          sig: '(n: number) -> number',
          doc: 'Rounds n down to the previous integer boundary.',
        },
        {
          name: 'fmod',
          sig: '(x: number, y: number) -> number',
          doc: 'Returns x modulo y, rounded towards zero.',
        },
        {
          name: 'frexp',
          sig: '(n: number) -> (number, number)',
          doc: 'Returns the significand and exponent of n such that n = s * 2^e.',
        },
        {
          name: 'ldexp',
          sig: '(s: number, e: number) -> number',
          doc: 'Returns s * 2^e.',
        },
        {
          name: 'lerp',
          sig: '(a: number, b: number, t: number) -> number',
          doc: 'Linearly interpolates between a and b by factor t.',
        },
        {
          name: 'log',
          sig: '(n: number, base: number?) -> number',
          doc: 'Returns the logarithm of n in the given base (default e).',
        },
        {
          name: 'log10',
          sig: '(n: number) -> number',
          doc: 'Returns the base-10 logarithm of n.',
        },
        {
          name: 'max',
          sig: '(...number) -> number',
          doc: 'Returns the maximum of all arguments.',
        },
        {
          name: 'min',
          sig: '(...number) -> number',
          doc: 'Returns the minimum of all arguments.',
        },
        {
          name: 'modf',
          sig: '(n: number) -> (number, number)',
          doc: 'Returns the integer and fractional parts of n with the same sign as n.',
        },
        {
          name: 'noise',
          sig: '(x: number, y: number?, z: number?) -> number',
          doc: 'Returns 3D Perlin noise for (x, y, z). Returns a value in [-1, 1].',
        },
        {
          name: 'pow',
          sig: '(x: number, y: number) -> number',
          doc: 'Returns x raised to the power of y.',
        },
        {
          name: 'rad',
          sig: '(n: number) -> number',
          doc: 'Converts n from degrees to radians.',
        },
        {
          name: 'random',
          sig: '(min: number?, max: number?) -> number',
          doc: 'Returns a random number. No args: [0,1]. One arg: [1,n]. Two args: [min,max].',
        },
        {
          name: 'randomseed',
          sig: '(seed: number) -> ()',
          doc: 'Seeds the global random number generator.',
        },
        {
          name: 'round',
          sig: '(n: number) -> number',
          doc: 'Rounds n to the nearest integer. Halfway rounds away from zero.',
        },
        {
          name: 'sign',
          sig: '(n: number) -> number',
          doc: 'Returns -1, 0, or 1 depending on the sign of n.',
        },
        {
          name: 'sin',
          sig: '(n: number) -> number',
          doc: 'Returns the sine of angle n (radians).',
        },
        {
          name: 'sinh',
          sig: '(n: number) -> number',
          doc: 'Returns the hyperbolic sine of n.',
        },
        {
          name: 'sqrt',
          sig: '(n: number) -> number',
          doc: 'Returns the square root of n.',
        },
        {
          name: 'tan',
          sig: '(n: number) -> number',
          doc: 'Returns the tangent of angle n (radians).',
        },
        {
          name: 'tanh',
          sig: '(n: number) -> number',
          doc: 'Returns the hyperbolic tangent of n.',
        },
      ],
    },
    table: {
      methods: [
        {
          name: 'clear',
          sig: '(t: table) -> ()',
          doc: 'Removes all elements from t while preserving its capacity.',
        },
        {
          name: 'clone',
          sig: '(t: table) -> table',
          doc: 'Returns a shallow copy of t with the same metatable. The copy is not frozen.',
        },
        {
          name: 'concat',
          sig: '(a: {string}, sep: string?, f: number?, t: number?) -> string',
          doc: 'Concatenates array elements in [f..t] with sep as separator.',
        },
        {
          name: 'create',
          sig: '(n: number, v: any?) -> table',
          doc: 'Creates a table with n preallocated slots, all set to v.',
        },
        {
          name: 'find',
          sig: '(t: table, v: any, init: number?) -> number?',
          doc: 'Returns the index of the first occurrence of v in t, or nil.',
        },
        {
          name: 'freeze',
          sig: '(t: table) -> table',
          doc: 'Freezes t so modifications raise an error. Returns t.',
        },
        {
          name: 'insert',
          sig: '(t: table, pos: number?, v: any) -> ()',
          doc: 'Inserts v at pos (or end). Shifts subsequent elements.',
        },
        {
          name: 'isfrozen',
          sig: '(t: table) -> boolean',
          doc: 'Returns true if t is frozen.',
        },
        {
          name: 'maxn',
          sig: '(t: table) -> number',
          doc: 'Returns the maximum numeric key, or 0 if none.',
        },
        {
          name: 'move',
          sig: '(a: table, f: number, t: number, d: number, tt: table?) -> ()',
          doc: 'Copies elements a[f..t] into tt (or a) starting at index d.',
        },
        {
          name: 'pack',
          sig: '(...any) -> table',
          doc: 'Returns a table of all arguments with field n set to the argument count.',
        },
        {
          name: 'remove',
          sig: '(t: table, i: number?) -> any',
          doc: 'Removes and returns element at index i (default: last element).',
        },
        {
          name: 'sort',
          sig: '(t: table, f: ((any, any) -> boolean)?) -> ()',
          doc: 'Sorts t in-place. f is a comparator predicate; defaults to <.',
        },
        {
          name: 'unpack',
          sig: '(a: table, f: number?, t: number?) -> ...any',
          doc: 'Returns elements a[f..t]. f defaults to 1, t defaults to #a.',
        },
      ],
    },
    coroutine: {
      methods: [
        {
          name: 'create',
          sig: '(f: function) -> thread',
          doc: 'Creates a new coroutine wrapping f. Does not start it.',
        },
        {
          name: 'resume',
          sig: '(co: thread, ...any) -> (boolean, ...any)',
          doc: 'Resumes coroutine co, passing args. Returns success and any yielded/returned values.',
        },
        {
          name: 'yield',
          sig: '(...any) -> ...any',
          doc: 'Suspends the current coroutine, passing values to the resumer.',
        },
        {
          name: 'wrap',
          sig: '(f: function) -> function',
          doc: 'Returns a function that resumes the coroutine each time it is called.',
        },
        {
          name: 'status',
          sig: '(co: thread) -> string',
          doc: "Returns 'running', 'suspended', 'normal', or 'dead'.",
        },
        {
          name: 'running',
          sig: '() -> (thread, boolean)',
          doc: 'Returns the running coroutine and true if it is the main thread.',
        },
        {
          name: 'isyieldable',
          sig: '() -> boolean',
          doc: 'Returns true if the running coroutine can yield.',
        },
        {
          name: 'close',
          sig: '(co: thread) -> (boolean, any)',
          doc: 'Closes coroutine co, releasing its resources. Returns success and any error.',
        },
      ],
    },
    os: {
      methods: [
        {
          name: 'clock',
          sig: '() -> number',
          doc: 'Returns CPU time used by the program in seconds.',
        },
        {
          name: 'time',
          sig: '(t: table?) -> number',
          doc: 'Returns the current time as a Unix timestamp, or converts table t to a timestamp.',
        },
        {
          name: 'date',
          sig: '(f: string?, t: number?) -> string|table',
          doc: 'Returns a formatted date string or table. Uses strftime format codes.',
        },
        {
          name: 'difftime',
          sig: '(t2: number, t1: number) -> number',
          doc: 'Returns t2 - t1 in seconds.',
        },
      ],
    },
  };
  const ENUM_DATA = {
    KeyCode: [
      'Unknown',
      'Backspace',
      'Tab',
      'Clear',
      'Return',
      'Pause',
      'Escape',
      'Space',
      'Quote',
      'Comma',
      'Minus',
      'Period',
      'Slash',
      'Zero',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Semicolon',
      'Equals',
      'LeftBracket',
      'BackSlash',
      'RightBracket',
      'Backquote',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
      'Q',
      'R',
      'S',
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
      'Z',
      'Delete',
      'KeypadZero',
      'KeypadOne',
      'KeypadTwo',
      'KeypadThree',
      'KeypadFour',
      'KeypadFive',
      'KeypadSix',
      'KeypadSeven',
      'KeypadEight',
      'KeypadNine',
      'KeypadPeriod',
      'KeypadDivide',
      'KeypadMultiply',
      'KeypadMinus',
      'KeypadPlus',
      'KeypadEnter',
      'KeypadEquals',
      'Up',
      'Down',
      'Right',
      'Left',
      'Insert',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'LeftShift',
      'RightShift',
      'LeftMeta',
      'RightMeta',
      'LeftAlt',
      'RightAlt',
      'LeftControl',
      'RightControl',
      'CapsLock',
      'NumLock',
      'ScrollLock',
      'LeftSuper',
      'RightSuper',
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
      'F11',
      'F12',
      'F13',
      'F14',
      'F15',
      'ButtonX',
      'ButtonY',
      'ButtonA',
      'ButtonB',
      'ButtonR1',
      'ButtonL1',
      'ButtonR2',
      'ButtonL2',
      'ButtonR3',
      'ButtonL3',
      'ButtonStart',
      'ButtonSelect',
      'DPadLeft',
      'DPadRight',
      'DPadUp',
      'DPadDown',
      'Thumbstick1',
      'Thumbstick2',
    ],
    UserInputType: [
      'MouseButton1',
      'MouseButton2',
      'MouseButton3',
      'MouseWheel',
      'MouseMovement',
      'Touch',
      'Keyboard',
      'Focus',
      'Accelerometer',
      'Gyro',
      'Gamepad1',
      'Gamepad2',
      'Gamepad3',
      'Gamepad4',
      'Gamepad5',
      'Gamepad6',
      'Gamepad7',
      'Gamepad8',
      'None',
    ],
    Material: [
      'Plastic',
      'SmoothPlastic',
      'Neon',
      'Wood',
      'WoodPlanks',
      'Marble',
      'Slate',
      'Concrete',
      'Granite',
      'Brick',
      'Cobblestone',
      'CorrodedMetal',
      'DiamondPlate',
      'Foil',
      'Metal',
      'Grass',
      'LeafyGrass',
      'Sand',
      'Fabric',
      'Ice',
      'Glacier',
      'Snow',
      'Sandstone',
      'Mud',
      'Rock',
      'Basalt',
      'Ground',
      'CrackedLava',
      'Asphalt',
      'Pebble',
      'Pavement',
      'SmoothSand',
      'CinderBlock',
      'Limestone',
      'Cardboard',
      'Glass',
      'ForceField',
      'Air',
      'Water',
    ],
    EasingStyle: [
      'Linear',
      'Sine',
      'Back',
      'Bounce',
      'Elastic',
      'Exponential',
      'Quad',
      'Quart',
      'Quint',
      'Cubic',
      'Circular',
    ],
    EasingDirection: ['In', 'Out', 'InOut'],
    HumanoidStateType: [
      'FallingDown',
      'Running',
      'RunningNoPhysics',
      'Climbing',
      'StrafingNoPhysics',
      'Ragdoll',
      'GettingUp',
      'Jumping',
      'Landed',
      'Flying',
      'Swimming',
      'Freefall',
      'Seated',
      'PlatformStanding',
      'Dead',
      'Physics',
      'None',
    ],
    AnimationPriority: ['Idle', 'Movement', 'Action', 'Action2', 'Action3', 'Action4', 'Core'],
    Font: [
      'Legacy',
      'Arial',
      'ArialBold',
      'SourceSans',
      'SourceSansBold',
      'SourceSansSemibold',
      'SourceSansItalic',
      'SourceSansLight',
      'SourceSansLightItalic',
      'Bodoni',
      'Cartoon',
      'Code',
      'Highway',
      'SciFi',
      'Antique',
      'Gotham',
      'GothamSemibold',
      'GothamBold',
      'GothamBlack',
      'AmaticSC',
      'Bangers',
      'Creepster',
      'DenkOne',
      'Fondamento',
      'FredokaOne',
      'GrenzeGotisch',
      'IndieFlower',
      'JosefinSans',
      'Jura',
      'Kalam',
      'LuckiestGuy',
      'Merriweather',
      'Michroma',
      'Nunito',
      'Oswald',
      'PatrickHand',
      'PermanentMarker',
      'Roboto',
      'RobotoCondensed',
      'RobotoMono',
      'Sarpanch',
      'SpecialElite',
      'TitilliumWeb',
      'Ubuntu',
      'Unknown',
    ],
    CameraType: ['Fixed', 'Attach', 'Watch', 'Track', 'Follow', 'Custom', 'Scriptable', 'Orbital'],
    PartType: ['Ball', 'Block', 'Cylinder', 'Wedge', 'CornerWedge'],
    SurfaceType: [
      'Smooth',
      'Glue',
      'Weld',
      'Studs',
      'Inlet',
      'Universal',
      'Hinge',
      'Motor',
      'StepMotor',
      'SmoothNoOutlines',
      'Decal',
    ],
    NormalId: ['Top', 'Bottom', 'Left', 'Right', 'Front', 'Back'],
    Axis: ['X', 'Y', 'Z'],
    CoreGuiType: ['PlayerList', 'Health', 'Backpack', 'Chat', 'All', 'EmotesMenu'],
    PlaybackState: ['Begin', 'Delayed', 'Playing', 'Paused', 'Completed', 'Cancelled'],
    RollOffMode: ['Inverse', 'Linear', 'LinearSquare', 'InverseTapered'],
    HttpContentType: [
      'ApplicationJson',
      'ApplicationXml',
      'ApplicationUrlEncoded',
      'TextPlain',
      'TextXml',
    ],
    InfoType: ['Asset', 'Product', 'GamePass', 'Subscription', 'Bundle'],
    MembershipType: ['None', 'Premium'],
    RigType: ['R6', 'R15'],
    CollisionFidelity: ['Default', 'Hull', 'Box', 'Precise'],
    RenderFidelity: ['Automatic', 'Precise', 'Performance'],
    MeshType: [
      'Head',
      'Torso',
      'Wedge',
      'Prism',
      'Pyramid',
      'ParallelRamp',
      'RightAngleRamp',
      'CornerWedge',
      'Cylinder',
      'FileMesh',
      'Sphere',
      'Brick',
    ],
    ScreenOrientation: ['LandscapeLeft', 'LandscapeRight', 'LandscapeSensor', 'Portrait', 'Sensor'],
    ZIndexBehavior: ['Global', 'Sibling'],
    AutomaticSize: ['None', 'X', 'Y', 'XY'],
    ScaleType: ['Stretch', 'Slice', 'Tile', 'Fit', 'Crop'],
    TextXAlignment: ['Left', 'Center', 'Right'],
    TextYAlignment: ['Top', 'Center', 'Bottom'],
    ButtonStyle: [
      'Custom',
      'RobloxButtonDefault',
      'RobloxButton',
      'RobloxRoundButton',
      'RobloxRoundDefaultButton',
      'RobloxRoundDropdownButton',
    ],
    SortDirection: ['Ascending', 'Descending'],
    RunContext: ['Legacy', 'Server', 'Client', 'Plugin'],
    HumanoidRigType: ['R6', 'R15'],
    Limb: ['Head', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg', 'Torso', 'Unknown'],
  };
  const EXECUTOR_COMPLETIONS = [
    {
      label: 'checkcaller',
      detail: '() -> boolean',
      documentation:
        "Returns true if the current function was called from the executor's own thread. Useful inside hookfunction/hookmetamethod to distinguish executor calls from game calls.",
      insertText: 'checkcaller()',
    },
    {
      label: 'clonefunction',
      detail: '(func) -> func',
      documentation:
        'Creates a new function with the same behaviour and environment as the original. Hooking the original will not affect the clone.',
      insertText: 'clonefunction(${1:func})',
      snippet: true,
    },
    {
      label: 'getfunctionhash',
      detail: '(func) -> string',
      documentation:
        "Returns the SHA-384 hex hash of a Luau function's bytecode instructions and constants. Errors on C closures.",
      insertText: 'getfunctionhash(${1:func})',
      snippet: true,
    },
    {
      label: 'hookfunction',
      detail: '(target, hook) -> originalFunc',
      documentation:
        'Replaces target with hook. Returns the original unhooked function. The hook must not have more upvalues than the target.',
      insertText: 'hookfunction(${1:target}, ${2:hook})',
      snippet: true,
    },
    {
      label: 'hookmetamethod',
      detail: '(object, metamethod, hook) -> originalFunc',
      documentation:
        'Hooks a metamethod on any object with a metatable (e.g. game, userdata). Returns the original metamethod function.',
      insertText: 'hookmetamethod(${1:object}, "${2:__index}", ${3:hook})',
      snippet: true,
    },
    {
      label: 'iscclosure',
      detail: '(func) -> boolean',
      documentation: 'Returns true if the given function is a C closure.',
      insertText: 'iscclosure(${1:func})',
      snippet: true,
    },
    {
      label: 'islclosure',
      detail: '(func) -> boolean',
      documentation: 'Returns true if the given function is a Luau closure.',
      insertText: 'islclosure(${1:func})',
      snippet: true,
    },
    {
      label: 'isexecutorclosure',
      detail: '(func) -> boolean',
      documentation: 'Returns true if the function is a closure created by the executor.',
      insertText: 'isexecutorclosure(${1:func})',
      snippet: true,
    },
    {
      label: 'newcclosure',
      detail: '(func) -> cFunc',
      documentation:
        'Wraps a Luau function into a C closure. The returned function must be yieldable and have no upvalues.',
      insertText: 'newcclosure(${1:func})',
      snippet: true,
    },
    {
      label: 'restorefunction',
      detail: '(func) -> ()',
      documentation: 'Restores a hooked function to its original state. Errors if not hooked.',
      insertText: 'restorefunction(${1:func})',
      snippet: true,
    },
    {
      label: 'debug.getconstant',
      detail: '(func, index) -> value',
      documentation:
        "Returns the constant at index in a Luau function's bytecode. nil if out of range. Errors on C closures.",
      insertText: 'debug.getconstant(${1:func}, ${2:index})',
      snippet: true,
    },
    {
      label: 'debug.getconstants',
      detail: '(func) -> {value}',
      documentation: "Returns all constants from a Luau function's bytecode. Errors on C closures.",
      insertText: 'debug.getconstants(${1:func})',
      snippet: true,
    },
    {
      label: 'debug.setconstant',
      detail: '(func, index, value) -> ()',
      documentation: "Modifies a constant in a Luau function's bytecode. Errors on C closures.",
      insertText: 'debug.setconstant(${1:func}, ${2:index}, ${3:value})',
      snippet: true,
    },
    {
      label: 'debug.getupvalue',
      detail: '(func, index) -> value',
      documentation: 'Returns the upvalue at index from a Luau function. Errors on C closures.',
      insertText: 'debug.getupvalue(${1:func}, ${2:index})',
      snippet: true,
    },
    {
      label: 'debug.getupvalues',
      detail: '(func) -> {value}',
      documentation: 'Returns all upvalues from a Luau function. Errors on C closures.',
      insertText: 'debug.getupvalues(${1:func})',
      snippet: true,
    },
    {
      label: 'debug.setupvalue',
      detail: '(func, index, value) -> ()',
      documentation: 'Replaces an upvalue in a Luau function. Errors on C closures.',
      insertText: 'debug.setupvalue(${1:func}, ${2:index}, ${3:value})',
      snippet: true,
    },
    {
      label: 'debug.getstack',
      detail: '(level, index?) -> value | {value}',
      documentation: 'Retrieves values from the stack at call level. Omit index to get all values.',
      insertText: 'debug.getstack(${1:level})',
      snippet: true,
    },
    {
      label: 'debug.setstack',
      detail: '(level, index, value) -> ()',
      documentation: 'Replaces a value in the specified stack frame.',
      insertText: 'debug.setstack(${1:level}, ${2:index}, ${3:value})',
      snippet: true,
    },
    {
      label: 'debug.getproto',
      detail: '(func, index, activated?) -> func | {func}',
      documentation:
        'Returns a nested function prototype. If activated=true, returns live active functions.',
      insertText: 'debug.getproto(${1:func}, ${2:index})',
      snippet: true,
    },
    {
      label: 'debug.getprotos',
      detail: '(func) -> {func}',
      documentation: 'Returns all nested function prototypes from a Luau function.',
      insertText: 'debug.getprotos(${1:func})',
      snippet: true,
    },
    {
      label: 'Drawing.new',
      detail: '(type) -> Drawing',
      documentation:
        'Creates a 2D drawing object.\nTypes: "Line", "Text", "Image", "Circle", "Square", "Quad", "Triangle"\n\nShared: Visible, ZIndex, Transparency, Color, __OBJECT_EXISTS\nMethod: :Destroy()',
      insertText: 'Drawing.new("${1|Line,Text,Image,Circle,Square,Quad,Triangle|}")',
      snippet: true,
    },
    {
      label: 'cleardrawcache',
      detail: '() -> ()',
      documentation: 'Destroys all active Drawing objects.',
      insertText: 'cleardrawcache()',
    },
    {
      label: 'getrenderproperty',
      detail: '(drawing, property) -> value',
      documentation: 'Gets a property from a Drawing object by name.',
      insertText: 'getrenderproperty(${1:drawing}, "${2:property}")',
      snippet: true,
    },
    {
      label: 'setrenderproperty',
      detail: '(drawing, property, value) -> ()',
      documentation: 'Sets a property on a Drawing object by name.',
      insertText: 'setrenderproperty(${1:drawing}, "${2:property}", ${3:value})',
      snippet: true,
    },
    {
      label: 'isrenderobj',
      detail: '(value) -> boolean',
      documentation: 'Returns true if value is a valid Drawing object.',
      insertText: 'isrenderobj(${1:value})',
      snippet: true,
    },
    {
      label: 'base64encode',
      detail: '(data: string) -> string',
      documentation: 'Encodes a string with Base64.',
      insertText: 'base64encode(${1:data})',
      snippet: true,
    },
    {
      label: 'base64decode',
      detail: '(data: string) -> string',
      documentation: 'Decodes a Base64-encoded string.',
      insertText: 'base64decode(${1:data})',
      snippet: true,
    },
    {
      label: 'lz4compress',
      detail: '(data: string) -> string',
      documentation: 'Compresses a string with LZ4.',
      insertText: 'lz4compress(${1:data})',
      snippet: true,
    },
    {
      label: 'lz4decompress',
      detail: '(data: string) -> string',
      documentation: 'Decompresses an LZ4-compressed string.',
      insertText: 'lz4decompress(${1:data})',
      snippet: true,
    },
    {
      label: 'getgenv',
      detail: '() -> table',
      documentation: "Returns the executor's global environment, shared across all threads.",
      insertText: 'getgenv()',
    },
    {
      label: 'getrenv',
      detail: '() -> table',
      documentation: 'Returns the Roblox global environment.',
      insertText: 'getrenv()',
    },
    {
      label: 'getreg',
      detail: '() -> table',
      documentation: 'Returns the Luau registry table.',
      insertText: 'getreg()',
    },
    {
      label: 'getgc',
      detail: '(includeTables?: boolean) -> {any}',
      documentation: 'Returns all non-dead GC values. Pass true to include tables.',
      insertText: 'getgc(${1:false})',
      snippet: true,
    },
    {
      label: 'filtergc',
      detail: '(filterType, filterOptions, returnOne?) -> result',
      documentation:
        'Searches GC memory for matching functions or tables.\n\nFunction filters: Name, IgnoreExecutor, Hash, Constants, Upvalues\nTable filters: Keys, Values, KeyValuePairs, Metatable\n\nPass returnOne=true for a single result.',
      insertText: 'filtergc("${1|function,table|}", {\n\t${2}\n})',
      snippet: true,
    },
    {
      label: 'readfile',
      detail: '(path: string) -> string',
      documentation: 'Reads and returns file contents. Errors if file does not exist.',
      insertText: 'readfile("${1:path}")',
      snippet: true,
    },
    {
      label: 'writefile',
      detail: '(path: string, data: string) -> ()',
      documentation: 'Writes data to a file, overwriting if it exists.',
      insertText: 'writefile("${1:path}", ${2:data})',
      snippet: true,
    },
    {
      label: 'appendfile',
      detail: '(path: string, contents: string) -> ()',
      documentation: 'Appends to a file. Creates it if it does not exist.',
      insertText: 'appendfile("${1:path}", ${2:contents})',
      snippet: true,
    },
    {
      label: 'listfiles',
      detail: '(path: string) -> {string}',
      documentation: 'Returns file and folder paths in the directory.',
      insertText: 'listfiles("${1:path}")',
      snippet: true,
    },
    {
      label: 'isfile',
      detail: '(path: string) -> boolean',
      documentation: 'Returns true if path exists and is a file.',
      insertText: 'isfile("${1:path}")',
      snippet: true,
    },
    {
      label: 'isfolder',
      detail: '(path: string) -> boolean',
      documentation: 'Returns true if path exists and is a folder.',
      insertText: 'isfolder("${1:path}")',
      snippet: true,
    },
    {
      label: 'makefolder',
      detail: '(path: string) -> ()',
      documentation: 'Creates a folder at the given path.',
      insertText: 'makefolder("${1:path}")',
      snippet: true,
    },
    {
      label: 'delfile',
      detail: '(path: string) -> ()',
      documentation: 'Deletes the file at the path.',
      insertText: 'delfile("${1:path}")',
      snippet: true,
    },
    {
      label: 'delfolder',
      detail: '(path: string) -> ()',
      documentation: 'Deletes the folder at the path.',
      insertText: 'delfolder("${1:path}")',
      snippet: true,
    },
    {
      label: 'loadfile',
      detail: '(path: string) -> (func | nil, err?)',
      documentation:
        'Compiles Luau from a file and returns it as a function. Returns nil + error on failure.',
      insertText: 'loadfile("${1:path}")',
      snippet: true,
    },
    {
      label: 'getcustomasset',
      detail: '(path: string) -> string',
      documentation: 'Returns a rbxasset:// content ID for a local file.',
      insertText: 'getcustomasset("${1:path}")',
      snippet: true,
    },
    {
      label: 'getinstances',
      detail: '() -> {Instance}',
      documentation: 'Returns every Instance tracked by the client, including nil-parented ones.',
      insertText: 'getinstances()',
    },
    {
      label: 'getnilinstances',
      detail: '() -> {Instance}',
      documentation: 'Returns all unparented Instances.',
      insertText: 'getnilinstances()',
    },
    {
      label: 'cloneref',
      detail: '(object: Instance) -> Instance',
      documentation:
        'Returns a reference clone of an Instance. Not == to original. Useful against weak-table detections.',
      insertText: 'cloneref(${1:object})',
      snippet: true,
    },
    {
      label: 'compareinstances',
      detail: '(a: Instance, b: Instance) -> boolean',
      documentation: "Checks if two Instances are the same object. Handles cloneref'd instances.",
      insertText: 'compareinstances(${1:a}, ${2:b})',
      snippet: true,
    },
    {
      label: 'gethui',
      detail: '() -> BasePlayerGui | Folder',
      documentation: 'Returns a hidden UI container safe from game-side detections.',
      insertText: 'gethui()',
    },
    {
      label: 'getcallbackvalue',
      detail: '(object: Instance, property: string) -> function?',
      documentation: 'Reads a write-only callback property (e.g. OnInvoke on BindableFunction).',
      insertText: 'getcallbackvalue(${1:object}, "${2:OnInvoke}")',
      snippet: true,
    },
    {
      label: 'fireclickdetector',
      detail: '(detector, distance?, event?) -> ()',
      documentation: 'Fires a ClickDetector event. Defaults to MouseClick.',
      insertText: 'fireclickdetector(${1:detector})',
      snippet: true,
    },
    {
      label: 'fireproximityprompt',
      detail: '(prompt: ProximityPrompt) -> ()',
      documentation: 'Triggers a ProximityPrompt, bypassing HoldDuration and distance.',
      insertText: 'fireproximityprompt(${1:prompt})',
      snippet: true,
    },
    {
      label: 'firetouchinterest',
      detail: '(part1, part2, toggle) -> ()',
      documentation: 'Simulates a touch event. toggle=true/0 for start, false/1 for end.',
      insertText: 'firetouchinterest(${1:part1}, ${2:part2}, ${3:true})',
      snippet: true,
    },
    {
      label: 'getrawmetatable',
      detail: '(object) -> table | nil',
      documentation: 'Returns the raw metatable, bypassing __metatable protection.',
      insertText: 'getrawmetatable(${1:object})',
      snippet: true,
    },
    {
      label: 'setrawmetatable',
      detail: '(object, metatable) -> object',
      documentation: 'Forcibly sets the metatable, bypassing __metatable protection.',
      insertText: 'setrawmetatable(${1:object}, ${2:metatable})',
      snippet: true,
    },
    {
      label: 'setreadonly',
      detail: '(table, state: boolean) -> ()',
      documentation: 'Sets whether a table is readonly. Pass false to unlock.',
      insertText: 'setreadonly(${1:table}, ${2:false})',
      snippet: true,
    },
    {
      label: 'isreadonly',
      detail: '(table) -> boolean',
      documentation: 'Returns true if the table is locked as readonly.',
      insertText: 'isreadonly(${1:table})',
      snippet: true,
    },
    {
      label: 'getnamecallmethod',
      detail: '() -> string?',
      documentation:
        'Returns the __namecall method name. Only valid inside a hookmetamethod __namecall hook.',
      insertText: 'getnamecallmethod()',
    },
    {
      label: 'identifyexecutor',
      detail: '() -> (string, string)',
      documentation: 'Returns the executor name and version as a tuple.',
      insertText: 'identifyexecutor()',
    },
    {
      label: 'request',
      detail: '(options: RequestOptions) -> Response',
      documentation:
        'Sends an HTTP request and yields until complete.\n\nOptions: { Url, Method, Body?, Headers?, Cookies? }\nResponse: { Success, Body, StatusCode, StatusMessage, Headers }',
      insertText:
        'request({\n\tUrl = "${1:https://}",\n\tMethod = "${2|GET,POST,PUT,PATCH,DELETE|}",\n})',
      snippet: true,
    },
    {
      label: 'gethiddenproperty',
      detail: '(instance, property) -> (value, isHidden: boolean)',
      documentation: 'Reads a hidden/non-scriptable property. Also returns whether it was hidden.',
      insertText: 'gethiddenproperty(${1:instance}, "${2:property}")',
      snippet: true,
    },
    {
      label: 'sethiddenproperty',
      detail: '(instance, property, value) -> boolean',
      documentation: 'Sets a hidden/non-scriptable property. Returns true if property was hidden.',
      insertText: 'sethiddenproperty(${1:instance}, "${2:property}", ${3:value})',
      snippet: true,
    },
    {
      label: 'setscriptable',
      detail: '(instance, property, state: boolean) -> boolean?',
      documentation:
        'Toggles whether a hidden property is accessible via normal indexing. Detection risk.',
      insertText: 'setscriptable(${1:instance}, "${2:property}", ${3:true})',
      snippet: true,
    },
    {
      label: 'isscriptable',
      detail: '(instance, property) -> boolean?',
      documentation: "Returns true if the property is scriptable. nil if it doesn't exist.",
      insertText: 'isscriptable(${1:instance}, "${2:property}")',
      snippet: true,
    },
    {
      label: 'getthreadidentity',
      detail: '() -> number',
      documentation: "Returns the current thread's security level.",
      insertText: 'getthreadidentity()',
    },
    {
      label: 'setthreadidentity',
      detail: '(id: number) -> ()',
      documentation:
        "Sets the current thread's security level. Level 8 = full access including CoreGui.",
      insertText: 'setthreadidentity(${1:8})',
      snippet: true,
    },
    {
      label: 'getscriptbytecode',
      detail: '(script) -> string?',
      documentation: 'Returns compiled bytecode of a script. nil if no bytecode.',
      insertText: 'getscriptbytecode(${1:script})',
      snippet: true,
    },
    {
      label: 'getscripthash',
      detail: '(script) -> string?',
      documentation: "Returns SHA-384 hex hash of a script's raw bytecode. nil if no bytecode.",
      insertText: 'getscripthash(${1:script})',
      snippet: true,
    },
    {
      label: 'getscriptclosure',
      detail: '(script) -> func?',
      documentation:
        "Creates a Luau closure from the script's bytecode. Useful for extracting constants.",
      insertText: 'getscriptclosure(${1:script})',
      snippet: true,
    },
    {
      label: 'getsenv',
      detail: '(script) -> table?',
      documentation: 'Returns the environment of a running script. Errors if not running.',
      insertText: 'getsenv(${1:script})',
      snippet: true,
    },
    {
      label: 'getscripts',
      detail: '() -> {BaseScript | ModuleScript}',
      documentation:
        'Returns all Script, LocalScript, and ModuleScript instances. Excludes CoreScripts.',
      insertText: 'getscripts()',
    },
    {
      label: 'getrunningscripts',
      detail: '() -> {BaseScript | ModuleScript}',
      documentation: 'Returns all currently running scripts. Excludes CoreScripts.',
      insertText: 'getrunningscripts()',
    },
    {
      label: 'getloadedmodules',
      detail: '() -> {ModuleScript}',
      documentation: 'Returns all successfully required ModuleScript instances.',
      insertText: 'getloadedmodules()',
    },
    {
      label: 'getcallingscript',
      detail: '() -> BaseScript | ModuleScript | nil',
      documentation: 'Returns the script that triggered this execution. nil from executor thread.',
      insertText: 'getcallingscript()',
    },
    {
      label: 'loadstring',
      detail: '(source, chunkname?) -> (func | nil, err?)',
      documentation:
        'Compiles Luau source and returns it as a function. Returns nil + error on failure.',
      insertText: 'loadstring(${1:source})',
      snippet: true,
    },
    {
      label: 'getconnections',
      detail: '(signal: RBXScriptSignal) -> {Connection}',
      documentation:
        'Returns all Connections on a signal.\n\nFields: Enabled, ForeignState, LuaConnection, Function, Thread\nMethods: :Fire(...), :Defer(...), :Disconnect(), :Disable(), :Enable()',
      insertText: 'getconnections(${1:signal})',
      snippet: true,
    },
    {
      label: 'firesignal',
      detail: '(signal: RBXScriptSignal, ...?) -> ()',
      documentation: 'Fires all Luau connections on a signal immediately.',
      insertText: 'firesignal(${1:signal})',
      snippet: true,
    },
    {
      label: 'replicatesignal',
      detail: '(signal: RBXScriptSignal, ...?) -> ()',
      documentation: 'Replicates a signal to the server with given arguments.',
      insertText: 'replicatesignal(${1:signal})',
      snippet: true,
    },
    {
      label: 'WebSocket.connect',
      detail: '(url: string) -> WebSocket',
      documentation:
        'Opens a WebSocket connection (ws:// or wss://).\n\nEvents: OnMessage(msg), OnClose()\nMethods: :Send(msg), :Close()',
      insertText: 'WebSocket.connect("${1:wss://}")',
      snippet: true,
    },
    {
      label: 'task.wait',
      detail: '(seconds?) -> number',
      documentation: 'Yields for given duration. Returns actual elapsed time.',
      insertText: 'task.wait(${1:1})',
      snippet: true,
    },
    {
      label: 'task.spawn',
      detail: '(func, ...?) -> thread',
      documentation: 'Runs a function immediately on the current frame.',
      insertText: 'task.spawn(${1:func})',
      snippet: true,
    },
    {
      label: 'task.defer',
      detail: '(func, ...?) -> thread',
      documentation: 'Runs a function after the current frame completes.',
      insertText: 'task.defer(${1:func})',
      snippet: true,
    },
    {
      label: 'task.delay',
      detail: '(seconds, func, ...?) -> thread',
      documentation: 'Runs a function after the given delay.',
      insertText: 'task.delay(${1:1}, ${2:func})',
      snippet: true,
    },
    {
      label: 'task.cancel',
      detail: '(thread) -> ()',
      documentation: 'Cancels a scheduled or deferred task.',
      insertText: 'task.cancel(${1:thread})',
      snippet: true,
    },
  ];
  const SNIPPETS = [
    {
      label: 'function',
      insertText: 'function ${1:name}(${2:args})\n\t$0\nend',
      detail: 'function block',
    },
    {
      label: 'lfunc',
      insertText: 'local function ${1:name}(${2:args})\n\t$0\nend',
      detail: 'local function',
    },
    {
      label: 'if',
      insertText: 'if ${1:cond} then\n\t$0\nend',
      detail: 'if statement',
    },
    {
      label: 'ife',
      insertText: 'if ${1:cond} then\n\t$2\nelse\n\t$0\nend',
      detail: 'if/else',
    },
    {
      label: 'for',
      insertText: 'for ${1:i} = ${2:1}, ${3:10} do\n\t$0\nend',
      detail: 'numeric for',
    },
    {
      label: 'fori',
      insertText: 'for ${1:i}, ${2:v} in ipairs(${3:t}) do\n\t$0\nend',
      detail: 'ipairs for',
    },
    {
      label: 'forp',
      insertText: 'for ${1:k}, ${2:v} in pairs(${3:t}) do\n\t$0\nend',
      detail: 'pairs for',
    },
    {
      label: 'while',
      insertText: 'while ${1:cond} do\n\t$0\nend',
      detail: 'while loop',
    },
    {
      label: 'pcall',
      insertText: 'local ok, err = pcall(function()\n\t$0\nend)',
      detail: 'protected call',
    },
    {
      label: 'xpcall',
      insertText: 'local ok, err = xpcall(function()\n\t$0\nend, function(e)\n\treturn e\nend)',
      detail: 'xpcall with handler',
    },
    {
      label: 'hook',
      insertText:
        'local old\nold = hookfunction(${1:target}, function(...)\n\t$0\n\treturn old(...)\nend)',
      detail: 'hookfunction template',
    },
    {
      label: 'hookmt',
      insertText:
        'local old\nold = hookmetamethod(${1:game}, "${2:__index}", function(...)\n\tif not checkcaller() then\n\t\t$0\n\tend\n\treturn old(...)\nend)',
      detail: 'hookmetamethod template',
    },
    {
      label: 'drawing',
      insertText:
        'local ${1:obj} = Drawing.new("${2|Circle,Square,Line,Text,Triangle,Quad,Image|}")\n${1}.Visible = true\n${1}.Color = Color3.fromRGB(${3:255, 0, 0})\n$0',
      detail: 'Drawing object',
    },
    {
      label: 'ws',
      insertText:
        'local ws = WebSocket.connect("${1:wss://}")\nws.OnMessage:Connect(function(msg)\n\t$0\nend)\nws.OnClose:Connect(function()\nend)',
      detail: 'WebSocket template',
    },
    {
      label: 'req',
      insertText:
        'local res = request({\n\tUrl = "${1:https://}",\n\tMethod = "${2|GET,POST,PUT,PATCH,DELETE|}",\n})\nif res.StatusCode == 200 then\n\t$0\nend',
      detail: 'HTTP request template',
    },
  ];
  function _buildSymbolProvider(monaco) {
    const K = monaco.languages.SymbolKind;
    const rOpen = /^(?:local\s+)?(?:function\s+([\w.:]+)|([\w.]+)\s*=\s*function)\s*\(/;
    const rTable = /^(?:local\s+)?(\w+)\s*=\s*\{/;
    const rEnd = /^\s*end\b/;
    return {
      provideDocumentSymbols(model) {
        const lines = model.getValue().split('\n');
        const total = lines.length;
        const root = [],
          stack = [];
        const cur = () => (stack.length ? stack[stack.length - 1] : null);
        lines.forEach((raw, i) => {
          const line = raw.trimStart(),
            ln = i + 1;
          if (rEnd.test(line) && stack.length) {
            const top = stack.pop();
            top.sym.range = {
              ...top.sym.range,
              endLineNumber: ln,
              endColumn: raw.length + 1,
            };
            (cur()?.children ?? root).push(top.sym);
          }
          let m, name, kind;
          if ((m = rOpen.exec(line))) {
            name = m[1] ?? m[2];
            kind = K.Function;
          } else if ((m = rTable.exec(line))) {
            name = m[1];
            kind = K.Module;
          }
          if (name) {
            const sel = {
              startLineNumber: ln,
              startColumn: 1,
              endLineNumber: ln,
              endColumn: raw.length + 1,
            };
            stack.push({
              sym: {
                name,
                detail: '',
                kind,
                range: {
                  ...sel,
                },
                selectionRange: sel,
                children: [],
              },
            });
          }
        });
        while (stack.length) {
          const top = stack.pop();
          top.sym.range = {
            ...top.sym.range,
            endLineNumber: total,
            endColumn: 1,
          };
          (cur()?.children ?? root).push(top.sym);
        }
        return root;
      },
    };
  }
  function register(monaco) {
    monaco.languages.register({
      id: 'lua',
    });
    const allIdentifiers = [...BUILTINS, ...EXECUTOR_GLOBALS, ...ROBLOX_GLOBALS];
    monaco.languages.setMonarchTokensProvider('lua', {
      keywords: KEYWORDS,
      builtins: allIdentifiers,
      tokenizer: {
        root: [
          [/^#!.*$/, 'comment'],
          [/--\[(=*)\[@@@/, 'comment', '@mlComment'],
          [/--\[(=*)\[/, 'comment', '@mlComment'],
          [/\/\*/, 'comment', '@cComment'],
          [/^(---\s*)@/, 'comment', '@docComment'],
          [/^(\s*---\s*)/, 'comment', '@docComment'],
          [/----.*/, 'comment'],
          [/--.*/, 'comment'],
          [/\[(=*)\[/, 'string', '@mlString'],
          [/"/, 'string', '@doubleString'],
          [/'/, 'string', '@singleString'],
          [/`/, 'string', '@backtickString'],
          [/0[xX][0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?(?:[eE]-?\d*)?(?:[pP][-+]?\d+)?/, 'number'],
          [/0[xX]\.[0-9a-fA-F]+(?:[eE]-?\d*)?(?:[pP][-+]?\d+)?/, 'number'],
          [/\d+\.\d*(?:[eE]-?\d*)?/, 'number'],
          [/\.\d+(?:[eE]-?\d*)?/, 'number'],
          [/\d+(?:[eE]-?\d*)?/, 'number'],
          [/\b(goto)(\s+)([A-Za-z_]\w*)/, ['keyword', '', 'string']],
          [/::\s*[A-Za-z_]\w*\s*::/, 'string'],
          [/<\s*(const|close)\s*>/, 'type'],
          [VANILLA_DOTTED_CONSTANT_RE, 'type'],
          [VANILLA_LIBRARY_FUNCTION_RE, 'type'],
          [VANILLA_CONSTANT_RE, 'keyword'],
          [/\bself\b/, 'type'],
          [VANILLA_GLOBAL_FUNCTION_RE, 'type'],
          [VANILLA_CONTROL_RE, 'keyword'],
          [VANILLA_LOGICAL_RE, 'keyword'],
          [/\blocal\b/, 'keyword'],
          [/\bfunction\b(?![,:])/, 'keyword'],
          [
            /[a-zA-Z_]\w*(?=\s*\()/,
            {
              cases: {
                '@builtins': 'type',
                '@keywords': 'keyword',
                '@default': 'identifier.function',
              },
            },
          ],
          [/\basync\b/, 'type'],
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                '@keywords': 'keyword',
                '@builtins': 'type',
                '@default': 'identifier',
              },
            },
          ],
          [/\|\||&&|!/, 'delimiter'],
          [/[+\-*/%^#&|~<>=(){}[\];:,.]/, 'delimiter'],
        ],
        mlComment: [
          [/\]=*\]/, 'comment', '@pop'],
          [/./, 'comment'],
        ],
        mlString: [
          [/\]=*\]/, 'string', '@pop'],
          [/./, 'string'],
        ],
        cComment: [
          [/\*\//, 'comment', '@pop'],
          [/./, 'comment'],
        ],
        docComment: [
          [VANILLA_DOC_TAG_RE, 'type'],
          [VANILLA_LDOC_TAG_RE, 'type'],
          [/[A-Za-z_*][A-Za-z0-9_.*-]*(?=\s*[|,:?()[\]{}])/, 'type'],
          [/$/, 'comment', '@pop'],
          [/./, 'comment'],
        ],
        doubleString: [
          [/\\(?:[abfnrtv\\"'\n]|z[\n\t ]*|\d{1,3}|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]+\})/, 'string'],
          [/\\./, 'string'],
          [/"/, 'string', '@pop'],
          [/[^"\\]+/, 'string'],
        ],
        singleString: [
          [/\\(?:[abfnrtv\\"'\n]|z[\n\t ]*|\d{1,3}|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]+\})/, 'string'],
          [/\\./, 'string'],
          [/'/, 'string', '@pop'],
          [/[^'\\]+/, 'string'],
        ],
        backtickString: [
          [/`/, 'string', '@pop'],
          [/[^`]+/, 'string'],
        ],
      },
    });
    monaco.languages.setLanguageConfiguration('lua', {
      comments: {
        lineComment: '--',
        blockComment: ['--[[', ']]'],
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        {
          open: '{',
          close: '}',
        },
        {
          open: '[',
          close: ']',
        },
        {
          open: '(',
          close: ')',
        },
        {
          open: '"',
          close: '"',
          notIn: ['string'],
        },
        {
          open: "'",
          close: "'",
          notIn: ['string'],
        },
      ],
      surroundingPairs: [
        {
          open: '{',
          close: '}',
        },
        {
          open: '[',
          close: ']',
        },
        {
          open: '(',
          close: ')',
        },
        {
          open: '"',
          close: '"',
        },
        {
          open: "'",
          close: "'",
        },
      ],
      indentationRules: {
        increaseIndentPattern:
          /^((?!(\-\-)).)*((\b(else|function|then|do|repeat)\b((?!\b(end|until)\b).)*)|(\{\s*))$/,
        decreaseIndentPattern: /^\s*((\b(elseif|else|end|until)\b)|(\})|(\)))/,
      },
    });
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.', ':'],
      provideCompletionItems(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        let range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const K = monaco.languages.CompletionItemKind;
        const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
        const orphanMemberSearch = textBefore.match(/(^|[^A-Za-z0-9_])(\.\w*)$/);
        if (orphanMemberSearch) {
          range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column - orphanMemberSearch[2].length,
            endColumn: position.column,
          };
          return {
            suggestions: [
              ..._datatypeGlobalSuggestions(DATATYPE_SIGS, range, K, InsertAsSnippet),
              ...EXECUTOR_COMPLETIONS.filter((item) => item.label.includes('.')).map((item) => ({
                label: item.label,
                kind: K.Function,
                detail: item.detail,
                documentation: {
                  value: item.documentation,
                },
                insertText: item.insertText,
                insertTextRules: item.snippet ? InsertAsSnippet : undefined,
                range,
                sortText: '2_' + item.label,
              })),
            ],
          };
        }
        if (/[.:]\s*\w*$/.test(textBefore) && typeof RobloxAPI !== 'undefined') {
          const forType = _resolveExprType(textBefore, model, position.lineNumber);
          if (forType && RobloxAPI.getClass(forType))
            return {
              suggestions: [],
            };
        }
        if (/\b(string|math|table|coroutine|os)\.\w*$/.test(textBefore))
          return {
            suggestions: [],
          };
        if (/\bEnum\./.test(textBefore))
          return {
            suggestions: [],
          };
        const nsMatch = textBefore.match(/\b(\w+)\.\w*$/);
        if (nsMatch && STATIC_NAMESPACES[nsMatch[1]])
          return {
            suggestions: _staticNamespaceSuggestions(
              nsMatch[1],
              STATIC_NAMESPACES[nsMatch[1]],
              DATATYPE_SIGS,
              EXECUTOR_COMPLETIONS,
              range,
              K,
              InsertAsSnippet,
            ),
          };
        if (nsMatch) {
          const executorMembers = _executorNamespaceSuggestions(
            nsMatch[1],
            EXECUTOR_COMPLETIONS,
            range,
            K,
            InsertAsSnippet,
          );
          if (executorMembers.length)
            return {
              suggestions: executorMembers,
            };
        }
        if (_hasMemberOwner(textBefore))
          return {
            suggestions: [],
          };
        return {
          suggestions: [
            ...KEYWORDS.map((l) => ({
              label: l,
              kind: K.Keyword,
              insertText: l,
              range,
            })),
            ...[...BUILTINS, ...ROBLOX_GLOBALS].map((l) => ({
              label: l,
              kind: K.Variable,
              insertText: l,
              range,
            })),
            ..._datatypeGlobalSuggestions(DATATYPE_SIGS, range, K, InsertAsSnippet),
            ...EXECUTOR_COMPLETIONS.map((c) => ({
              label: c.label,
              kind: K.Function,
              detail: c.detail,
              documentation: {
                value: c.documentation,
              },
              insertText: c.insertText,
              insertTextRules: c.snippet ? InsertAsSnippet : undefined,
              range,
              sortText: c.label.includes('.') ? '2_' + c.label : '3_' + c.label,
            })),
            ...SNIPPETS.map((snippet) => ({
              label: snippet.label,
              kind: K.Snippet,
              insertText: snippet.insertText,
              detail: snippet.detail,
              insertTextRules: InsertAsSnippet,
              range,
            })),
          ],
        };
      },
    });
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.'],
      provideCompletionItems(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        const libMatch = textBefore.match(/\b(string|math|table|coroutine|os)\.\w*$/);
        if (!libMatch)
          return {
            suggestions: [],
          };
        const lib = STD_MEMBERS[libMatch[1]];
        if (!lib)
          return {
            suggestions: [],
          };
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const K = monaco.languages.CompletionItemKind;
        const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
        const suggestions = [];
        if (lib.props) {
          lib.props.forEach((p) => {
            suggestions.push({
              label: p.name,
              kind: K.Property,
              detail: 'number',
              documentation: {
                value: p.doc,
              },
              insertText: p.name,
              sortText: '0_' + p.name,
              range,
            });
          });
        }
        lib.methods.forEach((m) => {
          const argsStr = m.sig.match(/^(\([^)]*\))/)?.[1] || '()';
          suggestions.push({
            label: m.name,
            kind: K.Method,
            detail: m.sig,
            documentation: {
              value: m.doc,
            },
            insertText: m.name + '(' + _argsToSnippet(argsStr) + ')',
            insertTextRules: InsertAsSnippet,
            sortText: '1_' + m.name,
            range,
          });
        });
        return {
          suggestions,
        };
      },
    });
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['.'],
      provideCompletionItems(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        const valueMatch = textBefore.match(/\bEnum\.(\w+)\.\w*$/);
        if (valueMatch) {
          const values = ENUM_DATA[valueMatch[1]];
          if (!values)
            return {
              suggestions: [],
            };
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: values.map((v) => ({
              label: v,
              kind: monaco.languages.CompletionItemKind.EnumMember,
              detail: 'Enum.' + valueMatch[1] + '.' + v,
              documentation: {
                value: '`Enum.' + valueMatch[1] + '.' + v + '`',
              },
              insertText: v,
              range,
            })),
          };
        }
        if (/\bEnum\.\w*$/.test(textBefore)) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: Object.keys(ENUM_DATA).map((name) => ({
              label: name,
              kind: monaco.languages.CompletionItemKind.Enum,
              detail: 'Enum.' + name,
              documentation: {
                value: '`Enum.' + name + '`',
              },
              insertText: name,
              range,
            })),
          };
        }
        return {
          suggestions: [],
        };
      },
    });
    monaco.languages.registerCompletionItemProvider('lua', {
      triggerCharacters: ['"', "'"],
      provideCompletionItems(model, position) {
        if (typeof RobloxAPI === 'undefined')
          return {
            suggestions: [],
          };
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        if (!/Instance\.new\(\s*["'][\w]*$/.test(textBefore))
          return {
            suggestions: [],
          };
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        return {
          suggestions: Object.keys(RobloxAPI.CLASSES).map((name) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: 'Roblox class',
            insertText: name,
            range,
          })),
        };
      },
    });
    const _sigMap = new Map();
    for (const c of EXECUTOR_COMPLETIONS) {
      if (!c.detail) continue;
      const argsMatch = c.detail.match(/^(\([^)]*\))/);
      if (!argsMatch) continue;
      const inner = argsMatch[1].slice(1, -1).trim();
      const params = inner
        ? inner.split(',').map((p) => ({
            label: p.trim(),
          }))
        : [];
      _sigMap.set(c.label, {
        label: c.label + argsMatch[1],
        params,
        doc: c.documentation,
      });
    }
    for (const [libName, lib] of Object.entries(STD_MEMBERS)) {
      for (const m of lib.methods) {
        const argsMatch = m.sig.match(/^(\([^)]*\))/);
        if (!argsMatch) continue;
        const inner = argsMatch[1].slice(1, -1).trim();
        const params = inner
          ? inner.split(',').map((p) => ({
              label: p.trim(),
            }))
          : [];
        _sigMap.set(libName + '.' + m.name, {
          label: libName + '.' + m.name + argsMatch[1],
          params,
          doc: m.doc,
        });
      }
    }
    const DATATYPE_SIGS = [
      {
        name: 'Vector3.new',
        params: ['x: number', 'y: number', 'z: number'],
        doc: 'Creates a new Vector3.',
      },
      {
        name: 'Vector3.fromNormalId',
        params: ['normal: Enum.NormalId'],
        doc: 'Creates a unit Vector3 from a NormalId.',
      },
      {
        name: 'Vector3.fromAxis',
        params: ['axis: Enum.Axis'],
        doc: 'Creates a unit Vector3 from an Axis.',
      },
      {
        name: 'Vector2.new',
        params: ['x: number', 'y: number'],
        doc: 'Creates a new Vector2.',
      },
      {
        name: 'CFrame.new',
        params: ['x: number', 'y: number', 'z: number'],
        doc: 'Creates a CFrame at position (x, y, z) with no rotation.',
      },
      {
        name: 'CFrame.fromEulerAnglesXYZ',
        params: ['rx: number', 'ry: number', 'rz: number'],
        doc: 'Creates a CFrame from Euler angles (radians) applied in X, Y, Z order.',
      },
      {
        name: 'CFrame.fromEulerAnglesYXZ',
        params: ['rx: number', 'ry: number', 'rz: number'],
        doc: "Creates a CFrame from Euler angles (radians) applied in Y, X, Z order. Matches Roblox's default rotation order.",
      },
      {
        name: 'CFrame.Angles',
        params: ['rx: number', 'ry: number', 'rz: number'],
        doc: 'Alias for CFrame.fromEulerAnglesXYZ.',
      },
      {
        name: 'CFrame.fromAxisAngle',
        params: ['axis: Vector3', 'angle: number'],
        doc: 'Creates a rotation CFrame from an axis vector and angle in radians.',
      },
      {
        name: 'CFrame.lookAt',
        params: ['at: Vector3', 'lookAt: Vector3', 'up: Vector3?'],
        doc: "Creates a CFrame at position 'at' facing 'lookAt', with optional up vector.",
      },
      {
        name: 'Color3.new',
        params: ['r: number', 'g: number', 'b: number'],
        doc: 'Creates a Color3 from r, g, b values in [0, 1] range.',
      },
      {
        name: 'Color3.fromRGB',
        params: ['r: number', 'g: number', 'b: number'],
        doc: 'Creates a Color3 from r, g, b values in [0, 255] range.',
      },
      {
        name: 'Color3.fromHSV',
        params: ['h: number', 's: number', 'v: number'],
        doc: 'Creates a Color3 from hue [0,1], saturation [0,1], value [0,1].',
      },
      {
        name: 'Color3.fromHex',
        params: ['hex: string'],
        doc: 'Creates a Color3 from a hex string e.g. "FF0000".',
      },
      {
        name: 'UDim.new',
        params: ['scale: number', 'offset: number'],
        doc: 'Creates a UDim with a scale and pixel offset component.',
      },
      {
        name: 'UDim2.new',
        params: ['xScale: number', 'xOffset: number', 'yScale: number', 'yOffset: number'],
        doc: 'Creates a UDim2 from scale and offset components for X and Y.',
      },
      {
        name: 'UDim2.fromScale',
        params: ['x: number', 'y: number'],
        doc: 'Creates a UDim2 using only scale values (offsets = 0).',
      },
      {
        name: 'UDim2.fromOffset',
        params: ['x: number', 'y: number'],
        doc: 'Creates a UDim2 using only pixel offset values (scales = 0).',
      },
      {
        name: 'TweenInfo.new',
        params: [
          'time: number',
          'easingStyle: Enum.EasingStyle',
          'easingDirection: Enum.EasingDirection',
          'repeatCount: number?',
          'reverses: boolean?',
          'delayTime: number?',
        ],
        doc: 'Creates a TweenInfo.',
      },
      {
        name: 'Ray.new',
        params: ['origin: Vector3', 'direction: Vector3'],
        doc: 'Creates a Ray from an origin and direction vector.',
      },
      {
        name: 'Rect.new',
        params: ['min: Vector2', 'max: Vector2'],
        doc: 'Creates a Rect from min and max Vector2 corners.',
      },
      {
        name: 'NumberRange.new',
        params: ['min: number', 'max: number?'],
        doc: 'Creates a NumberRange. If max is omitted, min is used for both.',
      },
      {
        name: 'NumberSequenceKeypoint.new',
        params: ['time: number', 'value: number', 'envelope: number?'],
        doc: 'Creates a NumberSequenceKeypoint at the given time [0,1] with value and optional envelope.',
      },
      {
        name: 'ColorSequenceKeypoint.new',
        params: ['time: number', 'color: Color3'],
        doc: 'Creates a ColorSequenceKeypoint at the given time [0,1].',
      },
      {
        name: 'NumberSequence.new',
        params: ['keypoints: {NumberSequenceKeypoint}'],
        doc: 'Creates a NumberSequence from a table of keypoints.',
      },
      {
        name: 'ColorSequence.new',
        params: ['keypoints: {ColorSequenceKeypoint}'],
        doc: 'Creates a ColorSequence from a table of keypoints.',
      },
      {
        name: 'Instance.new',
        params: ['className: string', 'parent: Instance?'],
        doc: 'Creates a new Instance of the given class. Optionally sets its parent.',
      },
      {
        name: 'RaycastParams.new',
        params: [],
        doc: 'Creates a new RaycastParams object. Set FilterDescendantsInstances, FilterType, IgnoreWater, CollisionGroup.',
      },
      {
        name: 'OverlapParams.new',
        params: [],
        doc: 'Creates a new OverlapParams object.',
      },
      {
        name: 'Random.new',
        params: ['seed: number?'],
        doc: 'Creates a Random object with an optional seed.',
      },
      {
        name: 'DateTime.now',
        params: [],
        doc: 'Returns the current DateTime.',
      },
      {
        name: 'DateTime.fromUnixTimestamp',
        params: ['unixTimestamp: number'],
        doc: 'Creates a DateTime from a Unix timestamp in seconds.',
      },
      {
        name: 'DateTime.fromUnixTimestampMillis',
        params: ['unixTimestampMillis: number'],
        doc: 'Creates a DateTime from a Unix timestamp in milliseconds.',
      },
      {
        name: 'DateTime.fromIsoDate',
        params: ['isoDate: string'],
        doc: 'Creates a DateTime from an ISO 8601 date string.',
      },
      {
        name: 'Vector3int16.new',
        params: ['x: number', 'y: number', 'z: number'],
        doc: 'Creates a Vector3int16.',
      },
      {
        name: 'Vector2int16.new',
        params: ['x: number', 'y: number'],
        doc: 'Creates a Vector2int16.',
      },
      {
        name: 'PhysicalProperties.new',
        params: [
          'density: number',
          'friction: number',
          'elasticity: number',
          'frictionWeight: number?',
          'elasticityWeight: number?',
        ],
        doc: 'Creates a PhysicalProperties value.',
      },
      {
        name: 'BrickColor.new',
        params: ['name: string'],
        doc: 'Creates a BrickColor from a color name string.',
      },
      {
        name: 'BrickColor.palette',
        params: ['paletteValue: number'],
        doc: 'Returns the BrickColor at the given palette index.',
      },
      {
        name: 'BrickColor.random',
        params: [],
        doc: 'Returns a random BrickColor.',
      },
    ];
    for (const ds of DATATYPE_SIGS) {
      _sigMap.set(ds.name, {
        label: ds.name + '(' + ds.params.join(', ') + ')',
        params: ds.params.map((p) => ({
          label: p,
        })),
        doc: ds.doc,
      });
    }
    monaco.languages.registerSignatureHelpProvider('lua', {
      signatureHelpTriggerCharacters: ['(', ','],
      provideSignatureHelp(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        let depth = 0,
          callStart = -1;
        for (let i = textBefore.length - 1; i >= 0; i--) {
          const ch = textBefore[i];
          if (ch === ')') {
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
        const funcExpr = textBefore.slice(0, callStart).trim();
        const argsText = textBefore.slice(callStart + 1);
        let activeParam = 0,
          d = 0;
        for (const ch of argsText) {
          if (ch === '(' || ch === '{') {
            d++;
            continue;
          }
          if (ch === ')' || ch === '}') {
            d--;
            continue;
          }
          if (ch === ',' && d === 0) activeParam++;
        }
        const funcName = funcExpr.match(/[\w.]+$/)?.[0];
        if (!funcName) return null;
        let sig = _sigMap.get(funcName);
        if (!sig && typeof RobloxAPI !== 'undefined') {
          const sepIdx = Math.max(funcName.lastIndexOf('.'), funcName.lastIndexOf(':'));
          if (sepIdx > 0) {
            const objExpr = funcName.slice(0, sepIdx);
            const methodName = funcName.slice(sepIdx + 1);
            const className = _resolveExprType(objExpr + '.', model, position.lineNumber);
            if (className) {
              const cls = RobloxAPI.getClass(className);
              const m = cls?.m.find((x) => x[0] === methodName);
              if (m && m[2]) {
                const inner = m[2].slice(1, -1).trim();
                const params = inner
                  ? inner.split(',').map((p) => ({
                      label: p.trim(),
                    }))
                  : [];
                sig = {
                  label: methodName + m[2],
                  params,
                  doc: 'Returns: `' + m[1] + '`',
                };
              }
            }
          }
        }
        if (!sig) return null;
        return {
          value: {
            signatures: [
              {
                label: sig.label,
                documentation: sig.doc
                  ? {
                      value: sig.doc,
                    }
                  : undefined,
                parameters: sig.params,
              },
            ],
            activeSignature: 0,
            activeParameter: Math.min(activeParam, Math.max(0, sig.params.length - 1)),
          },
          dispose() {},
        };
      },
    });
    monaco.languages.registerHoverProvider('lua', {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const lineText = model.getLineContent(position.lineNumber);
        const textBefore = lineText.slice(0, position.column - 1);
        const ec = EXECUTOR_COMPLETIONS.find((c) => c.label === word.word);
        if (ec) {
          return {
            contents: [
              {
                value: '```lua\n' + ec.label + ' ' + ec.detail + '\n```',
              },
              {
                value: ec.documentation,
              },
            ],
          };
        }
        const nsCtx = textBefore.match(/\b(\w+)\.(\w*)$/);
        if (nsCtx && STATIC_NAMESPACES[nsCtx[1]]) {
          const ds = DATATYPE_SIGS.find((d) => d.name === nsCtx[1] + '.' + word.word);
          if (ds) {
            return {
              contents: [
                {
                  value: '```lua\n' + ds.name + '(' + ds.params.join(', ') + ')\n```',
                },
                {
                  value: ds.doc,
                },
              ],
            };
          }
        }
        const stdCtx = textBefore.match(/\b(string|math|table|coroutine|os)\.(\w*)$/);
        if (stdCtx) {
          const lib = STD_MEMBERS[stdCtx[1]];
          if (lib) {
            const m = lib.methods.find((x) => x.name === word.word);
            if (m)
              return {
                contents: [
                  {
                    value: '```lua\n' + stdCtx[1] + '.' + m.name + ' ' + m.sig + '\n```',
                  },
                  {
                    value: m.doc,
                  },
                ],
              };
            const p = lib.props?.find((x) => x.name === word.word);
            if (p)
              return {
                contents: [
                  {
                    value: '```lua\n' + stdCtx[1] + '.' + p.name + ': number\n```',
                  },
                  {
                    value: p.doc,
                  },
                ],
              };
          }
        }
        const enumValueCtx = textBefore.match(/\bEnum\.(\w+)\.(\w*)$/);
        if (enumValueCtx && ENUM_DATA[enumValueCtx[1]]) {
          return {
            contents: [
              {
                value: '```lua\nEnum.' + enumValueCtx[1] + '.' + word.word + '\n```',
              },
            ],
          };
        }
        if (typeof RobloxAPI !== 'undefined') {
          if (/[.:]\w*$/.test(textBefore)) {
            const className = _resolveExprType(textBefore, model, position.lineNumber);
            if (className) {
              const cls = RobloxAPI.getClass(className);
              if (cls) {
                const m = cls.m.find((x) => x[0] === word.word);
                if (m)
                  return {
                    contents: [
                      {
                        value: '```lua\n' + m[0] + (m[2] || '()') + ': ' + m[1] + '\n```',
                      },
                    ],
                  };
                const p = cls.p.find((x) => x[0] === word.word);
                if (p)
                  return {
                    contents: [
                      {
                        value: '```lua\n' + p[0] + ': ' + p[1] + '\n```',
                      },
                    ],
                  };
                const e = cls.e.find((x) => x[0] === word.word);
                if (e)
                  return {
                    contents: [
                      {
                        value: '```lua\n' + e[0] + ': RBXScriptSignal ' + e[1] + '\n```',
                      },
                    ],
                  };
              }
            }
          }
          const globalType = RobloxAPI.resolveGlobal(word.word);
          if (globalType)
            return {
              contents: [
                {
                  value: '```lua\n' + word.word + ': ' + globalType + '\n```',
                },
              ],
            };
        }
        return null;
      },
    });
    const symbolProvider = _buildSymbolProvider(monaco);
    monaco.languages.registerDocumentSymbolProvider('lua', symbolProvider);
    return symbolProvider;
  }
  function _hasMemberOwner(textBefore) {
    return /\b[A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*\s*[.:]\s*\w*$/.test(textBefore);
  }

  function _staticNamespaceSuggestions(
    namespace,
    members,
    datatypeSigs,
    executorCompletions,
    range,
    K,
    InsertAsSnippet,
  ) {
    const executorByName = new Map(executorCompletions.map((item) => [item.label, item]));
    const sigByName = new Map(datatypeSigs.map((item) => [item.name, item]));
    return members.map((name) => {
      const fullName = namespace + '.' + name;
      const executor = executorByName.get(fullName);
      if (executor) return _executorSuggestion(executor, name, range, K, InsertAsSnippet, '0_');
      const sig = sigByName.get(fullName);
      if (sig) return _datatypeMemberSuggestion(sig, name, range, K, InsertAsSnippet, '0_');
      return {
        label: name,
        kind: /^[A-Z]/.test(name) ? K.Property : K.Method,
        detail: fullName,
        documentation: {
          value: '`' + fullName + '`',
        },
        insertText: name,
        sortText: '1_' + name,
        range,
      };
    });
  }

  function _executorNamespaceSuggestions(
    namespace,
    executorCompletions,
    range,
    K,
    InsertAsSnippet,
  ) {
    const prefix = namespace + '.';
    return executorCompletions
      .filter((item) => item.label.startsWith(prefix))
      .map((item) =>
        _executorSuggestion(item, item.label.slice(prefix.length), range, K, InsertAsSnippet, '0_'),
      );
  }

  function _datatypeGlobalSuggestions(datatypeSigs, range, K, InsertAsSnippet) {
    return datatypeSigs.map((sig) => ({
      label: sig.name,
      kind: K.Function,
      detail: '(' + sig.params.join(', ') + ')',
      documentation: {
        value: sig.doc,
      },
      insertText: _callInsertText(sig.name, sig.params),
      insertTextRules: sig.params.length ? InsertAsSnippet : undefined,
      sortText: '1_' + sig.name,
      range,
    }));
  }

  function _datatypeMemberSuggestion(sig, label, range, K, InsertAsSnippet, sortPrefix) {
    return {
      label,
      kind: sig.params.length || /^[a-z]/.test(label) ? K.Method : K.Property,
      detail: sig.name + '(' + sig.params.join(', ') + ')',
      documentation: {
        value: sig.doc,
      },
      insertText: _callInsertText(label, sig.params),
      insertTextRules: sig.params.length ? InsertAsSnippet : undefined,
      sortText: sortPrefix + label,
      range,
    };
  }

  function _executorSuggestion(item, label, range, K, InsertAsSnippet, sortPrefix) {
    const insertText = item.label.includes('.')
      ? item.insertText.slice(item.label.lastIndexOf('.') + 1)
      : item.insertText;
    return {
      label,
      kind: K.Function,
      detail: item.detail,
      documentation: {
        value: item.documentation,
      },
      insertText,
      insertTextRules: item.snippet ? InsertAsSnippet : undefined,
      sortText: sortPrefix + label,
      range,
    };
  }

  function _callInsertText(name, params) {
    if (!params.length) return name + '()';
    return (
      name +
      '(' +
      params
        .map(
          (param, index) =>
            '${' + (index + 1) + ':' + param.split(':')[0].replace(/[?]/g, '').trim() + '}',
        )
        .join(', ') +
      ')'
    );
  }

  function _resolveExprType(textBefore, model, lineNumber) {
    if (typeof RobloxAPI === 'undefined') return null;
    const expr = textBefore.replace(/[.:]\s*\w*$/, '').trimEnd();
    return _evalType(expr, model, lineNumber, 0);
  }
  function _evalType(expr, model, lineNumber, depth) {
    if (depth > 6 || !expr) return null;
    const t = expr.trim();
    const globalType = RobloxAPI.resolveGlobal(t);
    if (globalType) return globalType;
    const newMatch = expr.match(/Instance\.new\(\s*["'](\w+)["']\s*\)$/);
    if (newMatch) return newMatch[1];
    const svcMatch = expr.match(/(?:game|Game)\s*:\s*GetService\(\s*["'](\w+)["']\s*\)$/);
    if (svcMatch) return RobloxAPI.resolveService(svcMatch[1]) || svcMatch[1];
    const dotSvcMatch = expr.match(/(?:game|Game)\.(\w+)$/);
    if (dotSvcMatch) {
      const c = RobloxAPI.resolveService(dotSvcMatch[1]);
      if (c) return c;
    }
    const chainMatch = expr.match(/^([\s\S]+?)([.:])(\w+(?:\([^)]*\))?)$/);
    if (!chainMatch) return _resolveLocal(t, model, lineNumber);
    const [, lhs, , rhs] = chainMatch;
    const lhsType = _evalType(lhs.trimEnd(), model, lineNumber, depth + 1);
    if (!lhsType) return null;
    const cls = RobloxAPI.getClass(lhsType);
    if (!cls) return null;
    const rhsName = rhs.replace(/\([^)]*\)$/, '');
    const method = cls.m.find((m) => m[0] === rhsName);
    if (method) return _returnTypeToClass(method[1]);
    const prop = cls.p.find((p) => p[0] === rhsName);
    if (prop) return _typeStringToClass(prop[1]);
    return null;
  }
  function _resolveLocal(varName, model, lineNumber) {
    const safe = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const maxScan = Math.max(1, lineNumber - 60);
    for (let i = lineNumber - 1; i >= maxScan; i--) {
      const line = model.getLineContent(i);
      const patterns = [
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*Instance\\.new\\(["\'](\\w+)["\']\\)'),
        new RegExp(
          '(?:local\\s+)?' + safe + '\\s*=\\s*game\\s*:\\s*GetService\\(["\'](\\w+)["\']\\)',
        ),
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*game\\.([\\w]+)'),
        new RegExp('(?:local\\s+)?' + safe + '\\s*=\\s*(game|workspace|script)\\b'),
      ];
      for (const pat of patterns) {
        const m = line.match(pat);
        if (!m || !m[1]) continue;
        const svcCls = RobloxAPI.resolveService(m[1]);
        if (svcCls) return svcCls;
        const globalCls = RobloxAPI.resolveGlobal(m[1]);
        if (globalCls) return globalCls;
        if (RobloxAPI.getClass(m[1])) return m[1];
      }
      const annotMatch = line.match(new RegExp('(?:local\\s+)?' + safe + '\\s*:\\s*(\\w+)'));
      if (annotMatch && RobloxAPI.getClass(annotMatch[1])) return annotMatch[1];
    }
    return null;
  }
  function _typeStringToClass(typeStr) {
    if (!typeStr) return null;
    const clean = typeStr.replace(/[?{}]/g, '').trim();
    if (clean === 'Instance') return 'Instance';
    return RobloxAPI.getClass(clean) ? clean : null;
  }
  function _returnTypeToClass(ret) {
    if (!ret || ret.startsWith('(')) return null;
    return _typeStringToClass(ret);
  }
  function _argsToSnippet(args) {
    const inner = args.replace(/^\(|\)$/g, '').trim();
    if (!inner) return '';
    return inner
      .split(',')
      .map((p, i) => '${' + (i + 1) + ':' + p.trim().split(':')[0].replace(/[?]/g, '').trim() + '}')
      .join(', ');
  }

  function _offsetAt(text, position) {
    let line = 1;
    let column = 1;
    for (let i = 0; i < text.length; i++) {
      if (line === position.lineNumber && column === position.column) return i;
      if (text[i] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return text.length;
  }
  return {
    register,
  };
})();
