import type { PluginInput } from '@opencode-ai/plugin';
import { ChangeQueue, changeQueue, InterceptedError, PendingChange } from './state-manager.js';
import type { ConfigManager } from './config.js';
import { createLogger } from './debug.js';

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

    throw new InterceptedError(
      `Tool '${tool}' for '${filePath}' intercepted by DiffPlugin`,
      change.id,
      filePath
    );
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
