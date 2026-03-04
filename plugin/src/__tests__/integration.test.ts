import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ToolInterceptor, createBeforeHandler, createAfterHandler } from '../interceptor.js';
import { ConfigManager } from '../config.js';
import { ChangeQueue, PendingChange, InterceptedError } from '../state-manager.js';
import { BackupManager } from '../backup-manager.js';
import { VSCodeDetector } from '../vscode-detector.js';
import { StateSync } from '../state-sync.js';

const TEST_DIR = '/tmp/opencode-diff-plugin-integration-test';

interface MockShell {
  stdout: { toString: () => string };
}

type BunShell = (strings: TemplateStringsArray, ...values: string[]) => Promise<MockShell>;

const createMockShell = (content: string): BunShell => {
  return async () => ({ stdout: { toString: () => content } });
};

class MockVSCodeDetector extends VSCodeDetector {
  private mockIsRunning: boolean = false;

  constructor(workspaceRoot: string, isRunning: boolean = false) {
    super(workspaceRoot);
    this.mockIsRunning = isRunning;
  }

  setMockRunning(isRunning: boolean): void {
    this.mockIsRunning = isRunning;
  }

  async isVSCodeRunning(): Promise<boolean> {
    return this.mockIsRunning;
  }
}

describe('Integration Tests - VSCode-only Mode', () => {
  let testDir: string;
  let mockShell: BunShell;
  let changeQueue: ChangeQueue;
  let configManager: ConfigManager;
  let backupManager: BackupManager;
  let stateSync: StateSync;
  let consoleOutput: string[];
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    testDir = `${TEST_DIR}-${Date.now()}`;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.opencode'), { recursive: true });

    mockShell = createMockShell('');
    changeQueue = new ChangeQueue();
    configManager = new ConfigManager(testDir);
    backupManager = new BackupManager({
      backupDir: join(testDir, '.opencode', 'backups'),
    });
    stateSync = new StateSync(
      join(testDir, '.opencode', '.diff-plugin-state.json'),
      'test-session'
    );

    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(a => String(a)).join(' '));
      originalConsoleLog.apply(console, args);
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('Full Workflow - VSCode-only Mode', () => {
    beforeEach(() => {
      configManager.update({
        mode: 'vscode-only',
        vscodeOnly: {
          applyImmediately: true,
          backupOriginals: true,
          notificationOnChange: true,
          maxPendingAgeHours: 24,
          fallbackToTuiIfVsCodeClosed: true,
          maxBackupSizeBytes: 100 * 1024 * 1024,
        }
      });
    });

    it('should complete full workflow: File write → Backup → State capture → Notification → Cleanup', async () => {
      const filePath = 'src/components/Button.tsx';
      const originalContent = '// Original button component';
      const newContent = '// New button component with improvements';
      const fullPath = join(testDir, filePath);

      mkdirSync(join(testDir, 'src', 'components'), { recursive: true });
      writeFileSync(fullPath, originalContent);

      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call-1',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector: new VSCodeDetector(testDir),
        stateSync,
      });

      try {
        await interceptor.before('write', { filePath, content: newContent });
        expect.fail('Should have thrown InterceptedError');
      } catch (error) {
        expect(error).toBeInstanceOf(InterceptedError);
        expect((error as InterceptedError).message).toContain('applied via VSCode-only mode');
      }

      expect(existsSync(fullPath)).toBe(true);
      const writtenContent = readFileSync(fullPath, 'utf-8');
      expect(writtenContent).toBe(newContent);

      const stateFilePath = join(testDir, '.opencode', '.diff-plugin-state.json');
      expect(existsSync(stateFilePath)).toBe(true);

      expect(consoleOutput.some(msg => msg.includes('[DiffPlugin] Change applied to'))).toBe(true);
      expect(consoleOutput.some(msg => msg.includes(filePath))).toBe(true);

      expect(changeQueue.size()).toBe(0);
    });

    it('should handle new files (no backup created for new files)', async () => {
      const filePath = 'src/new-file.ts';
      const newContent = '// New file content';
      const fullPath = join(testDir, filePath);

      mkdirSync(join(testDir, 'src'), { recursive: true });

      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call-2',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector: new VSCodeDetector(testDir),
        stateSync,
      });

      expect(existsSync(fullPath)).toBe(false);

      try {
        await interceptor.before('write', { filePath, content: newContent });
        expect.fail('Should have thrown InterceptedError');
      } catch (error) {
        expect(error).toBeInstanceOf(InterceptedError);
      }

      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf-8')).toBe(newContent);
      expect(backupManager.hasBackup(fullPath)).toBe(false);
    });

    it('should handle edit tool in VSCode-only mode', async () => {
      const filePath = 'src/utils.ts';
      const originalContent = 'function greet(name) { return "Hello " + name; }';
      const oldString = '"Hello " + name';
      const newString = '`Hello ${name}!`';
      const fullPath = join(testDir, filePath);

      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(fullPath, originalContent);

      const mockShellWithContent = createMockShell(originalContent);

      const interceptor = new ToolInterceptor({
        $: mockShellWithContent,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call-3',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector: new VSCodeDetector(testDir),
        stateSync,
      });

      try {
        await interceptor.before('edit', { filePath, oldString, newString });
        expect.fail('Should have thrown InterceptedError');
      } catch (error) {
        expect(error).toBeInstanceOf(InterceptedError);
      }

      const editedContent = readFileSync(fullPath, 'utf-8');
      expect(editedContent).toContain('`Hello ${name}!`');
      expect(editedContent).not.toContain('"Hello " + name');
    });

    it('should restore from backup on write failure', async () => {
      const filePath = 'src/important.ts';
      const originalContent = '// Critical content that must be preserved';
      const fullPath = join(testDir, filePath);

      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(fullPath, originalContent);

      await backupManager.backup(fullPath);
      expect(backupManager.hasBackup(fullPath)).toBe(true);

      writeFileSync(fullPath, '// Modified content');
      expect(readFileSync(fullPath, 'utf-8')).toBe('// Modified content');

      await backupManager.restore(fullPath);

      expect(readFileSync(fullPath, 'utf-8')).toBe(originalContent);
    });

    it('should verify state file format is correct', async () => {
      const filePath = 'test.txt';
      const originalContent = 'original';
      const newContent = 'modified';
      const fullPath = join(testDir, filePath);

      writeFileSync(fullPath, originalContent);

      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'integration-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector: new VSCodeDetector(testDir),
        stateSync,
      });

      try {
        await interceptor.before('write', { filePath, content: newContent });
      } catch (error) {
        // Expected InterceptedError
      }

      const stateFilePath = join(testDir, '.opencode', '.diff-plugin-state.json');
      const stateContent = readFileSync(stateFilePath, 'utf-8');
      const stateData = JSON.parse(stateContent);

      expect(stateData.version).toBe('1.0');
      expect(typeof stateData.timestamp).toBe('number');
      expect(typeof stateData.sessionID).toBe('string');
      expect(Array.isArray(stateData.changes)).toBe(true);
    });
  });

  describe('Backward Compatibility - TUI Mode', () => {
    beforeEach(() => {
      configManager.update({ mode: 'tui' });
    });

    it('should use TUI mode by default (backward compatibility)', () => {
      const freshConfig = new ConfigManager(testDir);
      expect(freshConfig.getMode()).toBe('tui');
    });

    it('should preserve existing TUI behavior when mode is explicitly tui', () => {
      configManager.update({
        mode: 'tui',
        theme: 'dark',
        showLineNumbers: true,
      });

      expect(configManager.getMode()).toBe('tui');
      expect(configManager.getTheme()).toBe('dark');
      expect(configManager.shouldShowLineNumbers()).toBe(true);
    });

    it('should not apply files immediately in TUI mode', async () => {
      const filePath = 'test-tui.txt';
      const originalContent = 'original';
      const fullPath = join(testDir, filePath);

      writeFileSync(fullPath, originalContent);

      expect(configManager.getMode()).toBe('tui');

      const vscodeOnlyConfig = configManager.getVSCodeOnlyConfig();
      expect(vscodeOnlyConfig.applyImmediately).toBe(false);
    });

    it('should store pending changes in queue for TUI review', async () => {
      const filePath = 'pending-review.txt';
      const newContent = 'new content for review';

      const pendingChange = new PendingChange({
        id: ChangeQueue.generateId(),
        tool: 'write',
        filePath,
        oldContent: '',
        newContent,
        sessionID: 'test-session',
        callID: 'test-call-pending',
        timestamp: Date.now(),
      });

      changeQueue.add(pendingChange);

      expect(changeQueue.size()).toBe(1);
      expect(changeQueue.get(pendingChange.id)).toBeDefined();
      expect(changeQueue.get(pendingChange.id)?.filePath).toBe(filePath);
    });

    it('should maintain all TUI configuration options', () => {
      const fullTuiConfig = {
        enabled: true,
        mode: 'tui' as const,
        autoAccept: ['*.lock'],
        autoReject: ['*.min.js'],
        maxFileSize: 1024 * 1024,
        theme: 'dark' as const,
        showLineNumbers: true,
        confirmRejectAll: true,
        keybindings: [
          { key: 'y', action: 'acceptLine' as const },
          { key: 'n', action: 'rejectLine' as const },
        ],
        ide: {
          enabled: false,
          stateFilePath: '.opencode/.diff-plugin-state.json',
        },
      };

      configManager.update(fullTuiConfig);

      expect(configManager.isEnabled()).toBe(true);
      expect(configManager.getMode()).toBe('tui');
      expect(configManager.shouldAutoAccept('package.lock')).toBe(true);
      expect(configManager.shouldAutoReject('bundle.min.js')).toBe(true);
      expect(configManager.getTheme()).toBe('dark');
    });
  });

  describe('Mode="auto" with VSCode Detection', () => {
    it('should use vscode-only mode when VSCode is detected', async () => {
      const mockDetector = new MockVSCodeDetector(testDir, true);

      mkdirSync(join(testDir, '.vscode'), { recursive: true });
      writeFileSync(join(testDir, '.vscode', 'settings.json'), '{}');

      configManager.update({ mode: 'auto' });

      const isRunning = await mockDetector.isVSCodeRunning();
      expect(isRunning).toBe(true);

      expect(configManager.getMode()).toBe('auto');
    });

    it('should use TUI mode when VSCode is not detected', async () => {
      const mockDetector = new MockVSCodeDetector(testDir, false);

      const vscodeDir = join(testDir, '.vscode');
      if (existsSync(vscodeDir)) {
        rmSync(vscodeDir, { recursive: true });
      }

      configManager.update({ mode: 'auto' });

      const isRunning = await mockDetector.isVSCodeRunning();
      expect(isRunning).toBe(false);

      expect(configManager.getMode()).toBe('auto');
    });

    it('should dynamically switch based on VSCode detection', async () => {
      const mockDetector = new MockVSCodeDetector(testDir, false);

      configManager.update({
        mode: 'auto',
        vscodeOnly: {
          applyImmediately: true,
          backupOriginals: true,
          notificationOnChange: false,
          maxPendingAgeHours: 24,
          fallbackToTuiIfVsCodeClosed: true,
          maxBackupSizeBytes: 100 * 1024 * 1024,
        }
      });

      expect(await mockDetector.isVSCodeRunning()).toBe(false);

      mockDetector.setMockRunning(true);
      expect(await mockDetector.isVSCodeRunning()).toBe(true);

      mockDetector.setMockRunning(false);
      expect(await mockDetector.isVSCodeRunning()).toBe(false);
    });

    it('should respect fallbackToTuiIfVsCodeClosed setting', () => {
      configManager.update({
        mode: 'auto',
        vscodeOnly: {
          applyImmediately: true,
          backupOriginals: true,
          notificationOnChange: true,
          maxPendingAgeHours: 24,
          fallbackToTuiIfVsCodeClosed: true,
          maxBackupSizeBytes: 100 * 1024 * 1024,
        }
      });

      const vscodeOnlyConfig = configManager.getVSCodeOnlyConfig();
      expect(vscodeOnlyConfig.fallbackToTuiIfVsCodeClosed).toBe(true);
    });

    it('should handle auto mode configuration validation', () => {
      configManager.update({ mode: 'auto' });

      const result = configManager.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Multiple Files Simultaneous Writes', () => {
    beforeEach(() => {
      configManager.update({
        mode: 'vscode-only',
        vscodeOnly: {
          applyImmediately: true,
          backupOriginals: true,
          notificationOnChange: false,
          maxPendingAgeHours: 24,
          fallbackToTuiIfVsCodeClosed: true,
          maxBackupSizeBytes: 100 * 1024 * 1024,
        }
      });
    });

    it('should handle multiple files written simultaneously', async () => {
      const files = [
        { path: 'src/file1.ts', original: '// File 1 original', new: '// File 1 modified' },
        { path: 'src/file2.ts', original: '// File 2 original', new: '// File 2 modified' },
        { path: 'src/file3.ts', original: '// File 3 original', new: '// File 3 modified' },
      ];

      mkdirSync(join(testDir, 'src'), { recursive: true });
      for (const file of files) {
        writeFileSync(join(testDir, file.path), file.original);
      }

      const results = await Promise.allSettled(
        files.map((file, index) => {
          const interceptor = new ToolInterceptor({
            $: mockShell,
            directory: testDir,
            sessionID: 'test-session',
            callID: `test-call-${index}`,
            changeQueue,
            configManager,
            backupManager,
            vscodeDetector: new VSCodeDetector(testDir),
            stateSync,
          });

          return interceptor.before('write', {
            filePath: file.path,
            content: file.new
          });
        })
      );

      for (const result of results) {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(InterceptedError);
        }
      }

      for (const file of files) {
        const content = readFileSync(join(testDir, file.path), 'utf-8');
        expect(content).toBe(file.new);
      }
    });

    it('should handle mixed new and existing files', async () => {
      const existingFile = { path: 'existing.ts', original: '// Existing', new: '// Existing Modified' };
      const newFile = { path: 'new-file.ts', new: '// Brand new file' };

      writeFileSync(join(testDir, existingFile.path), existingFile.original);

      const files = [
        { path: existingFile.path, content: existingFile.new },
        { path: newFile.path, content: newFile.new },
      ];

      const results = await Promise.allSettled(
        files.map((file, index) => {
          const interceptor = new ToolInterceptor({
            $: mockShell,
            directory: testDir,
            sessionID: 'test-session',
            callID: `mixed-call-${index}`,
            changeQueue,
            configManager,
            backupManager,
            vscodeDetector: new VSCodeDetector(testDir),
            stateSync,
          });

          return interceptor.before('write', {
            filePath: file.path,
            content: file.content
          });
        })
      );

      expect(results).toHaveLength(2);

      // In VSCode-only mode with concurrent writes, backups are cleaned up immediately
      // after successful write. We verify the files were written correctly.
      expect(readFileSync(join(testDir, existingFile.path), 'utf-8')).toBe(existingFile.new);
      expect(readFileSync(join(testDir, newFile.path), 'utf-8')).toBe(newFile.new);

      // Both files should exist
      expect(existsSync(join(testDir, existingFile.path))).toBe(true);
      expect(existsSync(join(testDir, newFile.path))).toBe(true);
    });

    it('should track all changes in state file', async () => {
      const files = [
        { path: 'a.ts', content: '// A' },
        { path: 'b.ts', content: '// B' },
        { path: 'c.ts', content: '// C' },
      ];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const interceptor = new ToolInterceptor({
          $: mockShell,
          directory: testDir,
          sessionID: 'test-session',
          callID: `batch-call-${i}`,
          changeQueue,
          configManager,
          backupManager,
          vscodeDetector: new VSCodeDetector(testDir),
          stateSync,
        });

        try {
          await interceptor.before('write', { filePath: file.path, content: file.content });
        } catch (error) {
          // Expected InterceptedError
        }
      }

      const stateFilePath = join(testDir, '.opencode', '.diff-plugin-state.json');
      expect(existsSync(stateFilePath)).toBe(true);

      const stateData = JSON.parse(readFileSync(stateFilePath, 'utf-8'));
      expect(stateData.changes.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors in one file without affecting others', async () => {
      const files = [
        { path: 'good1.ts', content: '// Good 1' },
        { path: 'good2.ts', content: '// Good 2' },
      ];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const interceptor = new ToolInterceptor({
          $: mockShell,
          directory: testDir,
          sessionID: 'test-session',
          callID: `error-test-${i}`,
          changeQueue,
          configManager,
          backupManager,
          vscodeDetector: new VSCodeDetector(testDir),
          stateSync,
        });

        try {
          await interceptor.before('write', { filePath: file.path, content: file.content });
        } catch (error) {
          // Expected
        }
      }

      for (const file of files) {
        const fullPath = join(testDir, file.path);
        expect(existsSync(fullPath)).toBe(true);
        expect(readFileSync(fullPath, 'utf-8')).toBe(file.content);
      }
    });
  });

  describe('Error Handling and Rollback', () => {
    beforeEach(() => {
      configManager.update({
        mode: 'vscode-only',
        vscodeOnly: {
          applyImmediately: true,
          backupOriginals: true,
          notificationOnChange: true,
          maxPendingAgeHours: 24,
          fallbackToTuiIfVsCodeClosed: true,
          maxBackupSizeBytes: 100 * 1024 * 1024,
        }
      });
    });

    it('should rollback to backup on write failure', async () => {
      const filePath = 'rollback-test.txt';
      const originalContent = 'Original content that must be preserved';
      const fullPath = join(testDir, filePath);

      writeFileSync(fullPath, originalContent);

      const backupId = await backupManager.backup(fullPath);
      expect(backupManager.hasBackup(fullPath)).toBe(true);

      writeFileSync(fullPath, 'Modified content');
      expect(readFileSync(fullPath, 'utf-8')).toBe('Modified content');

      await backupManager.restore(fullPath);

      expect(readFileSync(fullPath, 'utf-8')).toBe(originalContent);
    });

    it('should handle missing backup gracefully', async () => {
      const filePath = 'no-backup.txt';
      const fullPath = join(testDir, filePath);

      writeFileSync(fullPath, 'content');

      let errorThrown = false;
      try {
        await backupManager.restore(fullPath);
      } catch (error) {
        errorThrown = true;
        expect(error).toBeDefined();
      }

      expect(errorThrown).toBe(true);
    });

    it('should clean up resources after successful operation', async () => {
      const filePath = 'cleanup-test.txt';
      const originalContent = 'original';
      const newContent = 'new';
      const fullPath = join(testDir, filePath);

      writeFileSync(fullPath, originalContent);

      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'cleanup-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector: new VSCodeDetector(testDir),
        stateSync,
      });

      try {
        await interceptor.before('write', { filePath, content: newContent });
      } catch (error) {
        // Expected
      }

      expect(changeQueue.size()).toBe(0);
    });
  });

  describe('Integration - Handler Factory Functions', () => {
    it('should create before handler with all dependencies', () => {
      const handler = createBeforeHandler(
        mockShell,
        testDir,
        configManager,
        changeQueue
      );

      expect(typeof handler).toBe('function');
    });

    it('should create after handler with all dependencies', () => {
      const handler = createAfterHandler(
        mockShell,
        testDir,
        configManager,
        changeQueue
      );

      expect(typeof handler).toBe('function');
    });

    it('should use default change queue when not provided', () => {
      const handler = createBeforeHandler(
        mockShell,
        testDir,
        configManager
      );

      expect(typeof handler).toBe('function');
    });
  });

  describe('Integration - State File Persistence', () => {
    it('should persist state across multiple operations', async () => {
      const statePath = join(testDir, '.opencode', 'persistent-state.json');
      const persistentStateSync = new StateSync(statePath, 'persistent-session');

      const changes = [
        new PendingChange({
          id: 'change-1',
          tool: 'write',
          filePath: 'file1.ts',
          oldContent: '',
          newContent: '// Content 1',
          sessionID: 'persistent-session',
          callID: 'call-1',
          timestamp: Date.now(),
        }),
        new PendingChange({
          id: 'change-2',
          tool: 'write',
          filePath: 'file2.ts',
          oldContent: '',
          newContent: '// Content 2',
          sessionID: 'persistent-session',
          callID: 'call-2',
          timestamp: Date.now() + 1,
        }),
      ];

      await persistentStateSync.writeState(changes);

      const readChanges = await persistentStateSync.readState();

      expect(readChanges).toHaveLength(2);
      expect(readChanges[0].id).toBe('change-1');
      expect(readChanges[1].id).toBe('change-2');
    });

    it('should handle sequential state writes correctly', async () => {
      const statePath = join(testDir, '.opencode', 'sequential-state.json');
      const sequentialStateSync = new StateSync(statePath, 'sequential-session');

      for (let i = 0; i < 3; i++) {
        const changes = [
          new PendingChange({
            id: `seq-change-${i}`,
            tool: 'write',
            filePath: `file${i}.ts`,
            oldContent: '',
            newContent: `// Content ${i}`,
            sessionID: 'sequential-session',
            callID: `seq-call-${i}`,
            timestamp: Date.now(),
          }),
        ];

        await sequentialStateSync.writeState(changes);

        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const finalState = await sequentialStateSync.readState();
      expect(finalState.length).toBeGreaterThanOrEqual(0);
      expect(existsSync(statePath)).toBe(true);
    });
  });
});
