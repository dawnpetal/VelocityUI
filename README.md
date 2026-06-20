# VelocityUI

```sh
curl -fsSL https://raw.githubusercontent.com/dawnpetal/VelocityUI/main/install.sh | bash
```

```sh
curl -fsSL https://raw.githubusercontent.com/dawnpetal/VelocityUI/main/uninstall.sh | bash
```

> **Before anything else:** Settings → Executor, pick your executor, reload. If you skip this, execution won't work.

---

VelocityUI is a macOS Roblox script executor built with Tauri + Rust. Fast, clean, and designed to feel like a proper native app.

## Features

**Editor** - A Monaco-powered playground with Lua/Luau coloring, Roblox API autocomplete, tabs, breadcrumbs, drag-and-drop, and preview mode. Write scripts like a boss.

**Workspaces** - Real folders, real files, and a workspace system that keeps everything tidy. Switch workspaces from the UI and keep your projects organized.

**Autoexec** - Toggle a script and it syncs straight to your executor's autoexec folder. Supports `~/Hydrogen/autoexecute` and `~/Opiumware/autoexec`.

**Cloud Scripts** - Browse ScriptBlox and rscripts.net without opening a browser. Filter by verified, universal, key-free, and unpatched scripts.

**Pinboard** - Pin your favorite scripts for one-click access. Drag to reorder, right-click to manage, and keep your best stuff handy.

**Timeline** - Save up to 50 snapshots per file, then rewind whenever you need to. It's like undo + time travel for your scripts.

**Multi-Instance** - Send commands to multiple Roblox clients through a JSON bridge file (`VelocityUI_multiexec.json`). Target clients by user ID and execute across all of them.

**Search** - Search every script in your workspace instantly. Type fast, find faster.

**Menu Scripts** - A sidebar macro board for scripts you run over and over. One click is all it takes.

## Executor Support

| Executor | Key |
|----------|-----|
| Hydrogen | `hydrogen` |
| Opiumware | `opium` |

Switch the active executor in Settings. That choice decides where autoexec scripts sync.

## Keyboard Shortcuts

The shortcut manager changes behavior depending on where you are: explorer, editor, or panel. Monaco bindings still work without conflict.

## Building

Requires Rust (stable), Node.js, and the Tauri CLI.

```sh
git clone https://github.com/dawnpetal/VelocityUI.git
cd VelocityUI
npm install
npm run dev
npm run build
npm run release
npm run build:dmg
```

## Requirements

- macOS (Intel or Apple Silicon)
- Installer needs `curl`, `unzip`, and `jq`

## Data

Everything lives in `~/VelocityUI/` - workspaces, execution history, autoexec scripts, settings. No telemetry, no nonsense.
