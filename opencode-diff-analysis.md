# OpenCode Diff Plugin - Complete Data Flow Analysis

## Executive Summary

The OpenCode Diff Plugin intercepts file modification tool calls (`write` and `edit`) from OpenCode, stores them in a persistent state file, and provides both terminal UI and IDE integration modes. This document details the complete data flow for real-world testing.

---

## 1. Data Flow: OpenCode → Plugin → VSCode

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OpenCode Agent                                     │
│  ┌─────────────────┐                                                        │
│  │ write/edit tool │                                                        │
│  │   invoked       │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           │ OpenCode Plugin Hooks                                            │
│           │ ┌─────────────────────┐                                         │
│           └─► tool.execute.before │                                         │
│             └──────────┬──────────┘                                         │
│                        │                                                     │
└────────────────────────┼─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Diff Plugin (interceptor.ts)                           │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ToolInterceptor.before(tool, args)                                   │   │
│  │                                                                      │   │
│  │ 1. Extract filePath from args                                        │   │
│  │ 2. Read original file content via `cat ${filePath}`                  │   │
│  │ 3. Compute new content (write=replace, edit=replace oldString)       │   │
│  │ 4. Create PendingChange object                                       │   │
│  │ 5. Add to ChangeQueue                                                │   │
│  │ 6. THROW InterceptedError (prevents OpenCode from executing)         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│                         │                                                     │
│                         │ ChangeQueue.add()                                  │
│                         ▼                                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ChangeQueue persists to state file (state-manager.ts)               │   │
│  │                                                                      │   │
│  │ - If persistence enabled: Write to `.diff-plugin-state.json`        │   │
│  │ - Debounced writes (100ms default)                                  │   │
│  │ - Atomic writes (temp file + rename pattern)                        │   │
│  │ - File watching for external changes                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────────────────────┘
                         │
                         │ State File Updated
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VSCode Extension                                      │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ VSCode watches `.diff-plugin-state.json`                             │   │
│  │                                                                      │   │
│  │ 1. Detects file change via file system watcher                       │   │
│  │ 2. Reads state file                                                  │   │
│  │ 3. Parses JSON → PendingChange[]                                     │   │
│  │ 4. Opens diff viewer for each change                                 │   │
│  │ 5. User reviews/accepts/rejects                                      │   │
│  │ 6. Updates state file with user decisions                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────────────────────┘
                         │
                         │ User Actions Persisted
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Diff Plugin (ChangeQueue)                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ StateSync detects external changes                                   │   │
│  │                                                                      │   │
│  │ - Watches state file for modifications                               │
│  │ - Callback triggers queue update                                     │   │
│  │ - Line-level states (pending/accepted/rejected) synced               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Files and Their Roles

### Core Plugin Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 91 | Plugin entry point, initializes ConfigManager and ChangeQueue with persistence |
| `src/interceptor.ts` | 156 | Intercepts OpenCode `write` and `edit` tool calls, captures original/new content |
| `src/state-manager.ts` | 815 | Manages ChangeQueue with line-level state tracking (pending/accepted/rejected) |
| `src/state-sync.ts` | 461 | File-based state persistence with atomic writes, debouncing, and file watching |
| `src/config.ts` | 440 | Configuration management including IDE integration settings |
| `src/diff-engine.ts` | 369 | Generates unified diffs and parses them for display |

### UI Components

| File | Purpose |
|------|---------|
| `src/ui/tui-renderer.ts` | Terminal UI renderer (boxes, colors, diff display) |
| `src/ui/keyboard-handler.ts` | Vim-style keybindings (j/k/y/n/h/r) |
| `src/ui/widgets.ts` | UI widgets (help, navigation, status bars) |

### Test Files

| File | Purpose |
|------|---------|
| `src/__tests__/state-manager.test.ts` | Tests for ChangeQueue persistence and state loading |
| `src/__tests__/state-sync.test.ts` | Tests for StateSync atomic writes and file watching |
| `src/__tests__/config.test.ts` | Tests for IDE config validation |
| `src/__tests__/diff-engine.test.ts` | Tests for diff generation and parsing |

---

## 3. State File Format

### Location
```
${workspaceRoot}/.opencode/.diff-plugin-state.json
```

### JSON Schema

```typescript
interface StateFileData {
  version: string;      // "1.0" - state file format version
  timestamp: number;    // Unix timestamp (ms)
  sessionID: string;    // OpenCode session identifier
  changes: PendingChange[];
}

interface PendingChange {
  id: string;           // Unique change ID (e.g., "change_1234567890_abc123")
  tool: string;         // "write" | "edit"
  filePath: string;     // Absolute path to file
  oldContent: string;   // Original file content (empty for new files)
  newContent: string;   // Proposed new content
  sessionID: string;    // OpenCode session ID
  callID: string;       // Tool call ID
  timestamp: number;    // When change was intercepted
  parsedDiff?: ParsedDiff;  // Structured diff data
  lineStates: {         // Map of "hunkIndex:lineIndex" -> state
    [key: string]: 'pending' | 'accepted' | 'rejected'
  };
}

interface ParsedDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';
  language?: string;    // e.g., "typescript", "javascript"
  hunks: Hunk[];
  oldContent?: string;
  newContent?: string;
}

interface Hunk {
  header: string;       // e.g., "@@ -1,5 +1,7 @@"
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'added' | 'deleted' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

### Example State File

```json
{
  "version": "1.0",
  "timestamp": 1709834567890,
  "sessionID": "session_abc123",
  "changes": [
    {
      "id": "change_1709834567890_xyz789",
      "tool": "edit",
      "filePath": "/Users/alihadiozturk/workspace/project/src/utils.ts",
      "oldContent": "function greet(name) {\n  return \"Hello, \" + name;\n}",
      "newContent": "function greet(name: string): string {\n  return `Hello, ${name}!`;\n}",
      "sessionID": "session_abc123",
      "callID": "call_1709834567890_def456",
      "timestamp": 1709834567890,
      "parsedDiff": {
        "oldPath": "src/utils.ts",
        "newPath": "src/utils.ts",
        "status": "modified",
        "language": "typescript",
        "hunks": [
          {
            "header": "@@ -1,3 +1,3 @@",
            "oldStart": 1,
            "oldLines": 3,
            "newStart": 1,
            "newLines": 3,
            "lines": [
              {
                "type": "unchanged",
                "content": "function greet(name) {",
                "oldLineNumber": 1,
                "newLineNumber": 1
              },
              {
                "type": "deleted",
                "content": "  return \"Hello, \" + name;",
                "oldLineNumber": 2
              },
              {
                "type": "added",
                "content": "  return `Hello, ${name}!`;",
                "newLineNumber": 2
              },
              {
                "type": "unchanged",
                "content": "}",
                "oldLineNumber": 3,
                "newLineNumber": 3
              }
            ]
          }
        ]
      },
      "lineStates": {
        "0:1": "pending",
        "0:2": "pending"
      }
    }
  ]
}
```

---

## 4. Tool Interception Mechanism

### How Interception Works

```typescript
// From src/interceptor.ts

export class ToolInterceptor {
  async before(tool: string, args: unknown): Promise<void> {
    // Only intercept write and edit tools
    if (tool !== 'write' && tool !== 'edit') {
      return;
    }

    // Extract file path from tool args
    const { filePath } = this.extractFilePath(tool, args);
    console.log(`[DiffPlugin] Intercepted: ${filePath}`);

    // Read original content before modification
    const oldContent = await this.readOriginalContent(filePath);

    // Compute what the new content would be
    const newContent = this.computeNewContent(tool, oldContent, args);

    // Create a PendingChange object
    const change = new PendingChange({
      id: ChangeQueue.generateId(),
      tool,
      filePath,
      oldContent,
      newContent,
      sessionID: this.context.sessionID,
      callID: this.context.callID,
      timestamp: Date.now(),
    });

    // Add to queue (this triggers state file write if persistence enabled)
    this.context.changeQueue.add(change);

    // CRITICAL: Throw InterceptedError to prevent OpenCode from executing
    throw new InterceptedError(
      `Tool '${tool}' for '${filePath}' intercepted by DiffPlugin`,
      change.id,
      filePath
    );
  }
}
```

### OpenCode Plugin Hooks

```typescript
// From src/index.ts

return {
  name: 'diff-plugin',
  version: '0.1.0',
  description: 'Enhanced diff viewing and interaction for OpenCode',

  hooks: {
    'tool.execute.before': createBeforeHandler(
      context.$,
      context.directory,
      configManager,
      changeQueue
    ),
    'tool.execute.after': createAfterHandler(
      context.$,
      context.directory,
      configManager,
      changeQueue
    ),
  },
};
```

---

## 5. IDE Mode vs Terminal UI Mode

### Mode Decision Logic

```typescript
// From src/index.ts (lines 40-59)

// Initialize ChangeQueue with persistence if IDE integration is enabled
const config = configManager.getConfig();
const enablePersistence = config.ide?.enabled ?? false;
const stateFilePath = config.ide?.stateFilePath ?? '.opencode/.diff-plugin-state.json';
const statePath = join(context.directory, stateFilePath);

let changeQueue: ChangeQueue;
if (enablePersistence) {
  console.log('[DiffPlugin] IDE integration enabled, enabling persistence at:', statePath);
  changeQueue = new ChangeQueue({
    enablePersistence: true,
    statePath,
  });
  await changeQueue.ready;
} else {
  console.log('[DiffPlugin] IDE integration disabled, using in-memory only');
  changeQueue = new ChangeQueue();
}
```

### Mode Comparison

| Feature | Terminal UI Mode | IDE Mode |
|---------|-----------------|----------|
| **Persistence** | In-memory only | File-based state |
| **State File** | Not created | `.opencode/.diff-plugin-state.json` |
| **Display** | Terminal TUI | VSCode diff viewer |
| **Interaction** | Vim keys (y/n/j/k) | VSCode UI |
| **Auto-sync** | N/A | Bidirectional via file watching |

---

## 6. Configuration for IDE Mode

### Enable IDE Mode

Create `.opencode/diff-plugin.json` in your workspace:

```json
{
  "enabled": true,
  "autoAccept": ["*.lock", "package-lock.json"],
  "autoReject": ["*.min.js", "node_modules/**"],
  "maxFileSize": 1048576,
  "theme": "dark",
  "showLineNumbers": true,
  "confirmRejectAll": true,
  "keybindings": [],
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
```

### Configuration Location

```
${workspaceRoot}/.opencode/diff-plugin.json
```

### IDE Config Schema

```typescript
interface IDEConfig {
  enabled: boolean;           // Enable IDE integration (default: false)
  stateFilePath: string;      // Path to state file relative to workspace root
                              // (default: ".opencode/.diff-plugin-state.json")
}
```

---

## 7. What Triggers VSCode to Open the Diff Viewer

### Trigger Flow

1. **OpenCode executes write/edit tool**
   → Plugin intercepts via `tool.execute.before` hook

2. **Plugin creates PendingChange**
   → Computes old/new content
   → Generates diff
   → Adds to ChangeQueue

3. **ChangeQueue persists to state file** (if IDE mode enabled)
   → Debounced write (100ms default)
   → Atomic write (temp file + rename)

4. **VSCode detects file change**
   → File system watcher on `.diff-plugin-state.json`
   → Reads and parses state file

5. **VSCode opens diff viewer**
   → For each pending change, opens side-by-side diff
   → User reviews and accepts/rejects

6. **VSCode updates state file**
   → Sets line states to 'accepted' or 'rejected'
   → Removes completed changes

7. **Plugin detects external changes**
   → StateSync file watcher triggers callback
   → ChangeQueue updates internal state

8. **Plugin applies accepted changes**
   → Reconstructs final content from line states
   → Writes to actual file

---

## 8. Testing Instructions for Real-World Scenarios

### Prerequisites

```bash
# Install the plugin
npm install opencode-diff-plugin

# Or with bun
bun add opencode-diff-plugin
```

### Test 1: Basic IDE Mode

```bash
# 1. Create workspace
mkdir test-workspace && cd test-workspace

# 2. Create config
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true
  }
}
EOF

# 3. Create a test file
echo 'function greet(name) { return "Hello"; }' > test.ts

# 4. Run OpenCode
opencode

# 5. Ask OpenCode to modify the file
#    "Add a parameter to the greet function"

# 6. Verify state file is created
ls -la .opencode/.diff-plugin-state.json

# 7. View state file contents
cat .opencode/.diff-plugin-state.json | jq '.'
```

### Test 2: Line-Level State Tracking

```bash
# 1. Enable IDE mode
# 2. Ask OpenCode to make multi-line changes
# 3. Observe state file lineStates:
#    - Initially all lines are "pending"
#    - VSCode sets specific lines to "accepted" or "rejected"
#    - Plugin reconstructs final content
```

### Test 3: File Watching

```bash
# 1. Enable IDE mode and create a change
# 2. Manually edit the state file to simulate VSCode:
cat > .opencode/.diff-plugin-state.json << 'EOF'
{
  "version": "1.0",
  "timestamp": 1709834567890,
  "sessionID": "manual_test",
  "changes": [
    {
      "id": "change_test_123",
      "tool": "edit",
      "filePath": "$(pwd)/test.ts",
      "oldContent": "old",
      "newContent": "new",
      "sessionID": "manual_test",
      "callID": "call_test",
      "timestamp": 1709834567890,
      "lineStates": {
        "0:0": "accepted"
      }
    }
  ]
}
EOF

# 3. Plugin should detect this change and apply it
```

### Test 4: Auto-Accept Patterns

```bash
# 1. Configure auto-accept
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true
  },
  "autoAccept": ["*.lock", "package-lock.json"]
}
EOF

# 2. Create a package-lock.json
# 3. Ask OpenCode to modify it
# 4. Change should be auto-accepted without showing in VSCode
```

---

## 9. Key Implementation Details

### Atomic Write Pattern

```typescript
// From src/state-sync.ts

async writeState(changes: PendingChange[]): Promise<void> {
  // Write to temp file
  const tempPath = `${this.statePath}.tmp`;
  await this.writeFileAsync(tempPath, jsonContent);

  // Atomic rename
  await this.renameAsync(tempPath, this.statePath);
}
```

### Debounced Writes

```typescript
// From src/state-sync.ts

async writeStateDebounced(changes: PendingChange[]): Promise<void> {
  this.pendingChanges = changes;

  // Clear existing timer
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
  }

  // Set new timer (default: 100ms)
  this.debounceTimer = setTimeout(async () => {
    if (this.pendingChanges) {
      await this.writeState(this.pendingChanges);
      this.pendingChanges = null;
    }
  }, this.debounceMs);
}
```

### File Watching (Self-Write Detection)

```typescript
// From src/state-sync.ts

private handleWatchEvent(eventType: string): void {
  // Ignore our own writes using timestamp-based detection
  const timeSinceWrite = Date.now() - this.lastWriteTime;
  if (timeSinceWrite < this.WRITE_IGNORE_WINDOW_MS) {  // 200ms
    return;
  }

  // Process external changes
  if (this.changeCallback) {
    this.watchDebounceTimer = setTimeout(async () => {
      const changes = await this.readState();
      this.changeCallback?.(changes);
    }, this.debounceMs);
  }
}
```

### Content Reconstruction

```typescript
// From src/state-manager.ts

reconstructContent(): string {
  // Start with old lines
  const resultLines = [...oldLines];

  // Process hunks in reverse order to maintain line integrity
  const hunks = [...this.parsedDiff.hunks].reverse();

  for (const hunk of hunks) {
    for (let lineIndex = hunk.lines.length - 1; lineIndex >= 0; lineIndex--) {
      const line = hunk.lines[lineIndex];
      const state = this.lineStates.get(key) || 'pending';

      if (line.type === 'added' && effectiveState === 'accepted') {
        resultLines.splice(insertPosition, 0, line.content);
      } else if (line.type === 'deleted' && effectiveState === 'accepted') {
        resultLines.splice(deletePosition, 1);
      }
    }
  }

  return resultLines.join('\n');
}
```

---

## 10. Testing Commands Summary

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/state-manager.test.ts
bun test src/__tests__/state-sync.test.ts
bun test src/__tests__/config.test.ts
bun test src/__tests__/diff-engine.test.ts

# Run tests in watch mode
bun test --watch

# Build the plugin
bun run build

# Run in development mode (watch)
bun run dev

# Type check
bun run lint
```

---

## 11. Files Summary

| File Path | Purpose | Key Exports |
|-----------|---------|-------------|
| `src/index.ts` | Plugin entry | `diffPlugin()` factory |
| `src/interceptor.ts` | Tool interception | `ToolInterceptor`, `createBeforeHandler`, `createAfterHandler` |
| `src/state-manager.ts` | State management | `ChangeQueue`, `PendingChange`, `InterceptedError` |
| `src/state-sync.ts` | File persistence | `StateSync`, `loadChangeQueue`, `saveChangeQueue` |
| `src/config.ts` | Configuration | `ConfigManager`, `DEFAULT_CONFIG`, `PluginConfig` |
| `src/diff-engine.ts` | Diff generation | `DiffEngine`, `generateDiff`, `parseDiff` |
| `src/ui/tui-renderer.ts` | Terminal UI | `TUIRenderer` |
| `src/ui/keyboard-handler.ts` | Keybindings | `KeyboardHandler`, `KeyboardAction` |
| `src/ui/widgets.ts` | UI components | `HelpOverlay`, `NavigationBar` |
| `src/types/diff.d.ts` | Type definitions | `ParsedDiff`, `Hunk`, `DiffLine` |

---

## 12. Configuration Files

| File Path | Purpose |
|-----------|---------|
| `.opencode/diff-plugin.json` | Plugin configuration (IDE mode, auto-accept patterns) |
| `.opencode/.diff-plugin-state.json` | Runtime state file (created when IDE mode enabled) |

---

*Generated from source analysis of opencode-diff-plugin*
