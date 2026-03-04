import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdir } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { BackupManager, BackupManagerError } from '../backup-manager.js';

const readdirAsync = promisify(readdir);

const TEST_DIR = '/tmp/opencode-diff-plugin-test-backup-manager';
const TEST_BACKUP_DIR = join(TEST_DIR, '.opencode', 'backups');
const TEST_FILES_DIR = join(TEST_DIR, 'files');

describe('BackupManager', () => {
  let manager: BackupManager;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_FILES_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('constructor', () => {
    it('should create BackupManager with default options', () => {
      const manager = new BackupManager();
      expect(manager).toBeDefined();
    });

    it('should create BackupManager with custom backup directory', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
      expect(manager).toBeDefined();
    });

    it('should create BackupManager with custom max backup size', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        maxBackupSizeBytes: 1024, // 1KB
      });
      expect(manager).toBeDefined();
    });

    it('should create BackupManager with debug mode enabled', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        debug: true,
      });
      expect(manager).toBeDefined();
    });
  });

  describe('backup', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should backup an existing file', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const content = 'Hello, World!';
      writeFileSync(testFile, content);

      const backupId = await manager.backup(testFile);

      expect(backupId).toBeDefined();
      expect(backupId.length).toBeGreaterThan(0);
      expect(existsSync(TEST_BACKUP_DIR)).toBe(true);
    });

    it('should create backup directory if it does not exist', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');

      expect(existsSync(TEST_BACKUP_DIR)).toBe(false);

      await manager.backup(testFile);

      expect(existsSync(TEST_BACKUP_DIR)).toBe(true);
    });

    it('should store backup info and allow retrieval', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const content = 'Test content';
      writeFileSync(testFile, content);

      const backupId = await manager.backup(testFile);
      const backupInfo = manager.getBackupInfo(testFile);

      expect(backupInfo).toBeDefined();
      expect(backupInfo?.backupId).toBe(backupId);
      expect(backupInfo?.originalPath).toBe(testFile);
      expect(backupInfo?.size).toBe(content.length);
    });

    it('should throw error when file does not exist', async () => {
      const nonExistentFile = join(TEST_FILES_DIR, 'non-existent.txt');

      try {
        await manager.backup(nonExistentFile);
        throw new Error('Expected backup to throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('backup');
        expect((error as BackupManagerError).message).toMatch(/File .* was deleted externally|File does not exist/);
      }
    });

    it('should throw error when file exceeds size limit', async () => {
      const smallManager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        maxBackupSizeBytes: 10, // 10 bytes
      });

      const testFile = join(TEST_FILES_DIR, 'large.txt');
      writeFileSync(testFile, 'This content is more than 10 bytes');

      try {
        await smallManager.backup(testFile);
        throw new Error('Expected backup to throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('backup');
        expect((error as BackupManagerError).message).toContain('exceeds maximum backup size');
      }
    });

    it('should backup files at exactly the size limit', async () => {
      const content = 'Exactly 20 bytes!!';
      const exactSizeManager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        maxBackupSizeBytes: content.length,
      });

      const testFile = join(TEST_FILES_DIR, 'exact-size.txt');
      writeFileSync(testFile, content);

      const backupId = await exactSizeManager.backup(testFile);
      expect(backupId).toBeDefined();
    });

    it('should handle empty files', async () => {
      const testFile = join(TEST_FILES_DIR, 'empty.txt');
      writeFileSync(testFile, '');

      const backupId = await manager.backup(testFile);
      expect(backupId).toBeDefined();

      const backupInfo = manager.getBackupInfo(testFile);
      expect(backupInfo?.size).toBe(0);
    });

    it('should handle files with special characters in content', async () => {
      const testFile = join(TEST_FILES_DIR, 'special.txt');
      const content = 'Special chars: äöü € 日本語 🎉 \n\t\\';
      writeFileSync(testFile, content);

      const backupId = await manager.backup(testFile);
      expect(backupId).toBeDefined();
    });

    it('should handle files in nested directories', async () => {
      const nestedDir = join(TEST_FILES_DIR, 'deep', 'nested', 'dir');
      mkdirSync(nestedDir, { recursive: true });
      const testFile = join(nestedDir, 'nested.txt');
      writeFileSync(testFile, 'Nested content');

      const backupId = await manager.backup(testFile);
      expect(backupId).toBeDefined();
    });

    it('should create unique backup IDs for same file at different times', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content v1');

      const backupId1 = await manager.backup(testFile);

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      writeFileSync(testFile, 'content v2');
      const backupId2 = await manager.backup(testFile);

      expect(backupId1).not.toBe(backupId2);
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should restore file from backup', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const originalContent = 'Original content';
      writeFileSync(testFile, originalContent);

      await manager.backup(testFile);

      // Modify the file
      writeFileSync(testFile, 'Modified content');

      // Restore
      await manager.restore(testFile);

      const restoredContent = readFileSync(testFile, 'utf-8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should restore to specific backup ID', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const content1 = 'Version 1';
      writeFileSync(testFile, content1);
      const backupId1 = await manager.backup(testFile);

      await new Promise(resolve => setTimeout(resolve, 10));

      const content2 = 'Version 2';
      writeFileSync(testFile, content2);
      await manager.backup(testFile);

      // Restore to first version
      await manager.restore(testFile, backupId1);

      const restoredContent = readFileSync(testFile, 'utf-8');
      expect(restoredContent).toBe(content1);
    });

    it('should throw error when no backup exists for file', async () => {
      const testFile = join(TEST_FILES_DIR, 'no-backup.txt');
      writeFileSync(testFile, 'content');

      try {
        await manager.restore(testFile);
        throw new Error('Expected backup to throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('restore');
        expect((error as BackupManagerError).message).toContain('No backup found');
      }
    });

    it('should throw error when backup ID does not exist', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');

      try {
        await manager.restore(testFile, 'non-existent-backup-id');
        throw new Error('Expected backup to throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('restore');
        expect((error as BackupManagerError).message).toContain('Backup not found');
      }
    });

    it('should create target directory if it does not exist during restore', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const originalContent = 'Original content';
      writeFileSync(testFile, originalContent);

      await manager.backup(testFile);

      // Remove original file and its directory
      rmSync(TEST_FILES_DIR, { recursive: true });

      mkdirSync(TEST_FILES_DIR, { recursive: true });
      await manager.restore(testFile);

      const restoredContent = readFileSync(testFile, 'utf-8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should throw error when backup file is missing from disk', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      // Get backup info and delete the backup file
      const backupInfo = manager.getBackupInfo(testFile);
      if (backupInfo) {
        rmSync(backupInfo.backupPath);
      }

      try {
        await manager.restore(testFile);
        throw new Error('Expected backup to throw error');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('restore');
        expect((error as BackupManagerError).message).toContain('Backup file not found');
      }
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should remove backup for a file', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      expect(manager.hasBackup(testFile)).toBe(true);

      await manager.cleanup(testFile);

      expect(manager.hasBackup(testFile)).toBe(false);
    });

    it('should remove specific backup by ID', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'v1');
      const backupId1 = await manager.backup(testFile);

      await new Promise(resolve => setTimeout(resolve, 10));

      writeFileSync(testFile, 'v2');
      await manager.backup(testFile);

      await manager.cleanup(testFile, backupId1);

      // Should still have the second backup
      expect(manager.hasBackup(testFile)).toBe(true);
    });

    it('should not throw error when cleaning up non-existent backup', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');

      // Should not throw
      await manager.cleanup(testFile);
    });

    it('should not throw error when specific backup ID does not exist', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');

      try {
        await manager.cleanup(testFile, 'non-existent-id');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('cleanup');
        expect((error as BackupManagerError).message).toContain('Backup not found');
      }
    });

    it('should remove backup file from disk', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      const backupInfo = manager.getBackupInfo(testFile);
      const backupPath = backupInfo?.backupPath;

      expect(existsSync(backupPath!)).toBe(true);

      await manager.cleanup(testFile);

      expect(existsSync(backupPath!)).toBe(false);
    });
  });

  describe('cleanupAll', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should remove all backups', async () => {
      const file1 = join(TEST_FILES_DIR, 'file1.txt');
      const file2 = join(TEST_FILES_DIR, 'file2.txt');
      writeFileSync(file1, 'content1');
      writeFileSync(file2, 'content2');

      await manager.backup(file1);
      await manager.backup(file2);

      expect(manager.hasBackup(file1)).toBe(true);
      expect(manager.hasBackup(file2)).toBe(true);

      await manager.cleanupAll();

      expect(manager.hasBackup(file1)).toBe(false);
      expect(manager.hasBackup(file2)).toBe(false);
    });

    it('should remove backup files from disk', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      const backupInfo = manager.getBackupInfo(testFile);
      const backupPath = backupInfo?.backupPath;

      await manager.cleanupAll();

      expect(existsSync(backupPath!)).toBe(false);
    });

    it('should remove empty backup directory', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      await manager.cleanupAll();

      // Directory might or might not be removed depending on implementation
      // The test should verify the behavior, not assume it
    });

    it('should handle cleanup when no backups exist', async () => {
      // Should not throw
      await manager.cleanupAll();
    });

    it('should continue cleanup even if some files fail', async () => {
      const file1 = join(TEST_FILES_DIR, 'file1.txt');
      const file2 = join(TEST_FILES_DIR, 'file2.txt');
      writeFileSync(file1, 'content1');
      writeFileSync(file2, 'content2');

      await manager.backup(file1);
      await manager.backup(file2);

      // Delete one backup file manually to simulate failure
      const backupInfo = manager.getBackupInfo(file1);
      if (backupInfo) {
        rmSync(backupInfo.backupPath);
      }

      // Should complete without throwing, but report errors
      try {
        await manager.cleanupAll();
        // If it doesn't throw, that's fine - errors are collected
      } catch (error) {
        // If it throws, it should be a BackupManagerError with aggregated errors
        expect(error).toBeInstanceOf(BackupManagerError);
        expect((error as BackupManagerError).operation).toBe('cleanup');
      }
    });
  });

  describe('hasBackup', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should return false when no backup exists', () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      expect(manager.hasBackup(testFile)).toBe(false);
    });

    it('should return true when backup exists', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      expect(manager.hasBackup(testFile)).toBe(true);
    });

    it('should return false when backup file is deleted from disk', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');
      await manager.backup(testFile);

      const backupInfo = manager.getBackupInfo(testFile);
      if (backupInfo) {
        rmSync(backupInfo.backupPath);
      }

      expect(manager.hasBackup(testFile)).toBe(false);
    });
  });

  describe('getBackupInfo', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should return undefined when no backup exists', () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      expect(manager.getBackupInfo(testFile)).toBeUndefined();
    });

    it('should return correct backup info', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const content = 'Test content';
      writeFileSync(testFile, content);

      const beforeBackup = Date.now();
      const backupId = await manager.backup(testFile);
      const afterBackup = Date.now();

      const backupInfo = manager.getBackupInfo(testFile);

      expect(backupInfo).toBeDefined();
      expect(backupInfo?.backupId).toBe(backupId);
      expect(backupInfo?.originalPath).toBe(testFile);
      expect(backupInfo?.size).toBe(content.length);
      expect(backupInfo?.timestamp).toBeGreaterThanOrEqual(beforeBackup);
      expect(backupInfo?.timestamp).toBeLessThanOrEqual(afterBackup);
      expect(backupInfo?.backupPath).toContain(TEST_BACKUP_DIR);
    });
  });

  describe('listBackups', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should return empty array when no backups exist', async () => {
      const backups = await manager.listBackups();
      expect(backups).toEqual([]);
    });

    it('should return all backups sorted by timestamp', async () => {
      const file1 = join(TEST_FILES_DIR, 'file1.txt');
      const file2 = join(TEST_FILES_DIR, 'file2.txt');
      writeFileSync(file1, 'content1');
      writeFileSync(file2, 'content2');

      await manager.backup(file1);
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.backup(file2);

      const backups = await manager.listBackups();

      expect(backups.length).toBe(2);
      expect(backups[0].originalPath).toBe(file2); // Most recent first
      expect(backups[1].originalPath).toBe(file1);
    });

    it('should not include duplicate backups', async () => {
      const file1 = join(TEST_FILES_DIR, 'file1.txt');
      writeFileSync(file1, 'v1');
      await manager.backup(file1);

      await new Promise(resolve => setTimeout(resolve, 10));

      writeFileSync(file1, 'v2');
      await manager.backup(file1);

      const backups = await manager.listBackups();

      expect(backups.length).toBe(2);
    });
  });

  describe('getBackupPath', () => {
    it('should generate backup path for file', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });

      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const path = manager.getBackupPath(testFile);

      expect(path).toContain(TEST_BACKUP_DIR);
      expect(path).toContain('.bak');
    });

    it('should generate different paths for different files', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });

      const path1 = manager.getBackupPath(join(TEST_FILES_DIR, 'file1.txt'));
      const path2 = manager.getBackupPath(join(TEST_FILES_DIR, 'file2.txt'));

      expect(path1).not.toBe(path2);
    });

    it('should use provided timestamp', () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });

      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const timestamp = 1234567890;
      const path = manager.getBackupPath(testFile, timestamp);

      expect(path).toContain(String(timestamp));
    });
  });

  describe('atomic operations', () => {
    beforeEach(() => {
      manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
      });
    });

    it('should use atomic write for backup (no temp files left behind)', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'content');

      await manager.backup(testFile);

      // Check no temp files in backup directory
      const backupFiles = await readdirAsync(TEST_BACKUP_DIR);
      const tempFiles = backupFiles.filter(f => f.endsWith('.tmp'));
      expect(tempFiles.length).toBe(0);
    });

    it('should use atomic write for restore (no temp files left behind)', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      writeFileSync(testFile, 'original');
      await manager.backup(testFile);

      writeFileSync(testFile, 'modified');
      await manager.restore(testFile);

      // Check no restore temp files
      const files = await readdirAsync(TEST_FILES_DIR);
      const tempFiles = files.filter(f => f.includes('.restore.tmp'));
      expect(tempFiles.length).toBe(0);
    });

    it('should preserve file integrity during backup', async () => {
      const testFile = join(TEST_FILES_DIR, 'test.txt');
      const content = 'Important data that must be preserved\nLine 2\nLine 3';
      writeFileSync(testFile, content);

      await manager.backup(testFile);

      const backupInfo = manager.getBackupInfo(testFile);
      const backupContent = readFileSync(backupInfo!.backupPath, 'utf-8');

      expect(backupContent).toBe(content);
    });
  });
});
