# OpenCode VSCode Extension - Activation & Diff Display Analysis

## Executive Summary

The OpenCode VSCode extension provides a custom diff viewer for reviewing code changes. This document explains how the extension activates, watches for state changes, and displays diffs through a CustomTextEditorProvider with webview-based rendering.

---

## 1. Extension Activation Mechanism

### Activation Events (package.json)

```json
{
  "activationEvents": [
    "onCommand:opencodeChangeViewer.openDiff",
    "onView:opencode.pendingChanges"
  ]
}
```

The extension activates when either:
1. **Command activation**: User runs the command `OpenCode: Open Diff Viewer` from the command palette
2. **View activation**: The "Pending Changes" sidebar view becomes visible

### Activation Flow (extension.ts)

```typescript
export function activate(context: vscode.ExtensionContext): void {
  console.log('OpenCode Change Viewer extension is now active');

  // Register command handler
  const openDiffCommand = vscode.commands.registerCommand(
    'opencodeChangeViewer.openDiff',
    () => { /* ... */ }
  );
  context.subscriptions.push(openDiffCommand);

  // Register accept/reject commands
  registerAcceptRejectCommands(context);

  // Register navigation commands (vim-style keys)
  registerNavigationCommands(context);

  // Register custom editor provider for .diff files
  const providerRegistration = OpenCodeDiffEditorProvider.register(context);
  context.subscriptions.push(providerRegistration);

  // Register pending changes tree view
  const pendingChangesProvider = registerPendingChangesTreeView(context);
  context.subscriptions.push(pendingChangesProvider);
}
```

---

## 2. State File Watching

### State File Location

The extension watches for changes in the workspace at:
```
{workspaceRoot}/.opencode/.diff-plugin-state.json
```

### File Watcher Setup (diff-editor-provider.ts)

```typescript
private async setupStateWatching(webviewPanel: vscode.WebviewPanel): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const stateFilePath = path.join(workspaceRoot, '.opencode', '.diff-plugin-state.json');
  const stateFilePattern = new vscode.RelativePattern(
    workspaceRoot,
    '.opencode/.diff-plugin-state.json'
  );

  // Initialize StateSync for reading state
  this.stateSync = new StateSync(stateFilePath, 'vscode-extension');

  // Create VSCode file system watcher
  this.fileWatcher = vscode.workspace.createFileSystemWatcher(stateFilePattern);

  // Watch for file changes
  this.fileWatcher.onDidChange(async () => {
    console.log('[OpenCodeDiffEditorProvider] State file changed, reloading...');
    await this.loadAndSendState(webviewPanel);
  });

  // Watch for file creation
  this.fileWatcher.onDidCreate(async () => {
    console.log('[OpenCodeDiffEditorProvider] State file created, reloading...');
    await this.loadAndSendState(webviewPanel);
  });
}
```

### State File Format (state-sync.ts)

```typescript
interface StateFileData {
  version: string;      // "1.0"
  timestamp: number;
  sessionID: string;
  changes: unknown[];   // Array of PendingChange objects
}
```

---

## 3. CustomTextEditorProvider Implementation

### Registration

```typescript
export class OpenCodeDiffEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'opencode.diffViewer';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new OpenCodeDiffEditorProvider(context);
    
    return vscode.window.registerCustomEditorProvider(
      OpenCodeDiffEditorProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,  // Keeps editor state when tab is switched
        },
      }
    );
  }
}
```

### Document Resolution Flow

When a `.diff` file is opened, VSCode calls `resolveCustomTextEditor`:

```typescript
public async resolveCustomTextEditor(
  document: vscode.TextDocument,
  webviewPanel: vscode.WebviewPanel,
  _token: vscode.CancellationToken
): Promise<void> {
  // 1. Configure webview security
  webviewPanel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
      vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
      vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', 'monaco-editor', 'min')),
    ],
  };

  // 2. Load HTML with embedded React app
  webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

  // 3. Set context for keyboard shortcuts
  vscode.commands.executeCommand('setContext', 'opencode.diffViewerActive', true);

  // 4. Setup state file watching
  await this.setupStateWatching(webviewPanel);

  // 5. Setup message handling between webview and extension
  this.setupMessageHandling(webviewPanel, document);

  // 6. Register panel for command handling
  registerWebViewPanel(webviewPanel);
  registerNavigationPanel(webviewPanel);

  // 7. Send initial theme and load data
  this.sendThemeToWebview(webviewPanel);
  
  // Load either raw diff file or state-based diff
  const isRawDiff = document.fileName.endsWith('.diff') || document.fileName.endsWith('.patch');
  if (isRawDiff) {
    await this.loadRawDiff(webviewPanel, document);
  } else {
    await this.loadAndSendState(webviewPanel);
  }
}
```

---

## 4. Message Passing Protocol

### Extension → Webview Messages

```typescript
type ExtensionMessage =
  | { type: 'stateUpdate'; changes: unknown[] }
  | { type: 'error'; message: string }
  | { type: 'themeChange'; theme: 'light' | 'dark' | 'high-contrast' }
  | { type: 'navigate'; direction: 'nextLine' | 'prevLine' | 'nextHunk' | 'prevHunk' | 'nextFile' | 'prevFile' };
```

**Sending from Extension:**
```typescript
// State update
const message: ExtensionMessage = {
  type: 'stateUpdate',
  changes: changes.map((change) => change.toJSON()),
};
webviewPanel.webview.postMessage(message);

// Theme change broadcast
private broadcastThemeChange(): void {
  const theme = this.getCurrentTheme();
  for (const panel of this.webviewPanels) {
    if (panel.visible) {
      panel.webview.postMessage({ type: 'themeChange', theme });
    }
  }
}
```

### Webview → Extension Messages

```typescript
type WebViewMessage =
  | { type: 'acceptLine'; lineId: string }
  | { type: 'rejectLine'; lineId: string }
  | { type: 'acceptHunk'; hunkIndex: number }
  | { type: 'rejectHunk'; hunkIndex: number }
  | { type: 'acceptAll' }
  | { type: 'rejectAll' }
  | { type: 'applyChanges' }
  | { type: 'ready' };
```

**Sending from Webview (index.tsx):**
```typescript
// Accept line action
const handleLineAccept = (hunkIndex: number, lineIndex: number) => {
  const lineKey = `${hunkIndex}:${lineIndex}`;
  setLineStates(prev => { /* ... */ });

  if (typeof vscode !== 'undefined') {
    vscode.postMessage({
      type: 'acceptLine',
      lineKey,
      hunkIndex,
      lineIndex,
    });
  }
};

// Accept all changes
const handleAcceptAll = () => {
  // Update local state
  setLineStates(prev => { /* ... */ });

  // Notify extension
  if (typeof vscode !== 'undefined') {
    vscode.postMessage({ type: 'acceptAll' });
  }
};
```

**Receiving in Extension (diff-editor-provider.ts):**
```typescript
private setupMessageHandling(webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument): void {
  webviewPanel.webview.onDidReceiveMessage(async (message: WebViewMessage) => {
    switch (message.type) {
      case 'ready':
        await this.loadAndSendState(webviewPanel);
        break;
      case 'acceptLine':
        await this.handleAcceptLine(message.lineId);
        break;
      case 'rejectLine':
        await this.handleRejectLine(message.lineId);
        break;
      case 'acceptHunk':
        await this.handleAcceptHunk(message.hunkIndex);
        break;
      case 'acceptAll':
        await this.handleAcceptAll();
        break;
      // ... etc
    }
  });
}
```

---

## 5. How the Extension Knows When to Show the Diff Viewer

### Automatic Trigger Mechanism

1. **State File Presence**: The extension watches `.opencode/.diff-plugin-state.json`
2. **Tree View Visibility**: The "Pending Changes" sidebar appears when `workspaceHasOpencodeChanges` context is true
3. **File Association**: Double-clicking `.diff` or `.patch` files opens the custom editor

### Pending Changes Tree View

```typescript
// Tree view shows when this context is true (package.json)
"when": "workspaceHasOpencodeChanges"

// Context is set by the StateSync when changes are detected
```

The tree view displays:
- File names with status icons (pending/mixed/accepted/rejected)
- Clicking a file opens the diff viewer
- Shows accepted/rejected/pending counts per file

---

## 6. Manual Trigger Methods for Testing

### Method 1: Command Palette
```
Cmd+Shift+P → "OpenCode: Open Diff Viewer"
```

### Method 2: Open a .diff File
```bash
# Create a test diff file
cat > test.diff << 'EOF'
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 modified
 line 3
EOF

# Open in VSCode
code test.diff
```

### Method 3: Create State File Manually
```bash
mkdir -p .opencode
cat > .opencode/.diff-plugin-state.json << 'EOF'
{
  "version": "1.0",
  "timestamp": 1704067200000,
  "sessionID": "test-session",
  "changes": [
    {
      "id": "test-change-1",
      "tool": "file_write",
      "filePath": "/path/to/file.ts",
      "oldContent": "const x = 1;\nconst y = 2;",
      "newContent": "const x = 1;\nconst y = 3;",
      "sessionID": "test-session",
      "callID": "call-1",
      "timestamp": 1704067200000,
      "lineStates": {}
    }
  ]
}
EOF
```

### Method 4: VSCode Command (from another extension)
```typescript
await vscode.commands.executeCommand('opencodeChangeViewer.openDiff');
```

---

## 7. Debug/Development Modes

### Console Logging

The extension logs extensively to the VSCode developer console:

```typescript
console.log('[OpenCodeDiffEditorProvider] State file changed, reloading...');
console.log('[AcceptRejectCommands] Accept line:', args);
console.log('[NavigationCommands] Next hunk');
console.log('[StateSync] State written successfully:', changes.length, 'changes');
```

**View logs:**
1. Open VSCode Command Palette: `Cmd+Shift+P`
2. Run: `Developer: Toggle Developer Tools`
3. Look for `[OpenCode...]` prefixed messages in Console

### Debug Configuration

The StateSync class has a debug mode:

```typescript
const stateSync = new StateSync(stateFilePath, sessionID, { debug: true });
```

When enabled, logs all file operations and state changes.

### Webview Development

The webview is a React app that can be developed independently:

```bash
cd ide/vscode
npm run dev  # Watches and rebuilds both extension and webview
```

Webview source: `webview/src/index.tsx`
Webview build output: `media/diff-viewer.js`

---

## 8. Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension Host                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Extension  │  │    State     │  │   Tree View      │  │
│  │    (main)    │──│    Sync      │──│  (Sidebar)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                   │                              │
│         │ registers         │ watches                      │
│         ▼                   ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │  CustomTextEditorProvider            │                 │
│  │  - OpenCodeDiffEditorProvider        │                 │
│  │  - Manages webview lifecycle         │                 │
│  │  - Handles file watching             │                 │
│  └──────────────────────────────────────┘                 │
│         │                                                  │
│         │ creates                                          │
│         ▼                                                  │
│  ┌──────────────────────────────────────┐                 │
│  │        Webview Panel                 │                 │
│  │  ┌────────────────────────────────┐ │                 │
│  │  │   React App (diff-viewer.js)   │ │                 │
│  │  │  ┌────────┐  ┌──────────────┐  │ │                 │
│  │  │  │  Diff  │  │   Changes    │  │ │                 │
│  │  │  │ Editor │  │   Sidebar    │  │ │                 │
│  │  │  │(Monaco)│  │              │  │ │                 │
│  │  │  └────────┘  └──────────────┘  │ │                 │
│  │  └────────────────────────────────┘ │                 │
│  └──────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ postMessage / onMessage
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              .opencode/.diff-plugin-state.json              │
│         (Shared state between OpenCode and VSCode)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Key Files Reference

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point, registers all components |
| `src/diff-editor-provider.ts` | CustomTextEditorProvider implementation |
| `src/tree-view.ts` | Pending changes sidebar |
| `src/shared/state-sync.ts` | File watching and state persistence |
| `src/shared/state-manager.ts` | PendingChange and ChangeQueue classes |
| `src/commands/acceptReject.ts` | Accept/reject command handlers |
| `src/commands/navigation.ts` | Vim-style navigation commands |
| `webview/src/index.tsx` | React webview entry point |
| `webview/src/components/DiffViewer.tsx` | Monaco diff editor wrapper |
| `package.json` | Extension manifest with activation events |

---

## Summary for Testing

To manually test the diff viewer:

1. **Activate extension**: Run command `OpenCode: Open Diff Viewer`
2. **Create state file**: Put JSON at `.opencode/.diff-plugin-state.json`
3. **Or open diff file**: Open any `.diff` or `.patch` file
4. **Watch console**: Open Developer Tools to see extension logs
5. **Use keyboard shortcuts**: 
   - `j/k` - Navigate lines
   - `]/[` - Navigate hunks
   - `l/p` - Navigate files
   - `y/n` - Accept/Reject line (webview)
   - `Y/N` - Accept/Reject all (webview)

The extension automatically detects changes to the state file and updates the webview in real-time.
