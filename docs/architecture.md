# OpenCode Diff Plugin - Architecture Document

## Executive Summary

This document provides a comprehensive architectural overview of the OpenCode Line-by-Line Diff Plugin, detailing component interactions, data flows, state management, and integration patterns with OpenCode's core systems.

## System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER ENVIRONMENT                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Terminal   │  │  IDE (VSCode)│  │    Web UI    │  │   Desktop    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼────────────────┼────────────────┼────────────────┼───────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OPENCODE PLATFORM                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         OpenCode Core                                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ AI Agent │ │  Tools   │ │ Sessions │ │   TUI    │ │  Config  │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │    │
│  │       └────────────┴────────────┴────────────┴────────────┘        │    │
│  └────────────────────────────────┬───────────────────────────────────┘    │
│                                   │                                         │
│                              Plugin API                                     │
│                                   │                                         │
│  ┌────────────────────────────────▼────────────────────────────────────┐    │
│  │                  OPENCODE DIFF PLUGIN                                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │Interceptr│ │  Diff    │ │   State  │ │   TUI    │ │  Config  │   │    │
│  │  │          │ │  Engine  │ │  Manager │ │  Render  │ │  Manager │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Plugin Entry Point (`src/index.ts`)

**Responsibility**: Initialize plugin, register hooks, manage lifecycle

```typescript
interface PluginContext {
  project: ProjectInfo;
  directory: string;
  worktree: string;
  client: OpenCodeClient;
  $: BunShell;
}

interface PluginHooks {
  'tool.execute.before': ToolInterceptor;
  'tool.execute.after': ToolConfirmation;
  'session.diff': DiffHandler;
  'tui.prompt.append': TUIInjector;
}

export default async function DiffPlugin(ctx: PluginContext): Promise<PluginHooks> {
  // Initialize configuration
  const config = await ConfigManager.load(ctx.directory);
  
  // Initialize state manager
  const stateManager = new StateManager();
  
  // Initialize diff engine
  const diffEngine = new DiffEngine(config);
  
  // Initialize UI renderer
  const uiRenderer = new TUIRenderer(ctx.client);
  
  // Initialize interceptor
  const interceptor = new ToolInterceptor({
    config,
    stateManager,
    diffEngine,
    uiRenderer
  });

  return {
    'tool.execute.before': interceptor.before.bind(interceptor),
    'tool.execute.after': interceptor.after.bind(interceptor),
    'session.diff': interceptor.handleDiff.bind(interceptor),
  };
}
```

### 2. Tool Interceptor (`src/interceptor.ts`)

**Responsibility**: Intercept file modifications, queue changes, prevent premature execution

```
┌──────────────────────────────────────────────────────────────┐
│                    TOOL INTERCEPTOR FLOW                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐                                          │
│   │ write/edit   │                                          │
│   │ tool called  │                                          │
│   └──────┬───────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐     NO     ┌──────────────┐              │
│   │ Auto-accept? │───────────►│ Auto-reject? │              │
│   └──────┬───────┘            └──────┬───────┘              │
│          │ YES                       │ YES                   │
│          ▼                           ▼                       │
│   ┌──────────────┐            ┌──────────────┐              │
│   │ Apply change │            │ Skip change  │              │
│   │ immediately  │            │              │              │
│   └──────────────┘            └──────────────┘              │
│                                          │                   │
│          ┌───────────────────────────────┘                   │
│          │ NO                                                │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ Capture      │                                          │
│   │ original     │                                          │
│   │ content      │                                          │
│   └──────┬───────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ Generate     │                                          │
│   │ unified diff │                                          │
│   └──────┬───────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ Create       │                                          │
│   │ PendingChange│                                          │
│   └──────┬───────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ Add to       │                                          │
│   │ ChangeQueue  │                                          │
│   └──────┬───────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ Trigger      │                                          │
│   │ diff review  │                                          │
│   └──────────────┘                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐                                          │
│   │ THROW        │◄── Prevents original tool execution      │
│   │ Intercepted  │                                          │
│   └──────────────┘                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Class Diagram:**

```
┌─────────────────────────────────────────────────────────────┐
│                    ToolInterceptor                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  - config: ConfigManager                                    │
│  - stateManager: StateManager                               │
│  - diffEngine: DiffEngine                                   │
│  - uiRenderer: TUIRenderer                                  │
│  - changeQueue: ChangeQueue                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  + before(input: ToolInput, output: ToolOutput): Promise    │
│  + after(input: ToolInput, output: ToolOutput): Promise     │
│  + handleDiff(diff: DiffInfo): Promise                      │
│                                                             │
│  - shouldIntercept(tool: string, filePath: string): boolean │
│  - captureOriginal(filePath: string): string                │
│  - queueChange(change: PendingChange): void                 │
│  - showReviewUI(change: PendingChange): Promise             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Diff Engine (`src/diff-engine.ts`)

**Responsibility**: Generate and parse unified diffs, compute line-by-line changes

```
┌─────────────────────────────────────────────────────────────┐
│                     DIFF ENGINE PIPELINE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   INPUT: oldContent, newContent, filePath                   │
│                                                             │
│          │                                                  │
│          ▼                                                  │
│   ┌──────────────┐                                          │
│   │ diff.createPatch│                                        │
│   │ (Myers alg)  │                                          │
│   └──────┬───────┘                                          │
│          │                                                  │
│          │ unified diff text                                │
│          ▼                                                  │
│   ┌──────────────┐                                          │
│   │ parseGitDiff │                                          │
│   └──────┬───────┘                                          │
│          │                                                  │
│          │ structured diff                                  │
│          ▼                                                  │
│   ┌──────────────┐                                          │
│   │ Enrich with  │                                          │
│   │ line numbers │                                          │
│   └──────┬───────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   ┌──────────────┐                                          │
│   │ Add syntax   │                                          │
│   │ highlighting │                                          │
│   │ hints        │                                          │
│   └──────┬───────┘                                          │
│          │                                                  │
│          ▼                                                  │
│   OUTPUT: ParsedDiff with hunks and lines                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Data Structures:**

```typescript
interface ParsedDiff {
  oldPath: string;
  newPath: string;
  oldMode?: string;
  newMode?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: Hunk[];
  stats: {
    additions: number;
    deletions: number;
    changes: number;
  };
}

interface Hunk {
  oldStart: number;      // Starting line in old file
  oldLines: number;      // Number of lines in old file
  newStart: number;      // Starting line in new file
  newLines: number;      // Number of lines in new file
  header: string;        // Hunk header line (@@ -1,3 +1,3 @@)
  lines: DiffLine[];     // Lines in this hunk
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;       // Line content (without prefix)
  oldLineNum: number | null;
  newLineNum: number | null;
  position: number;      // Overall position in diff (for GitHub-style comments)
}
```

### 4. State Manager (`src/state-manager.ts`)

**Responsibility**: Track acceptance state for every line, manage change lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                   STATE MANAGEMENT FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                   ChangeQueue                         │  │
│   │  Map<changeId, PendingChange>                        │  │
│   └──────────────┬───────────────────────────────────────┘  │
│                  │                                          │
│                  │ changeId                                 │
│                  ▼                                          │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                 PendingChange                         │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │  id: string                                          │  │
│   │  filePath: string                                    │  │
│   │  originalContent: string                             │  │
│   │  proposedContent: string                             │  │
│   │  parsedDiff: ParsedDiff                              │  │
│   │  status: 'pending' | 'reviewing' | 'applied' | 'rejected'││
│   │  createdAt: Date                                     │  │
│   │                                                      │  │
│   │  lineStates: Map<lineId, LineState> ◄──────────────────┤  │
│   └──────────────┬───────────────────────────────────────┘  │
│                  │                                          │
│                  │ lineId (e.g., "hunk-0-line-5")           │
│                  ▼                                          │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                   LineState                           │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │  lineId: string                                      │  │
│   │  hunkIndex: number                                   │  │
│   │  lineIndex: number                                   │  │
│   │  diffLine: DiffLine                                  │  │
│   │  state: 'pending' | 'accepted' | 'rejected'          │  │
│   │                                                      │  │
│   │  accept(): void ◄── User action                      │  │
│   │  reject(): void ◄── User action                      │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**State Transitions:**

```
┌──────────┐    accept()    ┌──────────┐
│ PENDING  │───────────────►│ ACCEPTED │
└────┬─────┘                └──────────┘
     │
     │ reject()
     ▼
┌──────────┐
│ REJECTED │
└──────────┘
```

**Aggregation Logic:**

```typescript
// Hunk state derived from lines
function getHunkState(hunk: Hunk, lineStates: Map): HunkState {
  const lines = hunk.lines.filter(l => l.type !== 'context');
  const states = lines.map(l => lineStates.get(l.id).state);
  
  if (states.every(s => s === 'accepted')) return 'accepted';
  if (states.every(s => s === 'rejected')) return 'rejected';
  return 'partial';
}

// File state derived from hunks
function getFileState(hunks: Hunk[], hunkStates: Map): FileState {
  const states = hunks.map(h => hunkStates.get(h.id));
  
  if (states.every(s => s === 'accepted')) return 'accepted';
  if (states.every(s => s === 'rejected')) return 'rejected';
  return 'partial';
}
```

### 5. TUI Renderer (`src/ui/tui-renderer.ts`)

**Responsibility**: Render diff in OpenCode's terminal UI

```
┌─────────────────────────────────────────────────────────────┐
│                   TUI RENDERING PIPELINE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │              DiffView Component                       │  │
│   ├──────────────────────────────────────────────────────┤  │
│   │  ┌────────────────────────────────────────────────┐  │  │
│   │  │           Header (File Info)                    │  │  │
│   │  │  📄 src/components/Button.tsx                  │  │  │
│   │  │  +45 lines, -12 lines                          │  │  │
│   │  └────────────────────────────────────────────────┘  │  │
│   │                                                      │  │
│   │  ┌────────────────────────────────────────────────┐  │  │
│   │  │           Toolbar (Actions)                     │  │  │
│   │  │  [Accept All] [Reject All] [Accept File] [?]   │  │  │
│   │  └────────────────────────────────────────────────┘  │  │
│   │                                                      │  │
│   │  ┌────────────────────────────────────────────────┐  │  │
│   │  │           Stats Bar                             │  │  │
│   │  │  ✅ 30 accepted | ❌ 5 rejected | ⏳ 10 pending  │  │  │
│   │  └────────────────────────────────────────────────┘  │  │
│   │                                                      │  │
│   │  ┌────────────────────────────────────────────────┐  │  │
│   │  │           Diff Content                          │  │  │
│   │  │                                                 │  │  │
│   │  │  @@ -23,7 +23,7 @@                            │  │  │
│   │  │      import React from 'react';               │  │  │
│   │  │  ┃   import { useState } from 'react'; ◄── Cursor│  │
│   │  │      import { Button } from './Button';       │  │  │
│   │  │                                                 │  │  │
│   │  │  ┌──────────────┐                             │  │  │
│   │  │  │ [✓] Accept   │ ◄── Widget                 │  │  │
│   │  │  │ [✗] Reject   │                             │  │  │
│   │  │  └──────────────┘                             │  │  │
│   │  │                                                 │  │  │
│   │  │  @@ -45,3 +45,6 @@                            │  │  │
│   │  │      export default Button;                   │  │  │
│   │  │  +                                             │  │  │
│   │  │  +  // New feature                           │  │  │
│   │  │  +  console.log('Button rendered');          │  │  │
│   │  │                                                 │  │  │
│   │  │  ┌──────────────┐                             │  │  │
│   │  │  │ [ ] Accept   │ ◄── Widget                 │  │  │
│   │  │  │ [ ] Reject   │                             │  │  │
│   │  │  └──────────────┘                             │  │  │
│   │  └────────────────────────────────────────────────┘  │  │
│   │                                                      │  │
│   │  ┌────────────────────────────────────────────────┐  │  │
│   │  │           Footer (Help)                         │  │  │
│   │  │  j/k: navigate | y: accept | n: reject | q: quit│  │  │
│   │  └────────────────────────────────────────────────┘  │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6. Configuration Manager (`src/config.ts`)

**Responsibility**: Load, validate, and provide configuration

```typescript
interface PluginConfig {
  // Feature toggles
  enabled: boolean;
  
  // Auto-action patterns
  autoAccept: string[];      // Glob patterns (e.g., "*.md", "*.txt")
  autoReject: string[];      // Glob patterns
  
  // Size limits
  maxFileSize: number;       // Bytes (default: 1MB)
  maxTotalSize: number;      // Bytes (default: 10MB)
  
  // UI preferences
  theme: 'light' | 'dark' | 'auto';
  showLineNumbers: boolean;
  showWhitespace: boolean;
  wrapLines: boolean;
  
  // Behavior
  confirmRejectAll: boolean;
  confirmBulkActions: boolean;
  defaultAction: 'prompt' | 'accept' | 'reject';
  
  // Keyboard shortcuts
  keybindings: {
    acceptLine: string;      // default: 'y'
    rejectLine: string;      // default: 'n'
    acceptHunk: string;      // default: 'h'
    rejectHunk: string;      // default: 'r'
    acceptFile: string;      // default: 'a'
    rejectFile: string;      // default: 'd'
    nextLine: string;        // default: 'j'
    prevLine: string;        // default: 'k'
    quit: string;            // default: 'q'
    help: string;            // default: '?'
  };
}

const defaultConfig: PluginConfig = {
  enabled: true,
  autoAccept: ['*.md', '*.txt', '*.json'],
  autoReject: [],
  maxFileSize: 1024 * 1024,      // 1MB
  maxTotalSize: 10 * 1024 * 1024, // 10MB
  theme: 'auto',
  showLineNumbers: true,
  showWhitespace: false,
  wrapLines: false,
  confirmRejectAll: true,
  confirmBulkActions: true,
  defaultAction: 'prompt',
  keybindings: {
    acceptLine: 'y',
    rejectLine: 'n',
    acceptHunk: 'h',
    rejectHunk: 'r',
    acceptFile: 'a',
    rejectFile: 'd',
    nextLine: 'j',
    prevLine: 'k',
    quit: 'q',
    help: '?'
  }
};
```

## Data Flow Diagrams

### Flow 1: File Write Interception

```
User: "Create a file utils.ts with helper functions"
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode AI Agent                         │
│  Generates code and calls write tool                         │
└─────────────────────────────────────────────────────────────┘
          │
          │ write({ filePath: "utils.ts", content: "..." })
          ▼
┌─────────────────────────────────────────────────────────────┐
│              tool.execute.before Hook                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check if enabled                                        │
│  2. Check auto-accept patterns (*.ts not in autoAccept)     │
│  3. Read original content (empty for new file)              │
│  4. Generate diff                                           │
│  5. Create PendingChange                                    │
│  6. Add to ChangeQueue                                      │
│  7. Throw InterceptedError (prevents write)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          │
          │ InterceptedError
          ▼
┌─────────────────────────────────────────────────────────────┐
│               TUI Diff View Displayed                        │
│  User reviews changes line by line                           │
└─────────────────────────────────────────────────────────────┘
          │
          │ User actions: accept/reject lines
          ▼
┌─────────────────────────────────────────────────────────────┐
│                 Apply Changes                                │
│  1. Filter accepted lines                                    │
│  2. Reconstruct file content                                 │
│  3. Write to disk                                            │
│  4. Update git status (optional)                             │
│  5. Mark change as 'applied'                                 │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
User sees: "Applied 45 lines, rejected 3 lines in utils.ts"
```

### Flow 2: Line Acceptance/Rejection

```
┌─────────────────────────────────────────────────────────────┐
│                 User Reviews Diff                            │
│                                                             │
│   Line 1: import React from 'react';       [context]        │
│ ► Line 2: import { useState } from 'react'; [added]         │
│   Line 3: import { Button } from './Button'; [context]      │
│                                                             │
│   Current line cursor: Line 2                               │
└─────────────────────────────────────────────────────────────┘
          │
          ├────────────────────┬────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    User presses 'y'     User presses 'n'     User presses 'h'
    (accept line)        (reject line)        (accept hunk)
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Line 2 state │      │ Line 2 state │      │ All changed  │
│  → ACCEPTED  │      │  → REJECTED  │      │ lines in     │
└──────────────┘      └──────────────┘      │ hunk →       │
                                            │ ACCEPTED     │
                                            └──────────────┘
          │                    │                    │
          └────────────────────┴────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           Reconstruct File Content                           │
│                                                             │
│  Original:    import React from 'react';                    │
│               import { Button } from './Button';            │
│                                                             │
│  Proposed:    import React from 'react';                    │
│               import { useState } from 'react';             │
│               import { Button } from './Button';            │
│                                                             │
│  Accepted:    import React from 'react';                    │
│               import { useState } from 'react'; ◄── accepted│
│               import { Button } from './Button';            │
│                                                             │
│  Rejected:    import React from 'react';                    │
│               import { Button } from './Button';            │
│               (useState line removed) ◄── rejected          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Flow 3: Multiple File Handling

```
AI makes changes to 5 files:
├── src/components/Button.tsx (modified)
├── src/components/Input.tsx  (modified)
├── src/utils/helpers.ts      (new)
├── src/styles/theme.css      (modified)
└── README.md                 (modified)
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              Auto-accept Check                               │
├─────────────────────────────────────────────────────────────┤
│  README.md matches *.md → AUTO-ACCEPT (no review)           │
│  theme.css > maxFileSize? → SKIP (too large)                │
│  helpers.ts (new file) → QUEUE                              │
│  Button.tsx, Input.tsx → QUEUE                              │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Change Queue                               │
│  [1] src/components/Button.tsx  ⏳ pending                   │
│  [2] src/components/Input.tsx   ⏳ pending                   │
│  [3] src/utils/helpers.ts       ⏳ pending                   │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              File List View (if >1 files)                    │
│  Reviewing 3 files (2 auto-accepted, 1 skipped)              │
│                                                             │
│  [ ] src/components/Button.tsx  +45 -12 lines               │
│  [ ] src/components/Input.tsx   +20 -5 lines                │
│  [ ] src/utils/helpers.ts       +120 lines (new)            │
│                                                             │
│  [Review All] [Accept All] [Reject All]                     │
└─────────────────────────────────────────────────────────────┘
          │
          │ User clicks "Review All" or reviews individually
          ▼
┌─────────────────────────────────────────────────────────────┐
│           Sequential Diff Review                             │
│  Shows diff for Button.tsx → user reviews → apply           │
│  Shows diff for Input.tsx  → user reviews → apply           │
│  Shows diff for helpers.ts → user reviews → apply           │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

### OpenCode Hooks Used

1. **`tool.execute.before`**
   - Intercepts: `write`, `edit`, `patch` tools
   - Modifies: Can throw to prevent execution
   - Timing: Synchronous, blocks tool execution

2. **`tool.execute.after`**
   - Confirms: Successful writes after our intercept
   - Cleanup: Removes from pending queue
   - Logging: Records applied changes

3. **`session.diff`**
   - Enhanced: Adds our review UI to built-in diff view
   - Context: Shows which changes are pending review

4. **`tui.prompt.append`**
   - Injects: Custom diff view components
   - Renders: Interactive line widgets
   - Handles: Keyboard events

### File System Integration

```typescript
// Reading original content
async function captureOriginal(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return ''; // New file
    }
    throw e;
  }
}

// Applying changes
async function applyChanges(
  filePath: string, 
  originalContent: string,
  acceptedContent: string
): Promise<void> {
  // Backup original (optional)
  await fs.writeFile(`${filePath}.orig`, originalContent);
  
  // Write accepted content
  await fs.writeFile(filePath, acceptedContent);
  
  // Update file timestamps
  const now = new Date();
  await fs.utimes(filePath, now, now);
}
```

### Git Integration (Optional)

```typescript
// After applying changes, optionally stage them
async function stageChanges(filePath: string): Promise<void> {
  await $`git add ${filePath}`;
}

// Or create a commit
async function commitChanges(message: string): Promise<void> {
  await $`git commit -m ${message}`;
}
```

## Error Handling Strategy

### Error Types

```typescript
enum PluginErrorType {
  INTERCEPTED = 'INTERCEPTED',           // Normal - change intercepted for review
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',     // Config limit exceeded
  BINARY_FILE = 'BINARY_FILE',          // Cannot diff binary
  PERMISSION_DENIED = 'PERMISSION_DENIED', // Cannot read/write file
  PARSE_ERROR = 'PARSE_ERROR',          // Diff parsing failed
  APPLY_ERROR = 'APPLY_ERROR',          // Failed to apply changes
}

class PluginError extends Error {
  constructor(
    public type: PluginErrorType,
    message: string,
    public context?: any
  ) {
    super(message);
  }
}
```

### Error Recovery

```
┌──────────────────┬──────────────────────────────────────────────────────────┐
│ Error Type       │ Recovery Strategy                                        │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ INTERCEPTED      │ Normal flow - show diff view                             │
│ FILE_TOO_LARGE   │ Skip review, apply immediately with warning              │
│ BINARY_FILE      │ Skip review, apply immediately with warning              │
│ PERMISSION_DENIED│ Skip file, notify user, continue with others             │
│ PARSE_ERROR      │ Fallback to simple line-by-line comparison               │
│ APPLY_ERROR      │ Restore from backup, notify user, retry                  │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Diff Generation**
   - Don't generate diff until user opens file
   - Cache generated diffs

2. **Virtual Scrolling**
   - For files > 1000 lines
   - Only render visible lines

3. **Incremental Parsing**
   - Parse hunks on demand
   - Don't parse entire file if user only reviews first hunk

4. **Debounce UI Updates**
   - Batch state changes
   - Update UI every 50ms, not on every keystroke

### Resource Limits

```typescript
const LIMITS = {
  maxFileSize: 1024 * 1024,        // 1MB
  maxTotalChanges: 100,            // Max files in one batch
  maxLineLength: 1000,             // Truncate long lines
  maxHunksPerFile: 100,            // Warn if more hunks
  renderDebounceMs: 50,            // UI update debounce
};
```

## Security Considerations

### Sandboxing

```typescript
// Prevent access to sensitive directories
const BLOCKED_PATHS = [
  /\.git\//,
  /node_modules\//,
  /\.env$/,
  /\.ssh\//,
  /\.opencode\//,
];

function isPathAllowed(filePath: string): boolean {
  return !BLOCKED_PATHS.some(pattern => pattern.test(filePath));
}
```

### Content Validation

```typescript
// Detect binary files
function isBinaryFile(content: Buffer): boolean {
  // Check for null bytes in first 1024 bytes
  return content.slice(0, 1024).includes(0);
}

// Validate file paths (prevent directory traversal)
function validatePath(filePath: string, baseDir: string): boolean {
  const resolved = path.resolve(baseDir, filePath);
  return resolved.startsWith(baseDir);
}
```

---

## Appendix A: Sequence Diagram

```
┌─────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐     ┌─────────┐
│  User   │     │ OpenCode │     │  Plugin    │     │  State   │     │  Disk   │
└────┬────┘     └────┬─────┘     └─────┬──────┘     └────┬─────┘     └────┬────┘
     │               │                 │                 │                │
     │ "Edit file"   │                 │                 │                │
     │──────────────►│                 │                 │                │
     │               │                 │                 │                │
     │               │ write()         │                 │                │
     │               │────────────────►│                 │                │
     │               │                 │                 │                │
     │               │                 │ captureOriginal │                │
     │               │                 │────────────────►│                │
     │               │                 │                 │                │
     │               │                 │◄────────────────│                │
     │               │                 │ content         │                │
     │               │                 │                 │                │
     │               │                 │ generateDiff()  │                │
     │               │                 │                 │                │
     │               │                 │ createPending() │                │
     │               │                 │────────────────►│                │
     │               │                 │                 │                │
     │               │                 │◄────────────────│ changeId       │
     │               │                 │                 │                │
     │               │ throw           │                 │                │
     │               │◄────────────────│                 │                │
     │               │ Intercepted     │                 │                │
     │               │                 │                 │                │
     │               │ showDiffView()  │                 │                │
     │               │────────────────►│                 │                │
     │               │                 │                 │                │
     │  Diff UI      │                 │                 │                │
     │◄──────────────│                 │                 │                │
     │               │                 │                 │                │
     │ y (accept)    │                 │                 │                │
     │──────────────►│                 │                 │                │
     │               │ acceptLine()    │                 │                │
     │               │────────────────►│                 │                │
     │               │                 │ updateState()   │                │
     │               │                 │────────────────►│                │
     │               │                 │                 │                │
     │ q (quit)      │                 │                 │                │
     │──────────────►│                 │                 │                │
     │               │ applyChanges()  │                 │                │
     │               │────────────────►│                 │                │
     │               │                 │ getAccepted()   │                │
     │               │                 │────────────────►│                │
     │               │                 │                 │                │
     │               │                 │◄────────────────│ content        │
     │               │                 │                 │                │
     │               │                 │ writeFile()     │                │
     │               │                 │────────────────────────────────►│
     │               │                 │                 │                │
     │               │                 │◄────────────────────────────────│
     │               │                 │                 │                │
     │  "Applied!"   │                 │                 │                │
     │◄──────────────│                 │                 │                │
     │               │                 │                 │                │
```

## Appendix B: State Machine

```
                    ┌─────────────┐
         ┌─────────►│   QUEUED    │◄────────┐
         │          └──────┬──────┘         │
         │                 │                │
         │         show UI │                │
         │                 ▼                │
         │          ┌─────────────┐         │
         │          │  REVIEWING  │         │
         │          └──────┬──────┘         │
         │                 │                │
         │    ┌────────────┼────────────┐   │
         │    │            │            │   │
         │    ▼            ▼            ▼   │
         │ ┌──────┐   ┌────────┐   ┌──────┐│
         │ │ACCEPT│   │ REJECT │   │PARTIAL│
         │ └──┬───┘   └───┬────┘   └──┬───┘│
         │    │           │           │    │
         │    └───────────┴───────────┘    │
         │                 │                │
         │              apply               │
         │                 │                │
         │                 ▼                │
         │          ┌─────────────┐         │
         └──────────│   APPLIED   │─────────┘
                    └─────────────┘
```

---

*Document Version: 1.0*
*Last Updated: 2025-02-10*
*Author: Prometheus (Planning Agent)*
