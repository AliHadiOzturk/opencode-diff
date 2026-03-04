# OpenCode Diff Plugin

[![Version](https://img.shields.io/npm/v/opencode-diff.svg)](https://www.npmjs.com/package/opencode-diff)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

A powerful interactive diff viewer plugin for [OpenCode](https://opencode.ai) that provides enhanced code review capabilities with vim-style navigation, granular change acceptance, and beautiful terminal UI rendering.

## Features

- **Interactive Diff Viewer** - Review code changes with a rich terminal UI
- **Granular Control** - Accept or reject changes at line, hunk, or file level
- **Vim-Style Navigation** - Efficient keyboard-driven interface
- **IDE Integration** - VSCode extension for side-by-side diff viewing
- **State Persistence** - Changes stored safely before application
- **Theme Support** - Light and dark themes for comfortable viewing
- **Auto-accept/Reject** - Configure glob patterns for automatic handling
- **Undo/Redo** - Full action history with undo support

## Quick Start

### Installation

```bash
npm install opencode-diff
```

### Enable in OpenCode

Add to your `opencode.json`:

```json
{
  "plugin": [
    "opencode-diff@latest"
  ]
}
```

### Configure

Create `.opencode/diff-plugin.json`:

```json
{
  "enabled": true,
  "autoAccept": ["*.lock", "package-lock.json"],
  "autoReject": [],
  "theme": "dark",
  "ide": {
    "enabled": false,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
```

## Project Structure

```
opencode-change-viewer/
├── plugin/                 # OpenCode plugin (npm package)
│   ├── src/               # TypeScript source
│   ├── dist/              # Compiled JavaScript
│   └── package.json       # Plugin package config
├── ide/
│   └── vscode/            # VSCode Extension
│       ├── src/           # Extension source
│       ├── webview/       # Webview UI
│       └── package.json   # Extension config
├── webview/               # Shared webview components
├── docs/                  # Documentation
└── README.md             # This file
```

## Usage

### Interactive Mode (Terminal TUI)

When running OpenCode interactively:

```bash
opencode
```

The plugin will intercept file changes and show a diff UI:

```
[y] accept line    [n] reject line    [h] accept hunk    [r] reject hunk
[a] accept file    [d] reject file    [q] quit           [?] help
```

### Headless Mode

When using `opencode run`, changes are intercepted and stored in:
`.opencode/.diff-plugin-state.json`

Use the helper script to review:

```bash
node node_modules/opencode-diff/review-changes.mjs list
node node_modules/opencode-diff/review-changes.mjs accept-all
```

### VSCode Extension

1. Install the extension from `ide/vscode/`
2. Enable IDE integration in config:
   ```json
   {
     "ide": {
       "enabled": true
     }
   }
   ```
3. Changes appear in the "Pending Changes" sidebar

## Keyboard Shortcuts

### Line Actions
| Key | Action |
|-----|--------|
| `y` | Accept current line |
| `n` | Reject current line |

### Hunk Actions
| Key | Action |
|-----|--------|
| `h` | Accept current hunk |
| `r` | Reject current hunk |

### File Actions
| Key | Action |
|-----|--------|
| `a` | Accept entire file |
| `d` | Reject entire file |
| `A` | Accept all pending |
| `R` | Reject all pending |

### Navigation
| Key | Action |
|-----|--------|
| `j` / `↓` | Next line |
| `k` / `↑` | Previous line |
| `]` | Next hunk |
| `[` | Previous hunk |
| `l` | Next file |
| `p` | Previous file |

## Development

### Plugin

```bash
cd plugin
npm install
npm run build
npm run dev      # Watch mode
```

### VSCode Extension

```bash
cd ide/vscode
npm install
npm run build
```

Press F5 in VSCode to launch Extension Development Host.

## Configuration

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable plugin |
| `autoAccept` | string[] | [] | Glob patterns for auto-accept |
| `autoReject` | string[] | [] | Glob patterns for auto-reject |
| `maxFileSize` | number | 1048576 | Max file size in bytes |
| `theme` | string | "dark" | UI theme (light/dark/auto) |
| `showLineNumbers` | boolean | true | Show line numbers |
| `confirmRejectAll` | boolean | true | Confirm before rejecting all |

### IDE Integration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ide.enabled` | boolean | false | Enable IDE integration |
| `ide.stateFilePath` | string | ".opencode/.diff-plugin-state.json" | State file location |

### Modes

The plugin supports three diff viewer modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `tui` | Terminal UI with vim-style navigation (default) | Interactive terminal sessions |
| `vscode-only` | VSCode extension only, no TUI | VSCode workflow, headless environments |
| `auto` | Auto-detect based on environment | Mixed workflows |

**Mode Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `"tui"` | Diff viewer mode: `"tui"`, `"vscode-only"`, or `"auto"` |

#### VSCode-only Mode

When `mode` is set to `"vscode-only"`, the plugin bypasses the terminal UI and sends changes directly to the VSCode extension. This is ideal for:

- VSCode-centric workflows
- Headless/CI environments with VSCode integration
- Users who prefer GUI diff review

**VSCode-only Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vscodeOnly.applyImmediately` | boolean | `false` | Apply changes immediately without review |
| `vscodeOnly.backupOriginals` | boolean | `true` | Backup original files before applying changes |
| `vscodeOnly.notificationOnChange` | boolean | `true` | Show notifications when changes are applied |
| `vscodeOnly.maxPendingAgeHours` | number | `24` | Maximum age in hours for pending changes before auto-cleanup |
| `vscodeOnly.fallbackToTuiIfVsCodeClosed` | boolean | `true` | Fallback to TUI if VSCode is not available |
| `vscodeOnly.maxBackupSizeBytes` | number | `104857600` | Maximum backup size in bytes (0 = unlimited) |

**Example VSCode-only configuration:**

```json
{
  "enabled": true,
  "mode": "vscode-only",
  "vscodeOnly": {
    "applyImmediately": false,
    "backupOriginals": true,
    "notificationOnChange": true,
    "maxPendingAgeHours": 24,
    "fallbackToTuiIfVsCodeClosed": true,
    "maxBackupSizeBytes": 104857600
  },
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
```

See [docs/migration.md](docs/migration.md) for migration guide from TUI to VSCode-only mode.

## Architecture

### Security Model
- **Plugin controls all file writes** - UI only updates state file
- **State file is source of truth** - Both plugin and IDE sync via JSON
- **No direct file modification** from UI - ensures safety

### Components
- **Plugin** (`opencode-diff`): Intercepts changes, manages state
- **State File**: Shared state between plugin and IDE
- **VSCode Extension**: Custom diff editor with Monaco

## Troubleshooting

### Plugin Not Loading

Check OpenCode logs:
```bash
DEBUG=opencode-diff-plugin opencode
```

Common issues:
- Ensure `plugin` array in `opencode.json` uses correct key name
- Check plugin is installed: `npm list opencode-diff`
- Verify Node.js >= 18.0.0

### Changes Not Showing in VSCode

- Ensure IDE integration is enabled in config
- Check state file exists: `.opencode/.diff-plugin-state.json`
- Reload VSCode window

### Debug Mode

```bash
DEBUG=opencode-diff-plugin* opencode
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related

- [OpenCode](https://opencode.ai) - The AI coding platform
- [Plugin Documentation](docs/) - Detailed documentation
- [VSCode Extension](ide/vscode/) - IDE integration

---

Made with ❤️ for the OpenCode community
