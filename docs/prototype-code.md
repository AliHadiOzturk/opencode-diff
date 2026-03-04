# OpenCode Diff Plugin - Prototype & Integration Code

## Overview

This document contains working pseudocode and prototype implementations for the key integration points between the OpenCode Diff Plugin and OpenCode's core systems.

---

## 1. Main Plugin Entry Point

```typescript
// src/index.ts

import type { Plugin, PluginContext } from '@opencode-ai/plugin';
import { ConfigManager } from './config';
import { StateManager } from './state-manager';
import { DiffEngine } from './diff-engine';
import { TUIRenderer } from './ui/tui-renderer';
import { ToolInterceptor } from './interceptor';
import { KeyboardHandler } from './ui/keyboard-handler';

/**
 * Main plugin function - entry point for OpenCode
 * OpenCode calls this function when loading the plugin
 */
const DiffReviewPlugin: Plugin = async (ctx: PluginContext) => {
  console.log('[DiffPlugin] Initializing...');

  // Load configuration from .opencode/diff-plugin.json
  const config = await ConfigManager.load(ctx.directory);
  
  if (!config.enabled) {
    console.log('[DiffPlugin] Disabled in config, skipping initialization');
    return {};
  }

  // Initialize core components
  const stateManager = new StateManager();
  const diffEngine = new DiffEngine(config);
  const uiRenderer = new TUIRenderer(ctx.client, config);
  const keyboardHandler = new KeyboardHandler(config.keybindings);

  // Initialize the tool interceptor - this is the heart of the plugin
  const interceptor = new ToolInterceptor({
    config,
    stateManager,
    diffEngine,
    uiRenderer,
    keyboardHandler,
    client: ctx.client,
    directory: ctx.directory,
    $: ctx.$
  });

  console.log('[DiffPlugin] Initialized successfully');

  // Return hooks that OpenCode will call
  return {
    // Intercept tool execution (write, edit, patch)
    'tool.execute.before': async (input, output) => {
      return interceptor.before(input, output);
    },

    // Confirm after tool execution
    'tool.execute.after': async (input, output) => {
      return interceptor.after(input, output);
    },

    // Handle session diff events
    'session.diff': async (diff) => {
      return interceptor.handleSessionDiff(diff);
    },

    // Optional: Handle file edits that bypass tool system
    'file.edited': async (event) => {
      return interceptor.handleFileEdit(event);
    },

    // Cleanup on session end
    'session.idle': async () => {
      await stateManager.cleanup();
    }
  };
};

export default DiffReviewPlugin;
```

---

## 2. Tool Interceptor - Core Integration

```typescript
// src/interceptor.ts

import type { ToolInput, ToolOutput } from '@opencode-ai/plugin';
import { createPatch } from 'diff';
import { parseGitDiff } from 'parse-git-diff';

interface InterceptorDependencies {
  config: ConfigManager;
  stateManager: StateManager;
  diffEngine: DiffEngine;
  uiRenderer: TUIRenderer;
  keyboardHandler: KeyboardHandler;
  client: OpenCodeClient;
  directory: string;
  $: BunShell;
}

export class ToolInterceptor {
  private deps: InterceptorDependencies;
  private changeQueue: ChangeQueue;

  constructor(deps: InterceptorDependencies) {
    this.deps = deps;
    this.changeQueue = new ChangeQueue();
  }

  /**
   * BEFORE hook - Intercepts tool execution
   * This is where we capture changes before they're written
   */
  async before(input: ToolInput, output: ToolOutput): Promise<void> {
    // Only intercept write-related tools
    if (!this.shouldIntercept(input.tool)) {
      return;
    }

    const { filePath, content: proposedContent } = this.extractToolArgs(input);
    
    console.log(`[DiffPlugin] Intercepting ${input.tool} for ${filePath}`);

    // Check auto-accept patterns
    if (this.shouldAutoAccept(filePath)) {
      console.log(`[DiffPlugin] Auto-accepting ${filePath}`);
      return; // Let the tool execute normally
    }

    // Check auto-reject patterns
    if (this.shouldAutoReject(filePath)) {
      console.log(`[DiffPlugin] Auto-rejecting ${filePath}`);
      throw new Error(`[DiffPlugin] Change to ${filePath} rejected by auto-reject pattern`);
    }

    // Check file size limits
    if (proposedContent.length > this.deps.config.maxFileSize) {
      console.log(`[DiffPlugin] File too large (${proposedContent.length} bytes), skipping review`);
      return;
    }

    // Capture original content
    const originalContent = await this.captureOriginal(filePath);

    // Generate diff
    const diff = this.deps.diffEngine.generateDiff(
      filePath,
      originalContent,
      proposedContent
    );

    // Create pending change
    const change = new PendingChange({
      id: this.generateId(),
      filePath,
      originalContent,
      proposedContent,
      diff,
      timestamp: Date.now()
    });

    // Initialize line states (all pending)
    diff.hunks.forEach((hunk, hunkIndex) => {
      hunk.lines.forEach((line, lineIndex) => {
        if (line.type !== 'context') {
          const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
          change.setLineState(lineId, 'pending');
        }
      });
    });

    // Add to queue
    this.changeQueue.add(change);

    // Show diff review UI
    await this.showReviewUI(change);

    // CRITICAL: Throw to prevent original tool execution
    // OpenCode will catch this and show our custom UI instead
    throw new InterceptedError({
      message: `[DiffPlugin] Change intercepted for review: ${filePath}`,
      changeId: change.id,
      filePath
    });
  }

  /**
   * AFTER hook - Confirm successful writes
   */
  async after(input: ToolInput, output: ToolOutput): Promise<void> {
    // Log successful writes
    if (this.shouldIntercept(input.tool)) {
      const { filePath } = this.extractToolArgs(input);
      console.log(`[DiffPlugin] Change applied: ${filePath}`);
      
      // Mark any pending changes as applied
      this.changeQueue.markApplied(filePath);
    }
  }

  /**
   * Show the diff review UI in TUI
   */
  private async showReviewUI(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] Showing review UI for ${change.filePath}`);

    // Use OpenCode's TUI injection
    await this.deps.client.app.showDiffReview({
      filePath: change.filePath,
      diff: change.diff,
      onAcceptLine: (lineId) => this.handleAcceptLine(change, lineId),
      onRejectLine: (lineId) => this.handleRejectLine(change, lineId),
      onAcceptHunk: (hunkIndex) => this.handleAcceptHunk(change, hunkIndex),
      onRejectHunk: (hunkIndex) => this.handleRejectHunk(change, hunkIndex),
      onAcceptFile: () => this.handleAcceptFile(change),
      onRejectFile: () => this.handleRejectFile(change),
      onComplete: () => this.handleComplete(change)
    });

    // Alternative: Use tui.prompt.append for custom rendering
    // await this.deps.client.tui.prompt.append({
    //   type: 'custom',
    //   component: 'diff-review',
    //   props: { change }
    // });
  }

  /**
   * Handle user accepting a line
   */
  private async handleAcceptLine(change: PendingChange, lineId: string): Promise<void> {
    console.log(`[DiffPlugin] Line accepted: ${lineId}`);
    change.setLineState(lineId, 'accepted');
    
    // Update UI
    await this.deps.uiRenderer.updateLineState(change, lineId, 'accepted');
  }

  /**
   * Handle user rejecting a line
   */
  private async handleRejectLine(change: PendingChange, lineId: string): Promise<void> {
    console.log(`[DiffPlugin] Line rejected: ${lineId}`);
    change.setLineState(lineId, 'rejected');
    
    await this.deps.uiRenderer.updateLineState(change, lineId, 'rejected');
  }

  /**
   * Handle user accepting entire hunk
   */
  private async handleAcceptHunk(change: PendingChange, hunkIndex: number): Promise<void> {
    console.log(`[DiffPlugin] Hunk ${hunkIndex} accepted`);
    
    const hunk = change.diff.hunks[hunkIndex];
    hunk.lines.forEach((line, lineIndex) => {
      if (line.type !== 'context') {
        const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
        change.setLineState(lineId, 'accepted');
      }
    });

    await this.deps.uiRenderer.updateHunkState(change, hunkIndex, 'accepted');
  }

  /**
   * Handle user rejecting entire hunk
   */
  private async handleRejectHunk(change: PendingChange, hunkIndex: number): Promise<void> {
    console.log(`[DiffPlugin] Hunk ${hunkIndex} rejected`);
    
    const hunk = change.diff.hunks[hunkIndex];
    hunk.lines.forEach((line, lineIndex) => {
      if (line.type !== 'context') {
        const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
        change.setLineState(lineId, 'rejected');
      }
    });

    await this.deps.uiRenderer.updateHunkState(change, hunkIndex, 'rejected');
  }

  /**
   * Handle user accepting entire file
   */
  private async handleAcceptFile(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] File accepted: ${change.filePath}`);
    
    // Accept all lines
    change.diff.hunks.forEach((hunk, hunkIndex) => {
      hunk.lines.forEach((line, lineIndex) => {
        if (line.type !== 'context') {
          const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
          change.setLineState(lineId, 'accepted');
        }
      });
    });

    await this.applyChanges(change);
  }

  /**
   * Handle user rejecting entire file
   */
  private async handleRejectFile(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] File rejected: ${change.filePath}`);
    
    // Reject all lines
    change.diff.hunks.forEach((hunk, hunkIndex) => {
      hunk.lines.forEach((line, lineIndex) => {
        if (line.type !== 'context') {
          const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
          change.setLineState(lineId, 'rejected');
        }
      });
    });

    await this.rejectChanges(change);
  }

  /**
   * Handle completion (user presses 'q' or finishes review)
   */
  private async handleComplete(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] Review complete for ${change.filePath}`);
    
    // Apply all accepted changes
    await this.applyChanges(change);
  }

  /**
   * Apply accepted changes to disk
   */
  private async applyChanges(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] Applying changes to ${change.filePath}`);

    // Reconstruct file content from accepted lines
    const content = this.reconstructContent(change);
    
    // Write to disk using Bun shell
    await this.deps.$`echo ${content} > ${change.filePath}`;
    
    // Update state
    change.status = 'applied';
    
    // Notify OpenCode
    await this.deps.client.app.notify({
      type: 'success',
      message: `Applied ${change.getAcceptedCount()} lines, rejected ${change.getRejectedCount()} lines in ${change.filePath}`
    });
  }

  /**
   * Reject changes - restore original file
   */
  private async rejectChanges(change: PendingChange): Promise<void> {
    console.log(`[DiffPlugin] Rejecting changes to ${change.filePath}`);

    // Restore original content
    await this.deps.$`echo ${change.originalContent} > ${change.filePath}`;
    
    change.status = 'rejected';
    
    await this.deps.client.app.notify({
      type: 'info',
      message: `Restored ${change.filePath} to original state`
    });
  }

  /**
   * Reconstruct file content from accepted lines
   */
  private reconstructContent(change: PendingChange): string {
    const lines: string[] = [];
    
    // Start with original content lines
    const originalLines = change.originalContent.split('\n');
    let originalIndex = 0;
    
    // Process each hunk
    change.diff.hunks.forEach((hunk, hunkIndex) => {
      hunk.lines.forEach((line, lineIndex) => {
        const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
        const state = change.getLineState(lineId);
        
        if (line.type === 'context') {
          // Context lines always included
          lines.push(line.content);
          originalIndex++;
        } else if (line.type === 'add') {
          // Added line - include if accepted
          if (state === 'accepted') {
            lines.push(line.content);
          }
        } else if (line.type === 'remove') {
          // Removed line - include original if rejected
          if (state === 'rejected') {
            lines.push(originalLines[originalIndex]);
          }
          originalIndex++;
        }
      });
    });

    return lines.join('\n');
  }

  /**
   * Capture original file content
   */
  private async captureOriginal(filePath: string): Promise<string> {
    try {
      const content = await this.deps.$`cat ${filePath}`.text();
      return content;
    } catch (e) {
      // File doesn't exist (new file)
      return '';
    }
  }

  /**
   * Determine if we should intercept this tool
   */
  private shouldIntercept(tool: string): boolean {
    return ['write', 'edit', 'patch'].includes(tool);
  }

  /**
   * Check if file matches auto-accept patterns
   */
  private shouldAutoAccept(filePath: string): boolean {
    return this.deps.config.autoAccept.some(pattern => 
      this.matchPattern(filePath, pattern)
    );
  }

  /**
   * Check if file matches auto-reject patterns
   */
  private shouldAutoReject(filePath: string): boolean {
    return this.deps.config.autoReject.some(pattern => 
      this.matchPattern(filePath, pattern)
    );
  }

  /**
   * Simple glob pattern matching
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = new RegExp(
      '^' + 
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.') + 
      '$'
    );
    return regex.test(filePath);
  }

  /**
   * Extract tool arguments based on tool type
   */
  private extractToolArgs(input: ToolInput): { filePath: string; content: string } {
    switch (input.tool) {
      case 'write':
        return {
          filePath: input.args.filePath,
          content: input.args.content
        };
      case 'edit':
        // For edit tool, we need to compute the new content
        // This is simplified - real implementation needs to apply the edit
        return {
          filePath: input.args.filePath,
          content: input.args.newContent || ''
        };
      default:
        throw new Error(`Unknown tool: ${input.tool}`);
    }
  }

  private generateId(): string {
    return `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Custom error to signal interception
 */
class InterceptedError extends Error {
  constructor(public details: {
    message: string;
    changeId: string;
    filePath: string;
  }) {
    super(details.message);
    this.name = 'InterceptedError';
  }
}
```

---

## 3. Diff Engine - Generation and Parsing

```typescript
// src/diff-engine.ts

import { createPatch, parsePatch } from 'diff';
import { parseGitDiff } from 'parse-git-diff';

export interface ParsedDiff {
  oldPath: string;
  newPath: string;
  oldMode?: string;
  newMode?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: Hunk[];
  stats: {
    additions: number;
    deletions: number;
    changes: number;
  };
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
  position: number;
}

export class DiffEngine {
  private config: ConfigManager;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Generate unified diff from old and new content
   */
  generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): ParsedDiff {
    // Detect file status
    const status = this.detectStatus(oldContent, newContent);

    // Generate unified diff using jsdiff
    const patch = createPatch(
      filePath,
      oldContent,
      newContent,
      '', // old header
      '', // new header
      { context: 3 } // lines of context
    );

    // Parse the generated patch
    const parsed = parseGitDiff(patch);

    // Enrich with our format
    return this.enrichDiff(parsed[0], status);
  }

  /**
   * Detect if file is added, modified, or deleted
   */
  private detectStatus(oldContent: string, newContent: string): ParsedDiff['status'] {
    if (oldContent === '' && newContent !== '') {
      return 'added';
    }
    if (oldContent !== '' && newContent === '') {
      return 'deleted';
    }
    return 'modified';
  }

  /**
   * Enrich parsed diff with additional metadata
   */
  private enrichDiff(parsed: any, status: ParsedDiff['status']): ParsedDiff {
    let position = 0;
    let oldLineNum = parsed.chunks[0]?.oldStart || 0;
    let newLineNum = parsed.chunks[0]?.newStart || 0;

    const hunks: Hunk[] = parsed.chunks.map((chunk: any, hunkIndex: number) => {
      const lines: DiffLine[] = chunk.changes.map((change: any) => {
        position++;

        let line: DiffLine;

        if (change.add) {
          line = {
            type: 'add',
            content: change.content.slice(1), // Remove '+' prefix
            oldLineNum: null,
            newLineNum: newLineNum++,
            position
          };
        } else if (change.del) {
          line = {
            type: 'remove',
            content: change.content.slice(1), // Remove '-' prefix
            oldLineNum: oldLineNum++,
            newLineNum: null,
            position
          };
        } else {
          line = {
            type: 'context',
            content: change.content.slice(1), // Remove ' ' prefix
            oldLineNum: oldLineNum++,
            newLineNum: newLineNum++,
            position
          };
        }

        return line;
      });

      return {
        oldStart: chunk.oldStart,
        oldLines: chunk.oldLines,
        newStart: chunk.newStart,
        newLines: chunk.newLines,
        header: `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`,
        lines
      };
    });

    // Calculate stats
    const additions = hunks.reduce((sum, hunk) => 
      sum + hunk.lines.filter(l => l.type === 'add').length, 0
    );
    const deletions = hunks.reduce((sum, hunk) => 
      sum + hunk.lines.filter(l => l.type === 'remove').length, 0
    );

    return {
      oldPath: parsed.from,
      newPath: parsed.to,
      status,
      hunks,
      stats: {
        additions,
        deletions,
        changes: additions + deletions
      }
    };
  }

  /**
   * Get language for syntax highlighting from file extension
   */
  getLanguage(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'tsx',
      'js': 'javascript',
      'jsx': 'jsx',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'rb': 'ruby',
      'php': 'php',
      'css': 'css',
      'scss': 'scss',
      'html': 'html',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'bash',
      'bash': 'bash'
    };

    return languageMap[ext || ''] || null;
  }
}
```

---

## 4. State Manager - Line-Level Tracking

```typescript
// src/state-manager.ts

export type LineState = 'pending' | 'accepted' | 'rejected';

export interface PendingChangeData {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: ParsedDiff;
  timestamp: number;
}

export class PendingChange {
  id: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: ParsedDiff;
  timestamp: number;
  status: 'pending' | 'reviewing' | 'applied' | 'rejected';
  
  private lineStates: Map<string, LineState>;

  constructor(data: PendingChangeData) {
    this.id = data.id;
    this.filePath = data.filePath;
    this.originalContent = data.originalContent;
    this.proposedContent = data.proposedContent;
    this.diff = data.diff;
    this.timestamp = data.timestamp;
    this.status = 'pending';
    this.lineStates = new Map();
  }

  /**
   * Set state for a specific line
   */
  setLineState(lineId: string, state: LineState): void {
    this.lineStates.set(lineId, state);
  }

  /**
   * Get state for a specific line
   */
  getLineState(lineId: string): LineState {
    return this.lineStates.get(lineId) || 'pending';
  }

  /**
   * Get count of accepted lines
   */
  getAcceptedCount(): number {
    return Array.from(this.lineStates.values()).filter(s => s === 'accepted').length;
  }

  /**
   * Get count of rejected lines
   */
  getRejectedCount(): number {
    return Array.from(this.lineStates.values()).filter(s => s === 'rejected').length;
  }

  /**
   * Get count of pending lines
   */
  getPendingCount(): number {
    return Array.from(this.lineStates.values()).filter(s => s === 'pending').length;
  }

  /**
   * Get state for entire hunk
   */
  getHunkState(hunkIndex: number): 'pending' | 'accepted' | 'rejected' | 'partial' {
    const hunk = this.diff.hunks[hunkIndex];
    const changedLines = hunk.lines.filter(l => l.type !== 'context');
    
    if (changedLines.length === 0) return 'accepted';

    const states = changedLines.map((_, lineIndex) => {
      const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
      return this.getLineState(lineId);
    });

    if (states.every(s => s === 'accepted')) return 'accepted';
    if (states.every(s => s === 'rejected')) return 'rejected';
    return 'partial';
  }

  /**
   * Get state for entire file
   */
  getFileState(): 'pending' | 'accepted' | 'rejected' | 'partial' {
    const hunks = this.diff.hunks;
    const hunkStates = hunks.map((_, i) => this.getHunkState(i));

    if (hunkStates.every(s => s === 'accepted')) return 'accepted';
    if (hunkStates.every(s => s === 'rejected')) return 'rejected';
    return 'partial';
  }

  /**
   * Serialize to JSON for persistence
   */
  toJSON(): object {
    return {
      id: this.id,
      filePath: this.filePath,
      originalContent: this.originalContent,
      proposedContent: this.proposedContent,
      diff: this.diff,
      timestamp: this.timestamp,
      status: this.status,
      lineStates: Object.fromEntries(this.lineStates)
    };
  }
}

/**
 * Queue to manage multiple pending changes
 */
export class ChangeQueue {
  private changes: Map<string, PendingChange> = new Map();

  add(change: PendingChange): void {
    this.changes.set(change.id, change);
  }

  get(id: string): PendingChange | undefined {
    return this.changes.get(id);
  }

  getByFilePath(filePath: string): PendingChange | undefined {
    return Array.from(this.changes.values()).find(c => c.filePath === filePath);
  }

  getAll(): PendingChange[] {
    return Array.from(this.changes.values());
  }

  getPending(): PendingChange[] {
    return this.getAll().filter(c => c.status === 'pending');
  }

  markApplied(filePath: string): void {
    const change = this.getByFilePath(filePath);
    if (change) {
      change.status = 'applied';
    }
  }

  remove(id: string): void {
    this.changes.delete(id);
  }

  clear(): void {
    this.changes.clear();
  }

  get size(): number {
    return this.changes.size;
  }
}

export class StateManager {
  private queue: ChangeQueue;

  constructor() {
    this.queue = new ChangeQueue();
  }

  getQueue(): ChangeQueue {
    return this.queue;
  }

  /**
   * Cleanup on session end
   */
  async cleanup(): Promise<void> {
    // Persist any pending changes if needed
    // For now, just clear the queue
    this.queue.clear();
  }
}
```

---

## 5. TUI Renderer - Terminal UI

```typescript
// src/ui/tui-renderer.ts

import chalk from 'chalk';

export class TUIRenderer {
  private client: OpenCodeClient;
  private config: ConfigManager;
  private currentChange: PendingChange | null = null;
  private currentLineIndex: number = 0;

  constructor(client: OpenCodeClient, config: ConfigManager) {
    this.client = client;
    this.config = config;
  }

  /**
   * Render the full diff view
   */
  async render(change: PendingChange): Promise<void> {
    this.currentChange = change;
    
    const output: string[] = [];
    
    // Header
    output.push(this.renderHeader(change));
    output.push('');
    
    // Toolbar
    output.push(this.renderToolbar());
    output.push('');
    
    // Stats
    output.push(this.renderStats(change));
    output.push('');
    
    // Diff content
    output.push(this.renderDiff(change));
    
    // Footer
    output.push('');
    output.push(this.renderFooter());
    
    // Send to TUI
    await this.client.tui.prompt.append({
      type: 'custom',
      content: output.join('\n')
    });
  }

  /**
   * Render header with file info
   */
  private renderHeader(change: PendingChange): string {
    const totalFiles = 1; // Simplified - would get from queue
    const currentFile = 1;
    
    return [
      chalk.bold.cyan('📝 Review Changes'),
      chalk.gray('═'.repeat(80)),
      '',
      `${chalk.blue('📄')} ${chalk.bold(change.filePath)} ${chalk.gray(`[${currentFile} of ${totalFiles}]`)}`,
      chalk.gray('━'.repeat(80))
    ].join('\n');
  }

  /**
   * Render toolbar with actions
   */
  private renderToolbar(): string {
    return [
      chalk.bgGray.white(' Actions ') + ' ' +
      chalk.yellow('[Y]') + ' Accept All  ' +
      chalk.yellow('[N]') + ' Reject All  ' +
      chalk.yellow('[A]') + ' Accept File  ' +
      chalk.yellow('[R]') + ' Reject File  ' +
      chalk.yellow('[?]') + ' Help'
    ].join('');
  }

  /**
   * Render stats bar
   */
  private renderStats(change: PendingChange): string {
    const accepted = change.getAcceptedCount();
    const rejected = change.getRejectedCount();
    const pending = change.getPendingCount();
    const { additions, deletions } = change.diff.stats;
    
    return [
      chalk.bgGray.white(' Stats ') + '  ' +
      chalk.green(`✅ ${accepted} accepted`) + '  │  ' +
      chalk.red(`❌ ${rejected} rejected`) + '  │  ' +
      chalk.yellow(`⏳ ${pending} pending`) + '  │  ' +
      chalk.blue(`📊 +${additions} / -${deletions} lines`)
    ].join('');
  }

  /**
   * Render the diff content
   */
  private renderDiff(change: PendingChange): string {
    const output: string[] = [];
    let globalLineIndex = 0;

    change.diff.hunks.forEach((hunk, hunkIndex) => {
      // Hunk header
      output.push(chalk.blue.bold(`HUNK ${hunkIndex + 1} of ${change.diff.hunks.length}`));
      output.push(chalk.gray('━'.repeat(80)));
      output.push('');
      
      // Hunk info line
      output.push(chalk.cyan(hunk.header));
      output.push('');
      
      // Lines
      hunk.lines.forEach((line, lineIndex) => {
        const isCurrent = globalLineIndex === this.currentLineIndex;
        const lineId = `hunk-${hunkIndex}-line-${lineIndex}`;
        const state = change.getLineState(lineId);
        
        output.push(this.renderLine(line, isCurrent, state));
        globalLineIndex++;
      });
      
      // Hunk actions (only show if hunk has changes)
      const hasChanges = hunk.lines.some(l => l.type !== 'context');
      if (hasChanges) {
        output.push('');
        output.push(
          '  ' + chalk.yellow('[H]') + ' Accept Hunk  ' +
          chalk.yellow('[R]') + ' Reject Hunk'
        );
      }
      
      output.push('');
    });

    return output.join('\n');
  }

  /**
   * Render a single diff line
   */
  private renderLine(line: DiffLine, isCurrent: boolean, state: LineState): string {
    let prefix: string;
    let content: string;
    let lineNum: string;

    // Format based on line type
    if (line.type === 'add') {
      prefix = chalk.green('+');
      content = chalk.green(line.content);
      lineNum = line.newLineNum?.toString().padStart(4, ' ') || '    ';
    } else if (line.type === 'remove') {
      prefix = chalk.red('-');
      content = chalk.red(line.content);
      lineNum = line.oldLineNum?.toString().padStart(4, ' ') || '    ';
    } else {
      prefix = ' ';
      content = line.content;
      lineNum = (line.oldLineNum || line.newLineNum || 0).toString().padStart(4, ' ');
    }

    // Add state indicator for changed lines
    let stateIndicator = '';
    if (line.type !== 'context') {
      if (state === 'accepted') {
        stateIndicator = chalk.green(' ✓');
      } else if (state === 'rejected') {
        stateIndicator = chalk.red(' ✗');
      } else {
        stateIndicator = chalk.gray(' ○');
      }
    }

    // Cursor indicator
    const cursor = isCurrent ? chalk.bgBlue.white(' ► ') : '   ';

    // Background highlight for current line
    if (isCurrent) {
      content = chalk.bgBlue(content);
    }

    return `${cursor}${lineNum} ${prefix} ${content}${stateIndicator}`;
  }

  /**
   * Render footer with keyboard shortcuts
   */
  private renderFooter(): string {
    return [
      chalk.gray('═'.repeat(80)),
      chalk.yellow('[j/k]') + ' Navigate  │  ' +
      chalk.yellow('[y/n]') + ' Accept/Reject Line  │  ' +
      chalk.yellow('[h/r]') + ' Accept/Reject Hunk  │  ' +
      chalk.yellow('[q]') + ' Quit'
    ].join('\n');
  }

  /**
   * Update line state in UI
   */
  async updateLineState(change: PendingChange, lineId: string, state: LineState): Promise<void> {
    // In a real implementation, this would update just that line
    // For now, re-render the whole view
    await this.render(change);
  }

  /**
   * Update hunk state in UI
   */
  async updateHunkState(change: PendingChange, hunkIndex: number, state: LineState): Promise<void> {
    await this.render(change);
  }
}
```

---

## 6. Keyboard Handler

```typescript
// src/ui/keyboard-handler.ts

interface KeybindingConfig {
  acceptLine: string;
  rejectLine: string;
  acceptHunk: string;
  rejectHunk: string;
  acceptFile: string;
  rejectFile: string;
  nextLine: string;
  prevLine: string;
  firstLine: string;
  lastLine: string;
  quit: string;
  help: string;
}

type KeyHandler = () => void;

export class KeyboardHandler {
  private bindings: KeybindingConfig;
  private handlers: Map<string, KeyHandler> = new Map();

  constructor(bindings: KeybindingConfig) {
    this.bindings = bindings;
    this.setupDefaultHandlers();
  }

  /**
   * Register a handler for a key
   */
  on(key: string, handler: KeyHandler): void {
    this.handlers.set(key.toLowerCase(), handler);
  }

  /**
   * Handle a keypress
   */
  handle(key: string): boolean {
    const handler = this.handlers.get(key.toLowerCase());
    if (handler) {
      handler();
      return true;
    }
    return false;
  }

  /**
   * Setup default navigation handlers
   */
  private setupDefaultHandlers(): void {
    // Navigation
    this.on(this.bindings.nextLine, () => this.emit('navigate', 1));
    this.on(this.bindings.prevLine, () => this.emit('navigate', -1));
    
    // Line actions
    this.on(this.bindings.acceptLine, () => this.emit('acceptLine'));
    this.on(this.bindings.rejectLine, () => this.emit('rejectLine'));
    
    // Hunk actions
    this.on(this.bindings.acceptHunk, () => this.emit('acceptHunk'));
    this.on(this.bindings.rejectHunk, () => this.emit('rejectHunk'));
    
    // File actions
    this.on(this.bindings.acceptFile, () => this.emit('acceptFile'));
    this.on(this.bindings.rejectFile, () => this.emit('rejectFile'));
    
    // General
    this.on(this.bindings.quit, () => this.emit('quit'));
    this.on(this.bindings.help, () => this.emit('help'));
  }

  /**
   * Emit event to registered listeners
   */
  private emit(event: string, ...args: any[]): void {
    // In real implementation, use EventEmitter
    console.log(`[KeyboardHandler] Event: ${event}`, args);
  }

  /**
   * Get help text for all bindings
   */
  getHelpText(): string {
    return [
      'Keyboard Shortcuts:',
      '',
      `  ${this.bindings.nextLine}/${this.bindings.prevLine}    Navigate up/down`,
      `  ${this.bindings.acceptLine}          Accept current line`,
      `  ${this.bindings.rejectLine}          Reject current line`,
      `  ${this.bindings.acceptHunk}          Accept current hunk`,
      `  ${this.bindings.rejectHunk}          Reject current hunk`,
      `  ${this.bindings.acceptFile}          Accept entire file`,
      `  ${this.bindings.rejectFile}          Reject entire file`,
      `  ${this.bindings.quit}          Quit and apply changes`,
      `  ${this.bindings.help}          Show this help`
    ].join('\n');
  }
}
```

---

## 7. Configuration Manager

```typescript
// src/config.ts

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface PluginConfig {
  enabled: boolean;
  autoAccept: string[];
  autoReject: string[];
  maxFileSize: number;
  maxTotalSize: number;
  theme: 'light' | 'dark' | 'auto';
  showLineNumbers: boolean;
  showWhitespace: boolean;
  wrapLines: boolean;
  confirmRejectAll: boolean;
  confirmBulkActions: boolean;
  defaultAction: 'prompt' | 'accept' | 'reject';
  keybindings: {
    acceptLine: string;
    rejectLine: string;
    acceptHunk: string;
    rejectHunk: string;
    acceptFile: string;
    rejectFile: string;
    nextLine: string;
    prevLine: string;
    quit: string;
    help: string;
  };
}

const defaultConfig: PluginConfig = {
  enabled: true,
  autoAccept: ['*.md', '*.txt', '*.json'],
  autoReject: [],
  maxFileSize: 1024 * 1024, // 1MB
  maxTotalSize: 10 * 1024 * 1024, // 10MB
  theme: 'auto',
  showLineNumbers: true,
  showWhitespace: false,
  wrapLines: false,
  confirmRejectAll: true,
  confirmBulkActions: true,
  defaultAction: 'prompt',
  keybindings: {
    acceptLine: 'y',
    rejectLine: 'n',
    acceptHunk: 'h',
    rejectHunk: 'r',
    acceptFile: 'a',
    rejectFile: 'd',
    nextLine: 'j',
    prevLine: 'k',
    quit: 'q',
    help: '?'
  }
};

export class ConfigManager {
  private config: PluginConfig;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Load configuration from file or return defaults
   */
  static async load(projectDir: string): Promise<ConfigManager> {
    const configPath = join(projectDir, '.opencode', 'diff-plugin.json');
    
    let userConfig: Partial<PluginConfig> = {};
    
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        userConfig = JSON.parse(content);
      } catch (e) {
        console.warn('[DiffPlugin] Failed to load config:', e);
      }
    }

    // Merge with defaults
    const merged = {
      ...defaultConfig,
      ...userConfig,
      keybindings: {
        ...defaultConfig.keybindings,
        ...userConfig.keybindings
      }
    };

    return new ConfigManager(merged);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get autoAccept(): string[] {
    return this.config.autoAccept;
  }

  get autoReject(): string[] {
    return this.config.autoReject;
  }

  get maxFileSize(): number {
    return this.config.maxFileSize;
  }

  get maxTotalSize(): number {
    return this.config.maxTotalSize;
  }

  get theme(): string {
    return this.config.theme;
  }

  get showLineNumbers(): boolean {
    return this.config.showLineNumbers;
  }

  get confirmRejectAll(): boolean {
    return this.config.confirmRejectAll;
  }

  get keybindings(): PluginConfig['keybindings'] {
    return this.config.keybindings;
  }

  /**
   * Get full config object
   */
  getConfig(): PluginConfig {
    return { ...this.config };
  }
}
```

---

## 8. Example Configuration File

```json
{
  "$schema": "https://opencode.ai/schemas/diff-plugin.json",
  "enabled": true,
  "autoAccept": [
    "*.md",
    "*.txt",
    "*.json",
    "*.lock",
    "docs/**/*.md",
    ".github/**/*.md"
  ],
  "autoReject": [
    "*.env",
    ".env.*",
    "*.secret",
    "**/secrets/**"
  ],
  "maxFileSize": 1048576,
  "maxTotalSize": 10485760,
  "theme": "auto",
  "showLineNumbers": true,
  "showWhitespace": false,
  "wrapLines": false,
  "confirmRejectAll": true,
  "confirmBulkActions": true,
  "defaultAction": "prompt",
  "keybindings": {
    "acceptLine": "y",
    "rejectLine": "n",
    "acceptHunk": "h",
    "rejectHunk": "r",
    "acceptFile": "a",
    "rejectFile": "d",
    "nextLine": "j",
    "prevLine": "k",
    "quit": "q",
    "help": "?"
  }
}
```

---

## 9. Integration Test Example

```typescript
// tests/interceptor.test.ts

import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolInterceptor } from '../src/interceptor';
import { ConfigManager } from '../src/config';
import { StateManager } from '../src/state-manager';

describe('ToolInterceptor', () => {
  let interceptor: ToolInterceptor;

  beforeEach(() => {
    const config = new ConfigManager({
      enabled: true,
      autoAccept: [],
      autoReject: [],
      maxFileSize: 1024 * 1024,
      maxTotalSize: 10 * 1024 * 1024,
      theme: 'auto',
      showLineNumbers: true,
      showWhitespace: false,
      wrapLines: false,
      confirmRejectAll: true,
      confirmBulkActions: true,
      defaultAction: 'prompt',
      keybindings: {
        acceptLine: 'y',
        rejectLine: 'n',
        acceptHunk: 'h',
        rejectHunk: 'r',
        acceptFile: 'a',
        rejectFile: 'd',
        nextLine: 'j',
        prevLine: 'k',
        quit: 'q',
        help: '?'
      }
    });

    interceptor = new ToolInterceptor({
      config,
      stateManager: new StateManager(),
      // ... other deps
    } as any);
  });

  it('should intercept write tool calls', async () => {
    const input = {
      tool: 'write',
      args: {
        filePath: 'test.ts',
        content: 'console.log("hello")'
      }
    };

    await expect(
      interceptor.before(input as any, {} as any)
    ).rejects.toThrow('InterceptedError');
  });

  it('should auto-accept files matching patterns', async () => {
    // Test implementation
  });
});
```

---

*Document Version: 1.0*
*Last Updated: 2025-02-10*
*Author: Prometheus (Planning Agent)*
