@@ name: Synapse X
@@ desc: Custom Lua function reference for Synapse X — environment helpers, hooking, reflection, drawing, crypt, websocket and more.
@@ accent: #2196f3
@@ pages: 16

>>> Custom Lua Functions
>>> Environment Helper Functions
# Environment Helper Functions

## Get Global Environment

```luau
<table> getgenv(<void>)
```

Returns the environment that will be applied to each script ran by Synapse.

## Get Roblox Environment

```luau
<table> getrenv(<void>)
```

Returns the global Roblox environment for the LocalScript state.

## Get Registry

```luau
<table> getreg(<void>)
```

Returns the Lua registry.

## Get Garbage Collection

```luau
<table> getgc(<void>)
```

Returns a copy of the Lua GC list.

## Get Instances

```luau
<table> getinstances(<void>)
```

Returns a list of all instances within the game.

## Get Nil Instances

```luau
<table> getnilinstances(<void>)
```

Returns a list of all instances parented to `nil` within the game.

## Get Scripts

```luau
<table> getscripts(<void>)
```

Returns a list of all scripts within the game.

## Get Loaded Modules

```luau
<table> getloadedmodules(<void>)
```

Returns all ModuleScripts loaded in the game.

## Get Connections

```luau
<table> getconnections(<RBXScriptSignal> obj)
```

Gets a list of connections to the specified signal.

| Property | Description |
| --- | --- |
| .Function | The function connected to the connection |
| .State | The state of the connection |
| :Enable | Enables the connection |
| :Disable | Disables the connection |
| :Fire | Fires the connection |

### Example

```luau
for i, connection in pairs(getconnections(workspace.ChildAdded)) do
    connection:Disable()
end
```

## Fire Signal

```luau
<void> firesignal(<RBXScriptSignal> obj)
```

Fires all the connections connected to the signal `obj`.

## Fire Click Detector

```luau
<void> fireclickdetector(<object> ClickDetector, <number> Distance)
```

Fires the designated `ClickDetector` with provided `Distance`. If `Distance` isn't provided, it will default to 0.

## Fire Touch Interest

```luau
<void> firetouchinterest(<object> Part, <object> Transmitter, <number> Toggle)
```

Fires the designated `Transmitter` with `Part`. The `Toggle` argument tells whether the Part is currently being touched.

>>> Custom Lua Functions
>>> Script Environment Functions
# Script Environment Functions

## Get Script Environment

```luau
<table> getsenv(<LocalScript, ModuleScript> Script)
```

Returns the environment of `Script`. Returns nil if the script is not running.

## Get Calling Script

```luau
<LocalScript, ModuleScript, nil> getcallingscript(<void>)
```

Gets the script that is calling this function.

>>> Custom Lua Functions
>>> Table Modification Functions
# Table Modification Functions

## Get Raw Metatable

```luau
<table> getrawmetatable(<table> value)
```

Retrieve the metatable of value irregardless of value's metatable's `__metatable` field. Returns `nil` if it doesn't exist.

## Set Raw Metatable

```luau
<bool> setrawmetatable(<object> o, <table> mt)
```

Sets `o`'s metatable to `mt` even if the `__metatable` field exists in `o`'s metatable.

## Set Readonly

```luau
<void> setreadonly(<table> table, <bool> val)
```

Sets `table`'s read-only value to `val`.

## Is Readonly

```luau
<bool> isreadonly(<table> table)
```

Returns `table`'s read-only condition.

>>> Custom Lua Functions
>>> Keyboard/Mouse Functions
# Keyboard/Mouse Functions

## Is Roblox Active

```luau
<bool> isrbxactive(<void>)
```

Returns if the Roblox window is in focus. This must return true for any other mouse/keyboard function to work.

## Keyboard

```luau
<void> keypress(<number> keycode)
```

Simulates a key press for the specified `keycode`.

```luau
<void> keyrelease(<number> key)
```

Releases `key` on the keyboard.

## Left Click

```luau
<void> mouse1click(<void>)
<void> mouse1press(<void>)
<void> mouse1release(<void>)
```

Simulates a full left mouse button press, press-only, or release.

## Right Click

```luau
<void> mouse2click(<void>)
<void> mouse2press(<void>)
<void> mouse2release(<void>)
```

Simulates a full right mouse button press, press-only, or release.

## Mouse Movement

```luau
<void> mousescroll(<number> px)
```

Scrolls the mouse wheel virtually by `px` pixels.

```luau
<void> mousemoverel(<number> x, <number> y)
```

Moves the mouse cursor relatively to the current position by `x` and `y`.

```luau
<void> mousemoveabs(<number> x, <number> y)
```

Moves the mouse to absolute coordinates `x`, `y` from the top-left of the Roblox window.

>>> Custom Lua Functions
>>> Hooking Functions
# Hooking Functions

## Hook Function

```luau
<function> hookfunction(<function> old, <function> hook)
```

Hooks function `old`, replacing it with the function `hook`. The old function is returned — you must use it to call the original further.

## New C Closure

```luau
<function> newcclosure(<function> f)
```

Pushes a new CClosure that invokes function `f` upon call. Used for metatable hooks.

>>> Custom Lua Functions
>>> Reflection Functions
# Reflection Functions

## Loadstring

```luau
<function> loadstring(<string> chunk, [<string> chunkname])
```

Loads `chunk` as a Lua function and returns it if compilation is successful. Otherwise returns nil followed by the error message.

## Check Caller

```luau
<bool> checkcaller(<void>)
```

Returns `true` if the current thread was made by Synapse. Useful for metatable hooks.

## Is Lua Closure

```luau
<bool> islclosure(<function> f)
```

Returns true if `f` is an LClosure.

## Is C Closure

```luau
<bool> iscclosure(<function> f)
```

Returns true if `f` is a CClosure.

## Dump String

```luau
<string> dumpstring(<string> Script)
```

Returns the Roblox formatted bytecode for source string `Script`.

## Decompile

```luau
<string> decompile(<userdata, function, string, proto> Script, <string, bool> mode, <number> timeout)
```

Decompiles `Script` and returns the decompiled script. If decompilation fails the return value will be an error message.

>>> Custom Lua Functions
>>> Console Functions
# Console Functions

## Console Print

```luau
<void> rconsoleprint(<string> message)
```

Prints `message` into the console. Supports color codes like `@@RED@@`, `@@BLUE@@`, etc.

### Example

```luau
rconsoleprint('@@RED@@')
rconsoleprint('this is red')
```

## Console Info / Warn / Error

```luau
<void> rconsoleinfo(<string> message)
<void> rconsolewarn(<string> message)
<void> rconsoleerr(<string> message)
```

Prints `message` with an info, warning, or error prefix respectively.

## Console Clear

```luau
<void> rconsoleclear(<void>)
```

Clears the console.

## Console Name

```luau
<void> rconsolename(<string> title)
```

Sets the allocated console title to `title`.

## Console Input

```luau
<string> rconsoleinput(<void>)
<string> rconsoleinputasync(<void>)
```

Yields until the user inputs into the console, then returns the input.

## Print Console

```luau
<void> printconsole(<string> message, <int> red, <int> green, <int> blue)
```

Prints `message` to the internal and integrated console with RGB color value.

>>> Custom Lua Functions
>>> File Functions
# File Functions

## Read File

```luau
<string> readfile(<string> path)
```

Reads the contents of the file at `path`. Errors if the file does not exist.

## Write File

```luau
<void> writefile(<string> filepath, <string> contents)
```

Writes `contents` to `filepath`. Extensions not allowed: `.exe`, `.bat`, `.vbs`, `.ps1`, and others.

## Append File

```luau
<void> appendfile(<string> path, <string> content)
```

Appends `content` to the file at `path`. Errors if the file does not exist.

## Load File

```luau
<function> loadfile(<string> path)
```

Loads the file contents as a chunk. Returns the function if successful, otherwise nil and an error message.

## List Files

```luau
<table> listfiles(<string> folder)
```

Returns a table of files in `folder`.

## Is File / Is Folder

```luau
<bool> isfile(<string> path)
<bool> isfolder(<string> path)
```

Returns whether `path` is a file or folder respectively.

## Make Folder

```luau
<void> makefolder(<string> filepath)
```

Creates a new folder at `filepath`.

## Delete Folder / Delete File

```luau
<void> delfolder(<string> path)
<void> delfile(<string> path)
```

Deletes the folder or file at `path`. Errors if it does not exist.

>>> Custom Lua Functions
>>> Internal Functions
# Internal Functions

These are internal Synapse functions datamined from the public source. Mostly useless to end users.

## Get States

```luau
<table> getstates(<void>)
```

Returns a table populated with all threads.

## Get Instance From State

```luau
<instance> getinstancefromstate(<thread>)
```

Exact function unknown.

## Get Pointer From State

```luau
<userdata> getpointerfromstate(<thread>)
```

Exact function unknown.

## Get State Environment

```luau
<table> getstateenv(<thread> state)
```

Returns the environment for `state`.

## Get Call Stack

```luau
<table> getcallstack(<thread>)
```

Exact function unknown.

>>> Custom Lua Functions
>>> Misc. Functions
# Misc. Functions

## Set Clipboard

```luau
<void> setclipboard(<string> value)
```

Sets `value` to the clipboard.

## Set Fast Flag

```luau
<void> setfflag(<string> FFlag, <string> Value)
```

Sets `FFlag` with `Value`. Must be run before Roblox loads.

### Example

```luau
setfflag('UseRoactPlayerList3', 'False')
```

## Get / Set Namecall Method

```luau
<string> getnamecallmethod(<void>)
<void> setnamecallmethod(<string> method)
```

Gets or sets the current namecall method. Must be called in a `__namecall` metatable hook.

## Is LuaU

```luau
<bool> isluau(<void>)
```

Returns true if the game is running LuaU. Always returns true — remove calls to this in your scripts.

## Set Nonreplicated Property

```luau
<void> setnonreplicatedproperty(<Instance> obj, <string> prop, <T> value)
```

Sets `prop` of `obj` without replicating to the server. **Currently broken.**

## Get Special Info

```luau
<table> getspecialinfo(<Instance> obj)
```

Gets special properties for `MeshParts`, `UnionOperations`, and `Terrain` instances.

## Save Instance

```luau
<void> saveinstance(<table> t)
```

Saves the Roblox game to your workspace folder.

| Option | Value |
| --- | --- |
| mode | optimized / full / scripts |
| noscripts | true / false |
| scriptcache | true / false |
| timeout | any number |

## Message Box

```luau
<void> messagebox(<string> text, <string> caption, <number> style)
```

Creates a Win32 message box. Style 0 = OK, 1 = OK/Cancel, 3 = Yes/No/Cancel, 4 = Yes/No.

>>> Libraries
>>> Bit
# Bit Library

```luau
<int> bit.bdiv(<uint> dividend, <uint> divisor)
<int> bit.badd(<uint> a, <uint> b)
<int> bit.bsub(<uint> a, <uint> b)
<int> bit.band(<uint> val, <uint> by)
<int> bit.bor(<uint> val, <uint> by)
<int> bit.bxor(<uint> val, <uint> by)
<int> bit.bnot(<uint> val)
<int> bit.bmul(<uint> val, <uint> by)
<int> bit.bswap(<uint> val)
<int> bit.ror(<uint> val, <uint> by)
<int> bit.rol(<int> value, <int> shiftCount)
<string> bit.tohex(<uint> val)
<int> bit.tobit(<uint> val)
<int> bit.lshift(<uint> val, <uint> by)
<int> bit.rshift(<uint> val, <uint> by)
<int> bit.arshift(<int> value, <int> shiftCount)
```

Standard bitwise operations. `badd`, `bsub`, `bmul` allow integer overflows unlike normal Lua arithmetic. `tohex` converts to hex string, `tobit` normalises a value for bitwise operations.

>>> Libraries
>>> Crypt
# Crypt Library

## Encrypt / Decrypt

```luau
<string> syn.crypt.encrypt(<string> data, <string> key)
<string> syn.crypt.decrypt(<string> data, <string> key)
```

Encrypt or decrypt `data` with `key`.

## Base64

```luau
<string> syn.crypt.base64.encode(<string> data)
<string> syn.crypt.base64.decode(<string> data)
```

Encode or decode `data` with base64.

## Hash / Derive / Random

```luau
<string> syn.crypt.hash(<string> data)
<string> syn.crypt.derive(<string> value, <number> len)
<string> syn.crypt.random(<number> size)
```

Hash data, derive a secret key, or generate a random string of `size` bytes (max 1024).

## Custom Encrypt / Decrypt / Hash

```luau
<string> syn.crypt.custom.encrypt(<string> cipher, <string> data, <string> key, <string> iv)
<string> syn.crypt.custom.decrypt(<string> cipher, <string> data, <string> key, <string> iv)
<string> syn.crypt.custom.hash(<string> algorithm, <string> data)
```

Ciphers: `aes-cbc`, `aes-cfb`, `aes-ctr`, `aes-ofb`, `aes-gcm`, `aes-eax`, `bf-cbc`, `bf-cfb`, `bf-ofb`.
Algorithms: `md5`, `sha1`, `sha224`, `sha256`, `sha384`, `sha512`, `sha3-256`, `sha3-384`, `sha3-512`.

### Example

```luau
local enc = syn.crypt.custom.encrypt("aes-gcm", "hi gamers!", "key32byteslong!!!", "iv12bytes!!!")
print(syn.crypt.custom.decrypt("aes-gcm", enc, "key32byteslong!!!", "iv12bytes!!!"))
```

>>> Libraries
>>> Debug
# Debug Library

```luau
<table> debug.getconstants(<function, number> fi)
<T>     debug.getconstant(<function, number> fi, <number> idx)
<void>  debug.setconstant(<function, number> fi, <string> consname, <number, bool, nil, string> value)
```

Get/set constants in a function or level.

```luau
<table> debug.getupvalues(<function, number> fi)
<T>     debug.getupvalue(<function, number> fi, <number> index)
<void>  debug.setupvalue(<function, number> fi, <number> index, <table> value)
```

Get/set upvalues in a function or level.

```luau
<table>    debug.getprotos(<function> f)
<function> debug.getproto(<function, number> f, <int> index)
<void>     debug.setproto(<function> fi, <number> index, <function> replacement)
```

Get/set protos (local functions) in a function.

```luau
<table> debug.getstack(<function, number> fi)
<void>  debug.setstack(<function, number> fi, <number> indice, <table> value)
```

Get/set the method stack at a level or function.

```luau
<table> debug.setmetatable(<table> o, <table> mt)
<table> debug.getregistry(<void>)
debug.getinfo(<function, number> fi, <string> w)
<void>  debug.setupvaluename(<table> Name)
```

Set metatable, get registry, get function info, or rename an upvalue.

>>> Libraries
>>> Drawing
# Drawing Library

## Creating Objects

```luau
<object> Drawing.new(<string> type)
```

Creates a new drawing object. Type can be `Line`, `Text`, `Circle`, `Square`, or `Triangle`.

```luau
<table> Drawing.Fonts(<void>)
```

Returns available fonts: `UI` (0), `System` (1), `Plex` (2), `Monospace` (3).

## Base Properties

All drawing objects inherit: `bool Visible`, `void Remove()`, `Color3 Color`.

## Line

```luau
-- Properties
number Transparency  -- (opposite to Roblox)
number Thickness
Vector2 From
Vector2 To
```

## Text

```luau
string Text
number Transparency
number Size
bool Center
bool Outline
Color3 OutlineColor
Vector2 Position
Vector2 TextBounds  -- readonly
number Font
```

## Circle

```luau
number Transparency
number Thickness
number NumSides
number Radius
bool Filled
Vector2 Position
```

## Square

```luau
number Transparency
number Thickness
Vector2 Size
Vector2 Position
bool Filled
```

## Triangle

```luau
number Transparency
number Thickness
Vector2 PointA
Vector2 PointB
Vector2 PointC
bool Filled
```

## Example

```luau
local line = Drawing.new("Line")
line.Visible = true
line.From = Vector2.new(0, 0)
line.To = Vector2.new(200, 200)
line.Color = Color3.fromRGB(255, 255, 255)
line.Thickness = 2
line.Transparency = 1
line:Remove()
```

>>> Libraries
>>> Syn
# Syn Library

## Cache

```luau
<void> syn.cache_replace(<Instance> obj, <Instance> t_obj)
<void> syn.cache_invalidate(<Instance> obj)
<bool> syn.is_cached(<Instance> obj)
```

Replace, invalidate, or check an instance in the cache registry.

## Thread Identity

```luau
<void>   syn.set_thread_identity(<number> n)
<number> syn.get_thread_identity(<void>)
```

Gets or sets the current thread identity. Call `wait()` after `set_thread_identity` for expected results.

## Clipboard / Teleport / GUI

```luau
<void> syn.write_clipboard(<string> content)
<void> syn.queue_on_teleport(<string> code)
<void> syn.protect_gui(<obj> gui)
<void> syn.unprotect_gui(<obj> gui)
```

Write to clipboard, queue code on teleport, or protect a GUI from recursive FindFirstChild attacks.

## HTTP Request

```luau
<table> syn.request(<table> options)
```

Sends an HTTP request. Options: `Url` (required), `Method`, `Headers`, `Body`. Returns a table with `Success`, `StatusCode`, `StatusMessage`, `Headers`, `Body`.

### Example

```luau
local response = syn.request({
    Url = "http://httpbin.org/post",
    Method = "POST",
    Headers = { ["Content-Type"] = "application/json" },
    Body = game:GetService("HttpService"):JSONEncode({ hello = "world" })
})
print(response.StatusCode, response.Body)
```

## Secure Call

```luau
<idk> syn.secure_call(<function> func, <script> script, <...> args)
```

Spoofs caller environment and context when calling `func` with `script`'s environment.

## Secure Functions

```luau
<string> syn.create_secure_function(<string> code)
<void>   syn.run_secure_function(<string> code)
```

Protect code with secure function, making it impossible for others to alter or view. Access restricted.

>>> Libraries
>>> WebSocket
# WebSocket Library

## Connecting

```luau
<object> syn.websocket.connect(<string> url)
```

Connects to `url`. Errors if the connection fails.

## Methods

```luau
WebSocket:Send(<string> message)
WebSocket:Close(<void>)
```

Send a message to the server or close the connection.

## Events

```luau
WebSocket.OnMessage  -- fired when server sends a message
WebSocket.OnClose    -- fired when connection is closed
```

## Example

```luau
local ws = syn.websocket.connect("ws://localhost:123/test")

ws.OnMessage:Connect(function(msg)
    print(msg)
end)

local i = 1
while wait(1) do
    ws:Send("message " .. i)
    i += 1
    if i == 50 then
        ws:Close()
        return
    end
end
```