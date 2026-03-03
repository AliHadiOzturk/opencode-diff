# Contributing to OpenCode Diff Plugin

Thank you for your interest in contributing to the OpenCode Diff Plugin! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Build Instructions](#build-instructions)
- [Testing Guide](#testing-guide)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Reporting Issues](#reporting-issues)

## Development Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.0.0 or higher (or Bun 1.0.0+)
- **Git** 2.30.0 or higher
- **TypeScript** 5.3.0 or higher

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/AliHadiOzturk/opencode-diff-plugin.git
   cd opencode-diff-plugin
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/AliHadiOzturk/opencode-diff-plugin.git
   ```

### Install Dependencies

Using npm:
```bash
npm install
```

Using Bun (recommended):
```bash
bun install
```

### Verify Setup

Run the test suite to ensure everything is working:

```bash
npm test
# or
bun test
```

## Build Instructions

### Development Build

Watch for changes and rebuild automatically:

```bash
npm run dev
# or
bun run dev
```

### Production Build

Compile TypeScript to JavaScript:

```bash
npm run build
# or
bun run build
```

This will:
- Compile all TypeScript files in `src/` to `dist/`
- Generate type declaration files (`.d.ts`)
- Create source maps (`.js.map`)

### Clean Build

Remove all build artifacts:

```bash
npm run clean
# or
bun run clean
```

Then rebuild:

```bash
npm run build
```

### Build Output

The build process creates the following in `dist/`:

```
dist/
├── index.js              # Main entry point
├── index.d.ts            # Type declarations
├── index.js.map          # Source map
├── config.js             # Config module
├── config.d.ts
├── diff-engine.js        # Diff engine module
├── diff-engine.d.ts
├── interceptor.js        # Interceptor module
├── interceptor.d.ts
├── state-manager.js      # State manager module
├── state-manager.d.ts
├── ui/
│   ├── keyboard-handler.js
│   ├── keyboard-handler.d.ts
│   ├── tui-renderer.js
│   ├── tui-renderer.d.ts
│   ├── widgets.js
│   └── widgets.d.ts
└── types/
    └── diff.d.ts
```

## Testing Guide

### Running Tests

Run all tests:

```bash
npm test
# or
bun test
```

### Test Structure

Tests are located in `src/__tests__/`:

```
src/__tests__/
├── config.test.ts          # ConfigManager tests
└── diff-engine.test.ts     # DiffEngine tests
```

### Writing Tests

We use the built-in Bun test runner. Here's an example test:

```typescript
import { describe, it, expect } from 'bun:test';
import { ConfigManager } from '../config';

describe('ConfigManager', () => {
  it('should load default configuration', () => {
    const config = new ConfigManager('/tmp/test-workspace');
    expect(config.isEnabled()).toBe(true);
    expect(config.getTheme()).toBe('auto');
  });

  it('should validate configuration', () => {
    const config = new ConfigManager('/tmp/test-workspace');
    const result = config.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
```

### Test Coverage

Aim for high test coverage, especially for:

- Configuration validation
- Diff parsing and generation
- Keyboard action handling
- State management

Run tests with coverage (if available):

```bash
bun test --coverage
```

### Manual Testing

To test the plugin manually:

1. Build the plugin:
   ```bash
   bun run build
   ```

2. Link the plugin locally:
   ```bash
   npm link
   ```

3. In a test project, link the plugin:
   ```bash
   npm link opencode-diff-plugin
   ```

4. Configure and run OpenCode with the plugin enabled

## Pull Request Process

### Before You Start

1. **Check existing issues** - Look for existing issues or PRs related to your change
2. **Create an issue** - For significant changes, create an issue to discuss the approach
3. **Fork the repo** - If you haven't already

### Branch Naming

Use descriptive branch names:

```
feature/add-keyboard-navigation
bugfix/fix-theme-detection
docs/update-readme
refactor/simplify-config-validation
```

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [code style guidelines](#code-style)

3. Write or update tests as needed

4. Update documentation if applicable:
   - README.md for user-facing changes
   - CONTRIBUTING.md for development changes
   - JSDoc comments for API changes

### Committing

#### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or auxiliary tool changes

**Examples:**

```
feat(keyboard): add support for custom keybindings

fix(theme): resolve auto theme detection on macOS

docs(readme): add troubleshooting section for large files

refactor(config): simplify validation logic
```

### Submitting the PR

1. Push your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request on GitHub

3. Fill out the PR template with:
   - Clear description of changes
   - Link to related issue(s)
   - Screenshots (if UI changes)
   - Testing performed

### PR Review Process

1. **Automated checks** must pass:
   - Build succeeds
   - All tests pass
   - No linting errors

2. **Code review** by maintainers:
   - We aim to review within 48 hours
   - Address feedback promptly
   - Be open to suggestions

3. **Merge**:
   - PRs are squash-merged to maintain clean history
   - Your commits will be preserved in the squashed commit message

## Code Style

### TypeScript

We use TypeScript with strict mode enabled. Key style guidelines:

#### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

#### Naming Conventions

- **Classes**: PascalCase (`DiffEngine`, `ConfigManager`)
- **Interfaces**: PascalCase with descriptive names (`PluginConfig`)
- **Functions**: camelCase (`generateDiff`, `parseDiff`)
- **Variables**: camelCase (`currentPosition`, `actionHistory`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`DEFAULT_CONFIG`)
- **Types**: PascalCase (`KeyboardAction`, `NavigationPosition`)
- **Enums**: PascalCase for name, UPPER_SNAKE_CASE for members

#### Documentation

All public APIs must have JSDoc comments:

```typescript
/**
 * Generate a unified diff between two text contents
 *
 * @param oldPath - Path to the old file (used in diff header)
 * @param newPath - Path to the new file (used in diff header)
 * @param oldContent - Original content (empty string for new files)
 * @param newContent - New content (empty string for deleted files)
 * @returns The unified diff string
 */
export function generateDiff(
  oldPath: string,
  newPath: string,
  oldContent: string,
  newContent: string
): string {
  // implementation
}
```

#### Imports

Order imports as follows:

1. Node.js built-ins
2. External dependencies
3. Internal modules (relative imports)

```typescript
// 1. Node.js built-ins
import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';

// 2. External dependencies
import chalk from 'chalk';
import parseGitDiff from 'parse-git-diff';

// 3. Internal modules
import { DiffEngine } from './diff-engine.js';
import { ConfigManager } from './config.js';
```

### File Organization

```
src/
├── index.ts              # Main entry point and plugin factory
├── config.ts             # Configuration management
├── diff-engine.ts        # Diff generation and parsing
├── interceptor.ts        # OpenCode tool interception
├── state-manager.ts      # Change state management
├── ui/
│   ├── keyboard-handler.ts   # Keyboard input handling
│   ├── tui-renderer.ts       # Terminal UI rendering
│   └── widgets.ts            # UI components
├── types/
│   ├── diff.d.ts             # Diff-related types
│   └── parse-git-diff.d.ts   # Third-party type declarations
└── __tests__/
    ├── config.test.ts
    └── diff-engine.test.ts
```

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

1. **Environment**:
   - Node.js/Bun version
   - Operating system
   - Terminal emulator

2. **Steps to reproduce**:
   - Minimal code example
   - Configuration used
   - Exact commands run

3. **Expected vs actual behavior**

4. **Error messages or logs** (with `DEBUG=opencode-diff-plugin` if applicable)

### Feature Requests

For feature requests, include:

1. **Use case** - What problem does this solve?
2. **Proposed solution** - How should it work?
3. **Alternatives** - What else have you considered?

## Development Tips

### Useful Commands

```bash
# Type-check without emitting
npx tsc --noEmit

# Watch mode for development
bun run dev

# Run specific test file
bun test src/__tests__/config.test.ts

# Format code (if prettier is configured)
npx prettier --write "src/**/*.ts"
```

### Debug Logging

Add debug logs during development:

```typescript
console.log('[DiffPlugin] Debug:', value);
```

Enable in terminal:
```bash
DEBUG=opencode-diff-plugin bun run dev
```

### Common Development Tasks

**Adding a new keyboard action:**

1. Add action to `KeyboardAction` type in `keyboard-handler.ts`
2. Add default binding to `DEFAULT_KEYBINDINGS`
3. Implement handler in `executeAction` method
4. Add to help text generation if needed
5. Write tests

**Adding a new configuration option:**

1. Add to `PluginConfig` interface in `config.ts`
2. Add default value to `DEFAULT_CONFIG`
3. Add validation in `validate()` method
4. Add getter method to `ConfigManager`
5. Update documentation
6. Write tests

## Questions?

Feel free to:
- Open an issue for questions
- Join our community discussions
- Reach out to maintainers

Thank you for contributing to OpenCode Diff Plugin!
