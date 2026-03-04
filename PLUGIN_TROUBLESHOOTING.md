# OpenCode Diff Plugin - Troubleshooting Complete

## Summary of Issues Found and Fixed

### 🔴 Critical Issues Fixed

#### 1. Wrong Configuration Key (GLOBAL)
**File**: `~/.config/opencode/opencode.json`
- ❌ Had: `"plugin"` (singular)
- ✅ Fixed to: `"plugins"` (plural)

#### 2. Wrong Package Name (GLOBAL)
**File**: `~/.config/opencode/opencode.json`
- ❌ Had: `"opencode-diff-plugin"`
- ✅ Fixed to: `"opencode-diff"`

#### 3. Wrong Configuration Key (PROJECT)
**File**: `/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode.json`
- ❌ Had: `"plugin"` (singular)
- ✅ Fixed to: `"plugins"` (plural)

#### 4. Broken Plugin File (GLOBAL)
**File**: `~/.config/opencode/plugins/diff-plugin.js`
- ❌ Had a broken standalone plugin file
- ✅ Removed (plugins should be loaded from node_modules)

#### 5. IDE Integration Disabled
**File**: `.opencode/diff-plugin.json`
- ❌ Had: `"ide.enabled": false`
- ✅ Fixed to: `"ide.enabled": true` (for VSCode extension)

---

## Current Configuration Status

### ✅ Global Config (`~/.config/opencode/opencode.json`)
```json
{
  "plugins": [
    "oh-my-opencode@3.5.2",
    "opencode-antigravity-auth@1.6.0",
    "opencode-diff"
  ]
}
```

### ✅ Project Config (`opencode.json`)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-diff"
  ]
}
```

### ✅ Plugin Config (`.opencode/diff-plugin.json`)
```json
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
  "showLineNumbers": true,
  "confirmRejectAll": true,
  "keybindings": []
}
```

### ✅ Plugin Installation
- Location: `node_modules/opencode-diff/`
- Status: ✅ Installed and linked globally
- Version: 0.1.0

---

## How to Test

### Step 1: Restart Everything
```bash
# Kill any running OpenCode processes
pkill -f opencode

# Clear any caches (optional but recommended)
rm -rf ~/.opencode/cache 2>/dev/null || true
```

### Step 2: Test with Debug Mode
```bash
# Navigate to your project
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer

# Run OpenCode with debug logging
export DEBUG=opencode-diff-plugin
opencode
```

### Step 3: Make a Test Change
In OpenCode, ask it to create a file:
```
Create a test file called hello.txt with the content "Hello World"
```

### Step 4: Expected Output
You should see logs like:
```
[DiffPlugin] [INFO] Initializing...
[DiffPlugin] [INFO] Configuration loaded successfully
[DiffPlugin] [INFO] Plugin enabled {...}
[DiffPlugin] [INFO] IDE integration enabled {...}
[DiffPlugin] [INFO] Persistence initialized { pendingCount: 0 }
[DiffPlugin] [INFO] Initialized successfully { hookCount: 2, persistenceEnabled: true }
[Interceptor] [INFO] Intercepting tool call { tool: 'write', filePath: 'hello.txt', ... }
[Interceptor] [INFO] Change queued successfully { changeId: '...', filePath: 'hello.txt', pendingCount: 1 }
```

And the file should NOT be created immediately - it should be intercepted!

### Step 5: Check State File
```bash
# The plugin should create this file:
cat .opencode/.diff-plugin-state.json
```

---

## VSCode Extension

### Current Status
- ✅ Extension is built: `ide/vscode/dist/extension.js`
- ✅ Plugin config has IDE enabled
- ✅ State file path configured

### How It Works
1. Plugin intercepts changes → creates `.opencode/.diff-plugin-state.json`
2. VSCode extension watches this file
3. Extension shows "Pending Changes" sidebar with the files
4. You can accept/reject changes from VSCode

### To Use VSCode Extension
1. Open project in VSCode
2. Run OpenCode with the debug command above
3. Make a file change request
4. Check the "Pending Changes" sidebar in VSCode

---

## What the Plugin Does

### Hooks Registered
1. **`tool.execute.before`**: Intercepts `write` and `edit` tool calls
2. **`tool.execute.after`**: Logs successful tool executions

### How Interception Works
1. When OpenCode tries to write/edit a file
2. Plugin intercepts the call BEFORE it happens
3. Plugin reads the original file content
4. Plugin computes the new content
5. Plugin stores the change in a queue
6. Plugin throws `InterceptedError` to stop the tool
7. File is NOT modified yet!

### Accepting/Rejecting Changes
Changes are stored in `.opencode/.diff-plugin-state.json`. You can:
- View them in VSCode extension sidebar
- Accept/reject individual lines
- Accept/reject entire hunks
- Accept/reject entire files
- Use keyboard shortcuts (j/k for navigation, y/n for accept/reject)

---

## Verification Checklist

- [ ] Global config has `"plugins"` (not `"plugin"`)
- [ ] Project config has `"plugins"` (not `"plugin"`)
- [ ] Plugin package name is `"opencode-diff"` (not `"opencode-diff-plugin"`)
- [ ] Plugin is installed: `ls node_modules/opencode-diff/`
- [ ] Debug mode shows logs: `export DEBUG=opencode-diff-plugin`
- [ ] Changes are intercepted (file not created immediately)
- [ ] State file created: `.opencode/.diff-plugin-state.json`
- [ ] VSCode extension shows "Pending Changes" sidebar

---

## If Still Not Working

### Check 1: Is OpenCode loading plugins?
Run with debug and look for ANY plugin-related output.

### Check 2: Plugin compatibility
OpenCode version: 1.2.15
Plugin version: 0.1.0
These should be compatible.

### Check 3: Reinstall plugin
```bash
npm uninstall opencode-diff
npm install opencode-diff
```

### Check 4: Check global node_modules
```bash
ls -la $(npm root -g)/opencode-diff/
```

### Check 5: Manual plugin test
```bash
node /tmp/test-plugin.mjs
```
(This was already verified working)

---

## Files Modified

1. `~/.config/opencode/opencode.json` - Fixed "plugin" → "plugins", fixed package name
2. `/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode.json` - Fixed "plugin" → "plugins"
3. `/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/.opencode/diff-plugin.json` - Enabled IDE integration
4. `~/.config/opencode/plugins/diff-plugin.js` - Removed broken file

---

## Plugin Flow Diagram

```
User: "Create hello.txt"
  ↓
OpenCode: Calls write tool
  ↓
Plugin (tool.execute.before): Intercepts
  ↓
Plugin: Reads original file (empty for new file)
  ↓
Plugin: Computes new content
  ↓
Plugin: Adds to ChangeQueue
  ↓
Plugin: Throws InterceptedError
  ↓
OpenCode: Tool call blocked!
  ↓
Plugin: Writes state to .opencode/.diff-plugin-state.json
  ↓
VSCode Extension: Detects state file change
  ↓
VSCode: Shows "Pending Changes" sidebar
  ↓
User: Reviews diff in VSCode
  ↓
User: Accepts/rejects changes
  ↓
Plugin: Applies accepted changes to filesystem
```

---

**Last Updated**: March 3, 2026
**Plugin Version**: 0.1.0
**OpenCode Version**: 1.2.15
