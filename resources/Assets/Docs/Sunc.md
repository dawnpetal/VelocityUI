@@ name: sUNC
@@ desc: Unified Naming Convention — executor API reference for Luau closures, debug, filesystem, instances, and more.
@@ accent: #8b78f0
@@ pages: 50

>>> sUNC
>>> Introduction
# sUNC Documentation

Welcome to the official documentation for **sUNC** - senS' Unified Naming Convention.

This documentation site serves as the central knowledge base for understanding what sUNC is, how it works, and how to contribute to the project.

Whether you're an executor developer, a curious tester, or a contributor helping document functions, you're in the right place!

!!! info "Not every original UNC function is tested!"

    This documentation covers ***only*** the functions that are **actively tested by the sUNC script**. If a function is not listed here, then it is likely not part of our standard.

    Over time, sUNC has largely diverged from the original UNC to become better and shaped by executor developers and users, hence why some functions have been deprecated/removed and others may have been added.

---

## 📚 Explore the Docs

- [What is sUNC?](./About/what-is-sunc.md)
- [How sUNC Test Results Work](./About/test-results.md)
- [How to contribute](./About/contributing.md)

## 📜 The script

```luau title="The sUNC testing script" linenums="1"
getgenv().sUNCDebug = {
    ["printcheckpoints"] = false,
    ["delaybetweentests"] = 0,
    ["printtesttimetaken"] = false,
}

loadstring(game:HttpGet("https://script.sunc.su/"))() -- (1)
```

1. This loadstring uses [script.sunc.su](https://script.sunc.su/), which is an official mirror of the sUNC script. If the mirror is down or you would like to use the original loadstring, visit [this](https://gitlab.com/sens3/nebunu/-/raw/main/HummingBird8's_sUNC_yes_i_moved_to_gitlab_because_my_github_acc_got_brickedd/sUNCm0m3n7.lua).

Please note that as of sUNC v2.0, the test now only runs inside of the official testing game. The latest one may be retrieved from [our Discord server](https://discord.gg/FNNfTUpFYv).

---

Thank you for being here.

>>> About
>>> What is sUNC?
# sUNC introduction

## What is "sUNC"?

**sUNC** stands for **senS' Unified Naming Convention**. It is a tool designed to check if an executor can properly run essential global functions, following the existing [Unified Naming Convention](https://github.com/unified-naming-convention/NamingStandard/tree/main).

Unlike the original UNC (which is now outdated and prone to spoofing), sUNC ensures that functions actually work as intended, by testing them as if they were to be used in a real scenario.
However, we are not in any way calling UNC "bad". We are simply stating that people should not be using UNC to deeply test their environment, as it was never intended to do so.

## How would I know what fails?

We are not gatekeeping function tests, despite the script being obfuscated.  
You are welcome to ask the owner (@sens6222 on Discord) **if you are struggling with passing certain tests**. We keep it this way for now, due to executors already faking their environments to suit the original UNC.

Note that it's also possible to see the detailed reason of a function's failure at the top of the `Developer Console` in game, or on the dedicated sUNC Rubiš site.

## Will sUNC be discontinued?

Not in the near future, we hope. However, if sUNC were to be discontinued, we will open source the project after 1-2 months.

-----

## Credits

- [Original UNC Documentation](https://github.com/unified-naming-convention/NamingStandard/tree/main)

>>> About
>>> Test Results
# How do test results work?

sUNC is known for its strict tests. Ever since it was made, it was built to expose falsified environments and spoofed globaly by testing for functionality - not just checking for their presence or shallow checking.

---

## Using the dedicated game

As of **sUNC V2**, all tests must be conducted in the official sUNC testing game. This game may be found in our [Discord server](https://discord.gg/FNNfTUpFYv).

We chose to do so, because by having a dedicated server, we're able to provide you with the new online test results via Rubiš. This allows us to provide you with verified and reproducible results, instead of people sending meaningless screenshots of their console output.

---

## Viewing your test results

Once your test is complete, sUNC will generate a short redirect link via `r.sunc.su` like this:

![An `r.sunc.su` redirect link generated](./assets/test-results/r.sunc.su.png)

This generated link redirects to **Numelon Rubiš**:

![An sUNC Test Result being displayed with Numelon Rubiš](./assets/test-results/RubisTestResult.png)

The results page offers a clean, visually appealing UI that lays out which functions passed and which failed, why they failed, and cryptographic guarantees of authenticity.

---

## Verified integrity

Rubiš doesn't just store your sUNC test results, it also **verifies** them.

- Every result is **cryptographically signed** by the sUNC test game servers.
- Any tampered or faked data is **flagged as unverified**.

Even if someone tries to replicate the link or manually upload fake data and use it with the results viewer (since [Rubiš is also a public paste service](https://rubis.app) which is usable by anyone), it will not work.

>>> About
>>> Contributing
# Contribution Guide

Welcome to the sUNC documentation project! We worked tirelessly to standardise and make the documentation beautiful and readable for everyone.

This guide outlines the official standards for contributing to the sUNC documentation, including how libraries and functions should be structured and written.

Consistency makes the documentation readable, searchable, and enjoyable to explore.

---

## Documenting entire libraries

Each library **must** be placed in a folder named after the library itself. Inside this folder, you must include a `README.md` file, which serves as the **index page** for that library, in both this documentation website and also when browsing the documentation repository on GitHub.

### Index page requirements

- Introduce the purpose of the library
- Summarise what you **can** and **cannot** do with it

Index pages *do not* need to follow this strict format, but they should ***aim*** to do so, for clarity and helpfulness.

---

## General documentation style

All documentation pages (including function pages and index pages) **must**:

- Use inline links to relevant [Wikipedia](https://wikipedia.org), [Roblox Luau](https://create.roblox.com/docs), or other sUNC pages with referencing key terms.
- Use the correct inline link formats, e.g.:

    ```md
    [`#!luau task.defer`](https://create.roblox.com/docs/reference/engine/libraries/task#defer)
    ```

    As you can see, the example above uses a code snippet with `luau` syntax highlighting enabled, whilst also being a hyperlink to the Roblox API documentation for [`#!luau task.defer`](https://create.roblox.com/docs/reference/engine/libraries/task#defer).

All markdown documents must be formatted using David Anson's ["markdownlint"](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint) extension, available for free in the Visual Studio marketplace.

This extension alone is not sufficient enough, which is why we use Yu Zhang's ["markdown all in one"](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one) extension too, but only specifically for formatting tables. This makes tables look nice and readable in the source markdown files of the documentation.

The repository for this documentation already includes a `.vscode/extensions.json` file, so the extensions should automatically download for you once you consent.

When formatting tables, open the Command Palette with `Ctrl + Shift + P` (Windows) or `⌘ + Shift + P` (macOS), select "Format Document With...", and select "Markdown All In One" like so:

![Formatting a markdown document using the Markdown All In One extension in Visual Studio Code](./assets/markdown-formatting.gif)

### Language choices

#### Using British English

It is generally well known around the sUNC community that the documentation and most things that have a lot of text are written using British English. This usually means some words Americans spell with a "z" will instead use an "s". If you are unsure, please check the Oxford or Cambridge dictionaries.

#### The "Oxford Comma"

Please use the [Oxford Comma](https://en.wikipedia.org/wiki/Serial_comma) when writing lists.  
This means that in a list of three or more items, a comma is placed before the final "and" or "or".  
For example: *"apples, oranges, and bananas"* rather than *"apples, oranges and bananas"*.  

The Oxford Comma avoids ambiguity and makes lists clearer. It also mirrors natural pauses in daily speech, which makes the text easier to read aloud and less confusing to follow.

#### Short-form contractions

Please avoid contractions like "isn't" and "it's". Instead, use "is not" and "it is" respectively. These are just examples, but the same rules apply for all contractions. Because this documentation is formal and technical rather than conversational, contractions should be avoided.

#### Articles before a word

An article is something that goes before a word, like `a` and `an`. This is a polite reminder to ***not*** just put an `an` in front of things that have a vowel *literally*, but rather whether the word has a vowel **sound** when pronounced out loud. Non-native English speakers tend to get this rule wrong sometimes.

If unsure about pronunciation, assume that pronunciation is done with a British RP accent - the best sources to listen to are the Oxford and Cambridge dictionaries again where the pronunciation is perfect.

---

## Function documentation

Each function must have **its own file**, named after the function (e.g. `newcclosure.md`).

### Title Format

The title of the page must be written as:

```md
# `function_name`
```

!!! failure "Important"

    Do not include emojis in function **titles**.

### Notices

Place all important `!!!` callouts (warnings, errors, info) **immediately under the title**. These should include anything the user must know before using the function.

---

### Description

Provide a description of the function directly after any notices.

When referencing the function name, **always** use the code snippet format:

```md
`#!luau function_name` allows you to do this and that.
```

---

### Type definition

!!! info "Type definitions are important!"

    You **must** always include a Luau-style type definition when documenting a function.

Include the Luau type definition **at the bottom of the first section**, with Luau syntax highlighting but **no *individual line highlighting* or line numbers**:

```luau
function newcclosure<A..., R...>(functionToWrap: (A...) -> R...): (A...) -> R...
```

Make sure it precedes the parameters table.

---

### Parameters

The parameters must always be neatly described in a function, like so:

```md
## Parameters

| Parameter               | Description                         |
| ----------------------- | ----------------------------------- |
| `#!luau parameter_name` | Short description of the parameter. |
```

Use [**snake_case**](https://en.wikipedia.org/wiki/Snake_case) for **every variable**, and [**camelCase**](https://en.wikipedia.org/wiki/Camel_case) for **parameters** to easily distinguish between the two.

There should be **no horizontal rule** (`---`) between the *type definition* and the *parameters* section.

---

### Providing users with examples

Every function page **must** include at least one example.

!!! info "Use 'Example' or 'Examples' based on how many examples you have"

    To make the documentation experience more logical and also grammatically correct, please do the following:
    - Make the heading `#!md ## Example` if there is only one example.
    - Make the heading `#!md ## Examples` if there is more than one example.
        Each example should have its own subheading, e.g. `#!md ### Example 1`, `#!md ### Example 2`.

Each example should use the following format:

````md
## Example

```luau title="Short but descriptive title for your code" linenums="1"
-- an example is here
print("Hello world!")
print("This is some example code")
```
````

- Examples must use `luau` syntax highlighting.
- Line numbers **must** be enabled using `linenums="1"`.
- Each example **must** have a `title` describing in short what the code does.

>>> Closures
>>> Overview
# Closures

The **Closures** library enables the inspection, modification and creation of Luau closures with precise control.

It is one of the most powerful tools available, exposing internals in a way that Luau does not natively support out of the box.

This library is incredibly useful for hooking functions to modify game logic to your own advantage, and any other creative uses you can think of.

---

## What is a closure?

The term [*"closure"*](https://en.wikipedia.org/wiki/Closure_(computer_programming)) comes from [functional programming](https://en.wikipedia.org/wiki/Functional_programming) and refers to a function ***plus*** the environment it carries (its **upvalues**).

In Luau, **every function is implemented as a closure** implicitly, even if it doesn't capture anything.

---

## What can you do?

With the `Closures` library, you can:

- **Hook** existing functions or metamethods with [`#!luau hookfunction`](./hookfunction.md) and [`#!luau hookmetamethod`](./hookmetamethod.md)
- **Restore** hooked functions with [`#!luau restorefunction`](./restorefunction.md)
- **Check** whether the current execution is from your script using [`#!luau checkcaller`](./checkcaller.md) for **hooking**
- **Clone** a function while keeping the same behavior to avoid tampering, with [`#!luau clonefunction`](./clonefunction.md)
- **Wrap** a Luau closure into a C closure using [`#!luau newcclosure`](./newcclosure.md)
- **Check** a function's closure type with [`#!luau iscclosure`](./iscclosure.md), [`#!luau islclosure`](./islclosure.md) or [`#!luau isexecutorclosure`](./isexecutorclosure.md).
- **Hash** a function with [`#!luau getfunctionhash`](./getfunctionhash.md)
- **Compile** and run code at runtime using [`#!luau loadstring`](./loadstring.md)

---

## What can't you do?

Although closure capabilities are powerful, there are natural boundaries:

- You cannot inspect **true C closures' internals** - they are not Luau-defined, compiled, and therefore opaque by design.
- Attempting to implement [`#!luau newcclosure`](./newcclosure.md) in Luau (e.g. via [`#!luau coroutine.wrap`](https://create.roblox.com/docs/reference/engine/libraries/coroutine#wrap)) **will fail sUNC verification**.

>>> Closures
>>> checkcaller
# `checkcaller`

`#!luau checkcaller` returns a boolean indicating whether the **current function was invoked from the executor's own thread**. This is useful for differentiating between your own calls and those made by the game.

It is often used in [`#!luau hookfunction`](../Closures/hookfunction.md) and/or [`#!luau hookmetamethod`](../Closures/hookmetamethod.md).

```luau
function checkcaller(): boolean
```

## Parameters

| Parameter | Description                        |
| --------- | ---------------------------------- |
| *(none)*  | This function takes no parameters. |

---

## Example

```luau title="Identifying the source of a __namecall" linenums="1"
local from_caller

local original; original = hookmetamethod(game, "__namecall", function(...)
    if not from_caller then
        from_caller = checkcaller()
    end

    return original(...)
end)

task.wait(0.1) -- Step a bit
hookmetamethod(game, "__namecall", original)

print(from_caller)       -- Output: false
print(checkcaller())    -- Output: true (current thread)
```

>>> Closures
>>> clonefunction
# `clonefunction`

!!! info "Notes on `#!luau clonefunction`"

    The new (cloned) function returned by `#!luau clonefunction` should have the same environment as the original function.

    Any sort of modification to the original function **should not** affect the clone. This means that stuff like hooking the original function will leave the clone **unaffected**.

`#!luau clonefunction` creates and returns a new function that has the exact same behaviour as the passed function.

```luau
function clonefunction<A..., R...>(functionToClone: (A...) -> R...): (A...) -> R...
```

## Parameters

| Parameter                | Description            |
| ------------------------ | ---------------------- |
| `#!luau functionToClone` | The function to clone. |

---

## Example

```luau title="Cloning functions with clonefunction" linenums="1"
local function dummy_function()
    print("Hello")
end

local cloned_function = clonefunction(dummy_function)

print(debug.info(cloned_function, "l")) -- Output: 1
print(debug.info(cloned_function, "n")) -- Output: dummy_function
print(cloned_function == dummy_function) -- Output: false
print(getfenv(cloned_function) == getfenv(dummy_function)) -- Output: true

```

>>> Closures
>>> getfunctionhash
# `getfunctionhash`

`#!luau getfunctionhash` returns the ***hex-represented*** [SHA384 hash](https://en.wikipedia.org/wiki/SHA-2) of a provided function's instructions (code) and constants.

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures have no reliable information to hash. The error should be something along the lines of `lua function expected`

!!! info "Notes on `#!luau getfunctionhash`"

    In order to have reliable knowledge over what the function changes, `constants` should **also** be added to the hash alongside the `l.p->code`. Add the constants at the beginning of the instructions, and hash that.

    We suggest following [this implementation](https://rubis.app/view?scrap=mwDweOS6zirsPJtc&type=cpp) in order to keep the same functionality across multiple executors, since it will be more convenient for the users not having to change their hashes if they do migrate to a different executor.

    Full credits go to Dottik and Ragnar regarding the source provided above.

```luau
function getfunctionhash(functionToHash: (...any) -> (...any)): string
```

## Parameters

| Parameter               | Description                           |
| ----------------------- | ------------------------------------- |
| `#!luau functionToHash` | The function to retrieve the hash of. |

---

## Example

```luau title="Checking the SHA384 hash of functions with getfunctionhash" linenums="1"
local function is_sha384_hex(hash)
    return #hash == 96 and hash:match("^[0-9a-fA-F]+$") ~= nil
end

local dummy_function_0 = function() end
local dummy_function_1 = function(...) end
local dummy_function_2 = function() end
local dummy_function_3 = function() return "Constant" end
local dummy_function_4 = function() return "Constant2" end

print(is_sha384_hex(getfunctionhash(dummy_function_0))) -- Output: true
print(getfunctionhash(dummy_function_0) == getfunctionhash(dummy_function_1)) -- Output: false
print(getfunctionhash(dummy_function_0) == getfunctionhash(dummy_function_2)) -- Output: true
print(getfunctionhash(dummy_function_3) == getfunctionhash(dummy_function_4)) -- Output: false
```

>>> Closures
>>> hookfunction
# `hookfunction`

!!! info "Notes on `#!luau hookfunction`"

    The hook should not have more upvalues than the function you want to hook. There are ways to bypass the upvalue restriction, such as using `#!luau newlclosure` or [`#!luau newcclosure`](./newcclosure.md) to wrap the `#!luau hook`

    All possible hooking closure pairs should be supported throughout L, NC, C (where NC = [`#!luau newcclosure`](./newcclosure.md))

`#!luau hookfunction` allows you to hook a function with another wanted function, returning the original unhooked function.

```luau
function hookfunction<A1..., R1..., A2..., R2...>(functionToHook: (A1...) -> R1..., hook: (A2...) -> R2...): (A1...) -> R1...
```

## Parameters

| Parameter               | Description                              |
| ----------------------- | ---------------------------------------- |
| `#!luau functionToHook` | The function that will be hooked         |
| `#!luau hook`           | The function that will be used as a hook |

---

## Example

```luau title="Hooking functions with hookfunction" linenums="1"
local function dummy_func()
    print("I am not hooked!")
end

local function dummy_hook()
    print("I am hooked!")
end

dummy_func() -- Output: I am not hooked!

local old_func = hookfunction(dummy_func, dummy_hook)

dummy_func() -- Output: I am hooked!
old_func() -- Output: I am not hooked!
```

>>> Closures
>>> hookmetamethod
# `hookmetamethod`

!!! info "Notes on `#!luau hookmetamethod`"

    `#!luau hookmetamethod` can be safely implemented from within Luau, **as long as [`#!luau hookfunction`](./hookfunction.md) is already properly implemented in C++**.

`#!luau hookmetamethod` takes any Luau object that can have a metatable, and attempts to hook the specified metamethod of the object. Internally, it essentially uses [`#!luau hookfunction`](./hookfunction.md) to hook specific metamethods.

```luau
function hookmetamethod(object: { [any]: any } | Instance | userdata, metamethodName: string, hook: (...any) -> (...any)): (...any) -> (...any)
```

## Parameters

| Parameter               | Description                               |
| ----------------------- | ----------------------------------------- |
| `#!luau object`         | The object which has a metatable.         |
| `#!luau metamethodName` | The name of the metamethod to hook.       |
| `#!luau hook`           | The function that will be used as a hook. |

---

## Example

```luau title="Easily hooking metamethods with hookmetamethod" linenums="1"
local original; original = hookmetamethod(game, "__index", function(...)
    local key = select(2, ...)
    print(key)
    return original(...)
end)

local _ = game.PlaceId -- Output: "PlaceId"

hookmetamethod(game, "__index", original) -- Restores game's __index
```

>>> Closures
>>> iscclosure
# `iscclosure`

`#!luau iscclosure` checks whether a given function is a C closure or not.

```luau
function iscclosure(func: (...any) -> (...any)): boolean
```

## Parameters

| Parameter     | Description            |
| ------------- | ---------------------- |
| `#!luau func` | The function to check. |

---

## Example

```luau title="Checking whether functions are C closures with iscclosure" linenums="1"
local function dummy_lua_function()
    print("This is an executor Luau closure")
end

local dummy_cfunction = newcclosure(function()
    print("This is an Executor C Closure")
end)

local dummy_standard_function = print
local dummy_global_cfunction = getgc

print(iscclosure(dummy_cfunction)) -- Output: true
print(iscclosure(dummy_global_cfunction)) -- Output: true
print(iscclosure(dummy_standard_function)) -- Output: true
print(iscclosure(dummy_lua_function)) -- Output: false
```

>>> Closures
>>> isexecutorclosure
# `isexecutorclosure`

`#!luau isexecutorclosure` checks whether a given function is a closure of the executor. This also includes closures retrieved using [`#!luau getscriptclosure`](../Scripts/getloadedmodules.md) or [`#!luau loadstring`](./loadstring.md).

```luau
function isexecutorclosure(func: (...any) -> (...any)): boolean
```

## Parameters

| Parameter     | Description            |
| ------------- | ---------------------- |
| `#!luau func` | The function to check. |

---

## Example

```luau title="Identifying executor closures with isexecutorclosure" linenums="1"
local function dummy_lua_function()
    print("This is an executor Luau closure")
end

local dummy_cfunction = newcclosure(function()
    print("This is an executor C closure")
end)

local dummy_standard_cfunction = print
local dummy_global_cfunction = getgc

print(isexecutorclosure(dummy_lua_function)) -- Output: true
print(isexecutorclosure(dummy_cfunction)) -- Output: true
print(isexecutorclosure(dummy_global_cfunction)) -- Output: true
print(isexecutorclosure(dummy_standard_cfunction)) -- Output: false
```

>>> Closures
>>> islclosure
# `islclosure`

`#!luau islclosure` checks whether a given function is a Luau closure or not.

```luau
function islclosure(func: (...any) -> (...any)): boolean
```

## Parameters

| Parameter     | Description            |
| ------------- | ---------------------- |
| `#!luau func` | The function to check. |

---

## Example

```luau title="Verifying Luau closures with islclosure" linenums="1"
local function dummy_lua_function()
    print("This is an executor Luau closure")
end

local dummy_cfunction = newcclosure(function()
    print("This is an executor C closure")
end)

local dummy_standard_cfunction = print

print(islclosure(dummy_lua_function)) -- Output: true
print(islclosure(dummy_standard_cfunction)) -- Output: false
print(islclosure(dummy_cfunction)) -- Output: false
```

>>> Closures
>>> loadstring
# `loadstring`

!!! warning "Unsafe by design"

    Compiles the given string, and returns it runnable in a function. The environment must become unsafe after this function is called due to it allowing the modification of globals uncontrollably (see [`#!luau setfenv`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#setfenv)/[`#!luau getfenv`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#getfenv) documentation).

!!! info "Does not error"

    Previous ambiguous wording for this function made it seem like calling `#!luau loadstring` itself with invalid code would actually error, but in fact it does not. Instead, as stated below, it returns `#!luau nil` and a `#!luau string` (which happens to be an error message).

`#!luau loadstring` compiles a string of Luau code and returns it as a runnable function. If the code has errors, two things are returned: `#!luau nil` and a `#!luau string`, which is the error message.

```luau
function loadstring<A...>(source: string, chunkname: string?): (((A...) -> any) | nil, string?)
```

## Parameters

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `#!luau source`     | The source code string to compile. |
| `#!luau chunkname?` | Custom chunk name.                 |

---

## Examples

### Example 1

```luau title="Compiling and running source code successfully" linenums="1"
loadstring([[
    placeholder = {"Example"}
]])()

print(placeholder[1]) -- Output: Example
```

---

### Example 2

```luau title="Using a custom chunk name while also getting an error" linenums="1"
local func, err = loadstring("Example = ", "CustomChunk")

print(func) -- Output: nil
print(err)  -- Output: [string "CustomChunk"]:1: Expected identifier when parsing expression, got <eof>
```

>>> Closures
>>> newcclosure
# `newcclosure`

!!! failure "Do not implement this with coroutines"

    Many executors seem to be implementing this function using [`#!luau coroutine`](https://create.roblox.com/docs/reference/engine/libraries/coroutine) functions in Luau. Such functions **will not pass sUNC checks**.

    The wrapped function **must** be yieldable, meaning that the function should be able to call [`#!luau task.wait`](https://create.roblox.com/docs/reference/engine/libraries/task#wait), for example.

!!! failure "Error spoofing"

    Luau and C errors are different. You must ensure that errors from functions wrapped with `#!luau newcclosure` appear as C closure errors!

!!! info "Upvalues"

    The function returned by `#!luau newcclosure` must have no upvalues.

`#!luau newcclosure` takes any Luau function and wraps it into a C closure.
When the returned function is called, it invokes the original Luau closure with the provided arguments, then passes the closure's returned values back to the caller.

```luau
function newcclosure<A..., R...>(functionToWrap: (A...) -> R...): (A...) -> R...
```

## Parameters

| Parameter               | Description               |
| ----------------------- | ------------------------- |
| `#!luau functionToWrap` | A function to be wrapped. |

---

## Examples

### Example 1

```luau title="Basic C closure wrapping example with newcclosure" linenums="1"
local dummy_function = function(...)
    return ...
end

print(iscclosure(dummy_function)) -- Output: false

local wrapped_function = newcclosure(dummy_function)

print(iscclosure(wrapped_function)) -- Output: true

local function_results = wrapped_function("Hello")
print(function_results) -- Output: Hello
```

### Example 2

This example illustrates how Luau functions wrapped as a C closure should also be yieldable, therefore also showcasing how coroutine implementations of `#!luau newcclosure` would not work.

```luau title="Yieldable C functions made with newcclosure" linenums="1"
local dummy_yielding_function = newcclosure(function()
    print("Before")
    task.wait(1.5)
    print("After")
end)

dummy_yielding_function()
-- Output:
-- Before
-- yield for 1.5 seconds
-- After
```

>>> Closures
>>> restorefunction
# `restorefunction`

!!! warning "This will throw an error if the requested function is not already hooked"

`#!luau restorefunction` restores a hooked function back to the very first original function, even if it has been hooked multiple times.

```luau
function restorefunction(functionToRestore: (...any) -> (...any)): ()
```

## Parameters

| Parameter                  | Description                                  |
| -------------------------- | -------------------------------------------- |
| `#!luau functionToRestore` | The hooked function that you want to restore |

---

## Examples

### Example 1

```luau title="Restoring a hooked function" linenums="1"
function dummy_func()
    print("I am not hooked!")
end

hookfunction(dummy_func, function()
    print("I am hooked!")
end)

dummy_func() -- Output: I am hooked!
restorefunction(dummy_func)
dummy_func() -- Output: I am not hooked!

```

### Example 2

```luau title="Restoring a function that was never hooked" linenums="1"
function dummy_func()
    print("I am not hooked!")
end

dummy_func() -- Output: I am not hooked!
restorefunction(dummy_func) -- Error: restorefunction: function is not hooked

```

>>> Debug
>>> Overview
# Debug

The **Debug** library offers powerful tools for inspecting and modifying Luau functions at a bytecode level.

It allows you to access constants, upvalues, stack frames, and internal structures of functions that would otherwise be hidden - making it especially useful for reverse engineering and hooking.

---

## What can you do?

With the Debug library, you can:

- **Inspect** constants with [`#!luau debug.getconstants`](./getconstants.md), [`#!luau debug.getconstant`](./getconstant.md)
- **Modify** constants using [`#!luau debug.setconstant`](./setconstant.md)
- **Access** upvalues using [`#!luau debug.getupvalues`](./getupvalues.md) and [`#!luau debug.getupvalue`](./getupvalue.md)
- **Replace** upvalues with [`#!luau debug.setupvalue`](./setupvalue.md)
- **Read** or **write** values from a stack frame, using [`#!luau debug.getstack`](./getstack.md) and [`#!luau debug.setstack`](./setstack.md)
- **List** or **retrieve** function prototypes, using [`#!luau debug.getprotos`](./getprotos.md) and [`#!luau debug.getproto`](./getproto.md)

---

## What can't you do?

- You cannot access C closures with this library, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print)

>>> Debug
>>> getconstant
# `debug.getconstant`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures have no accessible constants.

`#!luau debug.getconstant` returns the constant at the specified index from a Luau function. If no constant exists at that index, it returns `#!luau nil` instead.

This is useful when you want to inspect specific constant values (such as strings, numbers, or booleans) without dumping the entire list.

```luau
function debug.getconstant(func: (...any) -> (...any) | number, index: number): number | string | boolean | nil
```

## Parameters

| Parameter      | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `#!luau func`  | The Luau function (or stack level) whose constant to retrieve. |
| `#!luau index` | The position of the desired constant.                          |

---

## Examples

### Example 1

```luau title="Getting a valid constant" linenums="1"
local function dummy_function()
    local dummy_string = "foo bar"
    string.split(dummy_string, " ")
end

local result = debug.getconstant(dummy_function, 2)
print(result) -- Output: string
```

### Example 2

```luau title="Getting an out-of-range constant" linenums="1"
local function dummy_function()
    local dummy_string = "foo bar"
    string.split(dummy_string, " ")
end

local result = debug.getconstant(dummy_function, 3)
print(result) -- Output: nil
```

### Example 3

```luau title="Calling on a C closure should error" linenums="1"
print(debug.getconstant(print, 1)) -- Should error due to being a C closure
```

>>> Debug
>>> getconstants
# `debug.getconstants`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures have no accessible constants.

`#!luau debug.getconstants` returns a list of all constants used within a Luau function's bytecode. This includes literal values like numbers, strings, booleans, and `#!luau nil`.

```luau
function debug.getconstants(func: (...any) -> (...any) | number): { number | string | boolean | nil }
```

## Parameters

| Parameter     | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| `#!luau func` | The Luau function (or stack level) whose constants will be returned. |

---

## Examples

### Example 1

```luau title="Retrieving constants from a Luau function" linenums="1"
local function dummy_function()
    local dummy_string = "foo bar"
    string.split(dummy_string, " ")
end

local constants = debug.getconstants(dummy_function)
for constant_index, constant in constants do
    print(`[{constant_index}]: {constant}`)
end

-- Output:
-- [1]: "string"
-- [2]: "split"
-- [4]: "foo bar"
-- [5]: " "
```

### Example 2

```luau title="Calling on a C closure should error" linenums="1"
print(debug.getconstants(print)) -- Should error due to being a C closure
```

>>> Debug
>>> getproto
# `debug.getproto`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures do not contain function prototypes.

!!! info "Inactive protos"

    Protos retrieved without the `activated` should not be callable; this leads to vulnerabilities.
    The usage of inactive protos is to retrieve information off of them.

`#!luau debug.getproto` returns a specific function prototype from a Luau function by index. Optionally, it can search for **active functions** of the proto, if the `#!luau activated` parameter is set to `true`.

These are internal function definitions (e.g. nested functions) that exist as part of the compiled bytecode, even if they aren't assigned or called.

```luau
function debug.getproto(func: (...any) -> (...any) | number, index: number, activated: boolean?): (...any) -> (...any) | { (...any) -> (...any) }
```

## Parameters

| Parameter           | Description                                                                  |
| ------------------- | ---------------------------------------------------------------------------- |
| `#!luau func`       | The Luau function (or stack level) to extract a proto from.                  |
| `#!luau index`      | The index of the prototype to return.                                        |
| `#!luau activated?` | If `true`, returns a table of currently active functions based on the proto. |

---

## Examples

### Example 1

```luau title="Retrieving nested prototypes" linenums="1"
local function dummy_function()
    local function dummy_proto_1()
        print("Hello")
    end
    local function dummy_proto_2()
        print("Hello2")
    end
end

debug.getproto(dummy_function, 1)() -- Uncallable
debug.getproto(dummy_function, 2)() -- Uncallable
```

### Example 2

```luau title="Retrieving an active function from a proto" linenums="1"
local function dummy_function()
    local function dummy_proto()
        return "hi"
    end
    return dummy_proto
end

local real_proto = dummy_function()
local retrieved_proto = debug.getproto(dummy_function, 1, true)[1]

print(real_proto == retrieved_proto) -- Output: true
print(retrieved_proto()) -- Output: hi
```

>>> Debug
>>> getprotos
# `debug.getprotos`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures do not contain function prototypes.

!!! info "Inactive protos"

    Protos retrieved without the `activated` should not be callable; this leads to vulnerabilities.
    The usage of inactive protos is to retrieve information off of them.

`#!luau debug.getprotos` returns all function prototypes defined within the specified Luau function.

These are internal function definitions (e.g. nested functions) that exist as part of the compiled bytecode, even if they aren't assigned or called.

```luau
function debug.getprotos(func: (...any) -> (...any) | number): { (...any) -> (...any) }
```

## Parameters

| Parameter     | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `#!luau func` | The Luau function (or stack level) to extract protos from. |

---

## Example

```luau title="Getting nested function prototypes" linenums="1"
local function DummyFunction0()
    local function DummyFunction1() end
    local function DummyFunction2() end
end

for index, proto in pairs(debug.getprotos(DummyFunction0)) do
    print(index, debug.info(proto, "n"))
end

-- Output:
-- 1 DummyFunction1
-- 2 DummyFunction2
```

>>> Debug
>>> getstack
# `debug.getstack`

!!! warning "C closures are not supported"

    This function will throw an error if the stack level points to a C closure, such as `#!luau getstack(0)`.

`#!luau debug.getstack` retrieves values from the stack at the specified call level.

This function is useful for inspecting local variables or arguments at different layers of the stack frame. If no index is given, all values at that stack level are returned as a list.

```luau
function debug.getstack(level: number, index: number?): any | { any }
```

## Parameters

| Parameter       | Description                                              |
| --------------- | -------------------------------------------------------- |
| `#!luau level`  | The stack level to inspect. `1` is the current function. |
| `#!luau index?` | The specific slot/index at that stack level to read.     |

---

## Examples

### Example 1

```luau title="Retrieving multiple values from the stack" linenums="1"
local count = 0

local function recursive_function()
    count += 1
    if count > 6 then return end

    local a = 29
    local b = true
    local c = "Example"
    a += 1
    b = false
    c ..= "s"

    print(debug.getstack(1, count))
    recursive_function()
end

recursive_function()
-- Output (varies depending on Count):
-- 30
-- false
-- Examples
-- function: 0x... (print)
-- function: 0x... (getstack)
-- etc.
```

### Example 2

```luau title="Retrieving values from the caller's stack" linenums="1"
local function dummy_function()
    return "Hello"
end

local var = 5
var += 1

(function()
    print(debug.getstack(2)[1]()) -- Output: Hello
    print(debug.getstack(2)[2])   -- Output: 6
end)()
```

>>> Debug
>>> getupvalue
# `debug.getupvalue`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), for security reasons.

`#!luau debug.getupvalue` returns the upvalue at the specified index from a Luau function's closure. If the index is invalid or out of bounds, an error will occur.

```luau
function debug.getupvalue(func: (...any) -> (...any) | number, index: number): any
```

## Parameters

| Parameter      | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `#!luau func`  | The Luau function (or stack level) to retrieve an upvalue from. |
| `#!luau index` | The position of the upvalue.                                    |

---

## Examples

### Example 1

```luau title="Retrieving a function upvalue" linenums="1"
local UpFunction = function()
    print("Hello from up")
end

local function DummyFunction()
    UpFunction()
end

local Retrieved = debug.getupvalue(DummyFunction, 1)
Retrieved() -- Output: Hello from up
```

### Example 2

```luau title="Invalid index on a function with no upvalues" linenums="1"
local function DummyFunction() end

debug.getupvalue(DummyFunction, 0) -- Should error
```

### Example 3

```luau title="Calling on a C closure should error" linenums="1"
debug.getupvalue(print, 1) -- Should error due to C closure
```

>>> Debug
>>> getupvalues
# `debug.getupvalues`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), for security reasons.

`#!luau debug.getupvalues` returns a list of upvalues captured by a Luau function. These are the external variables that a function closes over from its surrounding scope.

If the function has no upvalues, the result will be an empty table.

```luau
function debug.getupvalues(func: (...any) -> (...any) | number): { any }
```

## Parameters

| Parameter     | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `#!luau func` | The Luau function (or stack level) to retrieve upvalues from. |

---

## Examples

### Example 1

```luau title="Retrieving upvalues from a closure" linenums="1"
local var1 = false
local var2 = "Hi"

local function dummy_function()
    var1 = true
    var2 ..= ", hello"
end

for index, value in pairs(debug.getupvalues(dummy_function)) do
    print(index, value)
end

-- Output:
-- 1 false
-- 2 Hi
```

### Example 2

```luau title="Calling with a function that has no upvalues" linenums="1"
local function dummy_function()
    return 123
end

print(next(debug.getupvalues(dummy_function))) -- Output: nil
```

### Example 3

```luau title="Calling on a C closure should error" linenums="1"
print(debug.getupvalues(print)) -- Should error due to being a C closure
```

>>> Debug
>>> setconstant
# `debug.setconstant`

!!! warning "C closures are not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), since C closures have no accessible constants.

!!! info "Mutable globals"

    If `game`is a mutable global, the constant indexes will be different.

`#!luau debug.setconstant` modifies a constant at the specified index in a Luau function bytecode.

This can be used to change hardcoded behavior within functions without modifying their source code - although it requires knowing the correct constant index beforehand.

```luau
function debug.setconstant(func: (...any) -> (...any) | number, index: number, value: number | string | boolean | nil): ()
```

## Parameters

| Parameter      | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `#!luau func`  | The Luau function (or stack level) whose constant to modify. |
| `#!luau index` | The position of the constant to change.                      |
| `#!luau value` | The new constant value to set.                               |

---

## Example

```luau title="Overwriting a constant string in a function" linenums="1"
local function dummy_function()
    print(game.Name)
end

debug.setconstant(dummy_function, 4, "Players")

dummy_function() -- Output: Players
```

>>> Debug
>>> setstack
# `debug.setstack`

!!! warning "C closures are not supported"

    This function will throw an error if the stack level points to a C closure, such as `#!luau setstack(0, 1, 0)`.

`#!luau debug.setstack` replaces a value in a specified stack frame.

This allows for powerful manipulation of runtime variables or arguments, particularly useful in advanced debugging or dynamic patching scenarios.

```luau
function debug.setstack(level: number, index: number, value: any): ()
```

## Parameters

| Parameter      | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| `#!luau level` | The stack level to target. `1` refers to the current function. |
| `#!luau index` | The index/slot in the stack frame to replace.                  |
| `#!luau value` | The new value to assign at that stack slot.                    |

---

## Examples

### Example 1

```luau title="Replacing the 'error' function on the stack with our own" linenums="1"
error(debug.setstack(1, 1, function()
    return function()
        print("Replaced")
    end
end))() -- Output: Replaced
```

### Example 2

```luau title="Replacing a numeric local in a parent scope" linenums="1"
local outer_value = 10

local function inner_function()
    outer_value += 9
    debug.setstack(2, 1, 100)
end

inner_function()
print(outer_value) -- Output: 100
```

>>> Debug
>>> setupvalue
# `debug.setupvalue`

!!! warning "C closures not supported"

    This function will throw an error if called on a C closure, such as [`#!luau print`](https://create.roblox.com/docs/reference/engine/globals/LuaGlobals#print), for security reasons.

`#!luau debug.setupvalue` replaces an upvalue at the specified index in a Luau function, with a new value.

This allows for controlled modification of function state, often used in hooking or testing environments.

```luau
function debug.setupvalue(func: (...any) -> (...any) | number, index: number, value: any): ()
```

## Parameters

| Parameter      | Description                                             |
| -------------- | ------------------------------------------------------- |
| `#!luau func`  | The function (or stack level) whose upvalue to replace. |
| `#!luau index` | The index of the upvalue to be replaced.                |
| `#!luau value` | The new value to assign to the upvalue.                 |

---

## Example

```luau title="Replacing a numeric upvalue" linenums="1"
local upvalue = 90

local function dummy_function()
    upvalue += 1
    print(upvalue)
end

dummy_function() -- Output: 91

debug.setupvalue(dummy_function, 1, 99)
dummy_function() -- Output: 100
```

>>> Filesystem
>>> Overview
# Filesystem

The **Filesystem** library provides access to an executor's virtual file system. It enables reading, writing, creating, and deleting files and folders, as well as utility functions for interacting with content assets.

This library is especially useful when storing persistent data, managing resources across sessions, or loading runtime content dynamically.

---

## What can you do?

With the Filesystem library, you can:

- **Write** data to a file using [`#!luau writefile`](./writefile.md)
- **Read** file contents with [`#!luau readfile`](./readfile.md)
- **Append** content using [`#!luau appendfile`](./appendfile.md)
- **List** files and folders via [`#!luau listfiles`](./listfiles.md)
- **Delete** files with [`#!luau delfile`](./delfile.md) and folders using [`#!luau delfolder`](./delfolder.md)
- **Check** if a path is a file or folder using [`#!luau isfile`](./isfile.md) or [`#!luau isfolder`](./isfolder.md)
- **Create** folders with [`#!luau makefolder`](./makefolder.md)
- **Dynamically load** code from a file via [`#!luau loadfile`](./loadfile.md)
- **Use** local assets in Roblox via [`#!luau getcustomasset`](./getcustomasset.md), as if it were an uploaded asset

---

## What can't you do?

- You cannot access files outside the executor's workspace/sandboxed storage
- You cannot use file IO to interact with the real disk (e.g. `C:/` (Windows), `/Library` (macOS), etc.)
- You cannot escape the executor's `workspace` folder at all.

>>> Filesystem
>>> appendfile
# `appendfile`

`#!luau appendfile` appends string content to the end of a file at the specified path. If the file does not exist, it will be created.

This is useful for logging, accumulating data over time, or extending file contents without overwriting them.

```luau
function appendfile(path: string, contents: string): ()
```

## Parameters

| Parameter         | Description                            |
| ----------------- | -------------------------------------- |
| `#!luau path`     | The file path to append to.            |
| `#!luau contents` | The string content to add to the file. |

---

## Example

```luau title="Appending to a file" linenums="1"
writefile("file4.txt", "print(")
appendfile("file4.txt", "'Hello')")
print(readfile("file4.txt")) -- Output: print('Hello')
```

>>> Filesystem
>>> delfile
# `delfile`

`#!luau delfile` deletes the file at the specified path if it exists.

This is useful for cleaning up temporary data or removing no-longer-needed files at runtime.

```luau
function delfile(path: string): ()
```

## Parameters

| Parameter     | Description                     |
| ------------- | ------------------------------- |
| `#!luau path` | The path of the file to delete. |

---

## Example

```luau title="Deleting a file" linenums="1"
writefile("file5.txt", "Hello")
print(isfile("file5.txt")) -- Output: true
delfile("file5.txt")
print(isfile("file5.txt")) -- Output: false
```

>>> Filesystem
>>> delfolder
# `delfolder`

`#!luau delfolder` deletes the folder at the specified path if it exists.

```luau
function delfolder(path: string): ()
```

## Parameters

| Parameter     | Description                       |
| ------------- | --------------------------------- |
| `#!luau path` | The path of the folder to delete. |

---

## Example

```luau title="Deleting a folder" linenums="1"
makefolder("folder3")
print(isfolder("folder3")) -- Output: true
delfolder("folder3")
print(isfolder("folder3")) -- Output: false
```

>>> Filesystem
>>> getcustomasset
# `getcustomasset`

`#!luau getcustomasset` returns a content ID (e.g. `rbxasset://`) that can be used in Roblox APIs for loading audio, meshes, UI images, and other asset types.

Internally, the file at the given path is copied to the game's content directory and then exposed with a usable asset URL.

```luau
function getcustomasset(path: string): string
```

## Parameters

| Parameter     | Description                                |
| ------------- | ------------------------------------------ |
| `#!luau path` | The file path to convert into an asset ID. |

---

## Example

```luau title="Using getcustomasset to load and play a sound in-game" linenums="1"
local encoded = game:HttpGet("https://gitlab.com/sens3/nebunu/-/raw/main/encodedBytecode.txt")
writefile("ExampleSound.mp3", base64decode(encoded))

local asset_id = getcustomasset("ExampleSound.mp3")

local sound = Instance.new("Sound")
sound.Parent = workspace
sound.SoundId = asset_id
sound.Volume = 0.35
sound:Play()
```

>>> Filesystem
>>> isfile
# `isfile`

`#!luau isfile` checks whether a given path exists and refers to a file.

This function is useful when validating input, confirming file existence before reading, or filtering entries returned by [`#!luau listfiles`](./listfiles.md).

```luau
function isfile(path: string): boolean
```

## Parameters

| Parameter     | Description        |
| ------------- | ------------------ |
| `#!luau path` | The path to check. |

---

## Example

```luau title="Checking file existence" linenums="1"
print(isfile("nonexistent.txt")) -- Output: false
writefile("file3.txt", "")
print(isfile("file3.txt")) -- Output: true
```

>>> Filesystem
>>> isfolder
# `isfolder`

`#!luau isfolder` checks whether a given path exists and refers to a folder.

This is useful when verifying that a directory exists before writing files into it or listing its contents.

```luau
function isfolder(path: string): boolean
```

## Parameters

| Parameter     | Description        |
| ------------- | ------------------ |
| `#!luau path` | The path to check. |

---

## Example

```luau title="Checking folder existence" linenums="1"
writefile("file7.txt", "")
makefolder("folder2")
print(isfolder("file7.txt")) -- Output: false
print(isfolder("folder2"))   -- Output: true
```

>>> Filesystem
>>> listfiles
# `listfiles`

!!! info "Relative Paths"

    Please note that paths returned by `#!luau listfiles` are relative to the workspace folder of the executor.

`#!luau listfiles` returns an array of strings representing all files and folders within the specified directory.

This can be used to dynamically check which files exist in a folder, etc.

```luau
function listfiles(path: string): { string }
```

## Parameters

| Parameter     | Description                        |
| ------------- | ---------------------------------- |
| `#!luau path` | The path to the directory to scan. |

---

## Example

```luau title="Listing files in the root directory" linenums="1"
writefile("file1.txt", "")
writefile("file2.lua", "")
task.wait()

for _, file in listfiles("") do
    if file == "file1.txt" then
        print(`Found: {file}`) -- Output: Found: file1.txt
    end
    if file == "file2.lua" then
        print(`Found: {file}`) -- Output: Found: file2.lua
    end
end
```

>>> Filesystem
>>> loadfile
# `loadfile`

`#!luau loadfile` compiles the Luau source code from a file and returns the resulting function (chunk). This chunk runs in the global environment.

If the file contains syntax errors, an actual Luau error is thrown - this is **unlike** [`#!luau loadstring`](../Closures/loadstring.md).

```luau
function loadfile<A...>(path: string): ((A...) -> any | nil, string?)
```

## Parameters

| Parameter     | Description                        |
| ------------- | ---------------------------------- |
| `#!luau path` | The path to the file to be loaded. |

---

## Examples

### Example 1

```luau title="Loading and executing a valid file" linenums="1"
writefile("file6.lua", "return 10 + ...")
local chunk = loadfile("file6.lua")
print(chunk(1)) -- Output: 11
```

### Example 2

```luau title="Triggering a syntax error" linenums="1"
writefile("file6.lua", "retrn 10 + ...")
loadfile("file6.lua") -- This will throw an error in the console
```

>>> Filesystem
>>> makefolder
# `makefolder`

`#!luau makefolder` creates a folder at the specified path if one does not already exist.

This is useful for organising files into separate directories.

```luau
function makefolder(path: string): ()
```

## Parameters

| Parameter     | Description                |
| ------------- | -------------------------- |
| `#!luau path` | The folder path to create. |

---

## Example

```luau title="Creating a new folder" linenums="1"
makefolder("test_folder")
print(isfolder("test_folder")) -- Output: true
```

>>> Filesystem
>>> readfile
# `readfile`

`#!luau readfile` retrieves the contents of a file at the specified path and returns it as a string.

If the file does not exist or cannot be accessed, the function will **error**.

```luau
function readfile(path: string): string
```

## Parameters

| Parameter     | Description                 |
| ------------- | --------------------------- |
| `#!luau path` | The file path to read from. |

---

## Example

```luau title="Reading a file" linenums="1"
writefile("file0.txt", "Hello")
print(readfile("file0.txt")) -- Output: Hello
```

>>> Filesystem
>>> writefile
# `writefile`

`#!luau writefile` writes data to a file at the specified path. If the file already exists, its contents will be overwritten.

This is one of the primary ways to persist string data within the executor's file sandbox.

```luau
function writefile(path: string, data: string): ()
```

## Parameters

| Parameter     | Description                             |
| ------------- | --------------------------------------- |
| `#!luau path` | The file path to write to.              |
| `#!luau data` | The string data to write into the file. |

---

## Example

```luau title="Basic file writing example" linenums="1"
writefile("file.txt", "Hello world")
print(readfile("file.txt")) -- Output: Hello world
```

>>> Instances
>>> Overview
# Instances

The **Instances** library provides direct access to and manipulation of [`Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) objects in the game world. It includes tools for listing, referencing, and firing Roblox-native interactions.

These functions are especially useful for inspecting hidden instances, working with UI safely, or simulating player interactions with in-game objects.

---

## What can you do?

With the Instances library, you can:

- **List all objects** tracked by the client using [`#!luau getinstances`](./getinstances.md)
- **List nil-parented objects** using [`#!luau getnilinstances`](./getnilinstances.md)
- **Compare two objects** using [`#!luau compareinstances`](./compareinstances.md)
- **Safely clone instance references** using [`#!luau cloneref`](./cloneref.md)
- **Access hidden UI containers** using [`#!luau gethui`](./gethui.md)
- **Inspect function-based properties** with [`#!luau getcallbackvalue`](./getcallbackvalue.md)
- **Simulate interactions** using [`#!luau fireclickdetector`](./fireclickdetector.md), [`#!luau fireproximityprompt`](./fireproximityprompt.md), and [`#!luau firetouchinterest`](./firetouchinterest.md)

>>> Instances
>>> cloneref
# `cloneref`

!!! info "Creates a safe reference to protected instances"

    `#!luau cloneref` returns a reference to an [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance). This can help avoid weak table styled detections. 

`#!luau cloneref` returns a **reference clone** of an [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance). The returned object behaves identically to the original but is not strictly equal (`==`) to it.

This is commonly used to safely interact with services such as [`#!luau game.CoreGui`](https://create.roblox.com/docs/reference/engine/classes/Players#LocalPlayer), making weak-table style attacks fail.

```luau
function cloneref<T>(object: T & Instance): T
```

## Parameters

| Parameter       | Description                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `#!luau object` | The [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) to clone a safe reference from. |

---

## Example

```luau title="Cloning a safe reference to LocalPlayer" linenums="1"
local players = game:GetService("Players")

local original = players.LocalPlayer
local clone = cloneref(original)

print(original == clone) -- Output: false
print(clone.Name)        -- Output: Player's name (same as original)
```

>>> Instances
>>> compareinstances
# `compareinstances`

`#!luau compareinstances` checks if two [`#!luau Instances`](https://create.roblox.com/docs/reference/engine/classes/Instance) are equal.

This is primarily used for instances which have been [`#!luau cloneref`](./cloneref.md)'d, where the normal equality check with `#!luau ==` fails.

```luau
function compareinstances(object1: Instance, object2: Instance): boolean
```

## Parameters

| Parameter        | Description                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `#!luau object1` | This first [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) to compare.         |
| `#!luau object2` | The second [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) to compare against. |

---

## Example

```luau title="Comparing instances" linenums="1"
print(compareinstances(game, game))              -- true
print(compareinstances(game, workspace))         -- false
print(compareinstances(game, cloneref(game)))    -- true
print(game == cloneref(game))                    -- false
```

>>> Instances
>>> fireclickdetector
# `fireclickdetector`

!!! warning "Avoid implementing in Luau"

    This function should **not be implemented** in Luau. Doing so exposes you to easy detection vectors.

`#!luau fireclickdetector` triggers a [`#!luau ClickDetector`](https://create.roblox.com/docs/reference/engine/classes/ClickDetector) event. By default, it fires the [`#!luau MouseClick`](https://create.roblox.com/docs/reference/engine/classes/ClickDetector#MouseClick) event.

```luau
function fireclickdetector(detector: ClickDetector, distance: number?, event: string?): ()
```

## Parameters

| Parameter          | Description                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `#!luau detector`  | The [`#!luau ClickDetector`](https://create.roblox.com/docs/reference/engine/classes/ClickDetector) to trigger. |
| `#!luau distance?` | Distance from which the click is simulated. Defaults to infinite.                                               |
| `#!luau event?`    | The event to trigger.                                                                                           |

---

## Example

```luau title="Firing different ClickDetector events" linenums="1"
local click_detector = Instance.new("ClickDetector")

click_detector.MouseClick:Connect(function(player)
    print(`{player.Name} Fired M1`)
end)

click_detector.RightMouseClick:Connect(function(player)
    print(`{player.Name} Fired M2`)
end)

click_detector.MouseHoverEnter:Connect(function(player)
    print(`{player.Name} Fired HoverEnter`)
end)

click_detector.MouseHoverLeave:Connect(function(player)
    print(`{player} Fired HoverLeave`)
end)

fireclickdetector(click_detector, 0, "MouseClick") -- Output: Player Fired M1
fireclickdetector(click_detector, 0, "RightMouseClick") -- Output: Player Fired M2
fireclickdetector(click_detector, 0, "MouseHoverEnter") -- Output: Player Fired HoverEnter
fireclickdetector(click_detector, 0, "MouseHoverLeave") -- Output: Player Fired HoverLeave
```

>>> Instances
>>> fireproximityprompt
# `fireproximityprompt`

!!! warning "Avoid implementing in Luau"

    This function should **not be implemented** in Luau. Doing so exposes you to easy detection vectors.

`#!luau fireproximityprompt` instantly triggers a [`#!luau ProximityPrompt`](https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt), bypassing its [`#!luau HoldDuration`](https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt#HoldDuration) and activation distance.

```luau
function fireproximityprompt(prompt: ProximityPrompt): ()
```

## Parameters

| Parameter       | Description                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `#!luau prompt` | The [`#!luau ProximityPrompt`](https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt) to trigger. |

---

## Example

```luau title="Triggering a ProximityPrompt manually" linenums="1"
local part = Instance.new("Part", workspace)
local prompt = Instance.new("ProximityPrompt", part)
prompt.ActionText = "Click Me"

prompt.Triggered:Connect(function(player)
    print(player.Name .. " triggered the prompt")
end)

fireproximityprompt(prompt) -- Output: [YourName] triggered the prompt
```

>>> Instances
>>> firetouchinterest
# `firetouchinterest`

!!! warning "Avoid implementing in Luau"

    This function should **not be implemented** in Luau. Doing so exposes you to easy detection vectors.

`#!luau firetouchinterest` simulates a physical touch event between two [`#!luau BasePart`](https://create.roblox.com/docs/reference/engine/classes/BasePart) objects. It can emulate both the start and end of a [`#!luau Touched`](https://create.roblox.com/docs/reference/engine/classes/BasePart#Touched) event.

```luau
function firetouchinterest(part1: BasePart, part2: BasePart, toggle: boolean | number): ()
```

## Parameters

| Parameter       | Description                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `#!luau part1`  | The initiating [`#!luau BasePart`](https://create.roblox.com/docs/reference/engine/classes/BasePart).                                 |
| `#!luau part2`  | The [`#!luau BasePart`](https://create.roblox.com/docs/reference/engine/classes/BasePart) that should be touched.                     |
| `#!luau toggle` | Whether to simulate touch start or end. `#!luau true` or `#!luau 0` simulates touch; `#!luau false` or `#!luau 1` simulates un-touch. |

---

## Examples

### Example 1

```luau title="Simulating a Touched event using 'true/false'" linenums="1"
local dummy_part = Instance.new("Part")
dummy_part.CFrame = CFrame.new(0, -200, 0)
dummy_part.Anchored = true
dummy_part.Parent = workspace

dummy_part.Touched:Connect(function(part)
    print(part.Name .. " touched the dummy part!")
end)

local player_head = game.Players.LocalPlayer.Character.Head

firetouchinterest(player_head, dummy_part, true) -- Simulate touch
task.wait(0.5)
firetouchinterest(player_head, dummy_part, false) -- Simulate un-touch
```

### Example 2

```luau title="Simulating a Touched event using '0/1'" linenums="1"
local dummy_part = Instance.new("Part")
dummy_part.CFrame = CFrame.new(0, -200, 0)
dummy_part.Anchored = true
dummy_part.Parent = workspace

dummy_part.Touched:Connect(function(part)
    print(part.Name .. " touched the dummy part!")
end)

local player_head = game.Players.LocalPlayer.Character.Head

firetouchinterest(player_head, dummy_part, 0) -- Simulate touch
task.wait(0.5)
firetouchinterest(player_head, dummy_part, 1) -- Simulate un-touch
```

>>> Instances
>>> getcallbackvalue
# `getcallbackvalue`

`#!luau getcallbackvalue` retrieves the **assigned callback property** on an [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance), such as [`#!luau OnInvoke`](https://create.roblox.com/docs/reference/engine/classes/BindableFunction#OnInvoke).

Normally, these properties are **write-only**, meaning you can assign a function to them but cannot read them back. This function bypasses that limitation and exposes the function directly.

```luau
function getcallbackvalue(object: Instance, property: string): any | nil
```

## Parameters

| Parameter         | Description                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `#!luau object`   | The [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) that owns the callback property. |
| `#!luau property` | The name of the callback property to retrieve.                                                                             |

---

## Example

```luau title="Retrieving a valid callback function, an unset property, and a missing property" linenums="1"
local dummy_bindable = Instance.new("BindableFunction")
local dummy_remote_function = Instance.new("RemoteFunction")

dummy_bindable.OnInvoke = function()
    print("Hello from callback!")
end

local retrieved = getcallbackvalue(dummy_bindable, "OnInvoke")
retrieved() -- Output: Hello from callback!

print(getcallbackvalue(dummy_remote_function, "OnClientInvoke")) -- Output: nil
```

>>> Instances
>>> gethui
# `gethui`

`#!luau gethui` returns a **hidden [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance)** container used for safely storing UI elements. This container is mainly designed to **avoid detections**.

```luau
function gethui(): BasePlayerGui | Folder
```

## Parameters

| Parameter | Description                        |
| --------- | ---------------------------------- |
| *(none)*  | This function takes no parameters. |

---

## Example

```luau title="Creating undetectable UI in gethui" linenums="1"
local hui = gethui() :: (BasePlayerGui | Folder)

local gui = Instance.new("ScreenGui")
gui.Parent = hui
gui.Name = "GUI"

local label = Instance.new("TextLabel")
label.Size = UDim2.fromOffset(200, 50)
label.Text = "Hello from gethui!"
label.Parent = gui

print(hui:FindFirstChild("GUI")) -- Output: GUI
```

>>> Instances
>>> getinstances
# `getinstances`

!!! info "Includes all memory-tracked instances"

    `#!luau getinstances` should be able to return [instances](https://create.roblox.com/docs/reference/engine/classes/Instance) outside of [`game`](https://create.roblox.com/docs/reference/engine/classes/DataModel).

`#!luau getinstances` retrieves **every [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance)** from the registry. Which means that instances that are/were parented to `#!luau nil` will also be returned.

```luau
function getinstances(): { Instance }
```

## Parameters

| Parameter | Description                        |
| --------- | ---------------------------------- |
| *(none)*  | This function takes no parameters. |

---

## Example

```luau title="Finding a nil-parented instance" linenums="1"
local dummy_part = Instance.new("Part")
dummy_part.Parent = nil

for _, instance in pairs(getinstances()) do
    if instance == dummy_part then
        print("Found the dummy part!")
    end
end
```

>>> Instances
>>> getnilinstances
# `getnilinstances`

`#!luau getnilinstances` returns a list of [`#!luau Instance`](https://create.roblox.com/docs/reference/engine/classes/Instance) objects that are **currently unparented**. These instances exist in memory but are no longer part of the [`#!luau DataModel`](https://create.roblox.com/docs/reference/engine/classes/DataModel) hierarchy.

```luau
function getnilinstances(): { Instance }
```

## Parameters

| Parameter | Description                        |
| --------- | ---------------------------------- |
| *(none)*  | This function takes no parameters. |

---

## Example

```luau title="Detecting a detached part" linenums="1"
local part = Instance.new("Part")
for _, instance in pairs(getnilinstances()) do
    if instance == part then
        print("Found our unattached part!")
    end
end
```

>>> WebSocket
>>> Overview
# WebSocket class

!!! warning "This is a WebSocket client only, meaning you won't be able to create a server with this library."

!!! info "The sUNC test explicitly checks for `wss` (secure) support."

The `#!luau WebSocket` class provides a lightweight interface for establishing and working with WebSocket connections. It allows scripts to **send** and **receive** messages over a persistent connection to a [WebSocket](https://en.wikipedia.org/wiki/WebSocket) server.

---

## Constructor

Attempts to create a new connection to the provided URL. The URL must be a valid WebSocket server URL, typically starting with `ws://` (unsecure) or `wss://` (secure).

```luau
function WebSocket.connect(url: string): WebSocket
```

## Parameters

| Parameter    | Description      |
| ------------ | ---------------- |
| `#!luau url` | A WebSocket URL. |

---

## Events

Signals that allow you handle events that occur during the WebSocket's lifetime, such as opening, receiving messages, or closing.

| Event                                   | Description                                                         |
| --------------------------------------- | ------------------------------------------------------------------- |
| `#!luau OnMessage(message: string): ()` | Triggered when a message is received over the WebSocket connection. |
| `#!luau OnClose(): ()`                  | Triggered when the WebSocket connection closes.                     |

## Methods

| Method                             | Description                                    |
| ---------------------------------- | ---------------------------------------------- |
| `#!luau Send(message: string): ()` | Sends a message over the WebSocket connection. |
| `#!luau Close(): ()`               | Closes the WebSocket connection.               |

---

<!-- TODO: change the websocket echo servers to numelon -->

## Examples

### Using the `#!luau OnMessage` event, and `#!luau Send` method

```luau title="Responding to incoming messages" linenums="1"
local ws = WebSocket.connect("wss://ws.postman-echo.com/raw")
ws.OnMessage:Connect(function(message)
    print(message)
end)
ws:Send("Hello") -- Output: Hello
```

---

### Using the `#!luau OnClose` event, and `#!luau Close` method

```luau title="Receive a closing message and catch it via OnClose" linenums="1"
local ws = WebSocket.connect("wss://ws.postman-echo.com/raw")
ws.OnClose:Connect(function()
    print("Closed")
end)
ws:Close() -- Output: Closed
```