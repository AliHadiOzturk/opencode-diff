# Draft: OpenCode Line-by-Line Diff Plugin

## Research Findings

### OpenCode Plugin Architecture
- **Location**: `.opencode/plugins/` (project) or `~/.config/opencode/plugins/` (global)
- **Format**: JavaScript/TypeScript modules exporting plugin functions
- **Key Events Available**:
  - `file.edited` - Fires when file is modified
  - `tool.execute.before` / `tool.execute.after` - Hook into tool execution
  - `session.diff` - Fires when session shows diff
  - `tui.prompt.append` - Can inject UI into TUI
  - `tui.toast.show` - Can show notifications
- **Plugin API**: Receives context with `project`, `client`, `$`, `directory`, `worktree`
- **TypeScript**: `@opencode-ai/plugin` package provides types

### Diff Parsing & Display Libraries
1. **parse-git-diff** (npm): Simple unified diff parser, 0 dependencies
2. **git-diff-view** by MrWangJustToDo: 
   - Full-featured React/Vue/Solid/Svelte components
   - Widget system for custom interactions
   - Supports line-level widgets (perfect for accept/reject)
   - Syntax highlighting via Shiki or lowlight
   - Split and unified views
3. **react-diff-view**: Mature React component for unified diffs
4. **jsdiff**: Myers algorithm implementation for computing diffs

### GitHub PR Review Patterns
- **Data Model**: 
  - File-level: path, status (added/modified/deleted)
  - Hunk-level: Groups of adjacent changes with context
  - Line-level: oldLineNum, newLineNum, type (add/remove/context)
- **Selection State**: Each line can have state (accepted/rejected/pending)
- **Bulk Actions**: Accept all, reject all, accept file, reject file
- **UI Patterns**: Checkboxes per line, toolbar with actions, keyboard shortcuts

### Agentic Tool Patterns
- **Aider**: Shows git diff, asks for confirmation before applying
- **Cursor**: Inline diff with accept/reject buttons in gutter
- **Claude Code**: File changes shown in chat, confirms before write
- **Common Pattern**: Intercept write operations, show diff, wait for user approval

## Proposed Architecture

### Plugin Structure
```
opencode-diff-plugin/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main plugin entry
│   ├── diff-manager.ts       # Tracks pending changes
│   ├── diff-parser.ts        # Parses git diff format
│   ├── diff-renderer.ts      # Renders diff in TUI
│   ├── state-manager.ts      # Manages line-level state
│   └── ui/
│       ├── diff-view.ts      # Main diff view component
│       ├── line-widget.ts    # Accept/reject widget
│       └── toolbar.ts        # Bulk actions toolbar
└── styles/
    └── diff.css
```

### Core Components

1. **Diff Interceptor** (`tool.execute.before`)
   - Intercepts `write` and `edit` tool calls
   - Captures proposed changes
   - Prevents immediate execution
   - Stores in pending changes queue

2. **Diff Parser**
   - Uses `parse-git-diff` to parse unified diffs
   - Converts to internal representation
   - Tracks file, hunks, and lines

3. **State Manager**
   - Line-level state: `pending` | `accepted` | `rejected`
   - Hunk-level state (derived from lines)
   - File-level state (derived from hunks)
   - Persistence during session

4. **Diff Renderer (TUI)**
   - Renders unified diff with syntax highlighting
   - Shows line numbers (old and new)
   - Shows widgets for accept/reject per line
   - Shows toolbar for bulk actions
   - Keyboard navigation

5. **Action Handlers**
   - Accept line: Mark line as accepted
   - Reject line: Mark line as rejected, restore original
   - Accept hunk: Accept all lines in hunk
   - Accept file: Accept all changes in file
   - Accept all: Accept all pending changes

### User Flow

1. **OpenCode initiates file change** (write/edit)
2. **Plugin intercepts** via `tool.execute.before`
3. **Plugin captures** old content, new content, generates diff
4. **Plugin shows** diff view in TUI via `tui.prompt.append`
5. **User reviews** changes line by line
6. **User accepts/rejects** individual lines or in bulk
7. **Plugin applies** accepted changes only
8. **Plugin rejects** changes (restores original for rejected lines)

### Data Structures

```typescript
interface PendingChange {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: ParsedDiff;
  lineStates: Map<number, LineState>;
  status: 'pending' | 'applied' | 'rejected';
  timestamp: number;
}

interface LineState {
  lineNumber: number;
  type: 'context' | 'add' | 'remove';
  oldLineNum: number | null;
  newLineNum: number | null;
  content: string;
  state: 'pending' | 'accepted' | 'rejected';
}

interface ParsedDiff {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: LineState[];
}
```

### Technical Decisions

- **Diff Library**: Use `parse-git-diff` for parsing, `@git-diff-view/core` for rendering
- **UI Framework**: Pure terminal UI via OpenCode TUI events (not React in TUI)
- **State Storage**: In-memory Map, persisted to session storage
- **Performance**: Show diffs in chunks for large files (>1000 lines)
- **Keyboard Shortcuts**: 
  - `y` - Accept line
  - `n` - Reject line
  - `a` - Accept all in current file
  - `r` - Reject all in current file
  - `j/k` - Navigate lines
  - `q` - Quit review (apply accepted, reject pending)

## Open Questions

1. Should rejected lines be restored to original or just omitted?
2. How to handle partial hunk acceptance (when lines in a hunk are mixed accepted/rejected)?
3. Should there be a config option to enable/disable the plugin?
4. How to handle binary files or very large diffs?
5. Should there be a git commit integration option?
