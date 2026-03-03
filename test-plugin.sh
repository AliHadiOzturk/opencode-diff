#!/bin/bash

echo "=========================================="
echo "OpenCode Diff Plugin - Comprehensive Test"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "1. Checking OpenCode CLI..."
if command -v opencode &> /dev/null; then
    VERSION=$(opencode --version 2>/dev/null)
    check_pass "OpenCode CLI found (version: $VERSION)"
else
    check_fail "OpenCode CLI not found"
    exit 1
fi

echo ""
echo "2. Checking Global Config..."
if [ -f ~/.config/opencode/opencode.json ]; then
    if grep -q '"plugins"' ~/.config/opencode/opencode.json; then
        check_pass "Global config has 'plugins' key"
        if grep -q '"opencode-diff"' ~/.config/opencode/opencode.json; then
            check_pass "Global config has 'opencode-diff' plugin"
        else
            check_fail "Global config missing 'opencode-diff' plugin"
        fi
    else
        check_fail "Global config missing 'plugins' key"
    fi
else
    check_fail "Global config not found"
fi

echo ""
echo "3. Checking Project Config..."
if [ -f opencode.json ]; then
    if grep -q '"plugins"' opencode.json; then
        check_pass "Project config has 'plugins' key"
    else
        check_fail "Project config missing 'plugins' key"
    fi
else
    check_warn "Project config not found (optional)"
fi

echo ""
echo "4. Checking Plugin Installation..."
if [ -d ~/.opencode/node_modules/opencode-diff ]; then
    check_pass "Plugin installed in OpenCode's node_modules"
    if [ -f ~/.opencode/node_modules/opencode-diff/dist/index.js ]; then
        check_pass "Plugin dist/index.js exists"
    else
        check_fail "Plugin dist/index.js missing"
    fi
else
    check_fail "Plugin not in OpenCode's node_modules"
fi

echo ""
echo "5. Checking Plugin Config..."
if [ -f .opencode/diff-plugin.json ]; then
    check_pass "Plugin config exists"
    if grep -q '"enabled": true' .opencode/diff-plugin.json; then
        check_pass "Plugin is enabled"
    else
        check_fail "Plugin is disabled"
    fi
else
    check_warn "Plugin config not found"
fi

echo ""
echo "6. Testing Plugin Load..."
node --input-type=module -e "
import plugin from '~/.opencode/node_modules/opencode-diff/dist/index.js';
if (typeof plugin === 'function') {
    console.log('Plugin loads successfully');
    process.exit(0);
} else {
    console.error('Plugin did not load as expected');
    process.exit(1);
}
" 2>/dev/null
if [ $? -eq 0 ]; then
    check_pass "Plugin can be loaded"
else
    check_fail "Plugin failed to load"
fi

echo ""
echo "7. Checking VSCode Extension..."
if [ -f ide/vscode/dist/extension.js ]; then
    check_pass "VSCode extension is built"
else
    check_warn "VSCode extension not built (run 'npm run build' in ide/vscode/)"
fi

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Restart OpenCode completely"
echo "2. Run: export DEBUG=opencode-diff-plugin"
echo "3. Run: opencode"
echo "4. Ask OpenCode to create a file"
echo "5. Check for [DiffPlugin] log messages"
echo ""
