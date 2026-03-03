# Basic Example - OpenCode Diff Plugin

This example demonstrates the basic usage of the OpenCode Diff Plugin with a simple TypeScript project.

## Project Structure

```
examples/basic/
├── README.md                    # This file
├── opencode-diff-config.json    # Sample plugin configuration
├── src/
│   ├── calculator.ts           # Example TypeScript file
│   └── utils.ts                # Utility functions
└── demo/
    └── sample-diff.txt         # Sample diff output
```

## Quick Start

### 1. Install the Plugin

```bash
# In your main project
npm install opencode-diff-plugin
```

### 2. Copy Configuration

Copy the sample configuration to your workspace:

```bash
cp opencode-diff-config.json /path/to/your/workspace/.opencode/diff-plugin.json
```

### 3. Run the Example

Use OpenCode to edit the sample files and see the diff plugin in action:

```bash
# Navigate to your workspace
cd /path/to/your/workspace

# Use OpenCode with the plugin enabled
opencode --plugin opencode-diff-plugin
```

## Configuration

The sample configuration (`opencode-diff-config.json`) demonstrates:

- **Auto-accept patterns** - Automatically accept lock files
- **Auto-reject patterns** - Automatically reject minified files
- **Theme settings** - Use dark theme with line numbers
- **Custom keybindings** - Add your own keyboard shortcuts

## Sample Files

### calculator.ts

A simple calculator class that OpenCode can modify. Try asking OpenCode to:

- Add error handling
- Add more operations (power, square root)
- Convert to a module pattern
- Add unit tests

### utils.ts

Utility functions that demonstrate various change types:

- Line additions
- Line deletions
- Line modifications
- Context lines

## Usage Scenarios

### Scenario 1: Accept All Changes

When you're confident in OpenCode's changes:

1. OpenCode proposes edits
2. Diff viewer appears
3. Press `A` to accept all changes
4. Changes are applied

### Scenario 2: Selective Acceptance

When you want to review each change:

1. OpenCode proposes edits
2. Diff viewer appears
3. Navigate with `j`/`k` or arrows
4. Press `y` to accept line, `n` to reject
5. Use `h`/`r` for hunk-level actions
6. Press `q` when done

### Scenario 3: Auto-Accept Patterns

Configure patterns for files you always want to accept:

```json
{
  "autoAccept": ["package-lock.json", "yarn.lock", "*.lock"]
}
```

Lock files will be automatically accepted without showing the diff viewer.

## Keyboard Navigation Demo

Try these keyboard shortcuts with the example:

```
Line Level:
  y - Accept current line
  n - Reject current line

Hunk Level:
  h - Accept entire hunk
  r - Reject entire hunk
  [ - Previous hunk
  ] - Next hunk

File Level:
  a - Accept entire file
  d - Reject entire file

Navigation:
  j/k or ↑/↓ - Move up/down
  g - Go to top
  G - Go to bottom
  PageDown/Space - Page down
  PageUp/Shift+Space - Page up

Actions:
  u - Undo last action
  Ctrl+r - Redo
  ? - Toggle help
  q - Quit
```

## Expected Output

When OpenCode edits `calculator.ts`, you'll see:

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  src/calculator.ts                                            +8/-2 lines ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  [Accept All] [Reject All]                                    1 hunk      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║ @@ -1,6 +1,12 @@                                                         ║
║   1 │   1 │ class Calculator {                                           ║
║   2 │   2 │   add(a: number, b: number): number {                        ║
║   3 │   3 │     return a + b;                                            ║
║     │   4 │+  }                                                          ║
║     │   5 │+                                                             ║
║     │   6 │+  subtract(a: number, b: number): number {                    ║
║     │   7 │+    return a - b;                                            ║
║   4 │   8 │   }                                                          ║
║   5 │   9 │ }                                                            ║
║   6 │  10 │                                                              ║
║     │  11 │+export default Calculator;                                   ║
║                                                                           ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  [y]accept [n]reject │ [h]accept hunk [r]reject hunk │ [q]uit [?]help     ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

## Troubleshooting

### Plugin Not Activating

1. Check that the plugin is installed globally or in your project
2. Verify the configuration file exists at `.opencode/diff-plugin.json`
3. Ensure `enabled` is set to `true`

### Keyboard Shortcuts Not Working

1. Make sure your terminal is focused
2. Try using arrow keys instead of `j`/`k`
3. Check that no other process is capturing keyboard input

### Theme Looks Wrong

1. Try setting theme explicitly: `"theme": "dark"`
2. Check your terminal's color support: `echo $TERM`
3. Should show `xterm-256color` or similar

## Next Steps

After trying this basic example:

1. **Customize Configuration** - Edit `.opencode/diff-plugin.json`
2. **Try Complex Changes** - Ask OpenCode for multi-file refactors
3. **Add Custom Keybindings** - Map your preferred keys
4. **Explore Features** - Try undo/redo, hunk navigation

## See Also

- [Main README](../../README.md) - Full documentation
- [Contributing Guide](../../CONTRIBUTING.md) - Development setup
- [Configuration Reference](../../README.md#configuration) - All options
