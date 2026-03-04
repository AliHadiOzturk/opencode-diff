import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ToolInterceptor, createBeforeHandler, createAfterHandler } from '../interceptor.js';
import { ConfigManager } from '../config.js';
import { ChangeQueue, PendingChange, InterceptedError } from '../state-manager.js';
import { BackupManager } from '../backup-manager.js';
import { VSCodeDetector } from '../vscode-detector.js';
import { StateSync } from '../state-sync.js';

const TEST_DIR = '/tmp/opencode-diff-plugin-interceptor-test';

interface MockShell {
  stdout: { toString: () => string };
}

type BunShell = (strings: TemplateStringsArray, ...values: string[]) => Promise<MockShell>;

const createMockShell = (content: string): BunShell => {
  return async () => ({ stdout: { toString: () => content } });
};

describe('ToolInterceptor', () => {
  let testDir: string;
  let mockShell: BunShell;
  let changeQueue: ChangeQueue;
  let configManager: ConfigManager;
  let backupManager: BackupManager;
  let vscodeDetector: VSCodeDetector;
  let stateSync: StateSync;

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
    vscodeDetector = new VSCodeDetector(testDir);
    stateSync = new StateSync(
      join(testDir, '.opencode', '.diff-plugin-state.json'),
      'test-session'
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('mode detection', () => {
    it('should use TUI mode when mode is "tui"', async () => {
      configManager.update({ mode: 'tui' });
      
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      expect(configManager.getMode()).toBe('tui');
    });

    it('should use vscode-only mode when mode is "vscode-only"', async () => {
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
      
      expect(configManager.getMode()).toBe('vscode-only');
    });

    it('should use auto mode with vscode-only when VSCode is detected', async () => {
      configManager.update({ mode: 'auto' });
      
      mkdirSync(join(testDir, '.vscode'), { recursive: true });
      writeFileSync(join(testDir, '.vscode', 'settings.json'), '{}');
      
      const isRunning = await vscodeDetector.isVSCodeRunning();
      expect(isRunning).toBe(true);
    });

    it('should use auto mode with tui when VSCode is not detected', async () => {
      configManager.update({ mode: 'auto' });

      const isolatedDir = `${TEST_DIR}-isolated-${Date.now()}`;
      mkdirSync(isolatedDir, { recursive: true });
      
      const detector = new VSCodeDetector(isolatedDir);
      const detectionResult = await detector.detect(100);
      
      const isVSCodeWorkspace = detector.isVSCodeWorkspace();
      rmSync(isolatedDir, { recursive: true, force: true });

      expect(isVSCodeWorkspace).toBe(false);
      expect(detectionResult.isRunning).toBe(detectionResult.method !== 'none');
    });
  });

  describe('vscode-only mode', () => {
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

    it('should create backup before writing file', async () => {
      const filePath = 'test.txt';
      const originalContent = 'original content';
      const fullPath = join(testDir, filePath);
      
      writeFileSync(fullPath, originalContent);
      
      const backupId = await backupManager.backup(fullPath);
      
      expect(backupId).toBeDefined();
      expect(backupManager.hasBackup(fullPath)).toBe(true);
    });

    it('should write file content', async () => {
      const filePath = 'test.txt';
      const newContent = 'new content';
      const fullPath = join(testDir, filePath);
      
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      await (interceptor as any).applyFileWrite(filePath, newContent);
      
      const writtenContent = readFileSync(fullPath, 'utf-8');
      expect(writtenContent).toBe(newContent);
    });

    it('should create parent directories when writing file', async () => {
      const filePath = 'nested/dir/test.txt';
      const newContent = 'nested content';
      const fullPath = join(testDir, filePath);
      
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      await (interceptor as any).applyFileWrite(filePath, newContent);
      
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf-8')).toBe(newContent);
    });

    it('should restore from backup on failure', async () => {
      const filePath = 'test.txt';
      const originalContent = 'original content';
      const fullPath = join(testDir, filePath);
      
      writeFileSync(fullPath, originalContent);
      
      await backupManager.backup(fullPath);
      expect(backupManager.hasBackup(fullPath)).toBe(true);
      
      writeFileSync(fullPath, 'corrupted content');
      
      await backupManager.restore(fullPath);
      
      const restoredContent = readFileSync(fullPath, 'utf-8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should update state file with change info', async () => {
      const change = new PendingChange({
        id: 'test-change-1',
        tool: 'write',
        filePath: 'test.txt',
        oldContent: '',
        newContent: 'new content',
        sessionID: 'test-session',
        callID: 'test-call',
        timestamp: Date.now(),
      });

      changeQueue.add(change);
      
      await stateSync.writeState(changeQueue.getAll());
      
      const changes = await stateSync.readState();
      expect(changes.length).toBe(1);
      expect(changes[0].id).toBe('test-change-1');
      expect(changes[0].filePath).toBe('test.txt');
    });
  });

  describe('createBeforeHandler', () => {
    it('should create handler with dependencies', () => {
      const handler = createBeforeHandler(
        mockShell,
        testDir,
        configManager,
        changeQueue
      );

      expect(typeof handler).toBe('function');
    });
  });

  describe('createAfterHandler', () => {
    it('should create handler with dependencies', () => {
      const handler = createAfterHandler(
        mockShell,
        testDir,
        configManager,
        changeQueue
      );

      expect(typeof handler).toBe('function');
    });
  });

  describe('computeNewContent', () => {
    it('should return content for write tool', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      const result = (interceptor as any).computeNewContent('write', '', { content: 'new content' });
      expect(result).toBe('new content');
    });

    it('should apply edit for edit tool', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      const oldContent = 'hello world';
      const result = (interceptor as any).computeNewContent('edit', oldContent, { 
        oldString: 'world', 
        newString: 'universe' 
      });
      expect(result).toBe('hello universe');
    });
  });

  describe('resolvePath', () => {
    it('should return absolute path as-is', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      const result = (interceptor as any).resolvePath('/absolute/path.txt');
      expect(result).toBe('/absolute/path.txt');
    });

    it('should resolve relative path against directory', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      const result = (interceptor as any).resolvePath('relative/path.txt');
      expect(result).toBe(`${testDir}/relative/path.txt`);
    });
  });

  describe('extractFilePath', () => {
    it('should extract filePath from args', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      const result = (interceptor as any).extractFilePath('write', { filePath: 'test.txt' });
      expect(result.filePath).toBe('test.txt');
    });

    it('should throw error for non-object args', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      expect(() => (interceptor as any).extractFilePath('write', null)).toThrow('Invalid arguments');
    });

    it('should throw error for non-string filePath', () => {
      const interceptor = new ToolInterceptor({
        $: mockShell,
        directory: testDir,
        sessionID: 'test-session',
        callID: 'test-call',
        changeQueue,
        configManager,
        backupManager,
        vscodeDetector,
        stateSync,
      });

      expect(() => (interceptor as any).extractFilePath('write', { filePath: 123 })).toThrow('Invalid filePath');
    });
  });
});
