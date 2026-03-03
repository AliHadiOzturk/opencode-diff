/**
 * State Sync for OpenCode Diff Plugin
 *
 * Provides file-based state persistence with atomic writes, file watching,
 * and debounced writes for performance. Manages state file format versioning
 * and handles concurrent access scenarios.
 */

import { existsSync, mkdirSync, rename, unlink, writeFile, readFile, watch, type FSWatcher, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PendingChange, ChangeQueue } from './state-manager.js';

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
   * Write state to file atomically
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
        mkdirSync(dir, { recursive: true });
      }

      // Prepare state data
      const stateData: StateFileData = {
        version: STATE_VERSION,
        timestamp: Date.now(),
        sessionID: this.sessionID,
        changes: changes.map(change => change.toJSON()),
      };

      // Convert to JSON
      const jsonContent = JSON.stringify(stateData, null, 2);

      // Write to temp file
      const tempPath = `${this.statePath}.tmp`;
      await this.writeFileAsync(tempPath, jsonContent);

      // Atomic rename
      await this.renameAsync(tempPath, this.statePath);

      this.log('State written successfully:', changes.length, 'changes');
    } catch (error) {
      this.isWriting = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new StateSyncError(`Failed to write state: ${message}`, 'write');
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Read state from file
   *
   * @returns Array of pending changes, or empty array if file doesn't exist
   * @throws StateSyncError if read fails or data is corrupted
   */
  async readState(): Promise<PendingChange[]> {
    try {
      if (!existsSync(this.statePath)) {
        this.log('State file not found, returning empty array');
        return [];
      }

      const content = await this.readFileAsync(this.statePath, 'utf-8');
      const data = JSON.parse(content) as StateFileData;

      // Validate version
      if (data.version !== STATE_VERSION) {
        throw new Error(`Unsupported state version: ${data.version}. Expected: ${STATE_VERSION}`);
      }

      // Validate required fields
      if (!Array.isArray(data.changes)) {
        throw new Error('Invalid state file: changes must be an array');
      }

      // Deserialize changes
      const changes = data.changes.map((changeData: unknown) =>
        PendingChange.fromJSON(changeData)
      );

      this.log('State read successfully:', changes.length, 'changes');
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
