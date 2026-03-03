# Agent Guidelines for OpenCode Diff Plugin

This file contains guidelines for AI agents working on the OpenCode Diff Plugin codebase.

## Build Commands

```bash
# Development - watch mode
bun run dev

# Production build
bun run build

# Clean build artifacts
bun run clean

# Run all tests
bun test

# Run specific test file
bun test src/__tests__/diff-engine.test.ts

# Run tests in watch mode
bun test --watch

# Type checking (no emit)
bun run lint
```

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2022, Module: ESNext with bundler resolution
- Strict mode enabled (all strict flags on)
- Import paths must use `.js` extension (e.g., `./config.js`)

### Imports
```typescript
// External imports first
import { createPatch } from 'diff';

// Internal imports with .js extension
import { ConfigManager } from './config.js';
import type { PluginConfig } from './config.js';
```

### Naming Conventions
- **Classes**: PascalCase (e.g., `DiffEngine`)
- **Interfaces**: PascalCase (e.g., `PluginConfig`, `ParsedDiff`)
- **Functions/Variables**: camelCase (e.g., `generateDiff`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_CONFIG`)

### Types and Interfaces
```typescript
// Use explicit return types on public methods
export interface ParsedDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted';
  hunks: Hunk[];
}
```

### Error Handling
```typescript
export class InterceptedError extends Error {
  constructor(
    message: string,
    public readonly changeId: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = 'InterceptedError';
  }
}
```

### Documentation
- Use JSDoc for all public APIs
- Document parameters with `@param`
- Document return values with `@returns`

```typescript
/**
 * Generates a unified diff between old and new content
 * @param oldPath - Path to the old file
 * @param newPath - Path to the new file
 * @param oldContent - Original file content
 * @param newContent - Modified file content
 * @returns The unified diff as a string
 */
```

### Testing
- Use `bun:test` for all tests
- Test files: `src/__tests__/{module}.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';

describe('DiffEngine', () => {
  let engine: DiffEngine;
  beforeEach(() => { engine = new DiffEngine(); });
  
  it('should generate diff for modified content', () => {
    const result = engine.generateDiff(...);
    expect(result).toContain('expected');
  });
});
```

### File Organization
```
src/
├── index.ts              # Main plugin entry
├── config.ts            # Configuration management
├── diff-engine.ts       # Diff generation/parsing
├── state-manager.ts     # State management
├── interceptor.ts       # Tool interception
├── ui/
│   ├── tui-renderer.ts  # Terminal UI
│   ├── keyboard-handler.ts
│   └── widgets.ts
├── types/               # Type declarations
└── __tests__/           # Test files
```

### Logging
```typescript
console.log('[DiffPlugin] Initializing...');
console.error('[DiffPlugin] Error:', error);
```

## Git Commits (Conventional)

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Build/config changes

## Testing Quick Reference

```bash
# Run single test file
bun test src/__tests__/diff-engine.test.ts

# Run specific test by name
bun test --grep "should generate diff"

# Run tests in directory
bun test src/__tests__/
```

## Project Context

OpenCode plugin for interactive diff viewing with vim-style navigation (j/k, y/n), line-by-line accept/reject, terminal UI with colors, and configuration system with glob patterns.

Built with: TypeScript, Bun, diff library, parse-git-diff, chalk
