import chalk, { ChalkInstance } from 'chalk';
import { LineState, PendingChange } from '../state-manager.js';
import { DiffLine } from '../diff-engine.js';
import { NavigationPosition } from './keyboard-handler.js';
import { TUITheme } from './tui-renderer.js';

export interface WidgetStyles {
  pending: {
    indicator: string;
    color: ChalkInstance;
    bgColor: ChalkInstance;
  };
  accepted: {
    indicator: string;
    color: ChalkInstance;
    bgColor: ChalkInstance;
  };
  rejected: {
    indicator: string;
    color: ChalkInstance;
    bgColor: ChalkInstance;
  };
  currentLine: {
    indicator: string;
    color: ChalkInstance;
  };
}

export const DEFAULT_WIDGET_STYLES: WidgetStyles = {
  pending: {
    indicator: '?',
    color: chalk.yellow,
    bgColor: chalk.bgYellow,
  },
  accepted: {
    indicator: '✓',
    color: chalk.green,
    bgColor: chalk.bgGreen,
  },
  rejected: {
    indicator: '✗',
    color: chalk.red,
    bgColor: chalk.bgRed,
  },
  currentLine: {
    indicator: '▶',
    color: chalk.cyan,
  },
};

export interface WidgetPosition {
  hunkIndex: number;
  lineIndex: number;
  absoluteLine: number;
}

export interface LineWidget {
  position: WidgetPosition;
  lineId: string;
  state: LineState;
  isCurrent: boolean;
  isChangeable: boolean;
  lineType: DiffLine['type'];
}

export class WidgetManager {
  private pendingChange: PendingChange | null = null;
  private currentPosition: NavigationPosition | null = null;
  private styles: WidgetStyles;
  private widgets: Map<string, LineWidget> = new Map();
  private visibleWidgets: Set<string> = new Set();
  private showCurrentIndicator: boolean = true;
  private showStateIndicators: boolean = true;
  private compactMode: boolean = false;

  constructor(
    styles: Partial<WidgetStyles> = {},
    options: {
      showCurrentIndicator?: boolean;
      showStateIndicators?: boolean;
      compactMode?: boolean;
    } = {}
  ) {
    this.styles = {
      pending: { ...DEFAULT_WIDGET_STYLES.pending, ...styles.pending },
      accepted: { ...DEFAULT_WIDGET_STYLES.accepted, ...styles.accepted },
      rejected: { ...DEFAULT_WIDGET_STYLES.rejected, ...styles.rejected },
      currentLine: { ...DEFAULT_WIDGET_STYLES.currentLine, ...styles.currentLine },
    };
    this.showCurrentIndicator = options.showCurrentIndicator ?? true;
    this.showStateIndicators = options.showStateIndicators ?? true;
    this.compactMode = options.compactMode ?? false;
  }

  setPendingChange(change: PendingChange | null): void {
    this.pendingChange = change;
    this.rebuildWidgets();
  }

  setCurrentPosition(position: NavigationPosition | null): void {
    this.currentPosition = position;
    this.updateCurrentLineIndicator();
  }

  private rebuildWidgets(): void {
    this.widgets.clear();
    this.visibleWidgets.clear();

    if (!this.pendingChange?.parsedDiff) {
      return;
    }

    let absoluteLine = 0;
    const hunks = this.pendingChange.parsedDiff.hunks;

    for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
      const hunk = hunks[hunkIndex];
      
      for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
        const line = hunk.lines[lineIndex];
        const lineId = `${hunkIndex}:${lineIndex}`;
        const isChangeable = line.type === 'added' || line.type === 'deleted';
        const state = this.pendingChange.getLineState(lineId) || 'pending';

        const widget: LineWidget = {
          position: {
            hunkIndex,
            lineIndex,
            absoluteLine,
          },
          lineId,
          state,
          isCurrent: false,
          isChangeable,
          lineType: line.type,
        };

        this.widgets.set(lineId, widget);
        if (isChangeable) {
          this.visibleWidgets.add(lineId);
        }

        absoluteLine++;
      }

      absoluteLine += 2;
    }
  }

  private updateCurrentLineIndicator(): void {
    for (const widget of this.widgets.values()) {
      widget.isCurrent = false;
    }

    if (!this.currentPosition) {
      return;
    }

    const lineId = `${this.currentPosition.hunkIndex}:${this.currentPosition.lineIndex}`;
    const widget = this.widgets.get(lineId);
    if (widget) {
      widget.isCurrent = true;
    }
  }

  getWidgetForLine(hunkIndex: number, lineIndex: number): LineWidget | undefined {
    const lineId = `${hunkIndex}:${lineIndex}`;
    return this.widgets.get(lineId);
  }

  getWidgetState(hunkIndex: number, lineIndex: number): LineState | undefined {
    const widget = this.getWidgetForLine(hunkIndex, lineIndex);
    return widget?.state;
  }

  setWidgetState(hunkIndex: number, lineIndex: number, state: LineState): void {
    const lineId = `${hunkIndex}:${lineIndex}`;
    const widget = this.widgets.get(lineId);
    if (widget) {
      widget.state = state;
    }
  }

  getStateIndicator(state: LineState): string {
    if (!this.showStateIndicators) {
      return ' ';
    }

    const style = this.styles[state];
    const indicator = this.compactMode ? style.indicator.charAt(0) : style.indicator;
    return style.color(indicator);
  }

  getCurrentLineIndicator(): string {
    if (!this.showCurrentIndicator) {
      return ' ';
    }

    const style = this.styles.currentLine;
    return style.color(style.indicator);
  }

  renderWidgetForLine(hunkIndex: number, lineIndex: number): string {
    const widget = this.getWidgetForLine(hunkIndex, lineIndex);
    if (!widget || !widget.isChangeable) {
      return '  ';
    }

    const parts: string[] = [];

    if (widget.isCurrent) {
      parts.push(this.getCurrentLineIndicator());
    } else {
      parts.push(' ');
    }

    parts.push(this.getStateIndicator(widget.state));

    return parts.join('');
  }

  renderWidgetColumn(hunkIndex: number, lineIndex: number, _theme: TUITheme): string {
    return this.renderWidgetForLine(hunkIndex, lineIndex);
  }

  getAllVisibleWidgets(): LineWidget[] {
    return Array.from(this.visibleWidgets)
      .map(id => this.widgets.get(id))
      .filter((w): w is LineWidget => w !== undefined);
  }

  getPendingWidgets(): LineWidget[] {
    return this.getAllVisibleWidgets().filter(w => w.state === 'pending');
  }

  getAcceptedWidgets(): LineWidget[] {
    return this.getAllVisibleWidgets().filter(w => w.state === 'accepted');
  }

  getRejectedWidgets(): LineWidget[] {
    return this.getAllVisibleWidgets().filter(w => w.state === 'rejected');
  }

  getWidgetStats(): {
    pending: number;
    accepted: number;
    rejected: number;
    total: number;
  } {
    const visible = this.getAllVisibleWidgets();
    return {
      pending: visible.filter(w => w.state === 'pending').length,
      accepted: visible.filter(w => w.state === 'accepted').length,
      rejected: visible.filter(w => w.state === 'rejected').length,
      total: visible.length,
    };
  }

  updateWidgetStatesFromPendingChange(): void {
    if (!this.pendingChange) {
      return;
    }

    const lineStates = this.pendingChange.getAllLineStates();
    for (const [lineId, state] of lineStates) {
      const widget = this.widgets.get(lineId);
      if (widget) {
        widget.state = state;
      }
    }
  }

  setStyles(styles: Partial<WidgetStyles>): void {
    this.styles = {
      pending: { ...this.styles.pending, ...styles.pending },
      accepted: { ...this.styles.accepted, ...styles.accepted },
      rejected: { ...this.styles.rejected, ...styles.rejected },
      currentLine: { ...this.styles.currentLine, ...styles.currentLine },
    };
  }

  getStyles(): WidgetStyles {
    return { ...this.styles };
  }

  setShowCurrentIndicator(show: boolean): void {
    this.showCurrentIndicator = show;
  }

  setShowStateIndicators(show: boolean): void {
    this.showStateIndicators = show;
  }

  setCompactMode(compact: boolean): void {
    this.compactMode = compact;
  }

  reset(): void {
    this.widgets.clear();
    this.visibleWidgets.clear();
    this.currentPosition = null;
    this.rebuildWidgets();
  }
}

export class AcceptRejectWidget {
  private position: WidgetPosition;
  private state: LineState;
  private onAccept: (() => void) | null = null;
  private onReject: (() => void) | null = null;
  private isHovered: boolean = false;
  private isFocused: boolean = false;
  private styles: WidgetStyles;

  constructor(
    position: WidgetPosition,
    initialState: LineState = 'pending',
    styles: Partial<WidgetStyles> = {}
  ) {
    this.position = position;
    this.state = initialState;
    this.styles = {
      pending: { ...DEFAULT_WIDGET_STYLES.pending, ...styles.pending },
      accepted: { ...DEFAULT_WIDGET_STYLES.accepted, ...styles.accepted },
      rejected: { ...DEFAULT_WIDGET_STYLES.rejected, ...styles.rejected },
      currentLine: { ...DEFAULT_WIDGET_STYLES.currentLine, ...styles.currentLine },
    };
  }

  getPosition(): WidgetPosition {
    return { ...this.position };
  }

  getState(): LineState {
    return this.state;
  }

  setState(state: LineState): void {
    this.state = state;
  }

  accept(): void {
    this.state = 'accepted';
    this.onAccept?.();
  }

  reject(): void {
    this.state = 'rejected';
    this.onReject?.();
  }

  setOnAccept(callback: () => void): void {
    this.onAccept = callback;
  }

  setOnReject(callback: () => void): void {
    this.onReject = callback;
  }

  setHovered(hovered: boolean): void {
    this.isHovered = hovered;
  }

  setFocused(focused: boolean): void {
    this.isFocused = focused;
  }

  render(): string {
    const style = this.styles[this.state];
    let output = style.color(style.indicator);

    if (this.isFocused) {
      output = chalk.bold(output);
    }

    if (this.isHovered) {
      output = chalk.underline(output);
    }

    return output;
  }

  renderDetailed(): string {
    const parts: string[] = [];
    
    if (this.isFocused) {
      parts.push(this.styles.currentLine.color('▶'));
    } else {
      parts.push(' ');
    }

    parts.push(this.render());

    return parts.join(' ');
  }
}

export class CurrentLineIndicator {
  private position: NavigationPosition | null = null;
  private styles: WidgetStyles;
  private visible: boolean = true;

  constructor(styles: Partial<WidgetStyles> = {}) {
    this.styles = {
      pending: { ...DEFAULT_WIDGET_STYLES.pending, ...styles.pending },
      accepted: { ...DEFAULT_WIDGET_STYLES.accepted, ...styles.accepted },
      rejected: { ...DEFAULT_WIDGET_STYLES.rejected, ...styles.rejected },
      currentLine: { ...DEFAULT_WIDGET_STYLES.currentLine, ...styles.currentLine },
    };
  }

  setPosition(position: NavigationPosition | null): void {
    this.position = position;
  }

  getPosition(): NavigationPosition | null {
    return this.position ? { ...this.position } : null;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  render(): string {
    if (!this.visible || !this.position) {
      return ' ';
    }

    return this.styles.currentLine.color(this.styles.currentLine.indicator);
  }

  renderWithLineNumber(lineNumber: number): string {
    if (!this.visible || !this.position) {
      return String(lineNumber).padStart(4, ' ');
    }

    const indicator = this.styles.currentLine.color(this.styles.currentLine.indicator);
    const numStr = String(lineNumber).padStart(3, ' ');
    return `${indicator}${numStr}`;
  }
}

export function createWidgetManager(
  pendingChange?: PendingChange,
  styles?: Partial<WidgetStyles>
): WidgetManager {
  const manager = new WidgetManager(styles);
  if (pendingChange) {
    manager.setPendingChange(pendingChange);
  }
  return manager;
}

export function createAcceptRejectWidget(
  hunkIndex: number,
  lineIndex: number,
  state: LineState = 'pending',
  styles?: Partial<WidgetStyles>
): AcceptRejectWidget {
  return new AcceptRejectWidget(
    {
      hunkIndex,
      lineIndex,
      absoluteLine: 0,
    },
    state,
    styles
  );
}

export function createCurrentLineIndicator(
  styles?: Partial<WidgetStyles>
): CurrentLineIndicator {
  return new CurrentLineIndicator(styles);
}

export default {
  WidgetManager,
  AcceptRejectWidget,
  CurrentLineIndicator,
  createWidgetManager,
  createAcceptRejectWidget,
  createCurrentLineIndicator,
  DEFAULT_WIDGET_STYLES,
};
