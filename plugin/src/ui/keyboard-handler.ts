/**
 * Keyboard Handler for OpenCode Diff Plugin
 * 
 * Manages keyboard input and emits actions for the TUI diff viewer.
 * Provides vim-like keybindings for efficient navigation and change management.
 */

import { EventEmitter } from 'events';
import { PendingChange, LineId } from '../state-manager.js';

/**
 * Action types that can be triggered by keyboard input
 */
export type KeyboardAction =
  | 'acceptLine'
  | 'rejectLine'
  | 'acceptHunk'
  | 'rejectHunk'
  | 'acceptFile'
  | 'rejectFile'
  | 'acceptAll'
  | 'rejectAll'
  | 'nextLine'
  | 'prevLine'
  | 'nextHunk'
  | 'prevHunk'
  | 'nextFile'
  | 'prevFile'
  | 'scrollUp'
  | 'scrollDown'
  | 'pageUp'
  | 'pageDown'
  | 'goToTop'
  | 'goToBottom'
  | 'toggleHelp'
  | 'quit'
  | 'undo'
  | 'redo';

/**
 * Keybinding definition
 */
export interface Keybinding {
  key: string;
  action: KeyboardAction;
  description: string;
  context?: 'global' | 'navigation' | 'action' | 'file';
}

/**
 * Navigation position in the diff
 */
export interface NavigationPosition {
  hunkIndex: number;
  lineIndex: number;
  absoluteLine: number;
}

/**
 * Default keybindings for the diff viewer
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // Line-level actions
  { key: 'y', action: 'acceptLine', description: 'Accept current line', context: 'action' },
  { key: 'n', action: 'rejectLine', description: 'Reject current line', context: 'action' },
  
  // Hunk-level actions
  { key: 'h', action: 'acceptHunk', description: 'Accept current hunk', context: 'action' },
  { key: 'r', action: 'rejectHunk', description: 'Reject current hunk', context: 'action' },
  
  { key: 'a', action: 'acceptFile', description: 'Accept entire file', context: 'file' },
  { key: 'd', action: 'rejectFile', description: 'Reject entire file', context: 'file' },
  { key: 'A', action: 'acceptAll', description: 'Accept all pending changes', context: 'global' },
  { key: 'R', action: 'rejectAll', description: 'Reject all pending changes', context: 'global' },
  
  // Navigation - line by line
  { key: 'j', action: 'nextLine', description: 'Move to next line', context: 'navigation' },
  { key: 'k', action: 'prevLine', description: 'Move to previous line', context: 'navigation' },
  { key: 'ArrowDown', action: 'nextLine', description: 'Move to next line', context: 'navigation' },
  { key: 'ArrowUp', action: 'prevLine', description: 'Move to previous line', context: 'navigation' },
  
  // Navigation - hunk by hunk
  { key: ']', action: 'nextHunk', description: 'Jump to next hunk', context: 'navigation' },
  { key: '[', action: 'prevHunk', description: 'Jump to previous hunk', context: 'navigation' },
  
  // Navigation - file by file
  { key: 'l', action: 'nextFile', description: 'Next file', context: 'navigation' },
  { key: 'p', action: 'prevFile', description: 'Previous file', context: 'navigation' },
  
  // Scrolling
  { key: 'PageDown', action: 'pageDown', description: 'Page down', context: 'navigation' },
  { key: 'PageUp', action: 'pageUp', description: 'Page up', context: 'navigation' },
  { key: 'Space', action: 'pageDown', description: 'Page down', context: 'navigation' },
  { key: 'Shift+Space', action: 'pageUp', description: 'Page up', context: 'navigation' },
  
  // Jump to top/bottom
  { key: 'g', action: 'goToTop', description: 'Go to top', context: 'navigation' },
  { key: 'G', action: 'goToBottom', description: 'Go to bottom', context: 'navigation' },
  { key: 'Home', action: 'goToTop', description: 'Go to top', context: 'navigation' },
  { key: 'End', action: 'goToBottom', description: 'Go to bottom', context: 'navigation' },
  
  // Global actions
  { key: 'q', action: 'quit', description: 'Quit viewer', context: 'global' },
  { key: 'Escape', action: 'quit', description: 'Quit viewer', context: 'global' },
  { key: '?', action: 'toggleHelp', description: 'Toggle help', context: 'global' },
  { key: 'u', action: 'undo', description: 'Undo last action', context: 'global' },
  { key: 'Ctrl+r', action: 'redo', description: 'Redo last action', context: 'global' },
];

/**
 * Help section for organizing keybindings in help text
 */
interface HelpSection {
  title: string;
  bindings: Keybinding[];
}

/**
 * Action event payload
 */
export interface ActionEvent {
  action: KeyboardAction;
  key: string;
  position?: NavigationPosition;
  lineId?: LineId;
  timestamp: number;
}

/**
 * KeyboardHandler - Manages keyboard input for the diff viewer
 * 
 * Emits events for all keyboard actions that can be consumed by
 * the TUIRenderer and PendingChange to update state.
 */
export class KeyboardHandler extends EventEmitter {
  private keybindings: Map<string, Keybinding> = new Map();
  private pendingChange: PendingChange | null = null;
  private currentPosition: NavigationPosition;
  private actionHistory: ActionEvent[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 50;
  private isProcessingInput: boolean = false;

  constructor(pendingChange?: PendingChange) {
    super();
    this.pendingChange = pendingChange || null;
    this.currentPosition = {
      hunkIndex: 0,
      lineIndex: 0,
      absoluteLine: 0,
    };
    this.registerDefaultKeybindings();
  }

  /**
   * Register all default keybindings
   */
  private registerDefaultKeybindings(): void {
    for (const binding of DEFAULT_KEYBINDINGS) {
      this.keybindings.set(binding.key, binding);
    }
  }

  /**
   * Set the pending change being viewed
   */
  setPendingChange(change: PendingChange | null): void {
    this.pendingChange = change;
    this.currentPosition = {
      hunkIndex: 0,
      lineIndex: 0,
      absoluteLine: 0,
    };
    this.emit('changeUpdated', change);
  }

  /**
   * Get the current pending change
   */
  getPendingChange(): PendingChange | null {
    return this.pendingChange;
  }

  /**
   * Get current navigation position
   */
  getCurrentPosition(): NavigationPosition {
    return { ...this.currentPosition };
  }

  /**
   * Set current navigation position
   */
  setCurrentPosition(position: Partial<NavigationPosition>): void {
    this.currentPosition = {
      ...this.currentPosition,
      ...position,
    };
    this.emit('positionChanged', this.currentPosition);
  }

  /**
   * Handle a keypress event
   * @returns true if the key was handled, false otherwise
   */
  handleKey(key: string): boolean {
    if (this.isProcessingInput) {
      return false;
    }

    const binding = this.keybindings.get(key);
    if (!binding) {
      return false;
    }

    this.isProcessingInput = true;
    
    try {
      const event: ActionEvent = {
        action: binding.action,
        key,
        position: { ...this.currentPosition },
        lineId: this.getCurrentLineId(),
        timestamp: Date.now(),
      };

      // Execute the action
      this.executeAction(binding.action, event);
      
      // Add to history (but not for navigation-only actions)
      if (!this.isNavigationOnlyAction(binding.action)) {
        this.addToHistory(event);
      }

      // Emit the action event
      this.emit('action', event);
      this.emit(binding.action, event);

      return true;
    } finally {
      this.isProcessingInput = false;
    }
  }

  /**
   * Check if an action is navigation-only (doesn't modify state)
   */
  private isNavigationOnlyAction(action: KeyboardAction): boolean {
    const navigationActions: KeyboardAction[] = [
      'nextLine', 'prevLine', 'nextHunk', 'prevHunk',
      'nextFile', 'prevFile', 'scrollUp', 'scrollDown',
      'pageUp', 'pageDown', 'goToTop', 'goToBottom',
      'toggleHelp',
    ];
    return navigationActions.includes(action);
  }

  /**
   * Execute the action and update internal state
   */
  private executeAction(action: KeyboardAction, _event: ActionEvent): void {
    switch (action) {
      case 'acceptLine':
        this.acceptCurrentLine();
        break;
      case 'rejectLine':
        this.rejectCurrentLine();
        break;
      case 'acceptHunk':
        this.acceptCurrentHunk();
        break;
      case 'rejectHunk':
        this.rejectCurrentHunk();
        break;
      case 'acceptFile':
        this.acceptCurrentFile();
        break;
      case 'rejectFile':
        this.rejectCurrentFile();
        break;
      case 'acceptAll':
        this.acceptAll();
        break;
      case 'rejectAll':
        this.rejectAll();
        break;
      case 'nextLine':
        this.moveToNextLine();
        break;
      case 'prevLine':
        this.moveToPrevLine();
        break;
      case 'nextHunk':
        this.moveToNextHunk();
        break;
      case 'prevHunk':
        this.moveToPrevHunk();
        break;
      case 'goToTop':
        this.moveToTop();
        break;
      case 'goToBottom':
        this.moveToBottom();
        break;
      case 'undo':
        this.undoLastAction();
        break;
      case 'redo':
        this.redoLastAction();
        break;
      // Navigation actions that don't modify state are handled by emit only
      default:
        break;
    }
  }

  /**
   * Accept the current line
   */
  private acceptCurrentLine(): void {
    if (!this.pendingChange) return;
    
    const lineId = this.getCurrentLineId();
    if (lineId) {
      this.pendingChange.setLineState(lineId, 'accepted');
      this.emit('lineAccepted', lineId);
    }
  }

  /**
   * Reject the current line
   */
  private rejectCurrentLine(): void {
    if (!this.pendingChange) return;
    
    const lineId = this.getCurrentLineId();
    if (lineId) {
      this.pendingChange.setLineState(lineId, 'rejected');
      this.emit('lineRejected', lineId);
    }
  }

  /**
   * Accept all lines in the current hunk
   */
  private acceptCurrentHunk(): void {
    if (!this.pendingChange) return;
    
    this.pendingChange.acceptHunk(this.currentPosition.hunkIndex);
    this.emit('hunkAccepted', this.currentPosition.hunkIndex);
  }

  /**
   * Reject all lines in the current hunk
   */
  private rejectCurrentHunk(): void {
    if (!this.pendingChange) return;
    
    this.pendingChange.rejectHunk(this.currentPosition.hunkIndex);
    this.emit('hunkRejected', this.currentPosition.hunkIndex);
  }

  /**
   * Accept all lines in the current file
   */
  private acceptCurrentFile(): void {
    if (!this.pendingChange) return;
    
    this.pendingChange.acceptAll();
    this.emit('fileAccepted');
  }

  /**
   * Reject all lines in the current file
   */
  private rejectCurrentFile(): void {
    if (!this.pendingChange) return;

    this.pendingChange.rejectAll();
    this.emit('fileRejected');
  }

  /**
   * Accept all pending changes across all files
   */
  private acceptAll(): void {
    if (!this.pendingChange) return;

    this.pendingChange.acceptAll();
    this.emit('allAccepted');
  }

  /**
   * Reject all pending changes across all files
   */
  private rejectAll(): void {
    if (!this.pendingChange) return;

    this.pendingChange.rejectAll();
    this.emit('allRejected');
  }

  /**
   * Get the LineId for the current position
   */
  private getCurrentLineId(): LineId | undefined {
    if (!this.pendingChange?.parsedDiff) return undefined;
    
    return {
      hunkIndex: this.currentPosition.hunkIndex,
      lineIndex: this.currentPosition.lineIndex,
    };
  }

  /**
   * Move to the next line
   */
  private moveToNextLine(): void {
    if (!this.pendingChange?.parsedDiff) return;

    const hunks = this.pendingChange.parsedDiff.hunks;
    const currentHunk = hunks[this.currentPosition.hunkIndex];
    
    if (!currentHunk) return;

    if (this.currentPosition.lineIndex < currentHunk.lines.length - 1) {
      // Move to next line in current hunk
      this.currentPosition.lineIndex++;
    } else if (this.currentPosition.hunkIndex < hunks.length - 1) {
      // Move to first line of next hunk
      this.currentPosition.hunkIndex++;
      this.currentPosition.lineIndex = 0;
    }

    this.updateAbsoluteLine();
    this.emit('positionChanged', this.currentPosition);
  }

  /**
   * Move to the previous line
   */
  private moveToPrevLine(): void {
    if (!this.pendingChange?.parsedDiff) return;

    if (this.currentPosition.lineIndex > 0) {
      // Move to previous line in current hunk
      this.currentPosition.lineIndex--;
    } else if (this.currentPosition.hunkIndex > 0) {
      // Move to last line of previous hunk
      this.currentPosition.hunkIndex--;
      const prevHunk = this.pendingChange.parsedDiff.hunks[this.currentPosition.hunkIndex];
      this.currentPosition.lineIndex = prevHunk.lines.length - 1;
    }

    this.updateAbsoluteLine();
    this.emit('positionChanged', this.currentPosition);
  }

  /**
   * Move to the next hunk
   */
  private moveToNextHunk(): void {
    if (!this.pendingChange?.parsedDiff) return;

    const hunks = this.pendingChange.parsedDiff.hunks;
    if (this.currentPosition.hunkIndex < hunks.length - 1) {
      this.currentPosition.hunkIndex++;
      this.currentPosition.lineIndex = 0;
      this.updateAbsoluteLine();
      this.emit('positionChanged', this.currentPosition);
    }
  }

  /**
   * Move to the previous hunk
   */
  private moveToPrevHunk(): void {
    if (this.currentPosition.hunkIndex > 0) {
      this.currentPosition.hunkIndex--;
      this.currentPosition.lineIndex = 0;
      this.updateAbsoluteLine();
      this.emit('positionChanged', this.currentPosition);
    }
  }

  /**
   * Move to the top of the diff
   */
  private moveToTop(): void {
    this.currentPosition.hunkIndex = 0;
    this.currentPosition.lineIndex = 0;
    this.updateAbsoluteLine();
    this.emit('positionChanged', this.currentPosition);
  }

  /**
   * Move to the bottom of the diff
   */
  private moveToBottom(): void {
    if (!this.pendingChange?.parsedDiff) return;

    const hunks = this.pendingChange.parsedDiff.hunks;
    if (hunks.length > 0) {
      this.currentPosition.hunkIndex = hunks.length - 1;
      const lastHunk = hunks[hunks.length - 1];
      this.currentPosition.lineIndex = lastHunk.lines.length - 1;
      this.updateAbsoluteLine();
      this.emit('positionChanged', this.currentPosition);
    }
  }

  /**
   * Update the absolute line number
   */
  private updateAbsoluteLine(): void {
    if (!this.pendingChange?.parsedDiff) return;

    let absoluteLine = 0;
    
    // Add lines from previous hunks
    for (let i = 0; i < this.currentPosition.hunkIndex; i++) {
      absoluteLine += this.pendingChange.parsedDiff.hunks[i].lines.length;
      // Add 1 for hunk header
      absoluteLine += 1;
      // Add 1 for spacing between hunks
      absoluteLine += 1;
    }

    // Add current line within hunk
    absoluteLine += this.currentPosition.lineIndex;

    this.currentPosition.absoluteLine = absoluteLine;
  }

  /**
   * Add an action to the history
   */
  private addToHistory(event: ActionEvent): void {
    // Remove any redo history if we're adding a new action
    if (this.historyIndex < this.actionHistory.length - 1) {
      this.actionHistory = this.actionHistory.slice(0, this.historyIndex + 1);
    }

    this.actionHistory.push(event);

    // Trim history if it exceeds max size
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Undo the last action
   */
  private undoLastAction(): void {
    if (this.historyIndex < 0) return;

    const event = this.actionHistory[this.historyIndex];
    this.historyIndex--;

    // Revert the action
    if (this.pendingChange && event.lineId) {
      this.pendingChange.setLineState(event.lineId, 'pending');
    }

    this.emit('undo', event);
  }

  /**
   * Redo the last undone action
   */
  private redoLastAction(): void {
    if (this.historyIndex >= this.actionHistory.length - 1) return;

    this.historyIndex++;
    const event = this.actionHistory[this.historyIndex];

    // Re-apply the action
    this.executeAction(event.action, event);

    this.emit('redo', event);
  }

  /**
   * Register a custom keybinding
   */
  registerKeybinding(binding: Keybinding): void {
    this.keybindings.set(binding.key, binding);
  }

  /**
   * Unregister a keybinding
   */
  unregisterKeybinding(key: string): boolean {
    // Don't allow unregistering default bindings
    const defaultBinding = DEFAULT_KEYBINDINGS.find(b => b.key === key);
    if (defaultBinding) {
      return false;
    }
    return this.keybindings.delete(key);
  }

  /**
   * Get all registered keybindings
   */
  getKeybindings(): Keybinding[] {
    return Array.from(this.keybindings.values());
  }

  /**
   * Get keybindings filtered by context
   */
  getKeybindingsByContext(context: Keybinding['context']): Keybinding[] {
    return this.getKeybindings().filter(b => b.context === context);
  }

  /**
   * Generate help text organized by sections
   */
  generateHelpText(): string {
    const sections = this.organizeKeybindingsIntoSections();
    const lines: string[] = [];

    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                  Keyboard Shortcuts Help                   ║');
    lines.push('╠════════════════════════════════════════════════════════════╣');

    for (const section of sections) {
      lines.push(`║  ${section.title.padEnd(54)} ║`);
      lines.push('║  ' + '─'.repeat(54) + ' ║');

      for (const binding of section.bindings) {
        const keyStr = binding.key.padEnd(12);
        const descStr = binding.description.padEnd(40);
        lines.push(`║    ${keyStr} ${descStr} ║`);
      }

      lines.push('║' + ' '.repeat(56) + '║');
    }

    lines.push('╚════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Generate compact help text for footer display
   */
  generateCompactHelpText(): string {
    const essentialBindings = [
      { key: 'y/n', action: 'accept/reject line' },
      { key: 'h/r', action: 'accept/reject hunk' },
      { key: 'a/d', action: 'accept/reject file' },
      { key: 'j/k', action: 'navigate' },
      { key: '[]', action: 'jump hunks' },
      { key: 'q', action: 'quit' },
      { key: '?', action: 'help' },
    ];

    return essentialBindings
      .map(b => `[${b.key}] ${b.action}`)
      .join(' │ ');
  }

  /**
   * Organize keybindings into sections for help display
   */
  private organizeKeybindingsIntoSections(): HelpSection[] {
    const sections: HelpSection[] = [
      {
        title: 'Line Actions',
        bindings: this.getKeybindingsByContext('action').filter(
          b => b.action === 'acceptLine' || b.action === 'rejectLine'
        ),
      },
      {
        title: 'Hunk Actions',
        bindings: this.getKeybindingsByContext('action').filter(
          b => b.action === 'acceptHunk' || b.action === 'rejectHunk'
        ),
      },
      {
        title: 'File Actions',
        bindings: this.getKeybindingsByContext('file'),
      },
      {
        title: 'Navigation',
        bindings: this.getKeybindingsByContext('navigation').filter(
          b => b.key.length === 1 || b.key === 'ArrowUp' || b.key === 'ArrowDown'
        ),
      },
      {
        title: 'Global',
        bindings: this.getKeybindingsByContext('global'),
      },
    ];

    // Filter out empty sections
    return sections.filter(s => s.bindings.length > 0);
  }

  /**
   * Get action description for a key
   */
  getActionDescription(key: string): string | undefined {
    const binding = this.keybindings.get(key);
    return binding?.description;
  }

  /**
   * Check if a key is registered
   */
  isKeyRegistered(key: string): boolean {
    return this.keybindings.has(key);
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.currentPosition = {
      hunkIndex: 0,
      lineIndex: 0,
      absoluteLine: 0,
    };
    this.actionHistory = [];
    this.historyIndex = -1;
    this.emit('reset');
  }

  /**
   * Destroy the handler and clean up
   */
  destroy(): void {
    this.removeAllListeners();
    this.keybindings.clear();
    this.pendingChange = null;
    this.actionHistory = [];
  }
}

export default KeyboardHandler;
