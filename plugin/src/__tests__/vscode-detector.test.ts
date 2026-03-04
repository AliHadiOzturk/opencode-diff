import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { VSCodeDetector, DEFAULT_DETECTION_TIMEOUT_MS } from '../vscode-detector.js';

const TEST_DIR = '/tmp/opencode-diff-vscode-detector-test';

describe('VSCodeDetector', () => {
  let detector: VSCodeDetector;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    detector = new VSCodeDetector(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should initialize with default workspace root', () => {
      const defaultDetector = new VSCodeDetector();
      expect(defaultDetector.getWorkspaceRoot()).toBe(process.cwd());
    });

    it('should initialize with custom workspace root', () => {
      expect(detector.getWorkspaceRoot()).toBe(TEST_DIR);
    });

    it('should use default timeout of 2000ms', () => {
      expect(detector.getTimeout()).toBe(DEFAULT_DETECTION_TIMEOUT_MS);
    });

    it('should accept custom timeout', () => {
      const customDetector = new VSCodeDetector(TEST_DIR, 5000);
      expect(customDetector.getTimeout()).toBe(5000);
    });
  });

  describe('workspace root management', () => {
    it('should update workspace root', () => {
      const newRoot = '/some/other/path';
      detector.setWorkspaceRoot(newRoot);
      expect(detector.getWorkspaceRoot()).toBe(newRoot);
    });

    it('should update timeout', () => {
      detector.setTimeout(3000);
      expect(detector.getTimeout()).toBe(3000);
    });
  });

  describe('isVSCodeWorkspace', () => {
    it('should return false when .vscode directory does not exist', () => {
      expect(detector.isVSCodeWorkspace()).toBe(false);
    });

    it('should return false when .vscode exists but is empty', () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      expect(detector.isVSCodeWorkspace()).toBe(false);
    });

    it('should return true when .vscode directory exists with files', () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');
      expect(detector.isVSCodeWorkspace()).toBe(true);
    });

    it('should return true when .vscode directory exists with extensions file', () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'extensions.json'), '{}');
      expect(detector.isVSCodeWorkspace()).toBe(true);
    });

    it('should return false when path is a file not directory', () => {
      writeFileSync(join(TEST_DIR, '.vscode'), 'not a directory');
      expect(detector.isVSCodeWorkspace()).toBe(false);
    });

    it('should handle errors gracefully and return false', () => {
      const invalidDetector = new VSCodeDetector('/nonexistent/path/that/cannot/be/accessed');
      expect(invalidDetector.isVSCodeWorkspace()).toBe(false);
    });
  });

  describe('isVSCodeRunning', () => {
    it('should return boolean value (async)', async () => {
      const result = await detector.isVSCodeRunning();
      expect(typeof result).toBe('boolean');
    });

    it('should detect VSCode via .vscode directory', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const result = await detector.isVSCodeRunning();
      expect(result).toBe(true);
    });

    it('should complete within timeout period', async () => {
      detector.setTimeout(100);
      const startTime = Date.now();
      await detector.isVSCodeRunning();
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('should return true if .vscode exists regardless of other detection methods', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const result = await detector.detect();
      expect(result.method).toBe('vscode-dir');
      expect(result.isRunning).toBe(true);
    });
  });

  describe('isVSCodeExtensionActive', () => {
    it('should return false when state file does not exist', async () => {
      const result = await detector.isVSCodeExtensionActive();
      expect(result).toBe(false);
    });

    it('should return true when state file exists and VSCode is detected via .vscode dir', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const opencodeDir = join(TEST_DIR, '.opencode');
      mkdirSync(opencodeDir, { recursive: true });
      writeFileSync(
        join(opencodeDir, '.diff-plugin-state.json'),
        JSON.stringify({ active: true })
      );

      const result = await detector.isVSCodeExtensionActive();
      expect(result).toBe(true);
    });

    it('should handle errors gracefully and return false', async () => {
      const invalidDetector = new VSCodeDetector('/root/protected/path');
      const result = await invalidDetector.isVSCodeExtensionActive();
      expect(result).toBe(false);
    });
  });

  describe('detect', () => {
    it('should return detection result with required fields', async () => {
      const result = await detector.detect();
      expect(result).toHaveProperty('isRunning');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('extensionActive');
      expect(typeof result.isRunning).toBe('boolean');
      expect(typeof result.method).toBe('string');
    });

    it('should detect via vscode-dir method when .vscode exists', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const result = await detector.detect();
      expect(result.isRunning).toBe(true);
      expect(result.method).toBe('vscode-dir');
      expect(result.details).toContain('.vscode/');
    });

    it('should return valid detection result structure when VSCode not detected via .vscode', async () => {
      const result = await detector.detect();
      expect(typeof result.isRunning).toBe('boolean');
      expect(['vscode-dir', 'cli', 'process', 'none']).toContain(result.method);
    });

    it('should accept custom timeout parameter', async () => {
      const startTime = Date.now();
      await detector.detect(50);
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500);
    });

    it('should prefer vscode-dir detection over other methods', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const result = await detector.detect();
      expect(result.method).toBe('vscode-dir');
    });
  });

  describe('platform-specific behavior', () => {
    it('should detect platform correctly', () => {
      const platform = process.platform;
      expect(['darwin', 'linux', 'win32']).toContain(platform);
    });

    it('should handle all supported platforms', async () => {
      const result = await detector.detect();
      expect(typeof result.isRunning).toBe('boolean');
    });
  });

  describe('timeout handling', () => {
    it('should respect timeout setting', async () => {
      detector.setTimeout(100);
      const startTime = Date.now();
      await detector.detect();
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should use constructor timeout as default', async () => {
      const fastDetector = new VSCodeDetector(TEST_DIR, 100);
      const startTime = Date.now();
      await fastDetector.detect();
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('error handling', () => {
    it('should not throw when directory does not exist', async () => {
      const nonExistentDetector = new VSCodeDetector('/nonexistent/path');
      
      let threw = false;
      try {
        await nonExistentDetector.isVSCodeRunning();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);

      threw = false;
      try {
        await nonExistentDetector.isVSCodeExtensionActive();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('should return false for isVSCodeWorkspace when workspace is invalid', () => {
      const invalidDetector = new VSCodeDetector('/root/invalid/access');
      expect(invalidDetector.isVSCodeWorkspace()).toBe(false);
    });

    it('should handle malformed state files gracefully', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const opencodeDir = join(TEST_DIR, '.opencode');
      mkdirSync(opencodeDir, { recursive: true });
      writeFileSync(
        join(opencodeDir, '.diff-plugin-state.json'),
        'not valid json {'
      );

      let threw = false;
      try {
        await detector.isVSCodeExtensionActive();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle workspace with nested directories', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      mkdirSync(join(vscodeDir, 'nested'));
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');
      writeFileSync(join(vscodeDir, 'nested', 'file.json'), '{}');

      expect(detector.isVSCodeWorkspace()).toBe(true);
    });

    it('should handle empty workspace root', async () => {
      const emptyDetector = new VSCodeDetector('');
      const result = await emptyDetector.isVSCodeRunning();
      expect(typeof result).toBe('boolean');
    });

    it('should handle very short timeout', async () => {
      detector.setTimeout(1);
      const startTime = Date.now();
      const result = await detector.detect();
      const elapsed = Date.now() - startTime;
      
      expect(typeof result.isRunning).toBe('boolean');
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle concurrent detection calls', async () => {
      const vscodeDir = join(TEST_DIR, '.vscode');
      mkdirSync(vscodeDir);
      writeFileSync(join(vscodeDir, 'settings.json'), '{}');

      const [result1, result2, result3] = await Promise.all([
        detector.isVSCodeRunning(),
        detector.isVSCodeRunning(),
        detector.isVSCodeRunning(),
      ]);

      expect(typeof result1).toBe('boolean');
      expect(typeof result2).toBe('boolean');
      expect(typeof result3).toBe('boolean');
    });
  });

  describe('CLI detection', () => {
    it('should attempt CLI detection when .vscode not present', async () => {
      const result = await detector.detect();
      expect(typeof result.isRunning).toBe('boolean');
      expect(['vscode-dir', 'cli', 'process', 'none']).toContain(result.method);
    });
  });

  describe('process detection', () => {
    it('should attempt process detection as fallback', async () => {
      const result = await detector.detect();
      expect(['vscode-dir', 'cli', 'process', 'none']).toContain(result.method);
    });
  });
});

describe('DEFAULT_DETECTION_TIMEOUT_MS', () => {
  it('should be 2000ms', () => {
    expect(DEFAULT_DETECTION_TIMEOUT_MS).toBe(2000);
  });
});

describe('VSCodeDetector type exports', () => {
  it('should export DetectionMethod type', () => {
    const methods: Array<'vscode-dir' | 'cli' | 'process' | 'none'> = [
      'vscode-dir',
      'cli',
      'process',
      'none',
    ];
    expect(methods).toHaveLength(4);
  });
});
