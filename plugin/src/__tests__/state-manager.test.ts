import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { ChangeQueue, PendingChange, ChangeQueueOptions } from '../state-manager.js';
import type { ParsedDiff } from '../diff-engine.js';

const TEST_DIR = '/tmp/opencode-diff-plugin-test-change-queue';
const TEST_STATE_FILE = join(TEST_DIR, 'test-state.json');

describe('ChangeQueue', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('constructor', () => {
    it('should create ChangeQueue without options (backward compatible)', () => {
      const queue = new ChangeQueue();
      expect(queue.size()).toBe(0);
    });

    it('should create ChangeQueue with empty options (backward compatible)', () => {
      const queue = new ChangeQueue({});
      expect(queue.size()).toBe(0);
    });

    it('should throw error when enablePersistence is true but statePath is missing', () => {
      expect(() => {
        new ChangeQueue({
          enablePersistence: true,
          sessionID: 'session_123',
        } as ChangeQueueOptions);
      }).toThrow('statePath is required when enablePersistence is true');
    });

    it('should create ChangeQueue with persistence enabled without sessionID (uses default)', () => {
      const queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
      });
      expect(queue.size()).toBe(0);
      queue.destroy();
    });

    it('should create ChangeQueue with persistence enabled', () => {
      const queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });
      expect(queue.size()).toBe(0);
    });
  });

  describe('persistence disabled (default)', () => {
    it('should not create state file when adding changes', async () => {
      const queue = new ChangeQueue();
      const change = createTestChange();

      queue.add(change);

      // Wait for any async operations
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(existsSync(TEST_STATE_FILE)).toBe(false);
    });

    it('should not create state file when removing changes', async () => {
      const queue = new ChangeQueue();
      const change = createTestChange();

      queue.add(change);
      queue.remove(change.id);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(existsSync(TEST_STATE_FILE)).toBe(false);
    });
  });

  describe('persistence enabled', () => {
    let queue: ChangeQueue;

    afterEach(() => {
      if (queue) {
        queue.destroy();
      }
    });

    it('should persist state on add', async () => {
      queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      const change = createTestChange();
      queue.add(change);

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });

    it('should persist state on remove', async () => {
      queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      const change = createTestChange();
      queue.add(change);

      // Wait for initial write
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(queue.size()).toBe(1);

      queue.remove(change.id);

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify by creating new queue and loading state
      const queue2 = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(queue2.size()).toBe(0);
      queue2.destroy();
    });

    it('should persist state on update', async () => {
      queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      const change = createTestChange();
      queue.add(change);

      // Wait for initial write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Update the change
      queue.update(change.id, { newContent: 'updated content' });

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify by creating new queue and loading state
      const queue2 = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const loadedChange = queue2.get(change.id);
      expect(loadedChange?.newContent).toBe('updated content');
      queue2.destroy();
    });

    it('should persist state on clear', async () => {
      queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      const change = createTestChange();
      queue.add(change);

      // Wait for initial write
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(queue.size()).toBe(1);

      queue.clear();

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify by creating new queue and loading state
      const queue2 = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(queue2.size()).toBe(0);
      queue2.destroy();
    });

    it('should debounce multiple writes', async () => {
      queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      await queue.ready;

      // Add multiple changes quickly
      for (let i = 0; i < 5; i++) {
        queue.add(createTestChange());
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(existsSync(TEST_STATE_FILE)).toBe(true);
      expect(queue.size()).toBe(5);
    });
  });

  describe('state loading', () => {
    afterEach(() => {
      // Cleanup handled by parent afterEach
    });

    it('should load persisted state on initialization', async () => {
      // Create initial queue and add changes
      const queue1 = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      const change1 = createTestChange();
      const change2 = createTestChange();
      queue1.add(change1);
      queue1.add(change2);

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 200));

      queue1.destroy();

      // Create new queue pointing to same state file
      const queue2 = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_456',
      });

      // Wait for loading
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(queue2.size()).toBe(2);
      expect(queue2.get(change1.id)).toBeDefined();
      expect(queue2.get(change2.id)).toBeDefined();

      queue2.destroy();
    });
  });

  describe('external change detection', () => {
    it('should detect external state changes within 200ms', async () => {
      const queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      await queue.ready;
      await new Promise(resolve => setTimeout(resolve, 200));

      const change1 = createTestChange();
      queue.add(change1);

      await new Promise(resolve => setTimeout(resolve, 300));

      const externalChange = createTestChange();
      const stateData = {
        version: '1.0',
        timestamp: Date.now(),
        sessionID: 'external_session',
        changes: [change1.toJSON(), externalChange.toJSON()],
      };

      const tempPath = `${TEST_STATE_FILE}.tmp`;
      writeFileSync(tempPath, JSON.stringify(stateData, null, 2));
      renameSync(tempPath, TEST_STATE_FILE);

      await new Promise(resolve => setTimeout(resolve, 400));

      expect(queue.size()).toBe(2);
      expect(queue.get(externalChange.id)).toBeDefined();

      queue.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up resources when destroyed', () => {
      const queue = new ChangeQueue({
        enablePersistence: true,
        statePath: TEST_STATE_FILE,
        sessionID: 'session_123',
      });

      expect(() => queue.destroy()).not.toThrow();
    });

    it('should not throw if destroyed when persistence is disabled', () => {
      const queue = new ChangeQueue();
      expect(() => queue.destroy()).not.toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('should work with existing code without persistence', () => {
      const queue = new ChangeQueue();
      const change = createTestChange();

      // All existing methods should work
      queue.add(change);
      expect(queue.get(change.id)).toBeDefined();
      expect(queue.getByFilePath(change.filePath)).toBeDefined();
      expect(queue.hasFile(change.filePath)).toBe(true);
      expect(queue.size()).toBe(1);

      queue.update(change.id, { newContent: 'updated' });
      expect(queue.get(change.id)?.newContent).toBe('updated');

      queue.remove(change.id);
      expect(queue.size()).toBe(0);

      queue.add(createTestChange());
      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });
});

// Helper function to create test changes
function createTestChange(): PendingChange {
  return new PendingChange({
    id: `change_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    tool: 'write',
    filePath: `/test/file_${Math.random().toString(36).substring(2, 5)}.txt`,
    oldContent: 'old content',
    newContent: 'new content',
    sessionID: 'test_session',
    callID: `call_${Date.now()}`,
    timestamp: Date.now(),
  });
}
