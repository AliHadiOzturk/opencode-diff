import type { PluginInput } from '@opencode-ai/plugin';
import { ChangeQueue, changeQueue, InterceptedError, PendingChange } from './state-manager.js';
import type { ConfigManager } from './config.js';
import { createLogger } from './debug.js';
import { DiffEngine } from './diff-engine.js';
import { TUIRenderer } from './ui/tui-renderer.js';
import { KeyboardHandler } from './ui/keyboard-handler.js';
import readline from 'readline';

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

    const oldContent = await this.readOriginalContent(filePath);
    const newContent = this.computeNewContent(tool, oldContent, args);
    const isNewFile = oldContent === '';

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

    const action = await this.showDiffUI(change);
    
    if (action === 'accept') {
      logger.info('Change accepted, applying...');
      return; // Allow the tool to proceed
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
  _configManager: ConfigManager,
  queue: ChangeQueue = changeQueue
) {
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
    });

    await interceptor.before(input.tool, output.args);
  };
}

export function createAfterHandler(
  $: BunShell,
  directory: string,
  _configManager: ConfigManager,
  queue: ChangeQueue = changeQueue
) {
  return async (
    input: { tool: string; sessionID: string; callID: string },
  ): Promise<void> => {
    const interceptor = new ToolInterceptor({
      $,
      directory,
      sessionID: input.sessionID,
      callID: input.callID,
      changeQueue: queue,
    });

    await interceptor.after(input.tool);
  };
}
