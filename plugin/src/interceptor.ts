import type { PluginInput } from '@opencode-ai/plugin';
import { ChangeQueue, changeQueue, InterceptedError, PendingChange } from './state-manager.js';
import { ConfigManager } from './config.js';
import { createLogger } from './debug.js';
import { DiffEngine } from './diff-engine.js';
import { TUIRenderer } from './ui/tui-renderer.js';
import { BackupManager } from './backup-manager.js';
import { VSCodeDetector } from './vscode-detector.js';
import { StateSync } from './state-sync.js';
import { writeFileSync, existsSync, mkdirSync, statSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import readline from 'readline';
import type { BackupErrorCode } from './backup-manager.js';

const logger = createLogger('Interceptor');
type BunShell = PluginInput['$'];

interface WriteToolArgs {
  filePath: string;
  content: string;
}

interface EditToolArgs {
  filePath: string;
  oldString: string;
  newString: string;
}

interface InterceptorContext {
  $: BunShell;
  directory: string;
  sessionID: string;
  callID: string;
  changeQueue: ChangeQueue;
  configManager: ConfigManager;
  backupManager: BackupManager;
  vscodeDetector: VSCodeDetector;
  stateSync: StateSync;
}

export class ToolInterceptor {
  constructor(private context: InterceptorContext) {}

  async before(tool: string, args: unknown): Promise<void> {
    if (tool !== 'write' && tool !== 'edit') {
      logger.debug('Skipping non-intercepted tool', { tool });
      return;
    }

    const { filePath } = this.extractFilePath(tool, args);
    logger.info('Intercepting tool call', { tool, filePath, callID: this.context.callID });

    // Validate file path
    const validation = this.validateFilePath(filePath);
    if (!validation.valid) {
      logger.error('File path validation failed', { filePath, error: validation.error });
      throw new Error(validation.error);
    }

    // Check for binary content
    const contentToWrite = (args as WriteToolArgs | EditToolArgs);
    if ('content' in contentToWrite && contentToWrite.content && this.isBinaryContent(contentToWrite.content)) {
      logger.warn('Binary file detected, processing with caution', { filePath });
      // Continue but warn - don't block binary files entirely
    }

    const mode = this.context.configManager.getMode();
    const vscodeConfig = this.context.configManager.getVSCodeOnlyConfig();
    
    logger.debug('Mode detection', { mode, filePath });

    let effectiveMode: 'tui' | 'vscode-only' = 'tui';
    if (mode === 'vscode-only') {
      effectiveMode = 'vscode-only';
    } else if (mode === 'auto') {
      try {
        const isVSCodeRunning = await this.context.vscodeDetector.isVSCodeRunning();
        effectiveMode = isVSCodeRunning ? 'vscode-only' : 'tui';
        logger.debug('Auto mode detection', { isVSCodeRunning, effectiveMode });
      } catch (error) {
        logger.warn('VSCode detection failed, falling back to TUI mode', { error });
        effectiveMode = 'tui';
      }
    }

    let oldContent: string;
    try {
      oldContent = await this.readOriginalContent(filePath);
    } catch (error) {
      logger.error('Failed to read original content', { filePath, error });
      throw new Error(this.getUserFriendlyError(error, filePath));
    }

    const newContent = this.computeNewContent(tool, oldContent, args);
    const isNewFile = oldContent === '';

    // Check for external modification
    if (!isNewFile && this.hasFileBeenModifiedExternally(filePath, oldContent)) {
      logger.warn('File modified externally since read', { filePath });
      // Continue but warn - this is handled gracefully
    }

    logger.debug('Content computed', {
      filePath,
      isNewFile,
      oldContentLength: oldContent.length,
      newContentLength: newContent.length,
    });

    const change = new PendingChange({
      id: ChangeQueue.generateId(),
      tool,
      filePath,
      oldContent,
      newContent,
      sessionID: this.context.sessionID,
      callID: this.context.callID,
      timestamp: Date.now(),
    });

    this.context.changeQueue.add(change);
    const pendingCount = this.context.changeQueue.size();

    logger.info('Change queued successfully', {
      changeId: change.id,
      filePath,
      pendingCount,
    });

    if (effectiveMode === 'vscode-only' && vscodeConfig.applyImmediately) {
      logger.info('VSCode-only mode: applying change immediately', { filePath });
      
      try {
        let backupId: string | undefined;
        if (vscodeConfig.backupOriginals && !isNewFile && oldContent !== '') {
          logger.debug('Creating backup', { filePath });
          backupId = await this.context.backupManager.backup(this.resolvePath(filePath));
          logger.debug('Backup created', { filePath, backupId });
        }

        await this.applyFileWrite(filePath, newContent);
        logger.info('File written successfully', { filePath });

        await this.context.stateSync.writeState(this.context.changeQueue.getAll());
        logger.debug('State file updated', { filePath });

        if (vscodeConfig.notificationOnChange) {
          console.log(`[DiffPlugin] Change applied to ${filePath}`);
        }

        this.context.changeQueue.remove(change.id);
        
        if (backupId) {
          await this.context.backupManager.cleanup(filePath, backupId);
        }

        throw new InterceptedError(
          `Tool '${tool}' for '${filePath}' applied via VSCode-only mode`,
          change.id,
          filePath
        );
      } catch (error) {
        if (error instanceof InterceptedError) {
          throw error;
        }
        
        const userMessage = this.getUserFriendlyError(error, filePath);
        logger.error('Failed to apply change in VSCode-only mode', { filePath, error, userMessage });
        
        // Attempt recovery with exponential backoff
        let restored = false;
        for (let attempt = 0; attempt < 3 && !restored; attempt++) {
          try {
            if (this.context.backupManager.hasBackup(filePath)) {
              logger.warn('Restoring from backup due to error', { filePath, attempt: attempt + 1 });
              await this.context.backupManager.restore(filePath);
              logger.info('Backup restored successfully', { filePath });
              restored = true;
            } else {
              break;
            }
          } catch (restoreError) {
            logger.error('Failed to restore from backup', { filePath, attempt: attempt + 1, restoreError });
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
            }
          }
        }

        this.context.changeQueue.remove(change.id);
        
        throw new InterceptedError(
          `Tool '${tool}' for '${filePath}' failed in VSCode-only mode: ${userMessage}`,
          change.id,
          filePath
        );
      }
    } else {
      const action = await this.showDiffUI(change);
      
      if (action === 'accept') {
        logger.info('Change accepted, applying...');
        return;
      } else {
        logger.info('Change rejected, removing from queue...');
        this.context.changeQueue.remove(change.id);
        throw new InterceptedError(
          `Tool '${tool}' for '${filePath}' rejected by user`,
          change.id,
          filePath
        );
      }
    }
  }

  async after(tool: string): Promise<void> {
    if (tool !== 'write' && tool !== 'edit') {
      return;
    }

    console.log(`[DiffPlugin] Tool '${tool}' executed successfully`);
  }

  private extractFilePath(tool: string, args: unknown): { filePath: string } {
    if (typeof args !== 'object' || args === null) {
      throw new Error(`Invalid arguments for ${tool} tool: expected object`);
    }

    const argsObj = args as Record<string, unknown>;
    const filePath = argsObj.filePath;

    if (typeof filePath !== 'string') {
      throw new Error(`Invalid filePath for ${tool} tool: expected string`);
    }

    return { filePath };
  }

  private async readOriginalContent(filePath: string): Promise<string> {
    try {
      const fullPath = this.resolvePath(filePath);
      const result = await this.context.$`cat ${fullPath}`;
      return result.stdout.toString();
    } catch {
      return '';
    }
  }

  private computeNewContent(tool: string, oldContent: string, args: unknown): string {
    if (tool === 'write') {
      const writeArgs = args as WriteToolArgs;
      return writeArgs.content;
    }

    if (tool === 'edit') {
      const editArgs = args as EditToolArgs;
      return oldContent.replace(editArgs.oldString, editArgs.newString);
    }

    return oldContent;
  }

  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    return `${this.context.directory}/${filePath}`;
  }

  private async applyFileWrite(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const dir = dirname(fullPath);
    
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
        logger.debug('Created directory', { dir });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        logger.error('Failed to create directory', { dir, error: nodeError.message, code: nodeError.code });
        throw new Error(`Failed to create directory ${dir}: ${nodeError.message}`);
      }
    }
    
    try {
      writeFileSync(fullPath, content, 'utf-8');
      logger.debug('File written successfully', { fullPath, contentLength: content.length });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      logger.error('Failed to write file', { fullPath, error: nodeError.message, code: nodeError.code });
      throw new Error(`Failed to write file ${fullPath}: ${nodeError.message}`);
    }
  }

  /**
   * Checks if content is binary
   * @param content - Content to check
   * @returns True if content appears to be binary
   */
  private isBinaryContent(content: string): boolean {
    const nullByteThreshold = 0.001;
    let nullByteCount = 0;
    const sampleSize = Math.min(content.length, 8192);
    
    for (let i = 0; i < sampleSize; i++) {
      if (content.charCodeAt(i) === 0x00) {
        nullByteCount++;
      }
    }
    
    return nullByteCount / sampleSize > nullByteThreshold;
  }

  /**
   * Validates file path and checks for edge cases
   * @param filePath - Path to validate
   * @returns Validation result with error message if invalid
   */
  private validateFilePath(filePath: string): { valid: boolean; error?: string } {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'Invalid file path: path must be a non-empty string' };
    }

    // Check for directory traversal attempts
    if (filePath.includes('..')) {
      return { valid: false, error: `Invalid file path: directory traversal not allowed: ${filePath}` };
    }

    // Check for absolute paths that are outside workspace
    const fullPath = this.resolvePath(filePath);
    if (!fullPath.startsWith(this.context.directory)) {
      return { valid: false, error: `Invalid file path: path outside workspace: ${filePath}` };
    }

    return { valid: true };
  }

  /**
   * Maps error to user-friendly message
   * @param error - Error to map
   * @param filePath - File path for context
   * @returns User-friendly error message
   */
  private getUserFriendlyError(error: unknown, filePath: string): string {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      
      switch (nodeError.code) {
        case 'ENOENT':
          return `File not found: ${filePath}`;
        case 'ENOSPC':
          return `Disk full - unable to write ${filePath}. Free up disk space and try again.`;
        case 'EACCES':
          return `Permission denied accessing ${filePath}. Check file permissions.`;
        case 'EPERM':
          return `Operation not permitted on ${filePath}. Check file permissions or if file is locked.`;
        case 'EISDIR':
          return `Cannot write to ${filePath}: path is a directory`;
        default:
          return `Error processing ${filePath}: ${error.message}`;
      }
    }
    return `Unknown error processing ${filePath}: ${String(error)}`;
  }

  /**
   * Checks if file was modified externally
   * @param filePath - Path to check
   * @param expectedContent - Expected content hash
   * @returns True if file was modified externally
   */
  private hasFileBeenModifiedExternally(filePath: string, expectedContent: string): boolean {
    const fullPath = this.resolvePath(filePath);
    
    if (!existsSync(fullPath)) {
      return expectedContent !== '';
    }

    try {
      const currentContent = readFileSync(fullPath, 'utf-8');
      return currentContent !== expectedContent;
    } catch (error) {
      logger.warn('Could not check for external modification', { filePath, error });
      return false;
    }
  }

  private async showDiffUI(change: PendingChange): Promise<'accept' | 'reject'> {
    const diffEngine = new DiffEngine({ contextLines: 3, ignoreWhitespace: false });
    const diffText = diffEngine.generateDiff(
      change.filePath,
      change.filePath,
      change.oldContent,
      change.newContent
    );
    const parsedDiffs = diffEngine.parseDiff(diffText);
    
    if (parsedDiffs.length === 0) {
      return 'accept';
    }

    const renderer = new TUIRenderer({ theme: 'dark', showToolbar: true, showFooter: true });
    const diff = parsedDiffs[0];
    
    console.clear();
    console.log(renderer.render(diff));
    console.log('\n[Actions] (a)ccept, (r)eject, (q)uit');

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = () => {
        rl.question('Choice: ', (answer) => {
          const choice = answer.trim().toLowerCase();
          if (choice === 'a' || choice === 'accept') {
            rl.close();
            resolve('accept');
          } else if (choice === 'r' || choice === 'reject') {
            rl.close();
            resolve('reject');
          } else if (choice === 'q' || choice === 'quit') {
            rl.close();
            resolve('reject');
          } else {
            console.log('Invalid choice. Use a, r, or q');
            ask();
          }
        });
      };

      ask();
    });
  }
}

export function createBeforeHandler(
  $: BunShell,
  directory: string,
  configManager: ConfigManager,
  queue: ChangeQueue = changeQueue
) {
  const backupManager = new BackupManager({
    backupDir: join(directory, '.opencode', 'backups'),
    maxBackupSizeBytes: configManager.getVSCodeOnlyConfig().maxBackupSizeBytes || 100 * 1024 * 1024,
  });
  
  const vscodeDetector = new VSCodeDetector(directory);
  
  const ideConfig = configManager.getConfig().ide;
  const statePath = ideConfig?.stateFilePath || join(directory, '.opencode', '.diff-plugin-state.json');
  const stateSync = new StateSync(statePath, 'default-session');
  
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown }
  ): Promise<void> => {
    const interceptor = new ToolInterceptor({
      $,
      directory,
      sessionID: input.sessionID,
      callID: input.callID,
      changeQueue: queue,
      configManager,
      backupManager,
      vscodeDetector,
      stateSync,
    });

    await interceptor.before(input.tool, output.args);
  };
}

export function createAfterHandler(
  $: BunShell,
  directory: string,
  configManager: ConfigManager,
  queue: ChangeQueue = changeQueue
) {
  const backupManager = new BackupManager({
    backupDir: join(directory, '.opencode', 'backups'),
    maxBackupSizeBytes: configManager.getVSCodeOnlyConfig().maxBackupSizeBytes || 100 * 1024 * 1024,
  });
  
  const vscodeDetector = new VSCodeDetector(directory);
  
  const ideConfig = configManager.getConfig().ide;
  const statePath = ideConfig?.stateFilePath || join(directory, '.opencode', '.diff-plugin-state.json');
  const stateSync = new StateSync(statePath, 'default-session');
  
  return async (
    input: { tool: string; sessionID: string; callID: string },
  ): Promise<void> => {
    const interceptor = new ToolInterceptor({
      $,
      directory,
      sessionID: input.sessionID,
      callID: input.callID,
      changeQueue: queue,
      configManager,
      backupManager,
      vscodeDetector,
      stateSync,
    });

    await interceptor.after(input.tool);
  };
}
