/**
 * State Manager for OpenCode Diff Plugin
 * 
 * Manages pending file changes in a queue structure with line-level state tracking.
 * Provides storage and retrieval for intercepted file operations.
 */

import { ParsedDiff } from './diff-engine.js';
import { StateSync } from './state-sync.js';

/**
 * Line state types for granular change tracking
 */
export type LineState = 'pending' | 'accepted' | 'rejected';

/**
 * Aggregate state for a hunk or file
 */
export type AggregateState = 'pending' | 'accepted' | 'rejected' | 'mixed';

/**
 * Line identifier structure for tracking state per line
 */
export interface LineId {
  hunkIndex: number;
  lineIndex: number;
}

/**
 * Represents a single pending file change with line-level state tracking
 */
export class PendingChange {
  /** Unique identifier for this change */
  id: string;
  /** The tool that triggered this change ('write' or 'edit') */
  tool: string;
  /** Absolute path to the file being modified */
  filePath: string;
  /** Original content of the file (empty string for new files) */
  oldContent: string;
  /** Proposed new content for the file */
  newContent: string;
  /** Session ID that initiated this change */
  sessionID: string;
  /** Tool call ID that triggered this change */
  callID: string;
  /** Timestamp when the change was intercepted */
  timestamp: number;
  /** Parsed diff information */
  parsedDiff?: ParsedDiff;
  /** Line-level state tracking: key is "hunkIndex:lineIndex" */
  private lineStates: Map<string, LineState> = new Map();

  constructor(data: {
    id: string;
    tool: string;
    filePath: string;
    oldContent: string;
    newContent: string;
    sessionID: string;
    callID: string;
    timestamp: number;
    parsedDiff?: ParsedDiff;
  }) {
    this.id = data.id;
    this.tool = data.tool;
    this.filePath = data.filePath;
    this.oldContent = data.oldContent;
    this.newContent = data.newContent;
    this.sessionID = data.sessionID;
    this.callID = data.callID;
    this.timestamp = data.timestamp;
    this.parsedDiff = data.parsedDiff;

    // Initialize all lines to 'pending' state if parsedDiff is available
    if (this.parsedDiff) {
      this.initializeLineStates();
    }
  }

  /**
   * Initialize line states to 'pending' for all changed lines
   */
  private initializeLineStates(): void {
    if (!this.parsedDiff?.hunks) return;

    for (let hunkIndex = 0; hunkIndex < this.parsedDiff.hunks.length; hunkIndex++) {
      const hunk = this.parsedDiff.hunks[hunkIndex];
      for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
        const line = hunk.lines[lineIndex];
        // Only track state for added and deleted lines (not unchanged context lines)
        if (line.type === 'added' || line.type === 'deleted') {
          this.lineStates.set(this.makeLineKey(hunkIndex, lineIndex), 'pending');
        }
      }
    }
  }

  /**
   * Create a unique key for a line
   */
  private makeLineKey(hunkIndex: number, lineIndex: number): string {
    return `${hunkIndex}:${lineIndex}`;
  }

  /**
   * Parse a line key back to indices
   */
  private parseLineKey(key: string): LineId {
    const [hunkIndex, lineIndex] = key.split(':').map(Number);
    return { hunkIndex, lineIndex };
  }

  /**
   * Set the state of a specific line
   * @param lineId - The line identifier (hunkIndex:lineIndex string or LineId object)
   * @param state - The new state for the line
   * @returns True if the line was found and state was set, false otherwise
   */
  setLineState(lineId: string | LineId, state: LineState): boolean {
    const key = typeof lineId === 'string' ? lineId : this.makeLineKey(lineId.hunkIndex, lineId.lineIndex);
    
    // Only allow setting state for tracked lines (added or deleted lines)
    if (this.lineStates.has(key)) {
      this.lineStates.set(key, state);
      return true;
    }

    // If not already tracked, check if it corresponds to a valid changeable line
    if (!this.parsedDiff) return false;

    const { hunkIndex, lineIndex } = typeof lineId === 'string' 
      ? this.parseLineKey(key) 
      : lineId;

    const hunk = this.parsedDiff.hunks[hunkIndex];
    if (!hunk || lineIndex < 0 || lineIndex >= hunk.lines.length) {
      return false;
    }

    const line = hunk.lines[lineIndex];
    if (line.type === 'added' || line.type === 'deleted') {
      this.lineStates.set(key, state);
      return true;
    }

    return false;
  }

  /**
   * Get the state of a specific line
   * @param lineId - The line identifier (hunkIndex:lineIndex string or LineId object)
   * @returns The line state, or undefined if not found
   */
  getLineState(lineId: string | LineId): LineState | undefined {
    const key = typeof lineId === 'string' ? lineId : this.makeLineKey(lineId.hunkIndex, lineId.lineIndex);
    return this.lineStates.get(key);
  }

  /**
   * Get all line states
   * @returns Map of line keys to their states
   */
  getAllLineStates(): Map<string, LineState> {
    return new Map(this.lineStates);
  }

  /**
   * Get the number of accepted lines
   * @returns Count of lines with 'accepted' state
   */
  getAcceptedCount(): number {
    return this.countLinesByState('accepted');
  }

  /**
   * Get the number of rejected lines
   * @returns Count of lines with 'rejected' state
   */
  getRejectedCount(): number {
    return this.countLinesByState('rejected');
  }

  /**
   * Get the number of pending lines
   * @returns Count of lines with 'pending' state
   */
  getPendingCount(): number {
    return this.countLinesByState('pending');
  }

  /**
   * Count lines by state
   */
  private countLinesByState(state: LineState): number {
    let count = 0;
    for (const lineState of this.lineStates.values()) {
      if (lineState === state) count++;
    }
    return count;
  }

  /**
   * Get the total number of tracked lines
   * @returns Total count of tracked lines
   */
  getTotalLineCount(): number {
    return this.lineStates.size;
  }

  /**
   * Get the aggregate state for a specific hunk
   * @param hunkIndex - The index of the hunk
   * @returns The aggregate state ('pending', 'accepted', 'rejected', or 'mixed')
   */
  getHunkState(hunkIndex: number): AggregateState {
    if (!this.parsedDiff?.hunks[hunkIndex]) {
      return 'pending'; // Default if hunk doesn't exist
    }

    const states: LineState[] = [];
    const hunk = this.parsedDiff.hunks[hunkIndex];

    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
      const line = hunk.lines[lineIndex];
      if (line.type === 'added' || line.type === 'deleted') {
        const key = this.makeLineKey(hunkIndex, lineIndex);
        const state = this.lineStates.get(key) || 'pending';
        states.push(state);
      }
    }

    return this.aggregateStates(states);
  }

  /**
   * Get the aggregate state for the entire file
   * @returns The aggregate state ('pending', 'accepted', 'rejected', or 'mixed')
   */
  getFileState(): AggregateState {
    const states = Array.from(this.lineStates.values());
    return this.aggregateStates(states);
  }

  /**
   * Aggregate an array of line states into a single state
   */
  private aggregateStates(states: LineState[]): AggregateState {
    if (states.length === 0) return 'pending';

    const hasPending = states.includes('pending');
    const hasAccepted = states.includes('accepted');
    const hasRejected = states.includes('rejected');

    // If all states are the same, return that state
    if (!hasPending && !hasRejected) return 'accepted';
    if (!hasPending && !hasAccepted) return 'rejected';
    if (!hasAccepted && !hasRejected) return 'pending';

    // Mixed states
    return 'mixed';
  }

  /**
   * Reconstruct the final content based on accepted lines
   * Applies accepted changes to the original content
   * @returns The reconstructed content string
   */
  reconstructContent(): string {
    if (!this.parsedDiff || !this.oldContent) {
      // If no diff parsed or no old content, return newContent if all accepted,
      // oldContent if all rejected, or newContent for partial acceptance
      return this.newContent;
    }

    const oldLines = this.oldContent.split('\n');
    // Handle trailing newline
    if (this.oldContent.endsWith('\n') && oldLines[oldLines.length - 1] === '') {
      oldLines.pop();
    }

    // Start with a copy of old lines
    const resultLines: string[] = [...oldLines];

    // Apply changes hunk by hunk, line by line
    // Process hunks in reverse order to maintain line number integrity
    const hunks = [...this.parsedDiff.hunks].reverse();

    for (const hunk of hunks) {
      const hunkIndex = this.parsedDiff.hunks.indexOf(hunk);
      let oldLineOffset = 0;

      // Process lines in reverse order within the hunk
      for (let lineIndex = hunk.lines.length - 1; lineIndex >= 0; lineIndex--) {
        const line = hunk.lines[lineIndex];
        const lineKey = this.makeLineKey(hunkIndex, lineIndex);
        const state = this.lineStates.get(lineKey) || 'pending';

        // For pending lines, default to accepting them (can be configured)
        const effectiveState = state === 'pending' ? 'accepted' : state;

        if (line.type === 'added') {
          // Calculate the actual position in the result
          const insertPosition = (line.newLineNumber || hunk.newStart + lineIndex) - 1 + oldLineOffset;
          
          if (effectiveState === 'accepted') {
            // Insert the new line
            resultLines.splice(insertPosition, 0, line.content);
            oldLineOffset++;
          }
          // If rejected, don't insert (skip)
        } else if (line.type === 'deleted') {
          const deletePosition = (line.oldLineNumber || hunk.oldStart + lineIndex) - 1 + oldLineOffset;
          
          if (effectiveState === 'accepted') {
            // Delete the old line
            resultLines.splice(deletePosition, 1);
            oldLineOffset--;
          }
          // If rejected, keep the old line (don't delete)
        }
        // Unchanged lines are already in place
      }
    }

    // Reconstruct content
    let result = resultLines.join('\n');
    
    // Preserve trailing newline if original had it
    if (this.oldContent.endsWith('\n') || this.newContent.endsWith('\n')) {
      result += '\n';
    }

    return result;
  }

  /**
   * Accept all lines in the change
   */
  acceptAll(): void {
    for (const key of this.lineStates.keys()) {
      this.lineStates.set(key, 'accepted');
    }
  }

  /**
   * Reject all lines in the change
   */
  rejectAll(): void {
    for (const key of this.lineStates.keys()) {
      this.lineStates.set(key, 'rejected');
    }
  }

  /**
   * Reset all lines to pending state
   */
  resetAll(): void {
    for (const key of this.lineStates.keys()) {
      this.lineStates.set(key, 'pending');
    }
  }

  /**
   * Accept all lines in a specific hunk
   * @param hunkIndex - The index of the hunk
   */
  acceptHunk(hunkIndex: number): void {
    if (!this.parsedDiff?.hunks[hunkIndex]) return;

    const hunk = this.parsedDiff.hunks[hunkIndex];
    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
      const line = hunk.lines[lineIndex];
      if (line.type === 'added' || line.type === 'deleted') {
        const key = this.makeLineKey(hunkIndex, lineIndex);
        this.lineStates.set(key, 'accepted');
      }
    }
  }

  /**
   * Reject all lines in a specific hunk
   * @param hunkIndex - The index of the hunk
   */
  rejectHunk(hunkIndex: number): void {
    if (!this.parsedDiff?.hunks[hunkIndex]) return;

    const hunk = this.parsedDiff.hunks[hunkIndex];
    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
      const line = hunk.lines[lineIndex];
      if (line.type === 'added' || line.type === 'deleted') {
        const key = this.makeLineKey(hunkIndex, lineIndex);
        this.lineStates.set(key, 'rejected');
      }
    }
  }

  /**
   * Check if all lines have been decided (no pending)
   * @returns True if there are no pending lines
   */
  isFullyDecided(): boolean {
    return this.getPendingCount() === 0;
  }

  /**
   * Check if the change can be applied (has accepted lines or is fully decided)
   * @returns True if the change can be applied
   */
  canApply(): boolean {
    return this.getAcceptedCount() > 0 || this.getTotalLineCount() === 0;
  }

  /**
   * Get statistics about the change
   * @returns Object with counts of accepted, rejected, pending, and total lines
   */
  getStats(): {
    accepted: number;
    rejected: number;
    pending: number;
    total: number;
    percentageAccepted: number;
    percentageRejected: number;
    percentagePending: number;
  } {
    const accepted = this.getAcceptedCount();
    const rejected = this.getRejectedCount();
    const pending = this.getPendingCount();
    const total = this.getTotalLineCount();

    return {
      accepted,
      rejected,
      pending,
      total,
      percentageAccepted: total > 0 ? Math.round((accepted / total) * 100) : 0,
      percentageRejected: total > 0 ? Math.round((rejected / total) * 100) : 0,
      percentagePending: total > 0 ? Math.round((pending / total) * 100) : 0,
    };
  }

  /**
   * Create a plain object representation for serialization
   * @returns Plain object with all data
   */
  toJSON(): object {
    return {
      id: this.id,
      tool: this.tool,
      filePath: this.filePath,
      oldContent: this.oldContent,
      newContent: this.newContent,
      sessionID: this.sessionID,
      callID: this.callID,
      timestamp: this.timestamp,
      parsedDiff: this.parsedDiff,
      lineStates: Object.fromEntries(this.lineStates),
    };
  }

  /**
   * Create a PendingChange instance from a plain object
   * @param data - Plain object with PendingChange data
   * @returns New PendingChange instance
   */
  static fromJSON(data: any): PendingChange {
    const change = new PendingChange({
      id: data.id,
      tool: data.tool,
      filePath: data.filePath,
      oldContent: data.oldContent,
      newContent: data.newContent,
      sessionID: data.sessionID,
      callID: data.callID,
      timestamp: data.timestamp,
      parsedDiff: data.parsedDiff,
    });

    // Restore line states if present
    if (data.lineStates) {
      change.lineStates = new Map(Object.entries(data.lineStates));
    }

    return change;
  }
}

/**
 * Options for ChangeQueue constructor
 */
export interface ChangeQueueOptions {
  /** Enable file-based persistence for the queue */
  enablePersistence?: boolean;
  /** Path to the state file (required if enablePersistence is true) */
  statePath?: string;
  /** Session ID for state file tracking (will use default if not provided) */
  sessionID?: string;
}

/**
 * Simple in-memory change queue using Map for O(1) lookups
 * Works with PendingChange class instances
 * 
 * Optional file-based persistence can be enabled via constructor options.
 * When enabled, the queue will:
 * - Load persisted state on initialization
 * - Write state to file on mutations (debounced)
 * - Watch for external changes and reflect them in the queue
 */
export class ChangeQueue {
  private changes: Map<string, PendingChange> = new Map();
  private fileIndex: Map<string, string> = new Map();
  private stateSync: StateSync | null = null;
  private persistenceEnabled = false;
  /** Promise that resolves when initialization is complete (for tests) */
  ready: Promise<void> = Promise.resolve();

  /**
   * Create a new ChangeQueue instance
   * @param options Optional configuration for persistence
   */
  constructor(options?: ChangeQueueOptions) {
    if (options?.enablePersistence) {
      if (!options.statePath) {
        throw new Error('statePath is required when enablePersistence is true');
      }
      this.persistenceEnabled = true;
      const sessionID = options.sessionID ?? 'default-session';
      this.stateSync = new StateSync(options.statePath, sessionID);
      this.ready = this.loadState();
    }
  }

  /**
   * Load persisted state from file
   * Called automatically on initialization when persistence is enabled
   */
  async loadState(): Promise<void> {
    if (!this.stateSync || !this.persistenceEnabled) return;

    try {
      const changes = await this.stateSync.readState();
      this.changes.clear();
      this.fileIndex.clear();
      for (const change of changes) {
        this.changes.set(change.id, change);
        this.fileIndex.set(change.filePath, change.id);
      }
      // Set up file watcher after loading
      this.setupWatcher();
    } catch (error) {
      console.error('[ChangeQueue] Failed to load state:', error);
    }
  }

  /**
   * Set up file watcher for external changes
   */
  private setupWatcher(): void {
    if (!this.stateSync) return;

    this.stateSync.watchState((changes) => {
      // Update internal state from external changes
      this.changes.clear();
      this.fileIndex.clear();
      for (const change of changes) {
        this.changes.set(change.id, change);
        this.fileIndex.set(change.filePath, change.id);
      }
    });
  }

  /**
   * Persist current state to file
   * Called automatically on mutations when persistence is enabled
   */
  private async persistState(): Promise<void> {
    if (!this.stateSync || !this.persistenceEnabled) return;

    try {
      await this.stateSync.writeStateDebounced(this.getAll());
    } catch (error) {
      console.error('[ChangeQueue] Failed to persist state:', error);
    }
  }

  /**
   * Add a new pending change to the queue
   * @param change The pending change to add (PendingChange instance or plain object)
   */
  add(change: PendingChange | object): void {
    const pendingChange = change instanceof PendingChange 
      ? change 
      : PendingChange.fromJSON(change);
    
    this.changes.set(pendingChange.id, pendingChange);
    this.fileIndex.set(pendingChange.filePath, pendingChange.id);
    void this.persistState();
  }

  /**
   * Get a pending change by its ID
   * @param id The change ID
   * @returns The pending change or undefined if not found
   */
  get(id: string): PendingChange | undefined {
    return this.changes.get(id);
  }

  /**
   * Get a pending change by file path
   * @param filePath The file path
   * @returns The pending change or undefined if not found
   */
  getByFilePath(filePath: string): PendingChange | undefined {
    const id = this.fileIndex.get(filePath);
    if (id) {
      return this.changes.get(id);
    }
    return undefined;
  }

  /**
   * Check if a change exists for a given file path
   * @param filePath The file path to check
   * @returns True if a pending change exists for this file
   */
  hasFile(filePath: string): boolean {
    return this.fileIndex.has(filePath);
  }

  /**
   * Remove a pending change from the queue
   * @param id The change ID to remove
   * @returns True if the change was found and removed
   */
  remove(id: string): boolean {
    const change = this.changes.get(id);
    if (change) {
      this.fileIndex.delete(change.filePath);
      this.changes.delete(id);
      void this.persistState();
      return true;
    }
    return false;
  }

  /**
   * Remove a pending change by file path
   * @param filePath The file path to remove
   * @returns True if the change was found and removed
   */
  removeByFilePath(filePath: string): boolean {
    const id = this.fileIndex.get(filePath);
    if (id) {
      return this.remove(id);
    }
    return false;
  }

  /**
   * Get all pending changes
   * @returns Array of all pending changes
   */
  getAll(): PendingChange[] {
    return Array.from(this.changes.values());
  }

  /**
   * Get all changes sorted by timestamp (oldest first)
   * @returns Array of pending changes sorted by timestamp
   */
  getAllSorted(): PendingChange[] {
    return this.getAll().sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get changes filtered by state
   * @param state The aggregate state to filter by
   * @returns Array of changes with the specified aggregate state
   */
  getByState(state: AggregateState): PendingChange[] {
    return this.getAll().filter(change => change.getFileState() === state);
  }

  /**
   * Get the count of pending changes
   * @returns Number of pending changes
   */
  size(): number {
    return this.changes.size;
  }

  /**
   * Clear all pending changes
   */
  clear(): void {
    this.changes.clear();
    this.fileIndex.clear();
    void this.persistState();
  }

  /**
   * Update an existing change in the queue
   * @param id The change ID to update
   * @param updates Partial PendingChange data to update
   * @returns True if the change was found and updated
   */
  update(id: string, updates: Partial<PendingChange>): boolean {
    const existing = this.changes.get(id);
    if (!existing) return false;

    Object.assign(existing, updates);
    void this.persistState();
    return true;
  }

  /**
   * Stop watching the state file and clean up resources
   * Call this when the queue is no longer needed
   */
  destroy(): void {
    if (this.stateSync) {
      this.stateSync.unwatchState();
      this.stateSync = null;
    }
    this.persistenceEnabled = false;
  }

  /**
   * Get queue statistics
   * @returns Object with counts of changes by state
   */
  getStats(): {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    mixed: number;
  } {
    const all = this.getAll();
    return {
      total: all.length,
      pending: all.filter(c => c.getFileState() === 'pending').length,
      accepted: all.filter(c => c.getFileState() === 'accepted').length,
      rejected: all.filter(c => c.getFileState() === 'rejected').length,
      mixed: all.filter(c => c.getFileState() === 'mixed').length,
    };
  }

  /**
   * Generate a unique change ID
   * @returns A unique identifier string
   */
  static generateId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Global change queue instance
 */
export const changeQueue = new ChangeQueue();

/**
 * Error thrown when a tool execution is intercepted
 * This signals to OpenCode that the plugin has handled the operation
 */
export class InterceptedError extends Error {
  constructor(
    message: string,
    public readonly changeId: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = 'InterceptedError';
    Object.setPrototypeOf(this, InterceptedError.prototype);
  }
}

/**
 * Utility functions for state management
 */
export namespace StateUtils {
  /**
   * Check if a line state allows the change to be applied
   * @param state The line state
   * @returns True if the change should be applied
   */
  export function isApplied(state: LineState): boolean {
    return state === 'accepted' || state === 'pending';
  }

  /**
   * Check if a line state rejects the change
   * @param state The line state
   * @returns True if the change should be rejected
   */
  export function isRejected(state: LineState): boolean {
    return state === 'rejected';
  }

  /**
   * Merge two aggregate states
   * @param a First aggregate state
   * @param b Second aggregate state
   * @returns The merged aggregate state
   */
  export function mergeAggregateStates(a: AggregateState, b: AggregateState): AggregateState {
    if (a === b) return a;
    if (a === 'mixed' || b === 'mixed') return 'mixed';
    return 'mixed';
  }
}
