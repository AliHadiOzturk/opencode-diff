# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-03-04

### Added
- **VSCode-only mode** - New mode that bypasses terminal UI and sends changes directly to VSCode extension
  - Three modes supported: `tui` (default), `vscode-only`, and `auto` (auto-detect)
  - `vscodeOnly.applyImmediately` - Apply changes immediately without review
  - `vscodeOnly.backupOriginals` - Backup original files before applying changes
  - `vscodeOnly.notificationOnChange` - Show notifications when changes are applied
  - `vscodeOnly.maxPendingAgeHours` - Auto-cleanup pending changes after specified hours
  - `vscodeOnly.fallbackToTuiIfVsCodeClosed` - Fallback to TUI if VSCode not available
  - `vscodeOnly.maxBackupSizeBytes` - Maximum backup size limit
- VSCode detector utility for auto-detection of VSCode environment
- State synchronization between plugin and VSCode extension
- Backup manager for file versioning and recovery
- Enhanced configuration validation for new mode options

### Changed
- Improved plugin setup script with better global vs local installation support
- Updated default configuration to include vscode-only mode settings

## [0.1.1] - 2025-03-03

### Added
- Initial public release
- Interactive diff viewer with vim-style navigation (j/k, y/n)
- Line-by-line accept/reject functionality
- Terminal UI with beautiful color-coded diffs
- Configuration system with glob patterns for auto-accept/reject
- Custom keybindings support
- IDE integration foundation
- Plugin setup CLI via `npx opencode-diff setup`

### Features
- TUI renderer with syntax highlighting
- Keyboard handler with customizable shortcuts
- State manager for tracking changes
- Diff engine using unified diff format
- Support for light/dark/auto themes
- File size limits and confirmation dialogs
- Backup system for original files

---

For detailed migration guides and usage instructions, see:
- [README.md](README.md)
- [docs/migration.md](docs/migration.md)
