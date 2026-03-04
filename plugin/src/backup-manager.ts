/**
 * Backup Manager for OpenCode Diff Plugin
 *
 * Provides file backup and restore functionality with atomic operations,
 * configurable size limits, and comprehensive error handling.
 */

import { existsSync, mkdirSync, rename, unlink, writeFile, readFile, readdir, stat } from 'fs';
import { dirname, join, basename } from 'path';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { createLogger } from './debug.js';

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);
const renameAsync = promisify(rename);
const unlinkAsync = promisify(unlink);
const readdirAsync = promisify(readdir);
const statAsync = promisify(stat);

const logger = createLogger('BackupManager');

/**
 * Default backup directory path
 */
const DEFAULT_BACKUP_DIR = '.opencode/backups';

/**
 * Default maximum backup size in bytes (10MB)
 */
const DEFAULT_MAX_BACKUP_SIZE = 10 * 1024 * 1024;

/**
 * Options for BackupManager initialization
 */
export interface BackupManagerOptions {
  /** Directory to store backups (default: .opencode/backups) */
  backupDir?: string;
  /** Maximum file size to backup in bytes (default: 10MB) */
  maxBackupSizeBytes?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Backup information
 */
export interface BackupInfo {
  /** Unique backup identifier */
  backupId: string;
  /** Original file path */
  originalPath: string;
  /** Backup file path */
  backupPath: string;
  /** Timestamp when backup was created */
  timestamp: number;
  /** File size in bytes */
  size: number;
}

/**
 * Error codes for backup operations
 */
export type BackupErrorCode =
  | 'ENOENT'           // File not found
  | 'ENOSPC'           // Disk full
  | 'EACCES'           // Permission denied
  | 'EPERM'            // Operation not permitted
  | 'EISDIR'           // Is a directory
  | 'BINARY_FILE'      // Binary file detected
  | 'FILE_TOO_LARGE'   // File exceeds size limit
  | 'FILE_MODIFIED'    // File modified externally
  | 'FILE_DELETED'     // File deleted externally
  | 'UNKNOWN';         // Unknown error

/**
 * Error thrown when backup operations fail
 */
export class BackupManagerError extends Error {
  constructor(
    message: string,
    public readonly operation: 'backup' | 'restore' | 'cleanup',
    public readonly filePath: string,
    public readonly code: BackupErrorCode = 'UNKNOWN'
  ) {
    super(message);
    this.name = 'BackupManagerError';
  }
}

/**
 * Manages file backups with atomic operations and size limits
 */
export class BackupManager {
  private readonly backupDir: string;
  private readonly maxBackupSizeBytes: number;
  private readonly debug: boolean;
  private readonly backups: Map<string, BackupInfo> = new Map();
  private fileSnapshots: Map<string, { content: Buffer; mtime: number; size: number }> = new Map();

  /**
   * Creates a new BackupManager instance
   * @param options - Configuration options
   */
  constructor(options: BackupManagerOptions = {}) {
    this.backupDir = options.backupDir ?? DEFAULT_BACKUP_DIR;
    this.maxBackupSizeBytes = options.maxBackupSizeBytes ?? DEFAULT_MAX_BACKUP_SIZE;
    this.debug = options.debug ?? false;
  }

  /**
   * Detects if content is binary by checking for null bytes
   * @param content - Buffer to check
   * @returns True if content appears to be binary
   */
  private isBinaryContent(content: Buffer): boolean {
    const nullByteThreshold = 0.001;
    let nullByteCount = 0;
    const sampleSize = Math.min(content.length, 8192);
    
    for (let i = 0; i < sampleSize; i++) {
      if (content[i] === 0x00) {
        nullByteCount++;
      }
    }
    
    return nullByteCount / sampleSize > nullByteThreshold;
  }

  /**
   * Takes a snapshot of file state for external modification detection
   * @param filePath - Path to file
   * @returns Snapshot data or null if file doesn't exist
   */
  private async takeFileSnapshot(filePath: string): Promise<{ content: Buffer; mtime: number; size: number } | null> {
    try {
      const stats = await statAsync(filePath);
      const content = await readFileAsync(filePath);
      return {
        content,
        mtime: stats.mtime.getTime(),
        size: stats.size,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Checks if file has been modified externally since snapshot
   * @param filePath - Path to file
   * @returns True if file has been modified
   */
  async hasFileBeenModified(filePath: string): Promise<boolean> {
    const snapshot = this.fileSnapshots.get(filePath);
    if (!snapshot) {
      return false;
    }

    try {
      const currentStats = await statAsync(filePath);
      const currentSize = currentStats.size;
      const currentMtime = currentStats.mtime.getTime();

      if (currentSize !== snapshot.size || currentMtime !== snapshot.mtime) {
        logger.warn('File modified externally detected', { filePath, oldSize: snapshot.size, newSize: currentSize });
        return true;
      }

      return false;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        logger.warn('File deleted externally detected', { filePath });
        return true;
      }
      return false;
    }
  }

  /**
   * Maps Node.js error code to BackupErrorCode
   * @param code - Node.js error code
   * @returns BackupErrorCode
   */
  private mapErrorCode(code?: string): BackupErrorCode {
    switch (code) {
      case 'ENOENT':
        return 'ENOENT';
      case 'ENOSPC':
        return 'ENOSPC';
      case 'EACCES':
        return 'EACCES';
      case 'EPERM':
        return 'EPERM';
      case 'EISDIR':
        return 'EISDIR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Gets user-friendly error message for error code
   * @param code - Error code
   * @param filePath - File path for context
   * @returns Human-readable error message
   */
  private getErrorMessage(code: BackupErrorCode, filePath: string): string {
    switch (code) {
      case 'ENOENT':
        return `File not found: ${filePath}`;
      case 'ENOSPC':
        return `Disk full - unable to backup ${filePath}. Free up disk space and try again.`;
      case 'EACCES':
        return `Permission denied accessing ${filePath}. Check file permissions.`;
      case 'EPERM':
        return `Operation not permitted on ${filePath}. Check file permissions or if file is locked.`;
      case 'EISDIR':
        return `Cannot backup directory ${filePath}`;
      case 'BINARY_FILE':
        return `Skipping binary file ${filePath}`;
      case 'FILE_TOO_LARGE':
        return `File ${filePath} exceeds maximum backup size limit`;
      case 'FILE_MODIFIED':
        return `File ${filePath} was modified externally`;
      case 'FILE_DELETED':
        return `File ${filePath} was deleted externally`;
      default:
        return `Unknown error processing ${filePath}`;
    }
  }

  /**
   * Generates a hash of the file path for unique backup naming
   * @param filePath - Path to hash
   * @returns Hashed string
   */
  private hashPath(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Generates a backup ID
   * @param filePath - Original file path
   * @param timestamp - Backup timestamp
   * @returns Backup ID
   */
  private generateBackupId(filePath: string, timestamp: number): string {
    return `${this.hashPath(filePath)}_${timestamp}`;
  }

  /**
   * Ensures the backup directory exists
   * @throws BackupManagerError if directory creation fails
   */
  private async ensureBackupDir(): Promise<void> {
    if (!existsSync(this.backupDir)) {
      try {
        mkdirSync(this.backupDir, { recursive: true });
        logger.debug('Created backup directory:', this.backupDir);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BackupManagerError(
          `Failed to create backup directory: ${message}`,
          'backup',
          this.backupDir
        );
      }
    }
  }

  /**
   * Gets the backup file path for a given file
   * @param filePath - Original file path
   * @param timestamp - Optional timestamp (defaults to current time)
   * @returns Path to backup file
   */
  getBackupPath(filePath: string, timestamp?: number): string {
    const ts = timestamp ?? Date.now();
    const backupId = this.generateBackupId(filePath, ts);
    return join(this.backupDir, `${backupId}.bak`);
  }

  /**
   * Creates a backup of the specified file with comprehensive edge case handling
   * @param filePath - Path to file to backup
   * @returns Promise resolving to backup ID
   * @throws BackupManagerError if backup fails
   */
  async backup(filePath: string): Promise<string> {
    logger.info('Backing up file:', { filePath });

    // Check if file exists before attempting backup
    if (!existsSync(filePath)) {
      logger.error('File does not exist', { filePath });
      throw new BackupManagerError(
        this.getErrorMessage('FILE_DELETED', filePath),
        'backup',
        filePath,
        'FILE_DELETED'
      );
    }

    try {
      // Check file size
      const stats = await statAsync(filePath);
      const fileSize = stats.size;

      // Check if it's a directory
      if (stats.isDirectory()) {
        logger.warn('Cannot backup directory', { filePath });
        throw new BackupManagerError(
          this.getErrorMessage('EISDIR', filePath),
          'backup',
          filePath,
          'EISDIR'
        );
      }

      if (fileSize > this.maxBackupSizeBytes) {
        const maxMB = (this.maxBackupSizeBytes / (1024 * 1024)).toFixed(2);
        const fileMB = (fileSize / (1024 * 1024)).toFixed(2);
        logger.warn('File size exceeds backup limit', { filePath, fileSize: `${fileMB}MB`, maxSize: `${maxMB}MB` });
        throw new BackupManagerError(
          this.getErrorMessage('FILE_TOO_LARGE', filePath),
          'backup',
          filePath,
          'FILE_TOO_LARGE'
        );
      }

      // Ensure backup directory exists
      await this.ensureBackupDir();

      // Generate backup ID and path
      const timestamp = Date.now();
      const backupId = this.generateBackupId(filePath, timestamp);
      const backupPath = join(this.backupDir, `${backupId}.bak`);

      // Read original file content
      const content = await readFileAsync(filePath);

      // Check for binary content
      if (this.isBinaryContent(content)) {
        logger.warn('Binary file detected, skipping backup', { filePath });
        throw new BackupManagerError(
          this.getErrorMessage('BINARY_FILE', filePath),
          'backup',
          filePath,
          'BINARY_FILE'
        );
      }

      // Take snapshot for external modification detection
      const snapshot = await this.takeFileSnapshot(filePath);
      if (snapshot) {
        this.fileSnapshots.set(filePath, snapshot);
      }

      // Atomic write: write to temp file, then rename
      const tempPath = `${backupPath}.tmp`;
      await writeFileAsync(tempPath, content);
      await renameAsync(tempPath, backupPath);

      // Store backup info
      const backupInfo: BackupInfo = {
        backupId,
        originalPath: filePath,
        backupPath,
        timestamp,
        size: fileSize,
      };
      this.backups.set(backupId, backupInfo);
      this.backups.set(filePath, backupInfo); // Also store by file path for easy lookup

      logger.info('Backup created successfully', { backupId, filePath, size: fileSize });
      return backupId;
    } catch (error) {
      if (error instanceof BackupManagerError) {
        throw error;
      }

      // Handle specific error codes
      const nodeError = error as NodeJS.ErrnoException;
      const errorCode = this.mapErrorCode(nodeError.code);
      const errorMessage = this.getErrorMessage(errorCode, filePath);

      logger.error('Backup failed', { filePath, errorCode, error: nodeError.message });

      throw new BackupManagerError(
        `${errorMessage}: ${nodeError.message}`,
        'backup',
        filePath,
        errorCode
      );
    }
  }

  /**
   * Restores a file from backup with edge case handling
   * @param filePath - Path to file to restore
   * @param backupId - Optional specific backup ID to restore from (uses most recent if not specified)
   * @throws BackupManagerError if restore fails
   */
  async restore(filePath: string, backupId?: string): Promise<void> {
    logger.info('Restoring file from backup', { filePath, backupId });

    let targetBackup: BackupInfo | undefined;

    if (backupId) {
      targetBackup = this.backups.get(backupId);
      if (!targetBackup) {
        logger.error('Backup not found', { backupId });
        throw new BackupManagerError(
          `Backup not found: ${backupId}`,
          'restore',
          filePath,
          'ENOENT'
        );
      }
    } else {
      // Find most recent backup for this file
      targetBackup = this.backups.get(filePath);
      if (!targetBackup) {
        logger.error('No backup found for file', { filePath });
        throw new BackupManagerError(
          'No backup found for file',
          'restore',
          filePath,
          'ENOENT'
        );
      }
    }

    // Verify backup file exists
    if (!existsSync(targetBackup.backupPath)) {
      logger.error('Backup file not found on disk', { backupPath: targetBackup.backupPath });
      throw new BackupManagerError(
        `Backup file not found: ${targetBackup.backupPath}`,
        'restore',
        filePath,
        'ENOENT'
      );
    }

    try {
      // Check for external modification before restore
      const wasModified = await this.hasFileBeenModified(filePath);
      if (wasModified) {
        logger.warn('File was modified externally since backup', { filePath });
        // Continue with restore but warn - user explicitly asked to restore
      }

      // Ensure target directory exists
      const targetDir = dirname(filePath);
      if (!existsSync(targetDir)) {
        try {
          mkdirSync(targetDir, { recursive: true });
          logger.debug('Created target directory', { targetDir });
        } catch (mkdirError) {
          const code = (mkdirError as NodeJS.ErrnoException)?.code;
          const errorCode = this.mapErrorCode(code);
          throw new BackupManagerError(
            `Failed to create target directory: ${(mkdirError as Error).message}`,
            'restore',
            filePath,
            errorCode
          );
        }
      }

      // Read backup content
      const content = await readFileAsync(targetBackup.backupPath);

      // Check if backup content is still valid (not corrupted)
      if (this.isBinaryContent(content) && !this.isBinaryContent(Buffer.from(''))) {
        // If original file was not binary but backup is, warn but still restore
        logger.warn('Backup appears to be binary, original may have been binary', { filePath });
      }

      // Atomic write: write to temp file, then rename
      const tempPath = `${filePath}.restore.tmp`;
      await writeFileAsync(tempPath, content);
      await renameAsync(tempPath, filePath);

      // Clean up snapshot after successful restore
      this.fileSnapshots.delete(filePath);

      logger.info('File restored successfully', { filePath });
    } catch (error) {
      if (error instanceof BackupManagerError) {
        throw error;
      }

      const nodeError = error as NodeJS.ErrnoException;
      const errorCode = this.mapErrorCode(nodeError.code);

      logger.error('Restore failed', { filePath, errorCode, error: nodeError.message });

      throw new BackupManagerError(
        `Failed to restore file: ${nodeError.message}`,
        'restore',
        filePath,
        errorCode
      );
    }
  }

  /**
   * Removes a specific backup with edge case handling
   * @param filePath - Original file path
   * @param backupId - Optional specific backup ID to remove (removes most recent if not specified)
   * @throws BackupManagerError if cleanup fails
   */
  async cleanup(filePath: string, backupId?: string): Promise<void> {
    logger.info('Cleaning up backup', { filePath, backupId });

    let targetBackup: BackupInfo | undefined;

    if (backupId) {
      targetBackup = this.backups.get(backupId);
      if (!targetBackup) {
        logger.error('Backup not found for cleanup', { backupId });
        throw new BackupManagerError(
          `Backup not found: ${backupId}`,
          'cleanup',
          filePath,
          'ENOENT'
        );
      }
    } else {
      // Find most recent backup for this file
      targetBackup = this.backups.get(filePath);
      if (!targetBackup) {
        logger.debug('No backup found for file', { filePath });
        return; // Nothing to cleanup
      }
    }

    try {
      if (existsSync(targetBackup.backupPath)) {
        await unlinkAsync(targetBackup.backupPath);
        logger.debug('Removed backup file', { backupPath: targetBackup.backupPath });
      } else {
        logger.warn('Backup file not found on disk during cleanup', { backupPath: targetBackup.backupPath });
      }

      // Remove from tracking
      this.backups.delete(targetBackup.backupId);
      if (this.backups.get(filePath)?.backupId === targetBackup.backupId) {
        this.backups.delete(filePath);
      }

      // Clean up snapshot
      this.fileSnapshots.delete(filePath);

      logger.info('Backup cleanup completed', { filePath, backupId: targetBackup.backupId });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      const errorCode = this.mapErrorCode(nodeError.code);

      logger.error('Backup cleanup failed', { filePath, errorCode, error: nodeError.message });

      throw new BackupManagerError(
        `Failed to cleanup backup: ${nodeError.message}`,
        'cleanup',
        filePath,
        errorCode
      );
    }
  }

  /**
   * Removes all backups for this session with edge case handling
   * @throws BackupManagerError if cleanup fails
   */
  async cleanupAll(): Promise<void> {
    logger.info('Cleaning up all backups');

    const errors: string[] = [];

    // Get unique backup entries
    const processedBackupIds = new Set<string>();

    for (const [, backupInfo] of this.backups.entries()) {
      // Skip if we've already processed this backup (keys include both backupId and filePath)
      if (processedBackupIds.has(backupInfo.backupId)) {
        continue;
      }
      processedBackupIds.add(backupInfo.backupId);

      try {
        if (existsSync(backupInfo.backupPath)) {
          await unlinkAsync(backupInfo.backupPath);
          logger.debug('Removed backup file', { backupId: backupInfo.backupId });
        } else {
          logger.warn('Backup file not found during cleanupAll', { backupId: backupInfo.backupId });
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        const errorCode = this.mapErrorCode(nodeError.code);
        logger.error('Failed to remove backup', { backupId: backupInfo.backupId, errorCode, error: nodeError.message });
        errors.push(`Failed to remove ${backupInfo.backupId}: ${nodeError.message}`);
      }
    }

    // Clear all tracked backups and snapshots
    this.backups.clear();
    this.fileSnapshots.clear();

    // Remove empty backup directory
    try {
      if (existsSync(this.backupDir)) {
        const files = await readdirAsync(this.backupDir);
        if (files.length === 0) {
          await unlinkAsync(this.backupDir);
          logger.debug('Removed empty backup directory');
        }
      }
    } catch {
      // Ignore errors when removing directory
    }

    if (errors.length > 0) {
      throw new BackupManagerError(
        `Cleanup completed with errors: ${errors.join('; ')}`,
        'cleanup',
        this.backupDir,
        'UNKNOWN'
      );
    }

    logger.info('All backups cleaned up successfully');
  }

  /**
   * Cleans up orphaned backup files not tracked in memory
   * Useful for recovering from crashes
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns Number of orphaned backups cleaned up
   */
  async cleanupOrphaned(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    logger.info('Cleaning up orphaned backups', { maxAgeHours: maxAgeMs / (60 * 60 * 1000) });

    if (!existsSync(this.backupDir)) {
      return 0;
    }

    let cleanedCount = 0;
    const now = Date.now();
    const trackedPaths = new Set<string>();

    // Build set of tracked backup paths
    for (const [, backupInfo] of this.backups) {
      trackedPaths.add(backupInfo.backupPath);
    }

    try {
      const files = await readdirAsync(this.backupDir);

      for (const file of files) {
        if (!file.endsWith('.bak')) {
          continue;
        }

        const backupPath = join(this.backupDir, file);

        // Skip if tracked
        if (trackedPaths.has(backupPath)) {
          continue;
        }

        try {
          const stats = await statAsync(backupPath);
          const age = now - stats.mtime.getTime();

          if (age > maxAgeMs) {
            await unlinkAsync(backupPath);
            cleanedCount++;
            logger.debug('Removed orphaned backup', { backupPath, ageHours: age / (60 * 60 * 1000) });
          }
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          logger.error('Failed to process orphaned backup', { backupPath, error: nodeError.message });
        }
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      logger.error('Failed to cleanup orphaned backups', { error: nodeError.message });
    }

    logger.info('Orphaned backup cleanup completed', { cleanedCount });
    return cleanedCount;
  }

  /**
   * Checks if a backup exists for the specified file
   * @param filePath - Original file path
   * @returns True if backup exists
   */
  hasBackup(filePath: string): boolean {
    const backupInfo = this.backups.get(filePath);
    if (!backupInfo) {
      return false;
    }
    return existsSync(backupInfo.backupPath);
  }

  /**
   * Gets information about a backup
   * @param filePath - Original file path
   * @returns Backup info or undefined if no backup exists
   */
  getBackupInfo(filePath: string): BackupInfo | undefined {
    return this.backups.get(filePath);
  }

  /**
   * Lists all backups in the backup directory
   * @returns Array of backup information
   */
  async listBackups(): Promise<BackupInfo[]> {
    const result: BackupInfo[] = [];
    const seenIds = new Set<string>();

    for (const [, backupInfo] of this.backups) {
      if (!seenIds.has(backupInfo.backupId)) {
        seenIds.add(backupInfo.backupId);
        result.push(backupInfo);
      }
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }
}

export default BackupManager;
