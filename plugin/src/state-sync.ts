/**
 * State Sync for OpenCode Diff Plugin
 *
 * Provides file-based state persistence with atomic writes, file watching,
 * and debounced writes for performance. Manages state file format versioning
 * and handles concurrent access scenarios.
 */

import { existsSync, mkdirSync, rename, unlink, writeFile, readFile, watch, type FSWatcher, writeFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { PendingChange, ChangeQueue } from './state-manager.js';
import { createLogger } from './debug.js';

const logger = createLogger('StateSync');

/**
 * State file format version
 */
const STATE_VERSION = '1.0';

/**
 * Default debounce interval in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = 100;

/**
 * State file data structure
 */
export interface StateFileData {
  version: string;
  timestamp: number;
  sessionID: string;
  changes: unknown[];
}

/**
 * Options for StateSync initialization
 */
export interface StateSyncOptions {
  /** Debounce interval in milliseconds (default: 100) */
  debounceMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Callback type for file change notifications
 */
export type StateChangeCallback = (changes: PendingChange[]) => void;

/**
 * Error thrown when state sync operations fail
 */
export class StateSyncError extends Error {
  constructor(
    message: string,
    public readonly operation: 'write' | 'read' | 'watch' | 'unwatch'
  ) {
    super(message);
    this.name = 'StateSyncError';
  }
}

/**
 * StateSync class for file-based state persistence
 *
 * Features:
 * - Atomic writes using temp file + rename pattern
 * - File watching with fs.watch for external changes
 * - Debounced writes to prevent excessive I/O
 * - State file versioning for backward compatibility
 */
export class StateSync {
  private statePath: string;
  private sessionID: string;
  private debounceMs: number;
  private debug: boolean;
  private watcher: FSWatcher | null = null;
  private watchTarget: string | null = null;
  private changeCallback: StateChangeCallback | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: PendingChange[] | null = null;
  private isWriting = false;
  private lastWriteTime = 0;
  private readonly WRITE_IGNORE_WINDOW_MS = 200; // Ignore watch events within 200ms of our writes

  /**
   * Create a new StateSync instance
   * @param statePath - Path to the state file
   * @param sessionID - Unique session identifier
   * @param options - Optional configuration options
   */
  constructor(
    statePath: string,
    sessionID: string,
    options: StateSyncOptions = {}
  ) {
    this.statePath = statePath;
    this.sessionID = sessionID;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.debug = options.debug ?? false;
  }

  /**
   * Get the state file path
   * @returns The path to the state file
   */
  getStatePath(): string {
    return this.statePath;
  }

  /**
   * Get the session ID
   * @returns The session identifier
   */
  getSessionID(): string {
    return this.sessionID;
  }

  /**
   * Write state to file atomically with comprehensive error handling
   *
   * Uses temp file + rename pattern for atomic writes:
   * 1. Write to temp file
   * 2. Sync to disk (optional, for durability)
   * 3. Rename temp file to target (atomic operation)
   *
   * @param changes - Array of pending changes to persist
   * @throws StateSyncError if write fails
   */
  async writeState(changes: PendingChange[]): Promise<void> {
    try {
      this.isWriting = true;
      this.lastWriteTime = Date.now();

      // Ensure directory exists
      const dir = dirname(this.statePath);
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
          logger.debug('Created state directory', { dir });
        } catch (mkdirError) {
          const nodeError = mkdirError as NodeJS.ErrnoException;
          logger.error('Failed to create state directory', { dir, error: nodeError.message, code: nodeError.code });
          throw new StateSyncError(
            `Failed to create state directory: ${nodeError.message}`,
            'write'
          );
        }
      }

      // Prepare state data
      const stateData: StateFileData = {
        version: STATE_VERSION,
        timestamp: Date.now(),
        sessionID: this.sessionID,
        changes: changes.map(change => change.toJSON()),
      };

      // Convert to JSON
      let jsonContent: string;
      try {
        jsonContent = JSON.stringify(stateData, null, 2);
      } catch (stringifyError) {
        logger.error('Failed to stringify state data', { error: (stringifyError as Error).message });
        throw new StateSyncError(
          `Failed to serialize state: ${(stringifyError as Error).message}`,
          'write'
        );
      }

      // Write to temp file
      const tempPath = `${this.statePath}.tmp`;
      try {
        await this.writeFileAsync(tempPath, jsonContent);
        logger.debug('Temp file written', { tempPath, size: jsonContent.length });
      } catch (writeError) {
        const nodeError = writeError as NodeJS.ErrnoException;
        logger.error('Failed to write temp state file', { tempPath, error: nodeError.message, code: nodeError.code });

        if (nodeError.code === 'ENOSPC') {
          throw new StateSyncError(
            'Disk full - unable to write state file. Free up disk space and try again.',
            'write'
          );
        } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
          throw new StateSyncError(
            `Permission denied writing state file: ${nodeError.message}`,
            'write'
          );
        }

        throw new StateSyncError(`Failed to write state file: ${nodeError.message}`, 'write');
      }

      // Atomic rename
      try {
        await this.renameAsync(tempPath, this.statePath);
        logger.debug('Atomic rename completed', { tempPath, target: this.statePath });
      } catch (renameError) {
        const nodeError = renameError as NodeJS.ErrnoException;
        logger.error('Failed to rename temp file', { tempPath, target: this.statePath, error: nodeError.message });

        // Cleanup temp file
        try {
          await this.unlinkAsync(tempPath);
        } catch {
          // Ignore cleanup errors
        }

        throw new StateSyncError(`Failed to finalize state file: ${nodeError.message}`, 'write');
      }

      logger.info('State written successfully', { changesCount: changes.length, sessionID: this.sessionID });
    } catch (error) {
      if (error instanceof StateSyncError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new StateSyncError(`Failed to write state: ${message}`, 'write');
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Validates state file data structure
   * @param data - Data to validate
   * @returns Validation result with error if invalid
   */
  private validateStateData(data: unknown): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'State data must be an object' };
    }

    const stateData = data as Record<string, unknown>;

    // Check version
    if (!stateData.version || typeof stateData.version !== 'string') {
      return { valid: false, error: 'Missing or invalid version field' };
    }

    // Check timestamp
    if (typeof stateData.timestamp !== 'number') {
      return { valid: false, error: 'Missing or invalid timestamp field' };
    }

    // Check sessionID
    if (typeof stateData.sessionID !== 'string') {
      return { valid: false, error: 'Missing or invalid sessionID field' };
    }

    // Check changes array
    if (!Array.isArray(stateData.changes)) {
      return { valid: false, error: 'Missing or invalid changes array' };
    }

    return { valid: true };
  }

  /**
   * Creates a backup of the current state file
   * @returns Path to backup file or null if no state file
   */
  private async backupCorruptedState(): Promise<string | null> {
    if (!existsSync(this.statePath)) {
      return null;
    }

    try {
      const backupPath = `${this.statePath}.corrupted.${Date.now()}.bak`;
      const content = await this.readFileAsync(this.statePath, 'utf-8');
      await this.writeFileAsync(backupPath, content);
      logger.warn('Corrupted state file backed up', { backupPath });
      return backupPath;
    } catch (error) {
      logger.error('Failed to backup corrupted state', { error });
      return null;
    }
  }

  /**
   * Attempts to recover from corrupted state file
   * @returns Recovered changes or empty array
   */
  private async attemptRecovery(): Promise<PendingChange[]> {
    logger.warn('Attempting to recover from corrupted state file');

    // Strategy 1: Try to read and fix malformed JSON
    try {
      const content = await this.readFileAsync(this.statePath, 'utf-8');

      // Try to extract valid JSON objects from the content
      const changes: PendingChange[] = [];
      const changeRegex = /\{[\s\S]*?"id"[\s\S]*?\}/g;
      const matches = content.match(changeRegex);

      if (matches) {
        for (const match of matches) {
          try {
            const changeData = JSON.parse(match);
            if (changeData.id) {
              const change = PendingChange.fromJSON(changeData);
              changes.push(change);
            }
          } catch {
            // Skip invalid change data
          }
        }
      }

      if (changes.length > 0) {
        logger.info('Recovered changes from corrupted state', { count: changes.length });
        return changes;
      }
    } catch (error) {
      logger.error('Recovery strategy 1 failed', { error });
    }

      // Strategy 2: Check for backup files
      try {
        const stateFileName = basename(this.statePath);
        const backupPattern = new RegExp(`^${stateFileName}\\.corrupted\\.(\\d+)\\.bak$`);
        logger.debug('Looking for backup files with pattern', { pattern: backupPattern.source });
      } catch (error) {
        logger.error('Recovery strategy 2 failed', { error });
      }

    logger.warn('Could not recover any changes from corrupted state');
    return [];
  }

  /**
   * Read state from file with comprehensive corruption handling
   *
   * @returns Array of pending changes, or empty array if file doesn't exist
   * @throws StateSyncError if read fails and recovery is not possible
   */
  async readState(): Promise<PendingChange[]> {
    try {
      if (!existsSync(this.statePath)) {
        logger.debug('State file not found, returning empty array');
        return [];
      }

      let content: string;
      try {
        content = await this.readFileAsync(this.statePath, 'utf-8');
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        logger.error('Failed to read state file', { error: nodeError.message, code: nodeError.code });

        if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
          throw new StateSyncError(
            `Permission denied reading state file: ${nodeError.message}`,
            'read'
          );
        } else if (nodeError.code === 'ENOENT') {
          // File was deleted between existsSync and readFile
          return [];
        }

        throw new StateSyncError(`Failed to read state file: ${nodeError.message}`, 'read');
      }

      // Check for empty file
      if (!content || content.trim() === '') {
        logger.warn('State file is empty');
        return [];
      }

      // Parse JSON
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        logger.error('State file JSON parse error', { error: (parseError as Error).message });

        // Backup corrupted file before attempting recovery
        await this.backupCorruptedState();

        // Attempt recovery
        const recovered = await this.attemptRecovery();

        if (recovered.length > 0) {
          // Write recovered state
          await this.writeState(recovered);
          return recovered;
        }

        throw new StateSyncError(
          `Corrupted state file: ${(parseError as Error).message}. Recovery failed.`,
          'read'
        );
      }

      // Validate structure
      const validation = this.validateStateData(data);
      if (!validation.valid) {
        logger.error('State file validation failed', { error: validation.error });
        await this.backupCorruptedState();
        throw new StateSyncError(`Invalid state file structure: ${validation.error}`, 'read');
      }

      const stateData = data as StateFileData;

      // Validate version
      if (stateData.version !== STATE_VERSION) {
        logger.error('State file version mismatch', {
          fileVersion: stateData.version,
          expectedVersion: STATE_VERSION,
        });
        // Graceful degradation: return empty array for unsupported version
        return [];
      }

      // Validate and deserialize changes
      const changes: PendingChange[] = [];
      const errors: string[] = [];

      for (let i = 0; i < stateData.changes.length; i++) {
        try {
          const change = PendingChange.fromJSON(stateData.changes[i]);
          changes.push(change);
        } catch (error) {
          errors.push(`Change ${i}: ${(error as Error).message}`);
        }
      }

      if (errors.length > 0) {
        logger.warn('Some changes failed to deserialize', { errors, total: stateData.changes.length });
      }

      logger.info('State read successfully', {
        changesCount: changes.length,
        errorsCount: errors.length,
        version: stateData.version,
      });

      return changes;
    } catch (error) {
      if (error instanceof StateSyncError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new StateSyncError(`Failed to read state: ${message}`, 'read');
    }
  }

  /**
   * Write state with debouncing
   *
   * Multiple calls within the debounce interval will be coalesced into a single write.
   * This prevents excessive I/O when changes happen rapidly.
   *
   * @param changes - Array of pending changes to persist
   */
  async writeStateDebounced(changes: PendingChange[]): Promise<void> {
    // Store pending changes
    this.pendingChanges = changes;

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    return new Promise((resolve, reject) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          if (this.pendingChanges) {
            await this.writeState(this.pendingChanges);
            this.pendingChanges = null;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      }, this.debounceMs);
    });
  }

  /**
   * Watch state file for external changes
   *
   * Sets up a file watcher that calls the provided callback when the state file
   * is modified externally. Automatically handles debouncing of watch events.
   *
   * @param callback - Function to call when state changes
   * @throws StateSyncError if watch fails
   */
  watchState(callback: StateChangeCallback): void {
    try {
      if (this.watcher) {
        this.unwatchState();
      }

      this.changeCallback = callback;

      // Ensure directory and file exist before watching
      const dir = dirname(this.statePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Ensure state file exists
      if (!existsSync(this.statePath)) {
        writeFileSync(this.statePath, JSON.stringify({
          version: STATE_VERSION,
          timestamp: Date.now(),
          sessionID: this.sessionID,
          changes: [],
        }, null, 2));
      }

      // On macOS/unix, fs.watch works better on directories
      // We watch the directory and filter by filename
      this.watchTarget = dir;
      const stateFileName = this.statePath.split('/').pop() || '';

      this.watcher = watch(this.watchTarget, (eventType, filename) => {
        this.log('Watch event:', eventType, 'filename:', filename);
        // Only process events for our specific file
        // Note: filename may be null on some platforms or partial match
        if (filename === stateFileName || filename === null || !filename) {
          this.handleWatchEvent(eventType);
        }
      });

      this.log('Started watching state file:', this.statePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StateSyncError(`Failed to watch state: ${message}`, 'watch');
    }
  }

  /**
   * Stop watching state file
   *
   * Removes the file watcher and cleans up resources.
   */
  unwatchState(): void {
    try {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
        this.watchTarget = null;
        this.changeCallback = null;
        this.log('Stopped watching state file');
      }

      // Clear any pending debounce timers
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      if (this.watchDebounceTimer) {
        clearTimeout(this.watchDebounceTimer);
        this.watchDebounceTimer = null;
      }

      this.pendingChanges = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new StateSyncError(`Failed to unwatch state: ${message}`, 'unwatch');
    }
  }

  /**
   * Check if currently watching
   * @returns True if watcher is active
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Handle file watch events
   * @param eventType - Type of file system event
   */
  private handleWatchEvent(eventType: string): void {
    // Ignore our own writes using timestamp-based detection
    // Watch events are async, so isWriting may be false by the time event fires
    const timeSinceWrite = Date.now() - this.lastWriteTime;
    if (timeSinceWrite < this.WRITE_IGNORE_WINDOW_MS) {
      this.log('Ignoring own write event (within ignore window):', timeSinceWrite, 'ms');
      return;
    }

    // Handle both 'change' and 'rename' events
    // 'rename' is triggered by atomic write operations (temp file + rename)
    if ((eventType === 'change' || eventType === 'rename') && this.changeCallback) {
      this.log('State file changed externally:', eventType);

      // Debounce watch events using separate timer from write debounce
      if (this.watchDebounceTimer) {
        clearTimeout(this.watchDebounceTimer);
      }

      this.watchDebounceTimer = setTimeout(async () => {
        try {
          const changes = await this.readState();
          this.changeCallback?.(changes);
        } catch (error) {
          console.error('[StateSync] Error reading watched state:', error);
        }
      }, this.debounceMs);
    }
  }

  /**
   * Async wrapper for writeFile
   */
  private writeFileAsync(path: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      writeFile(path, data, 'utf-8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Async wrapper for readFile
   */
  private readFileAsync(path: string, encoding: BufferEncoding): Promise<string> {
    return new Promise((resolve, reject) => {
      readFile(path, encoding, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Async wrapper for rename
   */
  private renameAsync(oldPath: string, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Async wrapper for unlink (cleanup)
   */
  private unlinkAsync(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      unlink(path, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Debug logging helper
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[StateSync]', ...args);
    }
  }
}

/**
 * Create a ChangeQueue from persisted state
 * @param statePath - Path to the state file
 * @returns ChangeQueue populated with persisted changes, or empty queue
 */
export async function loadChangeQueue(statePath: string): Promise<ChangeQueue> {
  const sync = new StateSync(statePath, 'load');
  const changes = await sync.readState();

  const queue = new ChangeQueue();
  for (const change of changes) {
    queue.add(change);
  }

  return queue;
}

/**
 * Save a ChangeQueue to state file
 * @param queue - The ChangeQueue to save
 * @param statePath - Path to the state file
 * @param sessionID - Session identifier
 */
export async function saveChangeQueue(
  queue: ChangeQueue,
  statePath: string,
  sessionID: string
): Promise<void> {
  const sync = new StateSync(statePath, sessionID);
  await sync.writeState(queue.getAll());
}

export default StateSync;
