/**
 * Configuration System for OpenCode Diff Plugin
 *
 * Manages plugin configuration loading, validation, and access.
 * Configuration is stored in .opencode/diff-plugin.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { KeyboardAction } from './ui/keyboard-handler.js';

/**
 * Custom keybinding configuration
 */
export interface KeybindingConfig {
  /** The key or key combination (e.g., 'y', 'Ctrl+a', 'Shift+Enter') */
  key: string;
  /** The action to trigger */
  action: KeyboardAction;
  /** Optional description override */
  description?: string;
}

/**
 * IDE integration configuration
 */
export interface IDEConfig {
  /** Whether IDE integration is enabled */
  enabled?: boolean;
  /** Path to the state file for persistence */
  stateFilePath?: string;
}

/**
 * VSCode-only mode configuration
 */
export interface VSCodeOnlyConfig {
  /** Whether to apply changes immediately without TUI */
  applyImmediately: boolean;
  /** Whether to backup original files before applying changes */
  backupOriginals: boolean;
  /** Whether to show notifications when changes are applied */
  notificationOnChange: boolean;
  /** Maximum age in hours for pending changes before auto-cleanup */
  maxPendingAgeHours: number;
  /** Whether to fallback to TUI if VSCode is not available */
  fallbackToTuiIfVsCodeClosed: boolean;
  /** Maximum backup size in bytes (0 = unlimited) */
  maxBackupSizeBytes: number;
}

/**
 * Plugin configuration interface
 */
export interface PluginConfig {
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** Glob patterns for files to auto-accept */
  autoAccept: string[];
  /** Glob patterns for files to auto-reject */
  autoReject: string[];
  /** Maximum file size in bytes to display diff for (0 = unlimited) */
  maxFileSize: number;
  /** UI theme preference */
  theme: 'light' | 'dark' | 'auto';
  /** Whether to show line numbers in diff view */
  showLineNumbers: boolean;
  /** Whether to show confirmation before rejecting all changes */
  confirmRejectAll: boolean;
  /** Custom keyboard shortcuts */
  keybindings: KeybindingConfig[];
  /** IDE integration configuration */
  ide?: IDEConfig;
  /** Diff viewer mode: 'tui' (terminal UI), 'vscode-only' (VSCode extension), or 'auto' (auto-detect) */
  mode?: 'tui' | 'vscode-only' | 'auto';
  /** VSCode-only mode configuration */
  vscodeOnly?: VSCodeOnlyConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  autoAccept: [],
  autoReject: [],
  maxFileSize: 1024 * 1024, // 1MB
  theme: 'auto',
  showLineNumbers: true,
  confirmRejectAll: true,
  keybindings: [],
  ide: {
    enabled: false,
    stateFilePath: '.opencode/.diff-plugin-state.json',
  },
  mode: 'tui',
  vscodeOnly: {
    applyImmediately: false,
    backupOriginals: true,
    notificationOnChange: true,
    maxPendingAgeHours: 24,
    fallbackToTuiIfVsCodeClosed: true,
    maxBackupSizeBytes: 100 * 1024 * 1024, // 100MB
  },
};

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Configuration validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Configuration Manager
 *
 * Handles loading, saving, and validating plugin configuration.
 * Uses .opencode/diff-plugin.json as the config file.
 */
export class ConfigManager {
  private config: PluginConfig;
  private configPath: string;
  private workspaceRoot: string;

  /**
   * Create a new ConfigManager
   * @param workspaceRoot - The workspace root directory
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.configPath = join(workspaceRoot, '.opencode', 'diff-plugin.json');
    this.config = this.load();
  }

  /**
   * Load configuration from file or use defaults
   */
  private load(): PluginConfig {
    if (!existsSync(this.configPath)) {
      return { ...DEFAULT_CONFIG };
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return this.mergeWithDefaults(parsed);
    } catch (error) {
      console.warn(
        `[DiffPlugin] Failed to load config from ${this.configPath}:`,
        error instanceof Error ? error.message : String(error)
      );
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Merge loaded config with defaults
   */
  private mergeWithDefaults(loaded: Partial<PluginConfig>): PluginConfig {
    return {
      enabled: loaded.enabled ?? DEFAULT_CONFIG.enabled,
      autoAccept: loaded.autoAccept ?? [...DEFAULT_CONFIG.autoAccept],
      autoReject: loaded.autoReject ?? [...DEFAULT_CONFIG.autoReject],
      maxFileSize: loaded.maxFileSize ?? DEFAULT_CONFIG.maxFileSize,
      theme: loaded.theme ?? DEFAULT_CONFIG.theme,
      showLineNumbers: loaded.showLineNumbers ?? DEFAULT_CONFIG.showLineNumbers,
      confirmRejectAll: loaded.confirmRejectAll ?? DEFAULT_CONFIG.confirmRejectAll,
      keybindings: loaded.keybindings ?? [...DEFAULT_CONFIG.keybindings],
      ide: {
        enabled: loaded.ide?.enabled ?? DEFAULT_CONFIG.ide!.enabled,
        stateFilePath: loaded.ide?.stateFilePath ?? DEFAULT_CONFIG.ide!.stateFilePath,
      },
      mode: loaded.mode ?? DEFAULT_CONFIG.mode!,
      vscodeOnly: {
        applyImmediately: loaded.vscodeOnly?.applyImmediately ?? DEFAULT_CONFIG.vscodeOnly!.applyImmediately,
        backupOriginals: loaded.vscodeOnly?.backupOriginals ?? DEFAULT_CONFIG.vscodeOnly!.backupOriginals,
        notificationOnChange: loaded.vscodeOnly?.notificationOnChange ?? DEFAULT_CONFIG.vscodeOnly!.notificationOnChange,
        maxPendingAgeHours: loaded.vscodeOnly?.maxPendingAgeHours ?? DEFAULT_CONFIG.vscodeOnly!.maxPendingAgeHours,
        fallbackToTuiIfVsCodeClosed: loaded.vscodeOnly?.fallbackToTuiIfVsCodeClosed ?? DEFAULT_CONFIG.vscodeOnly!.fallbackToTuiIfVsCodeClosed,
        maxBackupSizeBytes: loaded.vscodeOnly?.maxBackupSizeBytes ?? DEFAULT_CONFIG.vscodeOnly!.maxBackupSizeBytes,
      },
    };
  }

  /**
   * Validate the current configuration
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    // Validate enabled
    if (typeof this.config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    // Validate autoAccept
    if (!Array.isArray(this.config.autoAccept)) {
      errors.push('autoAccept must be an array');
    } else {
      for (let i = 0; i < this.config.autoAccept.length; i++) {
        if (typeof this.config.autoAccept[i] !== 'string') {
          errors.push(`autoAccept[${i}] must be a string`);
        }
      }
    }

    // Validate autoReject
    if (!Array.isArray(this.config.autoReject)) {
      errors.push('autoReject must be an array');
    } else {
      for (let i = 0; i < this.config.autoReject.length; i++) {
        if (typeof this.config.autoReject[i] !== 'string') {
          errors.push(`autoReject[${i}] must be a string`);
        }
      }
    }

    // Validate maxFileSize
    if (typeof this.config.maxFileSize !== 'number' || this.config.maxFileSize < 0) {
      errors.push('maxFileSize must be a non-negative number');
    }

    // Validate theme
    if (!['light', 'dark', 'auto'].includes(this.config.theme)) {
      errors.push('theme must be "light", "dark", or "auto"');
    }

    // Validate showLineNumbers
    if (typeof this.config.showLineNumbers !== 'boolean') {
      errors.push('showLineNumbers must be a boolean');
    }

    // Validate confirmRejectAll
    if (typeof this.config.confirmRejectAll !== 'boolean') {
      errors.push('confirmRejectAll must be a boolean');
    }

    // Validate keybindings
    if (!Array.isArray(this.config.keybindings)) {
      errors.push('keybindings must be an array');
    } else {
      const validActions: KeyboardAction[] = [
        'acceptLine', 'rejectLine', 'acceptHunk', 'rejectHunk',
        'acceptFile', 'rejectFile', 'acceptAll', 'rejectAll',
        'nextLine', 'prevLine', 'nextHunk', 'prevHunk',
        'nextFile', 'prevFile', 'scrollUp', 'scrollDown',
        'pageUp', 'pageDown', 'goToTop', 'goToBottom',
        'toggleHelp', 'quit', 'undo', 'redo'
      ];

      for (let i = 0; i < this.config.keybindings.length; i++) {
        const kb = this.config.keybindings[i];
        if (!kb || typeof kb !== 'object') {
          errors.push(`keybindings[${i}] must be an object`);
          continue;
        }
        if (typeof kb.key !== 'string' || kb.key.length === 0) {
          errors.push(`keybindings[${i}].key must be a non-empty string`);
        }
        if (!validActions.includes(kb.action)) {
          errors.push(`keybindings[${i}].action must be a valid KeyboardAction`);
        }
      }
    }

    // Validate ide config
    if (this.config.ide !== undefined) {
      if (typeof this.config.ide !== 'object' || this.config.ide === null) {
        errors.push('ide must be an object');
      } else {
        if (this.config.ide.enabled !== undefined && typeof this.config.ide.enabled !== 'boolean') {
          errors.push('ide.enabled must be a boolean');
        }
        if (this.config.ide.stateFilePath !== undefined && typeof this.config.ide.stateFilePath !== 'string') {
          errors.push('ide.stateFilePath must be a string');
        }
      }
    }

    // Validate mode
    if (this.config.mode !== undefined) {
      if (!['tui', 'vscode-only', 'auto'].includes(this.config.mode)) {
        errors.push('mode must be "tui", "vscode-only", or "auto"');
      }
    }

    // Validate vscodeOnly config
    if (this.config.vscodeOnly !== undefined) {
      if (typeof this.config.vscodeOnly !== 'object' || this.config.vscodeOnly === null) {
        errors.push('vscodeOnly must be an object');
      } else {
        if (this.config.vscodeOnly.applyImmediately !== undefined && typeof this.config.vscodeOnly.applyImmediately !== 'boolean') {
          errors.push('vscodeOnly.applyImmediately must be a boolean');
        }
        if (this.config.vscodeOnly.backupOriginals !== undefined && typeof this.config.vscodeOnly.backupOriginals !== 'boolean') {
          errors.push('vscodeOnly.backupOriginals must be a boolean');
        }
        if (this.config.vscodeOnly.notificationOnChange !== undefined && typeof this.config.vscodeOnly.notificationOnChange !== 'boolean') {
          errors.push('vscodeOnly.notificationOnChange must be a boolean');
        }
        if (this.config.vscodeOnly.maxPendingAgeHours !== undefined && (typeof this.config.vscodeOnly.maxPendingAgeHours !== 'number' || this.config.vscodeOnly.maxPendingAgeHours < 0)) {
          errors.push('vscodeOnly.maxPendingAgeHours must be a non-negative number');
        }
        if (this.config.vscodeOnly.fallbackToTuiIfVsCodeClosed !== undefined && typeof this.config.vscodeOnly.fallbackToTuiIfVsCodeClosed !== 'boolean') {
          errors.push('vscodeOnly.fallbackToTuiIfVsCodeClosed must be a boolean');
        }
        if (this.config.vscodeOnly.maxBackupSizeBytes !== undefined && (typeof this.config.vscodeOnly.maxBackupSizeBytes !== 'number' || this.config.vscodeOnly.maxBackupSizeBytes < 0)) {
          errors.push('vscodeOnly.maxBackupSizeBytes must be a non-negative number');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate configuration and throw on error
   */
  validateOrThrow(): void {
    const result = this.validate();
    if (!result.valid) {
      throw new ConfigValidationError(
        `Configuration validation failed: ${result.errors.join(', ')}`,
        this.configPath
      );
    }
  }

  /**
   * Save current configuration to file
   */
  save(): void {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to save config to ${this.configPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Reload configuration from file
   */
  reload(): void {
    this.config = this.load();
  }

  /**
   * Update configuration with partial values
   */
  update(updates: Partial<PluginConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  // Getter methods

  /**
   * Check if plugin is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get auto-accept glob patterns
   */
  getAutoAcceptPatterns(): string[] {
    return [...this.config.autoAccept];
  }

  /**
   * Get auto-reject glob patterns
   */
  getAutoRejectPatterns(): string[] {
    return [...this.config.autoReject];
  }

  /**
   * Get maximum file size in bytes
   */
  getMaxFileSize(): number {
    return this.config.maxFileSize;
  }

  /**
   * Get theme preference
   */
  getTheme(): 'light' | 'dark' | 'auto' {
    return this.config.theme;
  }

  /**
   * Check if line numbers should be shown
   */
  shouldShowLineNumbers(): boolean {
    return this.config.showLineNumbers;
  }

  /**
   * Check if confirmation is required before rejecting all
   */
  shouldConfirmRejectAll(): boolean {
    return this.config.confirmRejectAll;
  }

  /**
   * Get custom keybindings
   */
  getKeybindings(): KeybindingConfig[] {
    return [...this.config.keybindings];
  }

  /**
   * Get the full configuration object
   */
  getConfig(): PluginConfig {
    return { ...this.config };
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get the diff viewer mode
   * @returns The current mode: 'tui', 'vscode-only', or 'auto'
   */
  getMode(): 'tui' | 'vscode-only' | 'auto' {
    return this.config.mode!;
  }

  /**
   * Get the VSCode-only mode configuration
   * @returns The VSCode-only configuration object
   */
  getVSCodeOnlyConfig(): VSCodeOnlyConfig {
    return { ...this.config.vscodeOnly! };
  }

  /**
   * Check if a file matches any auto-accept pattern
   */
  shouldAutoAccept(filePath: string): boolean {
    return this.matchGlobPatterns(filePath, this.config.autoAccept);
  }

  /**
   * Check if a file matches any auto-reject pattern
   */
  shouldAutoReject(filePath: string): boolean {
    return this.matchGlobPatterns(filePath, this.config.autoReject);
  }

  /**
   * Check if a file exceeds the maximum file size
   */
  isFileTooLarge(fileSize: number): boolean {
    if (this.config.maxFileSize === 0) {
      return false;
    }
    return fileSize > this.config.maxFileSize;
  }

  /**
   * Match a file path against glob patterns
   * Supports basic glob patterns: *, ?, **
   */
  private matchGlobPatterns(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Match a file path against a single glob pattern
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    let regexPattern = pattern;

    regexPattern = regexPattern
      .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
      .replace(/\/\*\*/g, '__SLASH_GLOBSTAR__')
      .replace(/\*\*/g, '__GLOBSTAR__')
      .replace(/\*/g, '__STAR__')
      .replace(/\?/g, '__QUESTION__')
      .replace(/__GLOBSTAR_SLASH__/g, '(?:.*/)?')
      .replace(/__SLASH_GLOBSTAR__/g, '(?:/.*)?')
      .replace(/__GLOBSTAR__/g, '.*')
      .replace(/__STAR__/g, '[^/]*')
      .replace(/__QUESTION__/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}

export default ConfigManager;
