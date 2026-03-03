import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  ConfigManager,
  DEFAULT_CONFIG,
  ConfigValidationError,
  type PluginConfig,
  type KeybindingConfig,
} from '../config.js';
import type { KeyboardAction } from '../ui/keyboard-handler.js';

const TEST_DIR = '/tmp/opencode-diff-plugin-test';

describe('ConfigManager', () => {
  let configManager: ConfigManager;

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

  describe('initialization', () => {
    it('should use default config when no config file exists', () => {
      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.isEnabled()).toBe(DEFAULT_CONFIG.enabled);
      expect(configManager.getTheme()).toBe(DEFAULT_CONFIG.theme);
      expect(configManager.getMaxFileSize()).toBe(DEFAULT_CONFIG.maxFileSize);
      expect(configManager.shouldShowLineNumbers()).toBe(DEFAULT_CONFIG.showLineNumbers);
      expect(configManager.shouldConfirmRejectAll()).toBe(DEFAULT_CONFIG.confirmRejectAll);
    });

    it('should have default IDE config with enabled false', () => {
      configManager = new ConfigManager(TEST_DIR);

      const config = configManager.getConfig();
      expect(config.ide).toBeDefined();
      expect(config.ide?.enabled).toBe(false);
      expect(config.ide?.stateFilePath).toBe('.opencode/.diff-plugin-state.json');
    });

    it('should load IDE config from file when it exists', () => {
      const customConfig: Partial<PluginConfig> = {
        ide: {
          enabled: true,
          stateFilePath: '.custom/state.json',
        },
      };

      const configDir = join(TEST_DIR, '.opencode');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'diff-plugin.json'),
        JSON.stringify(customConfig)
      );

      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.getConfig().ide?.enabled).toBe(true);
      expect(configManager.getConfig().ide?.stateFilePath).toBe('.custom/state.json');
    });

    it('should merge partial IDE config with defaults', () => {
      const partialConfig: Partial<PluginConfig> = {
        ide: {
          enabled: true,
        },
      };

      const configDir = join(TEST_DIR, '.opencode');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'diff-plugin.json'),
        JSON.stringify(partialConfig)
      );

      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.getConfig().ide?.enabled).toBe(true);
      expect(configManager.getConfig().ide?.stateFilePath).toBe('.opencode/.diff-plugin-state.json');
    });

    it('should load config from file when it exists', () => {
      const customConfig: Partial<PluginConfig> = {
        enabled: false,
        theme: 'dark',
        maxFileSize: 512 * 1024,
      };

      const configDir = join(TEST_DIR, '.opencode');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'diff-plugin.json'),
        JSON.stringify(customConfig)
      );

      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.isEnabled()).toBe(false);
      expect(configManager.getTheme()).toBe('dark');
      expect(configManager.getMaxFileSize()).toBe(512 * 1024);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig: Partial<PluginConfig> = {
        theme: 'light',
      };

      const configDir = join(TEST_DIR, '.opencode');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'diff-plugin.json'),
        JSON.stringify(partialConfig)
      );

      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.getTheme()).toBe('light');
      expect(configManager.isEnabled()).toBe(DEFAULT_CONFIG.enabled);
      expect(configManager.getMaxFileSize()).toBe(DEFAULT_CONFIG.maxFileSize);
    });

    it('should fall back to defaults on invalid JSON', () => {
      const configDir = join(TEST_DIR, '.opencode');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, 'diff-plugin.json'),
        'not valid json'
      );

      configManager = new ConfigManager(TEST_DIR);

      expect(configManager.getConfig()).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      configManager = new ConfigManager(TEST_DIR);
    });

    it('should validate default config as valid', () => {
      const result = configManager.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid enabled type', () => {
      configManager.update({ enabled: 'true' as unknown as boolean });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('enabled must be a boolean');
    });

    it('should detect invalid autoAccept type', () => {
      configManager.update({ autoAccept: 'pattern' as unknown as string[] });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('autoAccept must be an array');
    });

    it('should detect invalid autoAccept items', () => {
      configManager.update({ autoAccept: ['valid', 123 as unknown as string] });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('autoAccept[1] must be a string');
    });

    it('should detect invalid autoReject type', () => {
      configManager.update({ autoReject: 'pattern' as unknown as string[] });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('autoReject must be an array');
    });

    it('should detect invalid maxFileSize', () => {
      configManager.update({ maxFileSize: -1 });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxFileSize must be a non-negative number');
    });

    it('should detect invalid theme', () => {
      configManager.update({ theme: 'blue' as 'light' });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('theme must be "light", "dark", or "auto"');
    });

    it('should accept valid theme values', () => {
      for (const theme of ['light', 'dark', 'auto'] as const) {
        configManager.update({ theme });
        const result = configManager.validate();
        expect(result.valid).toBe(true);
      }
    });

    it('should detect invalid showLineNumbers type', () => {
      configManager.update({ showLineNumbers: 'yes' as unknown as boolean });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('showLineNumbers must be a boolean');
    });

    it('should detect invalid confirmRejectAll type', () => {
      configManager.update({ confirmRejectAll: 'yes' as unknown as boolean });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('confirmRejectAll must be a boolean');
    });

    it('should detect invalid keybindings type', () => {
      configManager.update({ keybindings: 'binding' as unknown as KeybindingConfig[] });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('keybindings must be an array');
    });

    it('should detect invalid keybinding key', () => {
      configManager.update({
        keybindings: [{ key: '', action: 'acceptLine' }],
      });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('key must be a non-empty string'))).toBe(true);
    });

    it('should detect invalid keybinding action', () => {
      configManager.update({
        keybindings: [{ key: 'x', action: 'invalidAction' as KeyboardAction }],
      });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('action must be a valid KeyboardAction'))).toBe(true);
    });

    it('should validate valid keybindings', () => {
      configManager.update({
        keybindings: [
          { key: 'x', action: 'acceptLine' },
          { key: 'Ctrl+s', action: 'acceptAll', description: 'Custom save' },
        ],
      });
      const result = configManager.validate();
      expect(result.valid).toBe(true);
    });

    it('should validate default IDE config as valid', () => {
      const result = configManager.validate();
      expect(result.valid).toBe(true);
    });

    it('should validate IDE config with enabled true', () => {
      configManager.update({
        ide: { enabled: true, stateFilePath: '.custom/state.json' },
      });
      const result = configManager.validate();
      expect(result.valid).toBe(true);
    });

    it('should detect invalid ide type', () => {
      configManager.update({ ide: 'invalid' as unknown as PluginConfig['ide'] });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ide must be an object');
    });

    it('should detect invalid ide.enabled type', () => {
      configManager.update({ ide: { enabled: 'yes' } });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ide.enabled must be a boolean');
    });

    it('should detect invalid ide.stateFilePath type', () => {
      configManager.update({ ide: { stateFilePath: 123 } });
      const result = configManager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ide.stateFilePath must be a string');
    });

    it('should throw on validateOrThrow when invalid', () => {
      configManager.update({ enabled: 'invalid' as unknown as boolean });
      expect(() => configManager.validateOrThrow()).toThrow(ConfigValidationError);
    });

    it('should not throw on validateOrThrow when valid', () => {
      expect(() => configManager.validateOrThrow()).not.toThrow();
    });
  });

  describe('save and reload', () => {
    beforeEach(() => {
      configManager = new ConfigManager(TEST_DIR);
    });

    it('should save config to file', () => {
      configManager.update({ theme: 'dark', maxFileSize: 2048 });
      configManager.save();

      const configPath = join(TEST_DIR, '.opencode', 'diff-plugin.json');
      expect(existsSync(configPath)).toBe(true);

      const saved = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.theme).toBe('dark');
      expect(saved.maxFileSize).toBe(2048);
    });

    it('should reload config from file', () => {
      configManager.update({ theme: 'dark' });
      configManager.save();

      const newManager = new ConfigManager(TEST_DIR);
      expect(newManager.getTheme()).toBe('dark');
    });

    it('should reset to defaults', () => {
      configManager.update({ theme: 'dark', enabled: false });
      configManager.reset();

      expect(configManager.getTheme()).toBe(DEFAULT_CONFIG.theme);
      expect(configManager.isEnabled()).toBe(DEFAULT_CONFIG.enabled);
    });
  });

  describe('glob pattern matching', () => {
    beforeEach(() => {
      configManager = new ConfigManager(TEST_DIR);
    });

    it('should match simple glob patterns', () => {
      configManager.update({ autoAccept: ['*.js'] });

      expect(configManager.shouldAutoAccept('file.js')).toBe(true);
      expect(configManager.shouldAutoAccept('file.ts')).toBe(false);
    });

    it('should match multiple patterns', () => {
      configManager.update({ autoAccept: ['*.js', '*.ts'] });

      expect(configManager.shouldAutoAccept('file.js')).toBe(true);
      expect(configManager.shouldAutoAccept('file.ts')).toBe(true);
      expect(configManager.shouldAutoAccept('file.py')).toBe(false);
    });

    it('should match path patterns', () => {
      configManager.update({ autoAccept: ['src/**/*.js'] });

      expect(configManager.shouldAutoAccept('src/file.js')).toBe(true);
      expect(configManager.shouldAutoAccept('src/components/file.js')).toBe(true);
      expect(configManager.shouldAutoAccept('test/file.js')).toBe(false);
    });

    it('should match globstar patterns', () => {
      configManager.update({ autoAccept: ['**/node_modules/**'] });

      expect(configManager.shouldAutoAccept('node_modules/package/file.js')).toBe(true);
      expect(configManager.shouldAutoAccept('project/node_modules/package/file.js')).toBe(true);
    });

    it('should match single character wildcards', () => {
      configManager.update({ autoAccept: ['file?.js'] });

      expect(configManager.shouldAutoAccept('file1.js')).toBe(true);
      expect(configManager.shouldAutoAccept('fileA.js')).toBe(true);
      expect(configManager.shouldAutoAccept('file.js')).toBe(false);
    });

    it('should handle auto-reject patterns', () => {
      configManager.update({ autoReject: ['*.test.js'] });

      expect(configManager.shouldAutoReject('file.test.js')).toBe(true);
      expect(configManager.shouldAutoReject('file.js')).toBe(false);
    });
  });

  describe('file size checking', () => {
    beforeEach(() => {
      configManager = new ConfigManager(TEST_DIR);
    });

    it('should detect files exceeding max size', () => {
      configManager.update({ maxFileSize: 1000 });

      expect(configManager.isFileTooLarge(1500)).toBe(true);
      expect(configManager.isFileTooLarge(500)).toBe(false);
    });

    it('should allow any size when maxFileSize is 0', () => {
      configManager.update({ maxFileSize: 0 });

      expect(configManager.isFileTooLarge(1000000)).toBe(false);
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      configManager = new ConfigManager(TEST_DIR);
    });

    it('should return auto-accept patterns copy', () => {
      const patterns = configManager.getAutoAcceptPatterns();
      patterns.push('new-pattern');

      expect(configManager.getAutoAcceptPatterns()).not.toContain('new-pattern');
    });

    it('should return auto-reject patterns copy', () => {
      const patterns = configManager.getAutoRejectPatterns();
      patterns.push('new-pattern');

      expect(configManager.getAutoRejectPatterns()).not.toContain('new-pattern');
    });

    it('should return keybindings copy', () => {
      configManager.update({
        keybindings: [{ key: 'x', action: 'acceptLine' }],
      });

      const bindings = configManager.getKeybindings();
      bindings.push({ key: 'y', action: 'rejectLine' });

      expect(configManager.getKeybindings()).toHaveLength(1);
    });

    it('should return full config copy', () => {
      const config = configManager.getConfig();
      config.theme = 'dark';

      expect(configManager.getTheme()).toBe(DEFAULT_CONFIG.theme);
    });

    it('should return config path', () => {
      const path = configManager.getConfigPath();
      expect(path).toBe(join(TEST_DIR, '.opencode', 'diff-plugin.json'));
    });
  });
});

function readFileSync(path: string, encoding: BufferEncoding): string {
  const fs = require('fs');
  return fs.readFileSync(path, encoding);
}
