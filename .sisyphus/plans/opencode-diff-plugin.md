# OpenCode Line-by-Line Diff Review Plugin

## TL;DR

**Goal**: Create an OpenCode plugin that intercepts all AI-generated file changes and presents them as line-by-line diffs for user review, with granular accept/reject capabilities.

**Key Features**:
- Intercept `write`/`edit` tool calls before they execute
- Display unified diff with syntax highlighting in TUI
- Line-level accept/reject with visual widgets
- Bulk actions: accept all, reject all, accept file
- Keyboard-driven navigation (vim-style)
- Session-persistent state

**Deliverables**:
1. Core plugin package (`opencode-diff-plugin`)
2. Diff interception hooks (`tool.execute.before`)
3. TUI diff viewer component
4. State management system
5. Configuration system
6. Example usage and documentation

**Estimated Effort**: Large (5-7 days)
**Parallel Execution**: NO - sequential dependencies
**Critical Path**: Plugin skeleton → Interceptor → Parser → Renderer → State Manager → UI → Polish

---

## Context

### Original Request
Create an OpenCode plugin that shows every AI change as git-style diffs with line-by-line accept/reject capability. Users should be able to accept all changes at once or review line by line.

### Research Findings

#### OpenCode Plugin System
- Plugins are JS/TS modules in `.opencode/plugins/` or `~/.config/opencode/plugins/`
- Hook into events: `file.edited`, `tool.execute.before/after`, `tui.prompt.append`
- Context includes: `project`, `client`, `$` (Bun shell), `directory`, `worktree`
- Can use `@opencode-ai/plugin` for TypeScript types
- Events fire sequentially, plugins can modify output

#### Diff Libraries Analysis
- **parse-git-diff**: Lightweight parser, 0 dependencies, perfect for parsing unified diffs
- **git-diff-view**: Full-featured component library with widget system, supports React/Vue/Solid
- **jsdiff**: Myers algorithm implementation for computing text diffs
- **Recommendation**: Use `parse-git-diff` + custom TUI renderer (OpenCode TUI doesn't support React components directly)

#### GitHub PR Review Patterns
- **Line-level granularity**: Each line tracked individually
- **Hunk grouping**: Adjacent changes grouped with context lines
- **State model**: `pending` → `accepted`/`rejected`
- **Bulk actions**: Toolbar with accept all/reject all per file
- **Visual indicators**: +/- prefixes, background colors, checkboxes

### Metis Review

**Identified Gaps** (addressed in plan):
1. **Gap**: How to intercept file changes
   - **Resolution**: Use `tool.execute.before` hook for `write` and `edit` tools
   
2. **Gap**: How to show UI in OpenCode TUI
   - **Resolution**: Use `tui.prompt.append` event to inject custom diff view
   
3. **Gap**: What happens to rejected lines
   - **Resolution**: Restore original content for rejected lines, apply only accepted
   
4. **Gap**: Handling partial hunk acceptance
   - **Resolution**: Split hunks when lines have mixed states

---

## Work Objectives

### Core Objective
Build an OpenCode plugin that intercepts AI file modifications, displays them as interactive line-by-line diffs, and allows users to selectively accept or reject changes before they're applied to the filesystem.

### Concrete Deliverables
1. **Plugin Package** (`opencode-diff-plugin/`)
   - `src/index.ts` - Main plugin entry point
   - `src/interceptor.ts` - Tool execution interceptor
   - `src/diff-engine.ts` - Diff generation and parsing
   - `src/state-manager.ts` - Line-level state management
   - `src/ui/diff-view.ts` - TUI diff rendering
   - `src/ui/widgets.ts` - Accept/reject widgets
   - `src/config.ts` - Configuration handling
   - `package.json` with `@opencode-ai/plugin` dependency

2. **Core Features**
   - Automatic interception of `write` and `edit` tool calls
   - Unified diff display with line numbers
   - Syntax highlighting for common languages
   - Line-level accept/reject toggle
   - Hunk-level accept/reject
   - File-level accept all/reject all
   - Global accept all/reject all
   - Keyboard navigation (j/k, y/n, a/r)

3. **Configuration**
   - Enable/disable plugin
   - Default action (prompt/accept all/reject all)
   - Auto-accept patterns (e.g., *.md, *.txt)
   - Max file size threshold
   - Theme settings

4. **Documentation**
   - README with installation instructions
   - Configuration reference
   - Keyboard shortcuts cheat sheet
   - Example workflows

### Definition of Done
- [ ] Plugin intercepts all file writes and edits
- [ ] Diff displays correctly with syntax highlighting
- [ ] Users can accept/reject individual lines
- [ ] Bulk actions work (all, file, hunk)
- [ ] Keyboard navigation functions
- [ ] State persists through session
- [ ] Configuration system works
- [ ] Documentation complete
- [ ] Example project demonstrates usage

### Must Have
- Line-by-line accept/reject
- Unified diff display
- Keyboard navigation
- Bulk accept/reject
- Integration with OpenCode events

### Must NOT Have (Guardrails)
- NO automatic application without review (unless configured)
- NO blocking of critical system files (.git/, node_modules/)
- NO persistence across sessions (restarts with fresh state)
- NO modification of binary files
- AI-Slop Pattern: Over-engineering UI - keep it simple, terminal-native
- AI-Slop Pattern: Excessive abstractions - direct integration preferred

---

## Verification Strategy

### Test Infrastructure Decision
- **Infrastructure exists**: NO (this is a new plugin)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: `bun test` (built-in)
- **Agent-Executed QA**: YES (primary verification method)

### Agent-Executed QA Scenarios (MANDATORY)

Each task includes QA scenarios verified by the executing agent using interactive_bash (tmux) and Bash tools.

**Example QA Pattern for UI Tasks**:
```
Scenario: Diff view renders with line widgets
  Tool: interactive_bash (tmux)
  Preconditions: Plugin installed, test file with changes ready
  Steps:
    1. Open OpenCode TUI with test project
    2. Trigger AI to edit a file
    3. Wait for diff view to appear (timeout: 10s)
    4. Assert: Diff view visible with file path header
    5. Assert: Lines show +/- indicators
    6. Assert: Widgets show [Y] [N] for changed lines
    7. Send: 'q' to exit diff view
    8. Assert: Returns to normal TUI
  Evidence: .sisyphus/evidence/task-N-diff-render.png
```

---

## Execution Strategy

### Sequential Execution (No Parallelism)

This plugin requires tight integration between components. Each task builds on the previous:

```
Wave 1 (Foundation):
└── Task 1: Plugin skeleton and package setup

Wave 2 (Core Engine):
└── Task 2: Tool interception hooks

Wave 3 (Diff Processing):
└── Task 3: Diff generation and parsing

Wave 4 (State Management):
└── Task 4: Line-level state tracking

Wave 5 (UI):
└── Task 5: TUI diff view rendering

Wave 6 (Interactions):
└── Task 6: Keyboard handlers and widgets

Wave 7 (Bulk Actions):
└── Task 7: Accept all, reject all, hunk actions

Wave 8 (Configuration):
└── Task 8: Config system and polish

Wave 9 (Documentation):
└── Task 9: Docs and examples
```

### Critical Path
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9

---

## TODOs

### Task 1: Plugin Skeleton and Package Setup

**What to do**:
- Create plugin directory structure
- Initialize npm package with TypeScript
- Install dependencies (`@opencode-ai/plugin`, `parse-git-diff`, `diff`)
- Set up TypeScript configuration
- Create main plugin entry point with basic structure
- Add basic logging

**Must NOT do**:
- Don't implement actual hooks yet
- Don't add complex abstractions
- Don't create UI components

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `git-master`
- **Reason**: Quick scaffolding task, needs proper git init

**Parallelization**:
- **Can Run In Parallel**: NO (first task)
- **Blocked By**: None
- **Blocks**: Task 2

**References**:
- OpenCode docs: https://opencode.ai/docs/plugins/ - Plugin structure
- `@opencode-ai/plugin` npm package - Type definitions
- `parse-git-diff` npm - Diff parsing library

**Acceptance Criteria**:
- [ ] Plugin directory created at `opencode-diff-plugin/`
- [ ] `package.json` exists with correct dependencies
- [ ] `tsconfig.json` configured
- [ ] `src/index.ts` exports plugin function
- [ ] Plugin loads in OpenCode without errors

**Agent-Executed QA**:
```
Scenario: Plugin loads without errors
  Tool: Bash
  Preconditions: OpenCode installed
  Steps:
    1. Create .opencode/plugins/opencode-diff-plugin/ directory
    2. Copy plugin files
    3. Run: cd .opencode/plugins/opencode-diff-plugin && bun install
    4. Assert: Install completes without errors
    5. Start OpenCode in test project
    6. Assert: Plugin initializes (check logs if available)
  Evidence: Terminal output showing successful load
```

**Commit**: YES
- Message: `chore(plugin): initial plugin skeleton`
- Files: `opencode-diff-plugin/*`

---

### Task 2: Tool Interception Hooks

**What to do**:
- Implement `tool.execute.before` hook
- Detect `write` and `edit` tool invocations
- Capture proposed changes (file path, old content, new content)
- Store in pending changes queue
- Prevent original tool execution (throw or modify output)
- Implement `tool.execute.after` to confirm applied changes

**Must NOT do**:
- Don't show UI yet (just log to console)
- Don't handle edge cases (binary, large files) yet
- Don't apply any changes

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None specific
- **Reason**: Complex hook logic, requires careful implementation

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 1
- **Blocks**: Task 3

**References**:
- OpenCode docs: Events section - `tool.execute.before` hook
- Edit tool source: https://github.com/tencent-source/opencode/blob/main/packages/opencode/src/tool/edit.ts
- Write tool source: https://github.com/tencent-source/opencode/blob/main/packages/opencode/src/tool/write.ts

**Acceptance Criteria**:
- [ ] Hook intercepts `write` tool calls
- [ ] Hook intercepts `edit` tool calls
- [ ] Captures file path and content
- [ ] Logs "Intercepted: {filePath}" to console
- [ ] Prevents original write from executing
- [ ] Stores change in pending queue

**Agent-Executed QA**:
```
Scenario: Plugin intercepts file write
  Tool: interactive_bash (tmux)
  Preconditions: Plugin installed, OpenCode running
  Steps:
    1. In OpenCode TUI, ask AI: "Create a file test.txt with content 'hello'"
    2. Wait for AI to attempt write (timeout: 30s)
    3. Assert: Console shows "Intercepted: test.txt"
    4. Assert: File test.txt does NOT exist yet
    5. Check pending queue has the change
  Evidence: Terminal output capture

Scenario: Plugin intercepts file edit
  Tool: interactive_bash (tmux)
  Preconditions: Plugin installed, existing file to edit
  Steps:
    1. Create test file: echo "original" > test-edit.txt
    2. Ask AI: "Change test-edit.txt to say 'modified'"
    3. Wait for AI to attempt edit (timeout: 30s)
    4. Assert: Console shows "Intercepted: test-edit.txt"
    5. Assert: File still contains "original"
  Evidence: Terminal output capture
```

**Commit**: YES
- Message: `feat(interceptor): intercept write and edit tools`
- Files: `src/interceptor.ts`, `src/index.ts`

---

### Task 3: Diff Generation and Parsing

**What to do**:
- Implement diff generation using `diff` library (Myers algorithm)
- Generate unified diff format
- Parse diff with `parse-git-diff`
- Create internal representation (files, hunks, lines)
- Handle edge cases: new files, deleted files, empty files
- Add syntax highlighting detection (file extension mapping)

**Must NOT do**:
- Don't integrate with UI yet
- Don't handle line-level state
- Don't worry about performance optimization

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None specific
- **Reason**: Algorithmic work with diff libraries

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 2
- **Blocks**: Task 4

**References**:
- `diff` npm package: https://www.npmjs.com/package/diff
- `parse-git-diff` npm: https://www.npmjs.com/package/parse-git-diff
- Unified diff format spec

**Acceptance Criteria**:
- [ ] Can generate unified diff from old/new content
- [ ] Can parse unified diff to structured data
- [ ] Handles new files (all lines added)
- [ ] Handles deleted files (all lines removed)
- [ ] Detects language from file extension
- [ ] Unit tests pass for diff generation

**Agent-Executed QA**:
```
Scenario: Generate and parse diff for modified file
  Tool: Bash
  Steps:
    1. Create test with oldContent="line1\nline2\nline3" newContent="line1\nmodified\nline3"
    2. Run diff generation
    3. Assert: Output contains unified diff format
    4. Parse the diff
    5. Assert: Parsed result has 1 file, 1 hunk
    6. Assert: Hunk has 3 lines (1 context, 1 removed, 1 added)

Scenario: Handle new file
  Tool: Bash
  Steps:
    1. Generate diff with oldContent="" newContent="new file content"
    2. Parse diff
    3. Assert: Parsed result shows file as added
    4. Assert: All lines are type 'add'
```

**Commit**: YES
- Message: `feat(diff-engine): generate and parse unified diffs`
- Files: `src/diff-engine.ts`, `src/__tests__/diff-engine.test.ts`

---

### Task 4: State Management System

**What to do**:
- Implement `PendingChange` class to track a single change
- Implement `ChangeQueue` to manage multiple pending changes
- Create line-level state tracking (`pending` | `accepted` | `rejected`)
- Implement state transitions with validation
- Add methods: acceptLine, rejectLine, acceptHunk, acceptFile, acceptAll
- Implement applyChanges() to write accepted lines to disk
- Implement rejectChanges() to restore rejected lines

**Must NOT do**:
- Don't persist to disk (session-only)
- Don't integrate with UI yet
- Don't handle complex merge scenarios

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None specific
- **Reason**: State machine logic, requires careful design

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 3
- **Blocks**: Task 5

**References**:
- State management patterns in OpenCode core

**Acceptance Criteria**:
- [ ] Can create PendingChange with file info
- [ ] Can set line state individually
- [ ] Can accept/reject entire hunks
- [ ] Can accept/reject entire files
- [ ] applyChanges() writes only accepted content
- [ ] rejectChanges() restores original for rejected lines
- [ ] State is immutable (returns new state)

**Agent-Executed QA**:
```
Scenario: Accept individual lines
  Tool: Bash
  Steps:
    1. Create PendingChange with diff: old="A\nB\nC" new="A\nX\nC"
    2. Accept line 2 (the changed line)
    3. Apply changes
    4. Assert: Result content is "A\nX\nC"

Scenario: Reject individual lines
  Tool: Bash
  Steps:
    1. Create PendingChange with diff: old="A\nB\nC" new="A\nX\nC"
    2. Reject line 2 (the changed line)
    3. Apply changes
    4. Assert: Result content is "A\nB\nC" (original preserved)

Scenario: Mixed accept/reject in hunk
  Tool: Bash
  Steps:
    1. Create PendingChange: old="A\nB\nC\nD" new="A\nX\nY\nD"
    2. Accept line 2 (X), reject line 3 (Y)
    3. Apply changes
    4. Assert: Result is "A\nX\nC\nD" (X accepted, C preserved, Y rejected)
```

**Commit**: YES
- Message: `feat(state): line-level state management`
- Files: `src/state-manager.ts`, `src/__tests__/state-manager.test.ts`

---

### Task 5: TUI Diff View Rendering

**What to do**:
- Create diff view component for OpenCode TUI
- Render unified diff with proper formatting
- Show file headers with path and stats
- Show hunk headers with line numbers
- Render lines with +/- indicators and colors
- Show line numbers (old and new columns)
- Add basic navigation (scroll up/down)
- Use `tui.prompt.append` to inject view

**Must NOT do**:
- Don't add accept/reject widgets yet
- Don't handle keyboard shortcuts yet
- Don't optimize for large files yet

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: TUI rendering requires UI/UX expertise

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 4
- **Blocks**: Task 6

**References**:
- OpenCode TUI events: `tui.prompt.append`
- Terminal UI best practices
- Git diff color codes ( ANSI colors)

**Acceptance Criteria**:
- [ ] Diff view renders in TUI
- [ ] Shows file path header
- [ ] Shows hunk headers with @@ lines
- [ ] Shows context lines (white)
- [ ] Shows removed lines (red, - prefix)
- [ ] Shows added lines (green, + prefix)
- [ ] Shows old and new line numbers
- [ ] Can scroll through long diffs

**Agent-Executed QA**:
```
Scenario: Render diff in TUI
  Tool: interactive_bash (tmux)
  Preconditions: Plugin installed, pending change queued
  Steps:
    1. Trigger diff view display
    2. Wait for TUI update (timeout: 5s)
    3. Assert: Diff view visible in TUI
    4. Assert: File path shown in header
    5. Assert: Hunk header visible (@@ -1,3 +1,3 @@)
    6. Assert: Lines show +/- prefixes
    7. Assert: Colors visible (green for +, red for -)
    8. Screenshot for visual verification
  Evidence: .sisyphus/evidence/task-5-diff-render.png
```

**Commit**: YES
- Message: `feat(ui): basic diff view rendering`
- Files: `src/ui/diff-view.ts`, `src/ui/colors.ts`

---

### Task 6: Keyboard Handlers and Widgets

**What to do**:
- Add accept/reject widgets next to changeable lines
- Implement keyboard event handlers
- Map keys: `y` (accept line), `n` (reject line)
- Map keys: `j`/`k` (navigate down/up)
- Map keys: `h` (accept hunk), `r` (reject hunk)
- Map keys: `a` (accept file), `d` (reject file)
- Map keys: `q` (quit, apply accepted)
- Show current line indicator (cursor)
- Update state on keypress

**Must NOT do**:
- Don't implement bulk actions yet (just line and hunk)
- Don't add mouse support
- Don't worry about help text yet

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None specific
- **Reason**: Event handling and state updates

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 5
- **Blocks**: Task 7

**References**:
- Terminal key codes
- OpenCode TUI key handling
- Vim-style navigation patterns

**Acceptance Criteria**:
- [ ] Widgets show [Y] [N] next to changeable lines
- [ ] `y` key accepts current line
- [ ] `n` key rejects current line
- [ ] `j`/`k` navigate between lines
- [ ] Visual indicator shows current line
- [ ] State updates when keys pressed
- [ ] Widgets reflect state (e.g., [✓] for accepted)

**Agent-Executed QA**:
```
Scenario: Accept line with 'y' key
  Tool: interactive_bash (tmux)
  Steps:
    1. Open diff view with pending change
    2. Navigate to a changed line
    3. Press 'y'
    4. Assert: Widget changes to [✓] or similar
    5. Assert: Line state updated to 'accepted'

Scenario: Navigate with j/k keys
  Tool: interactive_bash (tmux)
  Steps:
    1. Open diff view with multiple hunks
    2. Press 'j' multiple times
    3. Assert: Cursor moves down line by line
    4. Press 'k'
    5. Assert: Cursor moves up
    6. Assert: Cursor stays within diff bounds
```

**Commit**: YES
- Message: `feat(interaction): keyboard navigation and line widgets`
- Files: `src/ui/widgets.ts`, `src/ui/keyboard.ts`

---

### Task 7: Bulk Actions Toolbar

**What to do**:
- Add toolbar header to diff view
- Show action buttons: Accept All, Reject All, Accept File, Reject File
- Implement acceptAll() - accept all pending changes
- Implement rejectAll() - reject all pending changes
- Implement acceptFile() - accept current file
- Implement rejectFile() - reject current file
- Add confirmation prompt for destructive actions
- Show stats (X accepted, Y rejected, Z pending)

**Must NOT do**:
- Don't add complex UI animations
- Don't persist preferences

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None specific
- **Reason**: UI additions and action handlers

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 6
- **Blocks**: Task 8

**Acceptance Criteria**:
- [ ] Toolbar visible at top of diff view
- [ ] Shows Accept All / Reject All buttons
- [ ] Shows Accept File / Reject File buttons
- [ ] Shows stats (accepted/rejected/pending counts)
- [ ] Confirm prompt on Reject All
- [ ] Actions update state correctly

**Agent-Executed QA**:
```
Scenario: Accept all changes in file
  Tool: interactive_bash (tmux)
  Steps:
    1. Open diff with 5 changes
    2. Click/activate "Accept File" button
    3. Assert: All lines marked accepted
    4. Assert: Stats show "5 accepted, 0 pending"

Scenario: Reject all with confirmation
  Tool: interactive_bash (tmux)
  Steps:
    1. Open diff with changes
    2. Activate "Reject All"
    3. Assert: Confirmation prompt appears
    4. Confirm rejection
    5. Assert: All changes rejected
```

**Commit**: YES
- Message: `feat(actions): bulk accept/reject toolbar`
- Files: `src/ui/toolbar.ts`, `src/ui/diff-view.ts`

---

### Task 8: Configuration System

**What to do**:
- Create config schema with defaults
- Support `.opencode/diff-plugin.json` config file
- Add options:
  - `enabled`: boolean (default: true)
  - `autoAccept`: string[] - glob patterns for auto-accept
  - `autoReject`: string[] - glob patterns for auto-reject
  - `maxFileSize`: number (bytes, default: 1MB)
  - `theme`: 'light' | 'dark' | 'auto'
  - `confirmRejectAll`: boolean (default: true)
- Load config on plugin init
- Apply config to interceptor and UI
- Respect auto-accept patterns (skip review)

**Must NOT do**:
- Don't add hot-reload of config
- Don't add UI for config editing

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
- **Skills**: None specific
- **Reason**: Config loading and validation

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 7
- **Blocks**: Task 9

**Acceptance Criteria**:
- [ ] Config file loads from `.opencode/diff-plugin.json`
- [ ] Default config applied if no file
- [ ] autoAccept patterns work (*.md files skip review)
- [ ] maxFileSize respected (large files skip review)
- [ ] theme affects color scheme

**Agent-Executed QA**:
```
Scenario: Auto-accept based on pattern
  Tool: Bash + interactive_bash (tmux)
  Steps:
    1. Create config: {"autoAccept": ["*.md"]}
    2. Restart OpenCode
    3. Ask AI to edit README.md
    4. Assert: No diff view shown
    5. Assert: Change applied automatically
    6. Ask AI to edit main.ts
    7. Assert: Diff view shown for review
```

**Commit**: YES
- Message: `feat(config): configuration system and auto-accept`
- Files: `src/config.ts`, `README.md`

---

### Task 9: Documentation and Examples

**What to do**:
- Write comprehensive README.md
  - Installation instructions
  - Configuration reference
  - Keyboard shortcuts table
  - Usage examples
  - Troubleshooting
- Create example project in `examples/basic/`
- Add screenshots/GIFs of plugin in action
- Write CONTRIBUTING.md for contributors
- Add JSDoc comments to public APIs

**Must NOT do**:
- Don't create video tutorials (out of scope)
- Don't add excessive branding

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None specific
- **Reason**: Documentation writing

**Parallelization**:
- **Can Run In Parallel**: NO
- **Blocked By**: Task 8
- **Blocks**: None (final task)

**Acceptance Criteria**:
- [ ] README.md complete with all sections
- [ ] Example project works
- [ ] Keyboard shortcuts documented
- [ ] Installation steps tested
- [ ] Screenshots added

**Agent-Executed QA**:
```
Scenario: Example project runs
  Tool: Bash
  Steps:
    1. cd examples/basic
    2. bun install
    3. Copy plugin to .opencode/plugins/
    4. Start OpenCode
    5. Follow example workflow
    6. Assert: Plugin works as documented

Scenario: README instructions work
  Tool: Bash
  Steps:
    1. Follow installation steps in README
    2. Assert: Plugin installs without errors
    3. Follow configuration steps
    4. Assert: Config loads correctly
```

**Commit**: YES
- Message: `docs: comprehensive documentation and examples`
- Files: `README.md`, `CONTRIBUTING.md`, `examples/`

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `chore(plugin): initial plugin skeleton` | `package.json`, `tsconfig.json`, `src/index.ts` |
| 2 | `feat(interceptor): intercept write and edit tools` | `src/interceptor.ts` |
| 3 | `feat(diff-engine): generate and parse unified diffs` | `src/diff-engine.ts`, tests |
| 4 | `feat(state): line-level state management` | `src/state-manager.ts`, tests |
| 5 | `feat(ui): basic diff view rendering` | `src/ui/diff-view.ts` |
| 6 | `feat(interaction): keyboard navigation and line widgets` | `src/ui/widgets.ts`, `src/ui/keyboard.ts` |
| 7 | `feat(actions): bulk accept/reject toolbar` | `src/ui/toolbar.ts` |
| 8 | `feat(config): configuration system and auto-accept` | `src/config.ts` |
| 9 | `docs: comprehensive documentation and examples` | `README.md`, `examples/` |

---

## Success Criteria

### Verification Commands
```bash
# Install plugin
cd opencode-diff-plugin && bun install

# Run tests
bun test

# Test in OpenCode
# 1. Copy plugin to ~/.config/opencode/plugins/
# 2. Start OpenCode
# 3. Ask AI to edit a file
# 4. Verify diff view appears
# 5. Test accept/reject line
# 6. Test bulk actions
# 7. Verify file correctly modified
```

### Final Checklist
- [ ] All 9 tasks complete
- [ ] Plugin intercepts all file changes
- [ ] Diff view renders correctly
- [ ] Line-level accept/reject works
- [ ] Keyboard navigation works
- [ ] Bulk actions work
- [ ] Configuration system works
- [ ] Documentation complete
- [ ] All tests pass
- [ ] Example project functional

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Core                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ write tool   │  │  edit tool   │  │   TUI Renderer   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────▲─────────┘   │
└─────────┼────────────────┼──────────────────┼──────────────┘
          │                │                  │
          │ tool.execute.before      tui.prompt.append
          │                │                  │
┌─────────▼────────────────▼──────────────────▼──────────────┐
│              opencode-diff-plugin                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Interceptor (tool.execute.before)          │   │
│  │  - Capture file path, old content, new content      │   │
│  │  - Queue change in PendingChanges                   │   │
│  │  - Prevent original execution                       │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │           Diff Engine                                │   │
│  │  - Generate unified diff (jsdiff)                   │   │
│  │  - Parse to structured format (parse-git-diff)     │   │
│  │  - Detect syntax language                           │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │           State Manager                              │   │
│  │  - Line-level state tracking                        │   │
│  │  - Hunk-level aggregations                          │   │
│  │  - applyChanges() / rejectChanges()                 │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │           TUI Diff View                              │   │
│  │  - Render diff with colors                          │   │
│  │  - Show widgets [Y] [N]                             │   │
│  │  - Toolbar with bulk actions                        │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │           Keyboard Handler                           │   │
│  │  - j/k navigation                                   │   │
│  │  - y/n accept/reject line                           │   │
│  │  - h/r accept/reject hunk                           │   │
│  │  - a/d accept/reject file                           │   │
│  │  - q quit and apply                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Notes

### Key Technical Decisions

1. **Use `tool.execute.before` hook**: This allows intercepting writes before they happen, giving us complete control over the process.

2. **Session-only state**: Don't persist across OpenCode restarts. Fresh review each session keeps it simple and predictable.

3. **Unified diff format**: Industry standard, familiar to developers, works well with existing tools.

4. **Terminal-native UI**: Use OpenCode's TUI events rather than trying to embed React/Vue. More reliable and consistent with OpenCode's aesthetic.

5. **jsdiff + parse-git-diff**: Compute diffs with jsdiff (Myers algorithm), then parse with parse-git-diff for structured access.

### Performance Considerations

- Large files (>1000 lines): Show summary, offer to skip review
- Many files: Show file list first, review one at a time
- Syntax highlighting: Use simple regex-based for performance (not full AST)

### Future Enhancements (Out of Scope)

- Git integration (commit after review)
- Side-by-side diff view
- Mouse support
- Comment/annotation on lines
- Persistent ignore patterns
- Multi-file review in one view
