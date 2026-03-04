# Migration Guide: TUI to VSCode-only Mode

This guide helps you migrate from the Terminal UI (TUI) mode to the VSCode-only mode in the OpenCode Diff Plugin.

## Overview

The OpenCode Diff Plugin supports three modes:
- **TUI** (Terminal UI) - Interactive terminal-based diff viewer with vim-style navigation
- **VSCode-only** - Bypasses terminal UI, sends changes directly to VSCode extension
- **Auto** - Automatically detects the best mode based on environment

## Why Migrate to VSCode-only Mode?

**Benefits:**
- No terminal blocking - OpenCode runs continuously without waiting for TUI input
- Better VSCode integration - Native diff experience with side-by-side comparison
- Headless-friendly - Works in CI/CD environments with VSCode
- Smoother workflow - Changes appear in VSCode's "Pending Changes" sidebar

**When to use TUI:**
- You prefer terminal-based workflows
- You don't use VSCode
- You're working over SSH without VSCode

## Migration Steps

### Step 1: Backup Your Current Configuration

```bash
cp .opencode/diff-plugin.json .opencode/diff-plugin.json.backup
```

### Step 2: Update Configuration

Edit `.opencode/diff-plugin.json`:

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
  },
  "autoAccept": ["*.lock", "package-lock.json", "yarn.lock"],
  "autoReject": ["*.min.js", "*.min.css", "dist/**"]
}
```

### Step 3: Configure VSCode Extension

Ensure the VSCode extension is installed:

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "OpenCode Diff"
4. Click Install

Or install from source:

```bash
cd ide/vscode
npm install
npm run build
```

Press F5 in VSCode to launch Extension Development Host.

### Step 4: Update Auto-accept Patterns

Consider adding more auto-accept patterns for VSCode-only mode since you won't be reviewing them in TUI:

```json
{
  "autoAccept": [
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "*.snap",
    "__snapshots__/**"
  ]
}
```

### Step 5: Test the Migration

1. Start OpenCode:
   ```bash
   opencode
   ```

2. Request a code change from OpenCode

3. Check the VSCode "Pending Changes" sidebar for the diff

4. Review and accept/reject changes in VSCode

## Configuration Options Reference

### Mode Setting

| Value | Behavior |
|-------|----------|
| `"tui"` | Use Terminal UI (default) |
| `"vscode-only"` | Use VSCode extension only |
| `"auto"` | Auto-detect based on environment |

### VSCode-only Options

| Option | Default | Description |
|--------|---------|-------------|
| `applyImmediately` | `false` | If `true`, changes apply without review. Use with caution! |
| `backupOriginals` | `true` | Creates `.backup` files before applying changes |
| `notificationOnChange` | `true` | Shows VSCode notifications when changes arrive |
| `maxPendingAgeHours` | `24` | Auto-cleans changes older than this (0 = never) |
| `fallbackToTuiIfVsCodeClosed` | `true` | Falls back to TUI if VSCode is unavailable |
| `maxBackupSizeBytes` | `104857600` | Max total backup size (100MB default, 0 = unlimited) |

## Troubleshooting

### Changes Not Appearing in VSCode

1. **Check IDE Integration:**
   ```json
   {
     "ide": {
       "enabled": true
     }
   }
   ```

2. **Verify State File:**
   ```bash
   cat .opencode/.diff-plugin-state.json
   ```

3. **Reload VSCode Window:**
   - Press Ctrl+Shift+P
   - Type "Developer: Reload Window"

### Fallback to TUI Not Working

If VSCode is closed and fallback isn't working:

1. Check `fallbackToTuiIfVsCodeClosed` is `true`
2. Ensure TUI dependencies are installed
3. Check OpenCode logs: `DEBUG=opencode-diff-plugin opencode`

### Backup Files Accumulating

To manage backup storage:

```json
{
  "vscodeOnly": {
    "maxBackupSizeBytes": 52428800,
    "maxPendingAgeHours": 12
  }
}
```

Or disable backups:

```json
{
  "vscodeOnly": {
    "backupOriginals": false
  }
}
```

## Rollback

To return to TUI mode:

```bash
cp .opencode/diff-plugin.json.backup .opencode/diff-plugin.json
```

Or edit the config:

```json
{
  "mode": "tui"
}
```

## Example Configurations

### Development Workflow

```json
{
  "enabled": true,
  "mode": "vscode-only",
  "vscodeOnly": {
    "applyImmediately": false,
    "backupOriginals": true,
    "notificationOnChange": true,
    "fallbackToTuiIfVsCodeClosed": true
  },
  "ide": {
    "enabled": true
  },
  "autoAccept": ["*.lock"],
  "autoReject": ["*.min.js"]
}
```

### CI/CD Headless

```json
{
  "enabled": true,
  "mode": "vscode-only",
  "vscodeOnly": {
    "applyImmediately": true,
    "backupOriginals": false,
    "notificationOnChange": false,
    "fallbackToTuiIfVsCodeClosed": false
  },
  "ide": {
    "enabled": true
  },
  "autoAccept": ["*.lock", "*.json"],
  "autoReject": []
}
```

### Conservative TUI Fallback

```json
{
  "enabled": true,
  "mode": "auto",
  "vscodeOnly": {
    "applyImmediately": false,
    "backupOriginals": true,
    "fallbackToTuiIfVsCodeClosed": true
  },
  "ide": {
    "enabled": true
  }
}
```

## Additional Resources

- [Configuration Reference](../README.md#configuration)
- [Example Config](../.opencode/diff-plugin.example.json)
- [VSCode Extension README](../ide/vscode/README.md)
