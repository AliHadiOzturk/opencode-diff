/**
 * VSCode Detector for OpenCode Diff Plugin
 *
 * Detects if VSCode is running and if the extension is active.
 * Used to determine whether to show diffs in VSCode or fall back to TUI.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { createLogger } from './debug.js';

const logger = createLogger('VSCodeDetector');

/**
 * Detection method that was successful
 */
export type DetectionMethod = 'vscode-dir' | 'cli' | 'process' | 'none';

/**
 * Result of VSCode detection
 */
export interface VSCodeDetectionResult {
  /** Whether VSCode is detected as running */
  isRunning: boolean;
  /** Which detection method succeeded */
  method: DetectionMethod;
  /** Additional details about the detection */
  details?: string;
  /** Whether the VSCode extension is active */
  extensionActive?: boolean;
}

/**
 * Default timeout for detection operations in milliseconds
 */
export const DEFAULT_DETECTION_TIMEOUT_MS = 2000;

/**
 * VSCode Detector
 *
 * Detects VSCode presence and status using multiple methods:
 * 1. Check for .vscode/ directory in workspace root (fastest)
 * 2. Run `code --status` CLI command (reliable if CLI installed)
 * 3. Check for VSCode process (platform-specific fallback)
 */
export class VSCodeDetector {
  private workspaceRoot: string;
  private timeoutMs: number;

  /**
   * Create a new VSCodeDetector
   * @param workspaceRoot - The workspace root directory to check for .vscode/
   * @param timeoutMs - Timeout for detection operations (default: 2000ms)
   */
  constructor(workspaceRoot: string = process.cwd(), timeoutMs: number = DEFAULT_DETECTION_TIMEOUT_MS) {
    this.workspaceRoot = workspaceRoot;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Check if VSCode process is running
   * Tries multiple detection methods in order of reliability
   * @returns Promise<boolean> - true if VSCode is detected as running
   */
  async isVSCodeRunning(): Promise<boolean> {
    const result = await this.detect();
    return result.isRunning;
  }

  /**
   * Check if the VSCode extension is active
   * This checks if the extension's state file exists and is recent
   * @returns Promise<boolean> - true if extension appears to be active
   */
  async isVSCodeExtensionActive(): Promise<boolean> {
    try {
      // Check for extension state file
      const stateFilePath = join(this.workspaceRoot, '.opencode', '.diff-plugin-state.json');
      if (!existsSync(stateFilePath)) {
        return false;
      }

      // Check if VSCode is running first
      const vsCodeRunning = await this.isVSCodeRunning();
      if (!vsCodeRunning) {
        return false;
      }

      // State file exists and VSCode is running - extension is likely active
      return true;
    } catch (error) {
      // Silently fail - return false on any error
      return false;
    }
  }

  /**
   * Check if .vscode/ directory exists in the workspace root
   * This is a fast synchronous check
   * @returns boolean - true if .vscode/ directory exists
   */
  isVSCodeWorkspace(): boolean {
    try {
      const vscodeDir = join(this.workspaceRoot, '.vscode');
      if (!existsSync(vscodeDir)) {
        return false;
      }

      // Verify it's a directory and not empty (has settings.json or similar)
      const entries = readdirSync(vscodeDir);
      return entries.length > 0;
    } catch (error) {
      // Silently fail - return false on any error
      return false;
    }
  }

  /**
   * Comprehensive VSCode detection
   * Tries multiple methods in order and returns detailed results
   * @param timeoutMs - Optional override for timeout (uses constructor value if not provided)
   * @returns Promise<VSCodeDetectionResult> - detailed detection result
   */
  async detect(timeoutMs?: number): Promise<VSCodeDetectionResult> {
    const effectiveTimeout = timeoutMs ?? this.timeoutMs;

    logger.debug('Starting VSCode detection', { effectiveTimeout, workspaceRoot: this.workspaceRoot });

    // Method 1: Check for .vscode/ directory (fastest, synchronous)
    if (this.isVSCodeWorkspace()) {
      logger.debug('VSCode workspace detected via .vscode directory');
      return {
        isRunning: true,
        method: 'vscode-dir',
        details: `.vscode/ directory found in ${this.workspaceRoot}`,
        extensionActive: await this.isVSCodeExtensionActive(),
      };
    }

    // Method 2: Try to run `code --status` (reliable if CLI installed)
    try {
      const cliResult = await this.detectViaCli(effectiveTimeout);
      if (cliResult) {
        logger.debug('VSCode detected via CLI');
        return {
          isRunning: true,
          method: 'cli',
          details: 'VSCode CLI responded successfully',
          extensionActive: await this.isVSCodeExtensionActive(),
        };
      }
    } catch (error) {
      logger.warn('CLI detection failed', { error });
    }

    // Method 3: Check for VSCode process (platform-specific fallback)
    try {
      const processResult = await this.detectViaProcess(effectiveTimeout);
      if (processResult) {
        logger.debug('VSCode detected via process check');
        return {
          isRunning: true,
          method: 'process',
          details: `VSCode process detected on ${process.platform}`,
          extensionActive: await this.isVSCodeExtensionActive(),
        };
      }
    } catch (error) {
      logger.warn('Process detection failed', { error });
    }

    // No detection method succeeded
    logger.debug('VSCode not detected by any method');
    return {
      isRunning: false,
      method: 'none',
      details: 'VSCode not detected by any method',
      extensionActive: false,
    };
  }

  /**
   * Detects if VSCode has crashed or is unresponsive
   * @param timeoutMs - Timeout for detection
   * @returns Promise<boolean> - true if VSCode appears crashed
   */
  async hasVSCodeCrashed(timeoutMs: number = 5000): Promise<boolean> {
    logger.debug('Checking if VSCode has crashed', { timeoutMs });

    // First check if VSCode is detected at all
    const detectionResult = await this.detect(timeoutMs);
    if (!detectionResult.isRunning) {
      // VSCode not running - check if it should be based on state file
      const stateFilePath = join(this.workspaceRoot, '.opencode', '.diff-plugin-state.json');
      if (existsSync(stateFilePath)) {
        try {
          const stats = statSync(stateFilePath);
          const age = Date.now() - stats.mtime.getTime();
          // If state file is recent (< 5 min) but VSCode not running, it may have crashed
          if (age < 5 * 60 * 1000) {
            logger.warn('VSCode may have crashed - state file is recent but VSCode not running', { age });
            return true;
          }
        } catch (error) {
          logger.error('Error checking state file', { error });
        }
      }
      return false;
    }

    // Check if extension state file exists and is recent
    const stateFilePath = join(this.workspaceRoot, '.opencode', '.diff-plugin-state.json');
    if (existsSync(stateFilePath)) {
      try {
        const stats = statSync(stateFilePath);
        const age = Date.now() - stats.mtime.getTime();
        // If state file is very old (> 1 hour), extension may be crashed
        if (age > 60 * 60 * 1000) {
          logger.warn('VSCode extension may have crashed - state file is stale', { age });
          return true;
        }
      } catch (error) {
        logger.error('Error checking state file for crash detection', { error });
      }
    }

    return false;
  }

  /**
   * Gets the age of the last VSCode extension activity
   * @returns Age in milliseconds, or null if no state file
   */
  getLastActivityAge(): number | null {
    const stateFilePath = join(this.workspaceRoot, '.opencode', '.diff-plugin-state.json');
    if (!existsSync(stateFilePath)) {
      return null;
    }

    try {
      const stats = statSync(stateFilePath);
      return Date.now() - stats.mtime.getTime();
    } catch (error) {
      logger.error('Error getting last activity age', { error });
      return null;
    }
  }

  /**
   * Checks if VSCode extension appears to be healthy
   * @returns boolean - true if extension appears healthy
   */
  isExtensionHealthy(): boolean {
    const lastActivity = this.getLastActivityAge();
    if (lastActivity === null) {
      return false;
    }
    // Consider healthy if activity within last 10 minutes
    return lastActivity < 10 * 60 * 1000;
  }

  /**
   * Detect VSCode via CLI command
   * @param timeoutMs - Timeout for the command
   * @returns Promise<boolean> - true if VSCode CLI responds
   */
  private async detectViaCli(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      // Use code --status or code --version depending on platform
      const command = process.platform === 'win32' ? 'code.cmd' : 'code';
      
      exec(`${command} --version`, { timeout: timeoutMs }, (error, stdout) => {
        clearTimeout(timeout);
        
        if (error) {
          resolve(false);
          return;
        }

        // Check if output contains version info (e.g., "1.85.0")
        const hasVersion = Boolean(stdout && /\d+\.\d+\.\d+/.test(stdout));
        resolve(hasVersion);
      });
    });
  }

  /**
   * Detect VSCode by checking running processes
   * Platform-specific implementation for macOS, Linux, and Windows
   * @param timeoutMs - Timeout for the command
   * @returns Promise<boolean> - true if VSCode process is found
   */
  private async detectViaProcess(timeoutMs: number): Promise<boolean> {
    const platform = process.platform;

    try {
      switch (platform) {
        case 'darwin':
          return await this.detectMacOSProcess(timeoutMs);
        case 'linux':
          return await this.detectLinuxProcess(timeoutMs);
        case 'win32':
          return await this.detectWindowsProcess(timeoutMs);
        default:
          // Unknown platform - can't detect
          return false;
      }
    } catch (error) {
      // Silently fail - return false on any error
      return false;
    }
  }

  /**
   * Detect VSCode process on macOS
   * @param timeoutMs - Timeout for the command
   * @returns Promise<boolean> - true if VSCode process is found
   */
  private async detectMacOSProcess(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      // Use pgrep to find VSCode processes
      // VSCode can appear as 'Visual Studio Code', 'Code', or 'Electron'
      exec(
        "pgrep -i 'visual studio code|electron' || pgrep -x 'Code'",
        { timeout: timeoutMs },
        (error, stdout) => {
          clearTimeout(timeout);
          
          if (error) {
            resolve(false);
            return;
          }

          // If we got output (PID), VSCode is running
          resolve(stdout.trim().length > 0);
        }
      );
    });
  }

  /**
   * Detect VSCode process on Linux
   * @param timeoutMs - Timeout for the command
   * @returns Promise<boolean> - true if VSCode process is found
   */
  private async detectLinuxProcess(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      // Use pgrep to find VSCode processes
      // VSCode can appear as 'code', 'vscode', or 'electron'
      exec(
        "pgrep -i 'code|vscode|electron' | head -1",
        { timeout: timeoutMs },
        (error, stdout) => {
          clearTimeout(timeout);
          
          if (error) {
            resolve(false);
            return;
          }

          // If we got output (PID), VSCode is running
          resolve(stdout.trim().length > 0);
        }
      );
    });
  }

  /**
   * Detect VSCode process on Windows
   * @param timeoutMs - Timeout for the command
   * @returns Promise<boolean> - true if VSCode process is found
   */
  private async detectWindowsProcess(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      // Use tasklist to find VSCode processes
      // Look for Code.exe or electron processes
      exec(
        'tasklist /FI "IMAGENAME eq Code.exe" /NH',
        { timeout: timeoutMs },
        (error, stdout) => {
          clearTimeout(timeout);
          
          if (error) {
            resolve(false);
            return;
          }

          // Check if Code.exe appears in the output
          resolve(stdout.includes('Code.exe'));
        }
      );
    });
  }

  /**
   * Update the workspace root for detection
   * @param workspaceRoot - New workspace root directory
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Update the timeout for detection operations
   * @param timeoutMs - New timeout in milliseconds
   */
  setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Get the current workspace root
   * @returns string - Current workspace root directory
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get the current timeout setting
   * @returns number - Current timeout in milliseconds
   */
  getTimeout(): number {
    return this.timeoutMs;
  }
}

export default VSCodeDetector;
