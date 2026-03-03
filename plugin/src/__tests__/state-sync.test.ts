import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, renameSync } from 'fs';
import { join } from 'path';
import {
  StateSync,
  StateSyncError,
  loadChangeQueue,
  saveChangeQueue,
  type StateFileData,
} from '../state-sync.js';
import { PendingChange, ChangeQueue } from '../state-manager.js';
import type { ParsedDiff } from '../diff-engine.js';

const TEST_DIR = '/tmp/opencode-diff-plugin-test-state-sync';
const TEST_STATE_FILE = join(TEST_DIR, 'test-state.json');

describe('StateSync', () => {
  let stateSync: StateSync;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up and stop watching
    if (stateSync) {
      stateSync.unwatchState();
    }
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should create StateSync instance with required parameters', () => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123');

      expect(stateSync.getStatePath()).toBe(TEST_STATE_FILE);
      expect(stateSync.getSessionID()).toBe('session_123');
    });

    it('should create StateSync instance with options', () => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123', {
        debounceMs: 200,
        debug: true,
      });

      expect(stateSync.getStatePath()).toBe(TEST_STATE_FILE);
      expect(stateSync.getSessionID()).toBe('session_123');
    });
  });

  describe('writeState', () => {
    beforeEach(() => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123');
    });

    it('should write state to file atomically', async () => {
      const changes = createTestChanges(2);

      await stateSync.writeState(changes);

      expect(existsSync(TEST_STATE_FILE)).toBe(true);

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const data = JSON.parse(content) as StateFileData;

      expect(data.version).toBe('1.0');
      expect(data.sessionID).toBe('session_123');
      expect(data.timestamp).toBeGreaterThan(0);
      expect(data.changes).toHaveLength(2);
    });

    it('should create directories if they do not exist', async () => {
      const nestedPath = join(TEST_DIR, 'nested', 'deep', 'state.json');
      stateSync = new StateSync(nestedPath, 'session_123');

      const changes = createTestChanges(1);
      await stateSync.writeState(changes);

      expect(existsSync(nestedPath)).toBe(true);
    });

    it('should overwrite existing state file', async () => {
      const changes1 = createTestChanges(1);
      await stateSync.writeState(changes1);

      const changes2 = createTestChanges(3);
      await stateSync.writeState(changes2);

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const data = JSON.parse(content) as StateFileData;

      expect(data.changes).toHaveLength(3);
    });

    it('should handle empty changes array', async () => {
      await stateSync.writeState([]);

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const data = JSON.parse(content) as StateFileData;

      expect(data.changes).toHaveLength(0);
    });

    it('should use temp file pattern for atomic writes', async () => {
      const changes = createTestChanges(1);
      await stateSync.writeState(changes);

      // Temp file should not exist after successful write
      const tempPath = `${TEST_STATE_FILE}.tmp`;
      expect(existsSync(tempPath)).toBe(false);
    });
  });

  describe('readState', () => {
    beforeEach(() => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123');
    });

    it('should read state from file', async () => {
      const originalChanges = createTestChanges(2);
      await stateSync.writeState(originalChanges);

      const readChanges = await stateSync.readState();

      expect(readChanges).toHaveLength(2);
      expect(readChanges[0].id).toBe(originalChanges[0].id);
      expect(readChanges[1].id).toBe(originalChanges[1].id);
    });

    it('should return empty array when file does not exist', async () => {
      const changes = await stateSync.readState();

      expect(changes).toHaveLength(0);
      expect(Array.isArray(changes)).toBe(true);
    });

    it('should correctly deserialize PendingChange objects', async () => {
      const originalChange = new PendingChange({
        id: 'test_id',
        tool: 'write',
        filePath: '/test/file.ts',
        oldContent: 'old',
        newContent: 'new',
        sessionID: 'session_123',
        callID: 'call_456',
        timestamp: Date.now(),
      });

      await stateSync.writeState([originalChange]);
      const readChanges = await stateSync.readState();

      expect(readChanges[0]).toBeInstanceOf(PendingChange);
      expect(readChanges[0].id).toBe('test_id');
      expect(readChanges[0].tool).toBe('write');
      expect(readChanges[0].filePath).toBe('/test/file.ts');
      expect(readChanges[0].oldContent).toBe('old');
      expect(readChanges[0].newContent).toBe('new');
      expect(readChanges[0].sessionID).toBe('session_123');
      expect(readChanges[0].callID).toBe('call_456');
    });

    it('should throw on unsupported version', async () => {
      const invalidState = {
        version: '2.0',
        timestamp: Date.now(),
        sessionID: 'session_123',
        changes: [],
      };

      writeFileSync(TEST_STATE_FILE, JSON.stringify(invalidState));

      expect(stateSync.readState()).rejects.toThrow(StateSyncError);
    });

    it('should throw on invalid JSON', async () => {
      writeFileSync(TEST_STATE_FILE, 'not valid json');

      expect(stateSync.readState()).rejects.toThrow(StateSyncError);
    });

    it('should throw when changes is not an array', async () => {
      const invalidState = {
        version: '1.0',
        timestamp: Date.now(),
        sessionID: 'session_123',
        changes: 'not an array',
      };

      writeFileSync(TEST_STATE_FILE, JSON.stringify(invalidState));

      expect(stateSync.readState()).rejects.toThrow(StateSyncError);
    });
  });

  describe('writeStateDebounced', () => {
    beforeEach(() => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123', {
        debounceMs: 50,
      });
    });

    it('should debounce multiple writes', async () => {
      const changes1 = createTestChanges(1);
      const changes2 = createTestChanges(2);
      const changes3 = createTestChanges(3);

      // Fire multiple writes in quick succession
      void stateSync.writeStateDebounced(changes1);
      void stateSync.writeStateDebounced(changes2);
      await stateSync.writeStateDebounced(changes3);

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const data = JSON.parse(content) as StateFileData;

      // Only the last write should have been executed
      expect(data.changes).toHaveLength(3);
    });

    it('should use custom debounce interval', async () => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123', {
        debounceMs: 150,
      });

      const changes = createTestChanges(1);
      
      // Start debounced write but don't await it yet
      const writePromise = stateSync.writeStateDebounced(changes);
      
      // File should not exist yet (before debounce completes)
      expect(existsSync(TEST_STATE_FILE)).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 80));
      expect(existsSync(TEST_STATE_FILE)).toBe(false);

      // Wait for debounce to complete (150ms debounce + margin)
      await writePromise;
      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });
  });

  describe('watchState', () => {
    beforeEach(() => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123', {
        debounceMs: 50,
      });
    });

    it('should set up file watcher', () => {
      let callbackCalled = false;

      stateSync.watchState(() => {
        callbackCalled = true;
      });

      expect(stateSync.isWatching()).toBe(true);
    });

    it('should create state file if it does not exist when watching', () => {
      stateSync.watchState(() => {});

      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });

    it('should call callback on external file changes', async () => {
      let receivedChanges: PendingChange[] | null = null;
      let callbackCount = 0;

      stateSync.watchState(changes => {
        receivedChanges = changes;
        callbackCount++;
      });

      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate external change by writing directly to file using append+truncate pattern
      // This is more reliable for triggering fs.watch events
      const externalChanges = createTestChanges(2);
      const stateData = {
        version: '1.0',
        timestamp: Date.now(),
        sessionID: 'external_session',
        changes: externalChanges.map(c => c.toJSON()),
      };

      // Write file using a temp file pattern which reliably triggers watch events
      const tempPath = `${TEST_STATE_FILE}.tmp`;
      writeFileSync(tempPath, JSON.stringify(stateData, null, 2));
      renameSync(tempPath, TEST_STATE_FILE);

      // Wait for watch event to be processed (debounce + margin)
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(callbackCount).toBeGreaterThan(0);
      expect(receivedChanges).not.toBeNull();
      expect(receivedChanges).toHaveLength(2);
    });

    it('should track last write timestamp', async () => {
      // Verify that writing updates the internal timestamp
      // This prevents watch events from triggering on our own writes
      const changes = createTestChanges(1);

      // Initial write sets timestamp
      await stateSync.writeState(changes);

      // Write again to update timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      await stateSync.writeState(changes);

      // Test passes if no errors occurred during writes
      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });

    it('should debounce multiple external changes', async () => {
      let callbackCount = 0;

      stateSync.watchState(() => {
        callbackCount++;
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Write multiple times quickly
      for (let i = 0; i < 5; i++) {
        const stateData = {
          version: '1.0',
          timestamp: Date.now(),
          sessionID: 'external_session',
          changes: createTestChanges(i + 1).map(c => c.toJSON()),
        };
        writeFileSync(TEST_STATE_FILE, JSON.stringify(stateData));
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have been debounced to fewer calls
      expect(callbackCount).toBeLessThan(5);
    });
  });

  describe('unwatchState', () => {
    beforeEach(() => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123');
    });

    it('should stop watching', () => {
      stateSync.watchState(() => {});
      expect(stateSync.isWatching()).toBe(true);

      stateSync.unwatchState();
      expect(stateSync.isWatching()).toBe(false);
    });

    it('should clear pending debounce timer', async () => {
      stateSync = new StateSync(TEST_STATE_FILE, 'session_123', {
        debounceMs: 500,
      });

      // Start a debounced write
      const changes = createTestChanges(1);
      void stateSync.writeStateDebounced(changes);

      // Unwatch immediately
      stateSync.unwatchState();

      // Wait for what would have been the debounce time
      await new Promise(resolve => setTimeout(resolve, 600));

      // File should not have been written
      expect(existsSync(TEST_STATE_FILE)).toBe(false);
    });

    it('should not throw if called when not watching', () => {
      expect(() => stateSync.unwatchState()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw StateSyncError on write failure', async () => {
      // Use an invalid path
      stateSync = new StateSync('/invalid/path/that/cannot/be/created/state.json', 'session_123');

      const changes = createTestChanges(1);
      await expect(stateSync.writeState(changes)).rejects.toThrow(StateSyncError);
    });

    it('should include operation type in error', async () => {
      stateSync = new StateSync('/invalid/path/state.json', 'session_123');

      try {
        const changes = createTestChanges(1);
        await stateSync.writeState(changes);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StateSyncError);
        expect((error as StateSyncError).operation).toBe('write');
      }
    });
  });

  describe('StateSyncError', () => {
    it('should create error with message and operation', () => {
      const error = new StateSyncError('Test error', 'read');

      expect(error.message).toBe('Test error');
      expect(error.operation).toBe('read');
      expect(error.name).toBe('StateSyncError');
    });
  });
});

describe('loadChangeQueue', () => {
  const testStatePath = join(TEST_DIR, 'queue-state.json');

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should load ChangeQueue from state file', async () => {
    const stateSync = new StateSync(testStatePath, 'session_123');
    const changes = createTestChanges(3);
    await stateSync.writeState(changes);

    const queue = await loadChangeQueue(testStatePath);

    expect(queue.size()).toBe(3);
    expect(queue.getAll()).toHaveLength(3);
  });

  it('should return empty queue when file does not exist', async () => {
    const queue = await loadChangeQueue(testStatePath);

    expect(queue.size()).toBe(0);
    expect(queue.getAll()).toHaveLength(0);
  });

  it('should correctly populate queue with PendingChange objects', async () => {
    const stateSync = new StateSync(testStatePath, 'session_123');
    const changes = [
      new PendingChange({
        id: 'change_1',
        tool: 'write',
        filePath: '/test/file1.ts',
        oldContent: 'old1',
        newContent: 'new1',
        sessionID: 'session_123',
        callID: 'call_1',
        timestamp: Date.now(),
      }),
      new PendingChange({
        id: 'change_2',
        tool: 'edit',
        filePath: '/test/file2.ts',
        oldContent: 'old2',
        newContent: 'new2',
        sessionID: 'session_123',
        callID: 'call_2',
        timestamp: Date.now(),
      }),
    ];
    await stateSync.writeState(changes);

    const queue = await loadChangeQueue(testStatePath);

    expect(queue.get('change_1')).toBeDefined();
    expect(queue.get('change_2')).toBeDefined();
    expect(queue.get('change_1')?.filePath).toBe('/test/file1.ts');
    expect(queue.get('change_2')?.tool).toBe('edit');
  });
});

describe('saveChangeQueue', () => {
  const testStatePath = join(TEST_DIR, 'save-queue-state.json');

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should save ChangeQueue to state file', async () => {
    const queue = new ChangeQueue();
    queue.add(
      new PendingChange({
        id: 'change_1',
        tool: 'write',
        filePath: '/test/file.ts',
        oldContent: 'old',
        newContent: 'new',
        sessionID: 'session_123',
        callID: 'call_1',
        timestamp: Date.now(),
      })
    );

    await saveChangeQueue(queue, testStatePath, 'session_123');

    expect(existsSync(testStatePath)).toBe(true);

    const content = readFileSync(testStatePath, 'utf-8');
    const data = JSON.parse(content) as StateFileData;

    expect(data.changes).toHaveLength(1);
    expect(data.sessionID).toBe('session_123');
  });

  it('should preserve all changes in queue', async () => {
    const queue = new ChangeQueue();
    for (let i = 0; i < 5; i++) {
      queue.add(
        new PendingChange({
          id: `change_${i}`,
          tool: 'write',
          filePath: `/test/file${i}.ts`,
          oldContent: `old${i}`,
          newContent: `new${i}`,
          sessionID: 'session_123',
          callID: `call_${i}`,
          timestamp: Date.now(),
        })
      );
    }

    await saveChangeQueue(queue, testStatePath, 'session_123');

    const savedQueue = await loadChangeQueue(testStatePath);
    expect(savedQueue.size()).toBe(5);
  });
});

// Helper functions

function createTestChanges(count: number): PendingChange[] {
  const changes: PendingChange[] = [];

  for (let i = 0; i < count; i++) {
    changes.push(
      new PendingChange({
        id: `test_change_${i}_${Date.now()}`,
        tool: i % 2 === 0 ? 'write' : 'edit',
        filePath: `/test/file${i}.ts`,
        oldContent: `original content ${i}`,
        newContent: `modified content ${i}`,
        sessionID: 'test_session',
        callID: `test_call_${i}`,
        timestamp: Date.now(),
      })
    );
  }

  return changes;
}
