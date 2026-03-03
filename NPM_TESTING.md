# Testing with NPM

## Option 1: Local NPM Link (Recommended for Development)

### Step 1: In the plugin directory (already done)
```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin
npm link
```

### Step 2: In your test project
```bash
cd /path/to/your/test-project

# Link the plugin
npm link opencode-diff-plugin

# Create opencode.json
cat > opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-diff-plugin"]
}
EOF

# Create plugin config
mkdir -p .opencode
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
EOF

# Test it
export DEBUG=opencode-diff-plugin*
opencode "create a test file"
```

## Option 2: Direct Path Reference (No npm link needed)

```bash
cd /path/to/your/test-project

# Create opencode.json with direct path
cat > opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin"]
}
EOF

# Create plugin config
mkdir -p .opencode
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
EOF

# Test it
export DEBUG=opencode-diff-plugin*
opencode "create a test file"
```

## Option 3: Install from Local Directory

```bash
cd /path/to/your/test-project

# Install the local plugin
npm install /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin

# Create opencode.json
cat > opencode.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-diff-plugin"]
}
EOF

# Create plugin config
mkdir -p .opencode
cat > .opencode/diff-plugin.json << 'EOF'
{
  "enabled": true,
  "ide": {
    "enabled": true,
    "stateFilePath": ".opencode/.diff-plugin-state.json"
  }
}
EOF

# Test it
export DEBUG=opencode-diff-plugin*
opencode "create a test file"
```

## What Should Happen

When you run `opencode "create a test file"`, you should see:

1. OpenCode loads the plugin from npm
2. Plugin initializes and logs: `[DiffPlugin] [INFO] Initializing...`
3. When OpenCode tries to write a file: `[Interceptor] [INFO] Intercepting tool call...`
4. State file created: `.opencode/.diff-plugin-state.json`
5. VSCode extension detects the state file and shows Pending Changes

## Troubleshooting

If nothing happens:

1. **Check if plugin is installed:**
   ```bash
   npm list opencode-diff-plugin
   ```

2. **Check opencode.json syntax:**
   ```bash
   cat opencode.json | jq .
   ```

3. **Verify the plugin exports:**
   ```bash
   node -e "const p = require('opencode-diff-plugin'); console.log(Object.keys(p));"
   # Should show: ['DiffPlugin', 'ConfigManager', ...]
   ```

4. **Check OpenCode can find the plugin:**
   ```bash
   opencode
   # Look for any plugin loading messages in the output
   ```

## Publishing to NPM (For Distribution)

When you're ready to publish:

```bash
cd /Users/alihadiozturk/workspace/alihadiozturk/projects/opencode-change-viewer/opencode-diff-plugin

# Login to npm
npm login

# Publish
npm publish

# Then users can install with:
# npm install opencode-diff-plugin
```
