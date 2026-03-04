# Local Installation Guide

Complete instructions for installing and testing the OpenCode Diff Plugin with the VSCode extension on your local machine.

## 📋 Prerequisites

- **Node.js 18+** or **Bun 1.0+**
- **VSCode** (or AntiGravity)
- **OpenCode CLI** installed globally

## 🔧 Step 1: Build the Plugin

```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin

# Install dependencies (if not already done)
bun install

# Build the plugin
bun run build

# Run tests to verify
bun test
```

**Expected output:**
```
125 pass
0 fail
242 expect() calls
```

## 🔧 Step 2: Build the VSCode Extension

```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/ide/vscode

# Install dependencies
npm install

# Build the extension
npm run build
```

**Expected output:**
```
webpack 5.105.2 compiled successfully
```

## 🔧 Step 3: Configure OpenCode to Use the Plugin

### Option A: Global Installation (Recommended for Development)

Add to your global OpenCode config at `~/.opencode/config.json`:

```json
{
  "plugins": [
    "/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin"
  ]
}
```

**Alternative: Use the NPX setup script for global installation:**

```bash
npx opencode-diff setup --global
```

This will:
- Install `opencode-diff` globally
- Create `~/.opencode/config.json` with plugin reference
- Make the plugin available in all projects automatically

### Option B: Project-Specific Installation

Add to your project's `.opencode/config.json`:

```json
{
  "plugins": [
    "/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin"
  ]
}
```

**Or use the NPX setup script for local installation:**

```bash
npx opencode-diff setup
```

### Global vs Local Installation

**Global Installation Benefits:**
- ✓ Plugin available in all projects without per-project installation
- ✓ Single source of truth for plugin version
- ✓ Easier to update across all projects
- ✓ No need to add to each project's `package.json`
- ✓ Each project can still have its own `.opencode/diff-plugin.json` for customization

**Local Installation Benefits:**
- ✓ Project-specific plugin version control
- ✓ Self-contained project (all dependencies in project)
- ✓ Better for CI/CD environments
- ✓ Other team members get the same version via `package.json`

## 🔧 Step 4: Enable IDE Integration

Create the plugin configuration file in your test project:

```bash
cd /path/to/your/test-project
mkdir -p .opencode
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  },
  "autoAccept": ["package-lock.json", "yarn.lock", "*.lock"],
  "autoReject": [],
  "maxFileSize": 1048576,
  "theme": "auto",
  "showLineNumbers": true
}
EOF
```

## 🔧 Step 5: Load VSCode Extension

### Method 1: Development Mode (Recommended for Testing)

```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/ide/vscode
code .
```

Then in VSCode:
1. Press **F5** (or go to Run → Start Debugging)
2. This opens an "Extension Development Host" window
3. In the new window, open your test project

### Method 2: Install as VSIX

```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/ide/vscode

# Package the extension (requires vsce)
npx vsce package

# This creates opencode-change-viewer-0.1.0.vsix

# Install in VSCode:
# 1. Go to Extensions view
# 2. Click "..." (More Actions)
# 3. Select "Install from VSIX"
# 4. Choose the .vsix file
```

## 🧪 Step 6: Test the Integration

### Test 1: Basic File Creation

1. **In VSCode**: Open your test project
2. **Open Terminal**: Use OpenCode to create a file
   ```bash
   opencode "Create a simple hello world function in hello.js"
   ```

3. **Expected behavior**:
   - OpenCode should propose the change
   - Plugin intercepts and shows: `[DiffPlugin] Intercepting tool call: write`
   - State file is created: `.opencode/.diff-plugin-state.json`
   - VSCode shows "Pending Changes" sidebar with `hello.js`
   - Click on file to open diff viewer

### Test 2: File Edit

1. **Create an existing file**:
   ```bash
   echo "function old() { return 1; }" > test.js
   ```

2. **Ask OpenCode to edit**:
   ```bash
   opencode "Update test.js to return 42 instead of 1"
   ```

3. **Expected behavior**:
   - Diff viewer shows old vs new content
   - Accept/Reject buttons work
   - File is updated when you accept

### Test 3: Enable Debug Logging

To see detailed logs, set the environment variable:

```bash
# In terminal before running OpenCode:
export DEBUG=opencode-diff-plugin*

# Then run OpenCode
opencode "Create a new file"
```

**You'll see logs like:**
```
[DiffPlugin] [INFO] Initializing...
[DiffPlugin] [DEBUG] Plugin context { directory: '/path', hasShell: true }
[Interceptor] [INFO] Intercepting tool call { tool: 'write', filePath: 'test.js', callID: '...' }
[Interceptor] [DEBUG] Content computed { isNewFile: true, oldContentLength: 0, newContentLength: 45 }
[DiffPlugin] [INFO] Change queued successfully { changeId: '...', filePath: 'test.js', pendingCount: 1 }
```

## 🐛 Debugging

### Check if plugin is loaded:
```bash
# Look for plugin initialization logs
opencode "list plugins" 2>&1 | grep -i diff
```

### Check state file:
```bash
# Should contain pending changes
cat .opencode/.diff-plugin-state.json

# Expected format:
{
  "version": "1.0",
  "timestamp": 1234567890,
  "sessionID": "...",
  "changes": [...]
}
```

### Check VSCode extension logs:
1. In VSCode: **Cmd+Shift+P** → "Developer: Toggle Developer Tools"
2. Go to **Console** tab
3. Filter by "OpenCode" or "DiffPlugin"

## 🔄 Multi-IDE / Multi-Project Workflow

You can safely use the extension across multiple projects with different editors:

```
Project A/          Project B/
├── .opencode/      ├── .opencode/
│   └── .diff-      │   └── .diff-
│       plugin-     │       plugin-
│       state.json  │       state.json
└── (VSCode)        └── (AntiGravity)
```

Each project maintains its own isolated state file. Changes in Project A won't affect Project B, even when using different editors.

**To verify this is working:**
1. Make a change in Project A → State file appears only in Project A
2. Make a change in Project B → State file appears only in Project B
3. Accept/reject in either editor → Only that project's files are affected

### Common Issues:

**Issue: Plugin not intercepting**
- Check if plugin is enabled in config: `"enabled": true`
- Verify plugin path is correct in OpenCode config
- Check logs for configuration errors

**Issue: VSCode not showing pending changes**
- Verify state file path matches in both plugin and VSCode extension
- Check VSCode Developer Console for errors
- Ensure you're using Extension Development Host (F5) if in dev mode

**Issue: Changes not applying**
- Check file permissions
- Verify state file is writable
- Look for errors in VSCode console when clicking Accept

## 📁 Project Structure Reference

```
opencode-change-viewer/
├── opencode-diff-plugin/          # Main plugin
│   ├── src/
│   │   ├── index.ts              # Plugin entry point
│   │   ├── interceptor.ts        # Tool interception
│   │   ├── state-manager.ts      # Change queue management
│   │   ├── state-sync.ts         # File persistence
│   │   ├── config.ts             # Configuration
│   │   └── debug.ts              # Debug logging utility
│   ├── dist/                     # Compiled output
│   └── examples/basic/           # Example project
│
├── ide/vscode/                   # VSCode extension
│   ├── src/
│   │   ├── extension.ts          # Extension entry
│   │   ├── tree-view.ts          # Pending changes sidebar
│   │   ├── diff-editor-provider.ts # Diff viewer
│   │   └── commands/             # Accept/Reject commands
│   ├── out/                      # Compiled output
│   └── dist/                     # Packaged extension
│
└── .sisyphus/plans/              # Work plans
```

## 🔄 Development Workflow

### Making changes to plugin:
```bash
cd opencode-diff-plugin
# Edit files in src/
bun run build
# Test with OpenCode
```

### Making changes to VSCode extension:
```bash
cd ide/vscode
# Edit files in src/
npm run build
# Press F5 in VSCode to reload Extension Development Host
```

### Testing both together:
1. Make changes to plugin
2. Run `bun run build` in plugin directory
3. Make changes to VSCode extension
4. Run `npm run build` in vscode directory
5. Press F5 in VSCode to test
6. Run OpenCode commands in the Extension Development Host

## 🎉 Success Criteria

You've successfully installed everything when:

1. ✅ All tests pass (`bun test` in plugin directory)
2. ✅ Plugin builds without errors (`bun run build`)
3. ✅ VSCode extension builds successfully (`npm run build`)
4. ✅ OpenCode loads the plugin (see initialization logs)
5. ✅ File edits are intercepted (see `[DiffPlugin] Intercepting` logs)
6. ✅ State file is created (`.opencode/.diff-plugin-state.json`)
7. ✅ VSCode shows pending changes sidebar
8. ✅ Diff viewer opens when clicking a file
9. ✅ Accept/Reject buttons work and update files

## 🆘 Getting Help

If something doesn't work:
1. Check this document's **Debugging** section
2. Enable debug logging with `DEBUG=opencode-diff-plugin*`
3. Check all three log sources:
   - Terminal (OpenCode/plugin output)
   - `.opencode/.diff-plugin-state.json` (state file)
   - VSCode Developer Console
4. File an issue with logs and reproduction steps
