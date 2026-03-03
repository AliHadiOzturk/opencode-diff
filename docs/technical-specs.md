# OpenCode Diff Plugin - Technical Specifications

## Component Specifications

### 1. Plugin Entry Point

**File**: `src/index.ts`

**Purpose**: Initialize plugin, register OpenCode hooks, manage lifecycle

**Interface**:
```typescript
interface PluginContext {
  project: ProjectInfo;
  directory: string;
  worktree: string;
  client: OpenCodeClient;
  $: BunShell;
}

interface PluginHooks {
  'tool.execute.before': ToolInterceptorFn;
  'tool.execute.after': ToolConfirmationFn;
  'session.diff': DiffHandlerFn;
  'file.edited': FileEditHandlerFn;
  'session.idle': CleanupFn;
}

type DiffPlugin = (ctx: PluginContext) => Promise<PluginHooks>;
```

**Lifecycle**:
1. OpenCode loads plugin from `.opencode/plugins/`
2. Calls default export function with PluginContext
3. Plugin initializes dependencies
4. Returns hooks object
5. OpenCode registers hooks
6. Hooks fire when corresponding events occur

**Error Handling**:
- If config fails to load: Use defaults, log warning
- If dependencies fail: Disable plugin gracefully
- If hook errors: Log error, don't crash OpenCode

---

### 2. Tool Interceptor

**File**: `src/interceptor.ts`

**Purpose**: Intercept write/edit tool calls, capture changes, present for review

**Class Specification**:

```typescript
class ToolInterceptor {
  constructor(deps: InterceptorDependencies);
  
  // Hook implementations
  async before(input: ToolInput, output: ToolOutput): Promise<void>;
  async after(input: ToolInput, output: ToolOutput): Promise<void>;
  async handleSessionDiff(diff: DiffInfo): Promise<void>;
  async handleFileEdit(event: FileEditEvent): Promise<void>;
  
  // Internal methods
  private shouldIntercept(tool: string): boolean;
  private shouldAutoAccept(filePath: string): boolean;
  private shouldAutoReject(filePath: string): boolean;
  private async captureOriginal(filePath: string): Promise<string>;
  private async showReviewUI(change: PendingChange): Promise<void>;
  private async applyChanges(change: PendingChange): Promise<void>;
  private async rejectChanges(change: PendingChange): Promise<void>;
  private reconstructContent(change: PendingChange): string;
  private extractToolArgs(input: ToolInput): ToolArgs;
}
```

**Hook: tool.execute.before**

**Input**: 
- `input.tool`: Tool name ('write', 'edit', 'patch')
- `input.args`: Tool arguments (filePath, content, oldString, newString)
- `output`: Mutable output object

**Output**: 
- Throws `InterceptedError` to prevent execution
- Returns normally to allow execution

**Logic Flow**:
1. Check if tool is interceptable
2. Check auto-accept patterns (allow if match)
3. Check auto-reject patterns (throw if match)
4. Check file size limits (allow if over)
5. Capture original file content
6. Generate unified diff
7. Create PendingChange
8. Add to ChangeQueue
9. Show review UI
10. Throw InterceptedError

**Performance Requirements**:
- Must complete in < 100ms for files < 1MB
- Non-blocking for auto-accepted files
- Fail fast on errors

**Security Requirements**:
- Validate file paths (prevent directory traversal)
- Block access to sensitive paths (.git/, .env, etc.)
- Don't persist content longer than session

---

### 3. Diff Engine

**File**: `src/diff-engine.ts`

**Purpose**: Generate and parse unified diffs, compute line-by-line changes

**Class Specification**:

```typescript
class DiffEngine {
  constructor(config: ConfigManager);
  
  // Core methods
  generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): ParsedDiff;
  
  // Utility methods
  detectStatus(oldContent: string, newContent: string): FileStatus;
  getLanguage(filePath: string): string | null;
  
  // Private helpers
  private enrichDiff(parsed: ParsedGitDiff, status: FileStatus): ParsedDiff;
  private computeLineNumbers(hunk: Hunk): void;
}
```

**Algorithm**: Myers Difference Algorithm (via `diff` library)

**Time Complexity**: O(ND) where N = lines in old, D = diff size

**Space Complexity**: O(N + D)

**ParsedDiff Structure**:

```typescript
interface ParsedDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: Hunk[];
  stats: {
    additions: number;
    deletions: number;
    changes: number;
  };
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
  position: number;
}
```

**Generation Steps**:
1. Compute diff using Myers algorithm
2. Generate unified diff format
3. Parse with parse-git-diff
4. Enrich with line numbers
5. Calculate statistics
6. Return structured diff

**Edge Cases**:
- New file: oldContent empty, all lines 'add'
- Deleted file: newContent empty, all lines 'remove'
- Empty file: Single empty line handling
- No changes: Return empty diff

**Performance Requirements**:
- Files < 1000 lines: < 50ms
- Files < 10000 lines: < 200ms
- Files > 10000 lines: Use streaming, show progress

---

### 4. State Manager

**File**: `src/state-manager.ts`

**Purpose**: Track acceptance state for every line in a change

**Class Specifications**:

```typescript
class StateManager {
  private queue: ChangeQueue;
  
  constructor();
  getQueue(): ChangeQueue;
  async cleanup(): Promise<void>;
}

class ChangeQueue {
  private changes: Map<string, PendingChange>;
  
  add(change: PendingChange): void;
  get(id: string): PendingChange | undefined;
  getByFilePath(filePath: string): PendingChange | undefined;
  getAll(): PendingChange[];
  getPending(): PendingChange[];
  markApplied(filePath: string): void;
  remove(id: string): void;
  clear(): void;
  get size(): number;
}

class PendingChange {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: ParsedDiff;
  timestamp: number;
  status: ChangeStatus;
  
  private lineStates: Map<string, LineState>;
  
  constructor(data: PendingChangeData);
  
  setLineState(lineId: string, state: LineState): void;
  getLineState(lineId: string): LineState;
  getAcceptedCount(): number;
  getRejectedCount(): number;
  getPendingCount(): number;
  getHunkState(hunkIndex: number): HunkState;
  getFileState(): FileState;
  toJSON(): object;
}
```

**State Transitions**:

```
PENDING --accept()--> ACCEPTED
PENDING --reject()--> REJECTED
```

**Aggregation Rules**:

- **Hunk State**: 
  - All lines accepted → 'accepted'
  - All lines rejected → 'rejected'
  - Mixed → 'partial'

- **File State**:
  - All hunks accepted → 'accepted'
  - All hunks rejected → 'rejected'
  - Mixed → 'partial'

**Data Persistence**:
- In-memory only (session scope)
- No disk persistence required
- Cleanup on session.idle event

**Memory Requirements**:
- Per line: ~50 bytes (id + state)
- 1000 lines: ~50KB
- 10000 lines: ~500KB
- No memory leaks (cleaned on session end)

---

### 5. TUI Renderer

**File**: `src/ui/tui-renderer.ts`

**Purpose**: Render diff view in OpenCode's terminal UI

**Class Specification**:

```typescript
class TUIRenderer {
  private client: OpenCodeClient;
  private config: ConfigManager;
  private currentChange: PendingChange | null;
  private currentLineIndex: number;
  
  constructor(client: OpenCodeClient, config: ConfigManager);
  
  // Rendering
  async render(change: PendingChange): Promise<void>;
  async updateLineState(change: PendingChange, lineId: string, state: LineState): Promise<void>;
  async updateHunkState(change: PendingChange, hunkIndex: number, state: LineState): Promise<void>;
  
  // Private render helpers
  private renderHeader(change: PendingChange): string;
  private renderToolbar(): string;
  private renderStats(change: PendingChange): string;
  private renderDiff(change: PendingChange): string;
  private renderLine(line: DiffLine, isCurrent: boolean, state: LineState): string;
  private renderFooter(): string;
  
  // Navigation
  moveCursor(delta: number): void;
  getCurrentLine(): { hunkIndex: number; lineIndex: number } | null;
}
```

**Rendering Pipeline**:

1. **Header**: File path, progress indicator
2. **Toolbar**: Action buttons
3. **Stats**: Accepted/rejected/pending counts
4. **Diff Content**: 
   - Hunk headers
   - Lines with line numbers
   - State indicators
   - Current line highlight
5. **Footer**: Keyboard shortcuts

**Color Scheme**:

```typescript
const colors = {
  added: { fg: '#2ea043', bg: 'rgba(46, 160, 67, 0.15)' },
  removed: { fg: '#f85149', bg: 'rgba(248, 81, 73, 0.15)' },
  context: { fg: '#d4d4d4', bg: 'transparent' },
  cursor: '#264f78',
  header: '#79c0ff',
  muted: '#6e7681'
};
```

**Update Strategy**:
- Full re-render on state change (simpler)
- Future optimization: Incremental updates
- Debounce rapid changes (50ms)

**Performance Requirements**:
- Render < 100ms for 1000 lines
- Virtual scrolling for > 1000 lines
- Responsive at 60fps

---

### 6. Keyboard Handler

**File**: `src/ui/keyboard-handler.ts`

**Purpose**: Handle keyboard input for navigation and actions

**Class Specification**:

```typescript
class KeyboardHandler {
  private bindings: KeybindingConfig;
  private handlers: Map<string, KeyHandler>;
  private eventEmitter: EventEmitter;
  
  constructor(bindings: KeybindingConfig);
  
  // Registration
  on(key: string, handler: KeyHandler): void;
  on(event: 'navigate', handler: (direction: number) => void): void;
  on(event: 'acceptLine' | 'rejectLine', handler: () => void): void;
  on(event: 'acceptHunk' | 'rejectHunk', handler: () => void): void;
  on(event: 'acceptFile' | 'rejectFile', handler: () => void): void;
  on(event: 'quit' | 'help', handler: () => void): void;
  
  // Handling
  handle(key: string): boolean;
  
  // Help
  getHelpText(): string;
  
  // Private
  private setupDefaultHandlers(): void;
  private emit(event: string, ...args: any[]): void;
}
```

**Default Keybindings**:

| Action | Key | Description |
|--------|-----|-------------|
| Navigate down | j | Move cursor to next line |
| Navigate up | k | Move cursor to previous line |
| Accept line | y | Accept current line |
| Reject line | n | Reject current line |
| Accept hunk | h | Accept all lines in current hunk |
| Reject hunk | r | Reject all lines in current hunk |
| Accept file | a | Accept all changes in file |
| Reject file | d | Reject all changes in file |
| Quit | q | Finish review and apply |
| Help | ? | Show keyboard shortcuts |

**Event System**:
- Decoupled from UI rendering
- Events: 'navigate', 'acceptLine', 'rejectLine', etc.
- Interceptor registers handlers

**Accessibility**:
- All actions have keyboard alternatives
- No mouse required
- Clear visual feedback

---

### 7. Configuration Manager

**File**: `src/config.ts`

**Purpose**: Load, validate, and provide configuration

**Class Specification**:

```typescript
class ConfigManager {
  private config: PluginConfig;
  
  constructor(config: PluginConfig);
  
  // Static factory
  static async load(projectDir: string): Promise<ConfigManager>;
  
  // Getters
  get enabled(): boolean;
  get autoAccept(): string[];
  get autoReject(): string[];
  get maxFileSize(): number;
  get maxTotalSize(): number;
  get theme(): Theme;
  get showLineNumbers(): boolean;
  get showWhitespace(): boolean;
  get wrapLines(): boolean;
  get confirmRejectAll(): boolean;
  get confirmBulkActions(): boolean;
  get defaultAction(): DefaultAction;
  get keybindings(): KeybindingConfig;
  
  getConfig(): PluginConfig;
  
  // Validation
  private validate(config: unknown): PluginConfig;
  private mergeDefaults(userConfig: Partial<PluginConfig>): PluginConfig;
}
```

**Configuration Schema**:

```typescript
interface PluginConfig {
  enabled: boolean;
  autoAccept: string[];      // Glob patterns
  autoReject: string[];      // Glob patterns
  maxFileSize: number;       // Bytes
  maxTotalSize: number;      // Bytes
  theme: 'light' | 'dark' | 'auto';
  showLineNumbers: boolean;
  showWhitespace: boolean;
  wrapLines: boolean;
  confirmRejectAll: boolean;
  confirmBulkActions: boolean;
  defaultAction: 'prompt' | 'accept' | 'reject';
  keybindings: KeybindingConfig;
}

interface KeybindingConfig {
  acceptLine: string;
  rejectLine: string;
  acceptHunk: string;
  rejectHunk: string;
  acceptFile: string;
  rejectFile: string;
  nextLine: string;
  prevLine: string;
  quit: string;
  help: string;
}
```

**Configuration File Location**:
- Primary: `.opencode/diff-plugin.json`
- Global fallback: `~/.config/opencode/diff-plugin.json`

**Validation Rules**:
- `maxFileSize`: Positive integer, default 1MB
- `theme`: Must be 'light', 'dark', or 'auto'
- `keybindings`: Single character strings only
- `autoAccept`/`autoReject`: Valid glob patterns

**Defaults**:

```typescript
const defaultConfig: PluginConfig = {
  enabled: true,
  autoAccept: ['*.md', '*.txt', '*.json'],
  autoReject: [],
  maxFileSize: 1024 * 1024,
  maxTotalSize: 10 * 1024 * 1024,
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

---

## API Specifications

### OpenCode Plugin API

**Hook: tool.execute.before**

```typescript
type ToolInterceptorFn = (
  input: {
    tool: string;
    args: Record<string, any>;
  },
  output: {
    args: Record<string, any>;
    [key: string]: any;
  }
) => Promise<void> | void;
```

**Hook: tool.execute.after**

```typescript
type ToolConfirmationFn = (
  input: ToolInput,
  output: ToolOutput
) => Promise<void> | void;
```

**Hook: session.diff**

```typescript
type DiffHandlerFn = (diff: {
  files: string[];
  changes: ChangeInfo[];
}) => Promise<void> | void;
```

**Hook: file.edited**

```typescript
type FileEditHandlerFn = (event: {
  filePath: string;
  timestamp: number;
}) => Promise<void> | void;
```

**Hook: session.idle**

```typescript
type CleanupFn = () => Promise<void> | void;
```

### OpenCode Client API

```typescript
interface OpenCodeClient {
  app: {
    log(entry: LogEntry): Promise<void>;
    notify(notification: Notification): Promise<void>;
    showDiffReview(options: DiffReviewOptions): Promise<void>;
  };
  tui: {
    prompt: {
      append(content: PromptContent): Promise<void>;
      clear(): Promise<void>;
    };
  };
}
```

---

## Error Handling Specifications

### Error Types

```typescript
enum PluginErrorType {
  INTERCEPTED = 'INTERCEPTED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  BINARY_FILE = 'BINARY_FILE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PARSE_ERROR = 'PARSE_ERROR',
  APPLY_ERROR = 'APPLY_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR'
}

class PluginError extends Error {
  constructor(
    public type: PluginErrorType,
    message: string,
    public context?: any,
    public recoverable: boolean = false
  ) {
    super(message);
  }
}
```

### Error Recovery Strategies

| Error Type | Recovery | User Impact |
|------------|----------|-------------|
| INTERCEPTED | Normal flow | None (expected) |
| FILE_TOO_LARGE | Skip review, apply directly | Warning shown |
| BINARY_FILE | Skip review, apply directly | Warning shown |
| PERMISSION_DENIED | Skip file, continue | Error notification |
| PARSE_ERROR | Fallback to simple diff | Warning shown |
| APPLY_ERROR | Restore from backup | Error notification |
| CONFIG_ERROR | Use defaults | Warning shown |

### Error Logging

```typescript
interface ErrorLog {
  timestamp: Date;
  type: PluginErrorType;
  message: string;
  context?: any;
  stack?: string;
}

// Log to OpenCode's logging system
await client.app.log({
  body: {
    service: 'diff-plugin',
    level: 'error',
    message: error.message,
    extra: { type: error.type, context: error.context }
  }
});
```

---

## Performance Specifications

### Time Budgets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Plugin init | < 100ms | 500ms |
| Intercept check | < 10ms | 50ms |
| Diff generation (< 1K lines) | < 50ms | 100ms |
| Diff generation (< 10K lines) | < 200ms | 500ms |
| UI render (< 1K lines) | < 100ms | 200ms |
| State update | < 10ms | 50ms |
| Apply changes | < 50ms | 100ms |

### Memory Limits

| Resource | Limit |
|----------|-------|
| Per line state | 50 bytes |
| Per file (1K lines) | 50 KB |
| Per file (10K lines) | 500 KB |
| Total session | 100 MB |

### Optimization Strategies

1. **Lazy Loading**: Don't generate diff until user opens file
2. **Virtual Scrolling**: Only render visible lines
3. **Debouncing**: Batch UI updates (50ms)
4. **Caching**: Cache parsed diffs
5. **Streaming**: Stream large files in chunks

---

## Security Specifications

### Path Validation

```typescript
const BLOCKED_PATTERNS = [
  /\.git\//,
  /\.env$/,
  /\.env\./,
  /node_modules\//,
  /\.ssh\//,
  /\.opencode\//
];

function validatePath(filePath: string, baseDir: string): boolean {
  // Check for directory traversal
  const resolved = path.resolve(baseDir, filePath);
  if (!resolved.startsWith(baseDir)) {
    return false;
  }
  
  // Check blocked patterns
  if (BLOCKED_PATTERNS.some(p => p.test(filePath))) {
    return false;
  }
  
  return true;
}
```

### Content Validation

```typescript
function isBinaryFile(content: Buffer): boolean {
  // Check for null bytes in first 1024 bytes
  return content.slice(0, 1024).includes(0);
}

function validateContent(content: string): boolean {
  // Check for excessive size
  if (content.length > 100 * 1024 * 1024) { // 100MB
    return false;
  }
  return true;
}
```

### Data Sanitization

- Don't log full file contents
- Don't persist diffs to disk
- Clear memory on session end
- No network requests

---

## Testing Specifications

### Unit Test Coverage

| Component | Coverage Target |
|-----------|----------------|
| DiffEngine | 90% |
| StateManager | 90% |
| ConfigManager | 80% |
| ToolInterceptor | 85% |
| TUIRenderer | 70% |
| KeyboardHandler | 80% |

### Test Categories

1. **Unit Tests**: Individual functions
2. **Integration Tests**: Component interactions
3. **E2E Tests**: Full workflow
4. **Performance Tests**: Time/memory benchmarks

### Test Scenarios

**DiffEngine Tests**:
- New file (all additions)
- Deleted file (all deletions)
- Modified file (mixed changes)
- Empty file
- No changes
- Large file (> 10K lines)
- Binary file detection

**StateManager Tests**:
- Set/get line state
- Hunk aggregation
- File aggregation
- Mixed states
- Edge cases (empty hunks)

**ToolInterceptor Tests**:
- Intercept write tool
- Intercept edit tool
- Auto-accept pattern matching
- Auto-reject pattern matching
- File size limits
- Path validation

---

## Deployment Specifications

### Package Structure

```
opencode-diff-plugin/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts
│   ├── interceptor.ts
│   ├── diff-engine.ts
│   ├── state-manager.ts
│   ├── config.ts
│   └── ui/
│       ├── tui-renderer.ts
│       ├── keyboard-handler.ts
│       └── widgets.ts
├── tests/
│   ├── unit/
│   └── integration/
└── examples/
    └── basic/
```

### Dependencies

**Production**:
- `@opencode-ai/plugin`: ^1.0.0 (peer dependency)
- `diff`: ^5.1.0 (diff generation)
- `parse-git-diff`: ^0.0.19 (diff parsing)
- `chalk`: ^5.3.0 (terminal colors)
- `minimatch`: ^9.0.3 (glob patterns)

**Development**:
- `typescript`: ^5.0.0
- `bun-types`: latest
- `@types/bun`: latest

### Build Process

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Build
bun run build

# Test
bun test

# Package
bun run package
```

### Distribution

- **npm**: `opencode-diff-plugin`
- **GitHub**: Releases with compiled JS
- **OpenCode Registry**: `opencode.ai/plugins`

---

*Document Version: 1.0*
*Last Updated: 2025-02-10*
*Author: Prometheus (Planning Agent)*
