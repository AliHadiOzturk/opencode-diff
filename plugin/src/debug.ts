/**
 * Debug logging utility for OpenCode Diff Plugin
 * 
 * Provides leveled logging with environment variable control
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

export class DebugLogger {
  private static instance: DebugLogger;
  private logLevel: LogLevel;
  private component: string;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor(component: string) {
    this.component = component;
    this.logLevel = this.detectLogLevel();
  }

  static getInstance(component: string): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger(component);
    }
    return new DebugLogger(component);
  }

  private detectLogLevel(): LogLevel {
    const envLevel = process.env.DEBUG?.toLowerCase();
    
    if (envLevel?.includes('opencode-diff-plugin') || envLevel === '*') {
      return 'debug';
    }
    
    if (envLevel?.includes('error')) return 'error';
    if (envLevel?.includes('warn')) return 'warn';
    if (envLevel?.includes('info')) return 'info';
    
    return 'info';
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.component}] [${level.toUpperCase()}] ${message}`;
  }

  private addToHistory(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog('debug')) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      component: this.component,
      message,
      data
    };
    
    this.addToHistory(entry);
    console.log(this.formatMessage('debug', message), data !== undefined ? data : '');
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog('info')) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      component: this.component,
      message,
      data
    };
    
    this.addToHistory(entry);
    console.log(this.formatMessage('info', message), data !== undefined ? data : '');
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog('warn')) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      component: this.component,
      message,
      data
    };
    
    this.addToHistory(entry);
    console.warn(this.formatMessage('warn', message), data !== undefined ? data : '');
  }

  error(message: string, error?: Error | unknown): void {
    if (!this.shouldLog('error')) return;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      component: this.component,
      message,
      data: error instanceof Error ? { message: error.message, stack: error.stack } : error
    };
    
    this.addToHistory(entry);
    console.error(this.formatMessage('error', message), error !== undefined ? error : '');
  }

  group(label: string): void {
    if (this.shouldLog('debug')) {
      console.group(this.formatMessage('debug', label));
    }
  }

  groupEnd(): void {
    if (this.shouldLog('debug')) {
      console.groupEnd();
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export function createLogger(component: string): DebugLogger {
  return DebugLogger.getInstance(component);
}

export function enableDebugMode(): void {
  process.env.DEBUG = 'opencode-diff-plugin*';
  console.log('[Debug] Debug mode enabled. Set DEBUG=opencode-diff-plugin* to see all logs.');
}

export function disableDebugMode(): void {
  delete process.env.DEBUG;
  console.log('[Debug] Debug mode disabled.');
}
