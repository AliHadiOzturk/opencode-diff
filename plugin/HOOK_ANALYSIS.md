# OpenCode Diff Plugin - Hook Analysis Report

## Executive Summary

**CRITICAL ISSUE FOUND**: The plugin structure is **WRONG**. The plugin returns an object with `name`, `version`, `description`, and `hooks` properties, but OpenCode expects the hooks to be returned **directly**.

---

## Root Cause

### Current (BROKEN) Structure
```typescript
export default async function diffPlugin(context: PluginInput) {
  // ... initialization
  return {
    name: 'diff-plugin',
    version: '0.1.0',
    description: 'Enhanced diff viewing...',
    hooks: {
      'tool.execute.before': createBeforeHandler(...),
      'tool.execute.after': createAfterHandler(...),
    },
  };
}
```

### Expected (CORRECT) Structure
```typescript
export default async function diffPlugin(context: PluginInput) {
  // ... initialization
  return {
    'tool.execute.before': createBeforeHandler(...),
    'tool.execute.after': createAfterHandler(...),
  };
}
```

---

## Evidence from Official Types

From `@opencode-ai/plugin@1.1.53` (`dist/index.d.ts`):

```typescript
// Line 18: Plugin type definition
export type Plugin = (input: PluginInput) => Promise<Hooks>;

// Lines 108-220: Hooks interface
export interface Hooks {
  "tool.execute.before"?: (input: {
    tool: string;
    sessionID: string;
    callID: string;
  }, output: {
    args: any;
  }) => Promise<void>;
  
  "tool.execute.after"?: (input: {
    tool: string;
    sessionID: string;
    callID: string;
  }, output: {
    title: string;
    output: string;
    metadata: any;
  }) => Promise<void>;
  
  // ... other hooks
}
```

### Official Example Plugin (from `@opencode-ai/plugin/dist/example.js`)
```typescript
export const ExamplePlugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: { foo: tool.schema.string().describe("foo") },
        async execute(args) {
          return `Hello ${args.foo}!`;
        },
      }),
    },
  };
};
```

Notice: **NO `name`, `version`, `description`, or `hooks` wrapper!**

---

## Hook Names Verification

✅ **Hook names ARE correct**:
- `'tool.execute.before'` - Correct
- `'tool.execute.after'` - Correct

These match the official `Hooks` interface exactly.

---

## Plugin Function Signature

✅ **Async function is correct**:
```typescript
export default async function diffPlugin(context: PluginInput)
```

The `Plugin` type is defined as:
```typescript
type Plugin = (input: PluginInput) => Promise<Hooks>;
```

So an async function that returns a Promise<Hooks> is correct.

---

## Hook Handler Signatures

✅ **Handler signatures ARE correct**:

Current handlers in `interceptor.ts`:
```typescript
// createBeforeHandler returns:
async (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: unknown }
): Promise<void> => { ... }

// createAfterHandler returns:
async (
  input: { tool: string; sessionID: string; callID: string }
): Promise<void> => { ... }
```

Expected from types:
```typescript
"tool.execute.before"?: (input: {
  tool: string;
  sessionID: string;
  callID: string;
}, output: {
  args: any;
}) => Promise<void>;

"tool.execute.after"?: (input: {
  tool: string;
  sessionID: string;
  callID: string;
}, output: {
  title: string;
  output: string;
  metadata: any;
}) => Promise<void>;
```

**Note**: The `after` hook expects an `output` parameter, but the current handler doesn't use it. This won't prevent the hook from firing but should be fixed for completeness.

---

## Required Fix

### File: `src/index.ts`

**Change from:**
```typescript
return {
  name: 'diff-plugin',
  version: '0.1.0',
  description: 'Enhanced diff viewing and interaction for OpenCode',

  hooks: {
    'tool.execute.before': createBeforeHandler(...),
    'tool.execute.after': createAfterHandler(...),
  },
};
```

**Change to:**
```typescript
return {
  'tool.execute.before': createBeforeHandler(
    context.$,
    context.directory,
    configManager,
    changeQueue
  ),
  'tool.execute.after': createAfterHandler(
    context.$,
    context.directory,
    configManager,
    changeQueue
  ),
};
```

### File: `src/interceptor.ts` (Minor fix)

The `after` hook handler should accept the `output` parameter:

```typescript
export function createAfterHandler(...) {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    _output: { title: string; output: string; metadata: any }  // Add this
  ): Promise<void> => {
    // ... rest of the code
  };
}
```

---

## Complete Fixed `src/index.ts`

```typescript
import type { Plugin, PluginInput } from '@opencode-ai/plugin';
import { createBeforeHandler, createAfterHandler } from './interceptor.js';
import { ConfigManager } from './config.js';
import { ChangeQueue } from './state-manager.js';
import { createLogger, enableDebugMode } from './debug.js';
import { join } from 'path';

const logger = createLogger('DiffPlugin');

export default async function diffPlugin(context: PluginInput) {
  logger.info('Initializing...');

  if (process.env.DEBUG?.includes('opencode-diff-plugin')) {
    enableDebugMode();
  }

  const configManager = new ConfigManager(context.directory);

  try {
    configManager.validateOrThrow();
    logger.info('Configuration loaded successfully');
  } catch (error) {
    logger.error('Configuration error', error as Error);
  }

  if (!configManager.isEnabled()) {
    logger.info('Plugin is disabled in configuration');
    // Return empty hooks object when disabled
    return {};
  }

  const config = configManager.getConfig();
  const enablePersistence = config.ide?.enabled ?? false;
  const stateFilePath = config.ide?.stateFilePath ?? '.opencode/.diff-plugin-state.json';
  const statePath = join(context.directory, stateFilePath);

  let changeQueue: ChangeQueue;
  if (enablePersistence) {
    logger.info('IDE integration enabled', { statePath });
    try {
      changeQueue = new ChangeQueue({ enablePersistence: true, statePath });
      await changeQueue.ready;
    } catch (error) {
      logger.error('Failed to initialize persistence', error as Error);
      changeQueue = new ChangeQueue();
    }
  } else {
    logger.info('IDE integration disabled, using in-memory only');
    changeQueue = new ChangeQueue();
  }

  logger.info('Initialized successfully');

  // Return hooks directly, NOT wrapped in an object with name/version/description
  return {
    'tool.execute.before': createBeforeHandler(
      context.$,
      context.directory,
      configManager,
      changeQueue
    ),
    'tool.execute.after': createAfterHandler(
      context.$,
      context.directory,
      configManager,
      changeQueue
    ),
  };
}

// Re-exports...
```

---

## Why This Wasn't Working

When OpenCode loads the plugin:
1. It calls `plugin(context)` and expects `Promise<Hooks>`
2. It receives `{ name, version, description, hooks: {...} }`
3. OpenCode looks for hook properties directly on the returned object
4. It doesn't find `'tool.execute.before'` or `'tool.execute.after'` at the top level
5. The hooks never fire because OpenCode can't find them

The plugin was essentially returning metadata instead of hooks.

---

## Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Hook names | ✅ Correct | `'tool.execute.before'`, `'tool.execute.after'` |
| Async function | ✅ Correct | Plugin is async, returns Promise<Hooks> |
| Return structure | ❌ **WRONG** | Should return hooks directly, not wrapped |
| Handler signatures | ✅ Mostly correct | `after` handler missing `output` param |

**The fix is simple**: Remove the wrapper object and return hooks directly.
