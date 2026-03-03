# OpenCode Diff Plugin - UI Design Document

## Overview

This document contains detailed UI mockups, visual specifications, and interaction designs for the OpenCode Line-by-Line Diff Plugin.

## Design Principles

1. **Terminal-Native**: UI must feel natural in a terminal environment
2. **Keyboard-Driven**: All actions accessible via keyboard (no mouse required)
3. **Clear Visual Hierarchy**: Easy to distinguish added/removed/context lines
4. **Minimal Clutter**: Show only essential information
5. **Consistent with OpenCode**: Match OpenCode's TUI aesthetic

---

## Screen 1: Diff View - Main Interface

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Changes                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  📄 src/components/Button.tsx                                                    [1 of 3]   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Toolbar                                                                             │    │
│  │  [Y] Accept All    [N] Reject All    [A] Accept File    [R] Reject File    [?] Help │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Stats:  ✅ 12 accepted  │  ❌ 3 rejected  │  ⏳ 5 pending  │  📊 +15 / -8 lines      │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ╔════════════════════════════════════════════════════════════════════════════════════╗     │
│  ║  HUNK 1 of 3                                                                        ║     │
│  ║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║     │
│  ║                                                                                     ║     │
│  ║  @@ -15,7 +15,7 @@                                                                  ║     │
│  ║    15     import React from 'react';                                                ║     │
│  ║  ► 16 ┃ - import { useState } from 'react';                                         ║     │
│  ║  ░ 16 ┃ + import { useState, useEffect } from 'react';                              ║     │
│  ║    17     import { Button } from './Button';                                        ║     │
│  ║    18     import { cn } from '@/utils';                                             ║     │
│  ║                                                                                     ║     │
│  ║  ┌────────────────────────────────────────────────────────────────────────────────┐ ║     │
│  ║  │ [Y] Accept  [N] Reject                                                          │ ║     │
│  ║  └────────────────────────────────────────────────────────────────────────────────┘ ║     │
│  ║                                                                                     ║     │
│  ╚════════════════════════════════════════════════════════════════════════════════════╝     │
│                                                                                             │
│  ╔════════════════════════════════════════════════════════════════════════════════════╗     │
│  ║  HUNK 2 of 3                                                                        ║     │
│  ║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║     │
│  ║                                                                                     ║     │
│  ║  @@ -45,10 +45,15 @@                                                                ║     │
│  ║    45     export function Button({                                                  ║     │
│  ║    46       children,                                                               ║     │
│  ║    47       variant = 'primary',                                                    ║     │
│  ║    48       ...props                                                                ║     │
│  ║    49     }: ButtonProps) {                                                         ║     │
│  ║    50    ┃+  const [count, setCount] = useState(0);                                  ║     │
│  ║    51    ┃+                                                                          ║     │
│  ║  ✓ 52    ┃+  useEffect(() => {                                                       ║     │
│  ║  ✓ 53    ┃+    console.log('Button rendered:', count);                               ║     │
│  ║  ✓ 54    ┃+  }, [count]);                                                            ║     │
│  ║    55    ┃+                                                                          ║     │
│  ║    56       return (                                                                 ║     │
│  ║    57         <button                                                                ║     │
│  ║    58           className={cn('btn', variant)}                                      ║     │
│  ║    59    ┃-      onClick={() => console.log('clicked')}                              ║     │
│  ║  ✗ 60    ┃+      onClick={() => setCount(c => c + 1)}                               ║     │
│  ║    61           {...props}                                                           ║     │
│  ║    62         >                                                                      ║     │
│  ║    63           {children}                                                           ║     │
│  ║    64         </button>                                                             ║     │
│  ║    65       );                                                                      ║     │
│  ║    66     }                                                                         ║     │
│  ║                                                                                     ║     │
│  ║  ┌────────────────────────────────────────────────────────────────────────────────┐ ║     │
│  ║  │ [H] Accept Hunk  [R] Reject Hunk                                                │ ║     │
│  ║  └────────────────────────────────────────────────────────────────────────────────┘ ║     │
│  ║                                                                                     ║     │
│  ╚════════════════════════════════════════════════════════════════════════════════════╝     │
│                                                                                             │
│  ╔════════════════════════════════════════════════════════════════════════════════════╗     │
│  ║  HUNK 3 of 3 (accepted) ✓                                                           ║     │
│  ║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║     │
│  ║                                                                                     ║     │
│  ║  @@ -78,3 +83,7 @@                                                                  ║     │
│  ║  ✓ 84 ┃+  export default Button;                                                    ║     │
│  ║  ✓ 85 ┃+  export { Button };                                                        ║     │
│  ║  ✓ 86 ┃+  export type { ButtonProps };                                              ║     │
│  ║                                                                                     ║     │
│  ╚════════════════════════════════════════════════════════════════════════════════════╝     │
│                                                                                             │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│  [j/k] Navigate  │  [y/n] Accept/Reject Line  │  [h/r] Accept/Reject Hunk  │  [q] Quit    │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Visual Specifications

#### Color Scheme (Dark Theme)

```
Background:        #1e1e1e (VS Code dark)
Text:             #d4d4d4 (Light gray)
Border:           #3c3c3c (Dark gray)

Added lines:      #2ea043 (GitHub green)
Added bg:         rgba(46, 160, 67, 0.15)

Removed lines:    #f85149 (GitHub red)
Removed bg:       rgba(248, 81, 73, 0.15)

Context lines:    #d4d4d4 (Default text)
Context bg:       transparent

Cursor line:      #264f78 (VS Code selection)

Accepted:         #2ea043 ✓
Rejected:         #f85149 ✗
Pending:          #d4d4d4 ○

Line numbers:     #6e7681 (Muted)
Hunk header:      #79c0ff (Blue)
```

#### Symbols

```
Added line:       +  (plus sign, green)
Removed line:     -  (minus sign, red)
Context line:     ␣  (space)
Cursor:           ►  (right arrow, blue background)
Old line marker:  ┃- (pipe + minus, red)
New line marker:  ┃+ (pipe + plus, green)

Accepted state:   ✓  (checkmark, green)
Rejected state:   ✗  (x mark, red)
Pending state:    ○  (circle, gray)
```

---

## Screen 2: File List View (Multiple Files)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Changes                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  📁 5 files changed (2 auto-accepted, 1 skipped)                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  [Y] Accept All Files    [N] Reject All Files    [Enter] Review Selected            │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  ☐  1. src/components/Button.tsx        +45  -12  lines  (modified)  [reviewing]    │    │
│  │                                                                                     │    │
│  │  ☐  2. src/components/Input.tsx         +20  -5   lines  (modified)  [pending]      │    │
│  │                                                                                     │    │
│  │  ☐  3. src/utils/helpers.ts            +120 -0   lines  (new)        [pending]      │    │
│  │                                                                                     │    │
│  │  ✓  4. README.md                        +10  -2   lines  (modified)  [auto-accepted] │    │
│  │                                                                                     │    │
│  │  ⚠  5. src/assets/large-file.bin       +2MB       (binary)         [skipped]        │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  Summary:  +195 / -19 lines across 5 files                                                  │
│                                                                                             │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│  [j/k] Navigate  │  [Space] Toggle Selection  │  [Enter] Review  │  [q] Skip All          │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### File Status Icons

```
Modified:  📝  (document with pencil)
Added:     ➕  (plus circle)
Deleted:   🗑️  (trash)
Renamed:   ➡️  (arrow right)
Binary:    ⚙️  (gear)

Pending:    ⏳  (hourglass)
Reviewing:  👁️  (eye)
Accepted:   ✓   (checkmark green)
Rejected:   ✗   (x mark red)
Skipped:    ⚠️  (warning yellow)
Auto:       ⚡  (lightning bolt)
```

---

## Screen 3: Single Line Detail View

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Changes                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  📄 src/components/Button.tsx                                                    [1 of 3]   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                                             │
│  HUNK 2 of 3                                                                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                                                             │
│  Line 50 - Line 55:                                                                          │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  BEFORE                                                                             │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │     return (                                                                        │    │
│  │       <button                                                                       │    │
│  │         className={cn('btn', variant)}                                             │    │
│  │  ❌      onClick={() => console.log('clicked')}     ◄── Old code                   │    │
│  │         {...props}                                                                  │    │
│  │       >                                                                             │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  AFTER                                                                              │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │     return (                                                                        │    │
│  │       <button                                                                       │    │
│  │         className={cn('btn', variant)}                                             │    │
│  │  ✓       onClick={() => setCount(c => c + 1)}     ◄── New code                    │    │
│  │         {...props}                                                                  │    │
│  │       >                                                                             │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  ACTIONS                                                                            │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  [Y] Accept this change - Update the click handler to use state                    │    │
│  │  [N] Reject this change - Keep the console.log for debugging                       │    │
│  │                                                                                     │    │
│  │  [E] Explain this change - Ask AI to explain the modification                      │    │
│  │  [C] Comment - Add a comment about this line                                       │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│  [y] Accept  │  [n] Reject  │  [e] Explain  │  [Esc] Back to diff view                     │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4: Confirmation Dialog

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Changes                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                                     │    │
│  │                         ⚠️  CONFIRM ACTION                                          │    │
│  │                                                                                     │    │
│  │    You are about to REJECT ALL changes in this file.                              │    │
│  │                                                                                     │    │
│  │    This will:                                                                       │    │
│  │    • Discard 15 additions                                                           │    │
│  │    • Keep 8 deletions (original code will be restored)                              │    │
│  │    • Restore the file to its original state                                         │    │
│  │                                                                                     │    │
│  │    File: src/components/Button.tsx                                                  │    │
│  │                                                                                     │    │
│  │    This action cannot be undone.                                                    │    │
│  │                                                                                     │    │
│  │    [Y] Yes, reject all changes    [N] No, cancel    [?] View diff first             │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 5: Summary View (After Review)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Complete                                                                         │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                                     │    │
│  │                         ✅  REVIEW COMPLETED                                        │    │
│  │                                                                                     │    │
│  │    3 files reviewed and applied successfully                                        │    │
│  │                                                                                     │    │
│  │    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │    │
│  │                                                                                     │    │
│  │    ✅ src/components/Button.tsx                                                     │    │
│  │       • 12 lines accepted                                                           │    │
│  │       • 3 lines rejected                                                            │    │
│  │       • Net change: +9 lines                                                        │    │
│  │                                                                                     │    │
│  │    ✅ src/components/Input.tsx                                                      │    │
│  │       • 20 lines accepted                                                           │    │
│  │       • 0 lines rejected                                                            │    │
│  │       • Net change: +20 lines                                                       │    │
│  │                                                                                     │    │
│  │    ✅ src/utils/helpers.ts                                                          │    │
│  │       • 120 lines accepted (new file)                                               │    │
│  │       • 0 lines rejected                                                            │    │
│  │       • Net change: +120 lines                                                      │    │
│  │                                                                                     │    │
│  │    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │    │
│  │                                                                                     │    │
│  │    Total: +149 lines added, -3 lines removed                                         │    │
│  │    Acceptance rate: 97.4% (152/156 lines)                                            │    │
│  │                                                                                     │    │
│  │    [G] View in Git    [O] Open files    [C] Continue    [Q] Quit                    │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6: Help Overlay

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  📝 Review Changes                                                     ┌──────────────────┐ │
│  ═════════════════════════════════════════════════════════════════════ │    KEYBOARD      │ │
│                                                                        │    SHORTCUTS     │ │
│  📄 src/components/Button.tsx                                          ├──────────────────┤ │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                  │ │
│                                                                        │  Navigation      │ │
│  [Diff view content behind overlay]                                    │  ──────────────  │ │
│                                                                        │  j / ↓    Next   │ │
│                                                                        │  k / ↑    Prev   │ │
│                                                                        │  g        First  │ │
│                                                                        │  G        Last   │ │
│                                                                        │                  │ │
│                                                                        │  Line Actions    │ │
│                                                                        │  ──────────────  │ │
│                                                                        │  y         Accept│ │
│                                                                        │  n         Reject│ │
│                                                                        │  u         Undo  │ │
│                                                                        │                  │ │
│                                                                        │  Hunk Actions    │ │
│                                                                        │  ──────────────  │ │
│                                                                        │  h         Accept│ │
│                                                                        │  r         Reject│ │
│                                                                        │                  │ │
│                                                                        │  File Actions    │ │
│                                                                        │  ──────────────  │ │
│                                                                        │  a         Accept│ │
│                                                                        │  d         Reject│ │
│                                                                        │                  │ │
│                                                                        │  General         │ │
│                                                                        │  ──────────────  │ │
│                                                                        │  ?         Help  │ │
│                                                                        │  q / Esc   Quit  │ │
│                                                                        │  Space     Next  │ │
│                                                                        │             file │ │
│                                                                        │                  │ │
│                                                                        │  [Press any key  │ │
│                                                                        │   to close]      │ │
│                                                                        └──────────────────┘ │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 7: Settings/Configuration View

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│  ⚙️  Diff Plugin Settings                                                                   │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  General Settings                                                                   │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  [✓] Enable diff plugin                                                             │    │
│  │                                                                                     │    │
│  │  Theme:  ○ Light  ● Dark  ○ Auto                                                    │    │
│  │                                                                                     │    │
│  │  [✓] Show line numbers                                                              │    │
│  │  [ ] Show whitespace characters                                                     │    │
│  │  [ ] Wrap long lines                                                                │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Auto-Accept Patterns (skip review for these files)                                │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  • *.md                                    [x]                                      │    │
│  │  • *.txt                                   [x]                                      │    │
│  │  • *.json                                  [x]                                      │    │
│  │  • *.lock                                  [x]                                      │    │
│  │  • docs/**/*.md                            [x]                                      │    │
│  │                                                                                     │    │
│  │  [+] Add pattern                                                                    │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Size Limits                                                                        │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  Max file size for review:  [1 MB        ]                                          │    │
│  │                                                                                     │    │
│  │  Max total changes:         [10 MB       ]                                          │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Confirmation Settings                                                              │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  [✓] Confirm before rejecting all changes                                           │    │
│  │  [✓] Confirm before bulk actions                                                    │    │
│  │  [ ] Confirm before accepting all changes                                           │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐    │
│  │  Keyboard Shortcuts                                                                 │    │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                                                     │    │
│  │  Accept line:    [y  ]    Reject line:    [n  ]                                     │    │
│  │  Accept hunk:    [h  ]    Reject hunk:    [r  ]                                     │    │
│  │  Accept file:    [a  ]    Reject file:    [d  ]                                     │    │
│  │  Next line:      [j  ]    Previous line:  [k  ]                                     │    │
│  │                                                                                     │    │
│  │  [Reset to defaults]                                                                │    │
│  │                                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                             │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
│  [s] Save    [r] Reset    [q] Cancel                                                        │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Library

### 1. Header Component

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  📝 Review Changes                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════════    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
- `title: string` - "Review Changes"
- `icon: string` - "📝"

### 2. File Info Bar

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  📄 src/components/Button.tsx                                                    [1 of 3]   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
- `filePath: string` - Path to file
- `currentIndex: number` - Current file number
- `totalFiles: number` - Total number of files

### 3. Toolbar Component

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  [Y] Accept All    [N] Reject All    [A] Accept File    [R] Reject File    [?] Help         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
- `onAcceptAll: () => void`
- `onRejectAll: () => void`
- `onAcceptFile: () => void`
- `onRejectFile: () => void`
- `onHelp: () => void`

### 4. Stats Bar Component

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  ✅ 12 accepted  │  ❌ 3 rejected  │  ⏳ 5 pending  │  📊 +15 / -8 lines                      │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
- `accepted: number`
- `rejected: number`
- `pending: number`
- `additions: number`
- `deletions: number`

### 5. Hunk Component

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║  HUNK 1 of 3                                                                        ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                                     ║
║  @@ -15,7 +15,7 @@                                                                  ║
║    15     import React from 'react';                                                ║
║  ► 16 ┃ - import { useState } from 'react';                                         ║
║  ░ 16 ┃ + import { useState, useEffect } from 'react';                              ║
║    17     import { Button } from './Button';                                        ║
║    18     import { cn } from '@/utils';                                             ║
║                                                                                     ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐ ║
║  │ [Y] Accept  [N] Reject                                                          │ ║
║  └────────────────────────────────────────────────────────────────────────────────┘ ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

**Props:**
- `hunkIndex: number`
- `totalHunks: number`
- `header: string` - Hunk header line
- `lines: DiffLine[]`
- `state: 'pending' | 'accepted' | 'rejected' | 'partial'`

### 6. Line Component

```
  ► 16 ┃ - import { useState } from 'react';         ◄── Current line
  ░ 16 ┃ + import { useState, useEffect } from 'react';
```

**Props:**
- `type: 'context' | 'add' | 'remove'`
- `content: string`
- `oldLineNum: number | null`
- `newLineNum: number | null`
- `isCurrent: boolean`
- `state: 'pending' | 'accepted' | 'rejected'`

### 7. Action Widget Component

```
┌────────────────────────────────────────┐
│ [Y] Accept  [N] Reject                 │
└────────────────────────────────────────┘
```

**Props:**
- `onAccept: () => void`
- `onReject: () => void`
- `state: 'pending' | 'accepted' | 'rejected'`

### 8. Footer Component

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  [j/k] Navigate  │  [y/n] Accept/Reject Line  │  [h/r] Accept/Reject Hunk  │  [q] Quit    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
- `shortcuts: Shortcut[]`

---

## Responsive Behavior

### Narrow Terminal (< 80 columns)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📝 Review                                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                             │
│  📄 Button.tsx                                                   [1/3]      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                             │
│  [Y] Acc All  [N] Rej All  [A] Acc File  [R] Rej File  [?] Help            │
│                                                                             │
│  ✅ 12 │ ❌ 3 │ ⏳ 5                                                       │
│                                                                             │
│  @@ -15,7 +15,7 @@                                                          │
│  15   import React...                                                       │
│  ►16 ┃- import { useState }...                                              │
│  ░16 ┃+ import { useState, useEffect }...                                   │
│  17   import { Button...                                                    │
│                                                                             │
│  ┌────────────┐                                                             │
│  │[Y] Acc     │                                                             │
│  │[N] Rej     │                                                             │
│  └────────────┘                                                             │
│                                                                             │
│  [j/k] Nav │ [y/n] Line │ [q] Quit                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Wide Terminal (> 120 columns)

- Show side-by-side comparison option
- More detailed stats
- Full file paths
- Additional context lines

---

## Animation Specifications

### State Change Animation

When user accepts/rejects a line:

```
1. User presses 'y'
2. Line background flashes green (100ms)
3. Checkmark appears with fade-in (150ms)
4. Widget updates to show "Accepted" state
5. Stats bar updates with count animation
```

### Cursor Movement

```
1. User presses 'j'
2. Current line loses highlight (instant)
3. Next line gains highlight (fade-in 50ms)
4. Widget appears on new current line
```

---

## Accessibility Considerations

### Color Blindness Support

```
Added lines:    Green background + "+" prefix
Removed lines:  Red background + "-" prefix
Context lines:  No background + " " prefix

Accepted state: Green checkmark icon + "ACCEPTED" text
Rejected state: Red X icon + "REJECTED" text
```

### Screen Reader Support

```
Aria labels:
- Line 16: "Removed line 16. Import useState from react. Not accepted."
- Line 16: "Added line 16. Import useState and useEffect from react. Not accepted."
- Action widget: "Press Y to accept this change, N to reject"
```

---

## File Format: Design Tokens

```json
{
  "colors": {
    "dark": {
      "background": "#1e1e1e",
      "text": "#d4d4d4",
      "border": "#3c3c3c",
      "added": { "fg": "#2ea043", "bg": "rgba(46, 160, 67, 0.15)" },
      "removed": { "fg": "#f85149", "bg": "rgba(248, 81, 73, 0.15)" },
      "cursor": "#264f78",
      "header": "#79c0ff",
      "muted": "#6e7681"
    },
    "light": {
      "background": "#ffffff",
      "text": "#24292f",
      "border": "#d0d7de",
      "added": { "fg": "#1a7f37", "bg": "rgba(46, 160, 67, 0.15)" },
      "removed": { "fg": "#cf222e", "bg": "rgba(248, 81, 73, 0.15)" },
      "cursor": "#0969da",
      "header": "#0969da",
      "muted": "#6e7781"
    }
  },
  "spacing": {
    "padding": 1,
    "borderWidth": 1,
    "lineHeight": 1
  },
  "typography": {
    "fontFamily": "monospace",
    "fontSize": "inherit"
  },
  "symbols": {
    "added": "+",
    "removed": "-",
    "context": " ",
    "cursor": "►",
    "accepted": "✓",
    "rejected": "✗",
    "pending": "○"
  }
}
```

---

*Document Version: 1.0*
*Last Updated: 2025-02-10*
*Author: Prometheus (Planning Agent)*
