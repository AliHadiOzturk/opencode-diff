# VSCode Extension - End-to-End Workflow Test Plan

## Current Implementation Status

### ✅ Completed (13/17 tasks)

**Phase 1: Plugin Enhancement**
- StateSync class for file-based persistence
- ChangeQueue integration with persistence
- IDE configuration options

**Phase 2: VSCode Extension Core**
- Extension scaffold with TypeScript + Webpack
- Shared core modules bundled
- CustomTextEditorProvider with state file watching
- WebView HTML/CSS scaffold

**Phase 3: Rich Features**
- React diff viewer with Monaco Editor
- Message passing protocol
- Accept/reject commands (line, hunk, file, all)
- Vim navigation commands (j/k, ]/[, l/p)
- Tree view sidebar for pending changes
- Theme synchronization

**Phase 4: Integration (In Progress)**
- End-to-end workflow ⏳
- Error handling ⏳
- Performance optimization ⏳
- Documentation ⏳

## End-to-End Workflow

### Flow Diagram
```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode Plugin (Terminal)                                 │
│  1. Intercepts write/edit tool calls                        │
│  2. Creates PendingChange in ChangeQueue                    │
│  3. StateSync writes to .opencode/.diff-plugin-state.json   │
└────────────────────┬────────────────────────────────────────┘
                     │ File Change
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  VSCode Extension                                           │
│  4. FileSystemWatcher detects state file change             │
│  5. Opens custom diff editor                                │
│  6. Loads diff data from state file                         │
│  7. User reviews in Monaco diff viewer                      │
│  8. User clicks accept/reject                               │
│  9. Updates state file via commands                         │
└────────────────────┬────────────────────────────────────────┘
                     │ File Change
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  OpenCode Plugin (Terminal)                                 │
│  10. StateSync detects state file change                    │
│  11. ChangeQueue updates PendingChange                      │
│  12. Plugin reconstructs content (accept/reject applied)    │
│  13. Plugin writes file to disk                             │
│  14. Removes change from queue                              │
│  15. State file cleaned up                                  │
└─────────────────────────────────────────────────────────────┘
```

### Security Model
- ✅ Plugin controls all file writes (VSCode never writes directly)
- ✅ VSCode only updates state file
- ✅ Plugin reconstructs content and applies changes
- ✅ State file is source of truth

### Testing Required
1. Plugin intercepts change → state file created
2. VSCode detects state file → opens diff viewer
3. User reviews and accepts → state file updated
4. Plugin detects update → reconstructs content
5. Plugin writes file → state file cleaned up

### Known Limitations
- Tree view sidebar created but needs verification
- Error handling for edge cases not yet implemented
- Performance optimizations not yet applied
- Documentation incomplete
