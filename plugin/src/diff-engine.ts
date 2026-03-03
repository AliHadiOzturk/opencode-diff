import { createPatch } from 'diff';
import parseGitDiff from 'parse-git-diff';

/**
 * Represents a single line in a diff hunk
 */
export interface DiffLine {
  type: 'added' | 'deleted' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Represents a hunk (section) of a diff
 */
export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * Represents a parsed diff result
 */
export interface ParsedDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';
  language?: string;
  hunks: Hunk[];
  oldContent?: string;
  newContent?: string;
}

/**
 * Configuration for diff generation
 */
export interface DiffEngineConfig {
  contextLines: number;
  ignoreWhitespace: boolean;
}

/**
 * DiffEngine - A class for generating and parsing unified diffs
 * 
 * Uses the Myers diff algorithm (via the 'diff' library) for generating diffs
 * and parse-git-diff for parsing them.
 */
export class DiffEngine {
  private config: DiffEngineConfig;

  // Language mapping from file extensions
  private static readonly LANGUAGE_MAP: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'jsx',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.json': 'json',
    '.md': 'markdown',
    '.mdx': 'mdx',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.vue': 'vue',
    '.svelte': 'svelte',
    '.sol': 'solidity',
    '.toml': 'toml',
    '.ini': 'ini',
    '.env': 'env',
    '.dockerfile': 'dockerfile',
    'dockerfile': 'dockerfile',
  };

  constructor(config: Partial<DiffEngineConfig> = {}) {
    this.config = {
      contextLines: 3,
      ignoreWhitespace: false,
      ...config,
    };
  }

  /**
   * Generate a unified diff between two text contents
   * 
   * @param oldPath - Path to the old file (used in diff header)
   * @param newPath - Path to the new file (used in diff header)
   * @param oldContent - Original content (empty string for new files)
   * @param newContent - New content (empty string for deleted files)
   * @returns The unified diff string
   */
  generateDiff(
    oldPath: string,
    newPath: string,
    oldContent: string,
    newContent: string
  ): string {
    if (!oldContent && !newContent) {
      return '';
    }

    if (!oldContent) {
      oldContent = '';
    }

    if (!newContent) {
      newContent = '';
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    if (oldContent.endsWith('\n') && oldLines[oldLines.length - 1] === '') {
      oldLines.pop();
    }
    if (newContent.endsWith('\n') && newLines[newLines.length - 1] === '') {
      newLines.pop();
    }

    return createPatch(
      newPath,
      oldContent,
      newContent,
      oldPath,
      newPath,
      { context: this.config.contextLines }
    );
  }

  /**
   * Parse a unified diff string into a structured format
   * 
   * @param diff - The unified diff string to parse
   * @returns Array of parsed diff objects
   */
  parseDiff(diff: string): ParsedDiff[] {
    if (!diff || diff.trim() === '') {
      return [];
    }

    try {
      const parsed = parseGitDiff(diff);
      return this.convertParsedGitDiff(parsed);
    } catch (error) {
      console.warn('Failed to parse diff:', error);
      return [];
    }
  }

  /**
   * Convert parse-git-diff output to our ParsedDiff format
   */
  private convertParsedGitDiff(parsed: any): ParsedDiff[] {
    if (!parsed.files || !Array.isArray(parsed.files)) {
      return [];
    }

    return parsed.files.map((file: any): ParsedDiff => {
      const oldPath = file.from || file.path || '/dev/null';
      const newPath = file.to || file.path || '/dev/null';
      
      return {
        oldPath,
        newPath,
        status: this.detectFileStatus(file, oldPath, newPath),
        language: this.detectLanguage(newPath),
        hunks: this.convertHunks(file.chunks || []),
      };
    });
  }

  /**
   * Detect the file status from the parsed diff
   */
  private detectFileStatus(
    file: any,
    oldPath: string,
    newPath: string
  ): 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged' {
    if (oldPath !== newPath && oldPath !== '/dev/null' && newPath !== '/dev/null') {
      return 'renamed';
    }

    if (oldPath === '/dev/null' || file.type === 'add') {
      return 'added';
    }

    if (newPath === '/dev/null' || file.type === 'delete') {
      return 'deleted';
    }

    const hunks = file.chunks || [];
    const hasChanges = hunks.some((chunk: any) => {
      const changes = chunk.changes || [];
      return changes.some((change: any) => 
        change.type === 'add' || change.type === 'del'
      );
    });

    return hasChanges ? 'modified' : 'unchanged';
  }

  /**
   * Detect programming language from file extension
   */
  detectLanguage(filePath: string): string | undefined {
    if (!filePath || filePath === '/dev/null') {
      return undefined;
    }

    const lowerPath = filePath.toLowerCase();
    const fileName = lowerPath.split('/').pop() || '';
    if (DiffEngine.LANGUAGE_MAP[fileName]) {
      return DiffEngine.LANGUAGE_MAP[fileName];
    }

    const ext = '.' + fileName.split('.').pop();
    if (DiffEngine.LANGUAGE_MAP[ext]) {
      return DiffEngine.LANGUAGE_MAP[ext];
    }

    return undefined;
  }

  /**
   * Convert parse-git-diff chunks to our Hunk format
   */
  private convertHunks(chunks: any[]): Hunk[] {
    return chunks.map((chunk: any): Hunk => {
      const header = chunk.header || '';
      const lines: DiffLine[] = [];
      
      let oldLineNumber = chunk.fromFileRange?.start || 1;
      let newLineNumber = chunk.toFileRange?.start || 1;

      const changes = chunk.changes || [];
      
      for (const change of changes) {
        if (change.type === 'add') {
          lines.push({
            type: 'added',
            content: change.content,
            newLineNumber: newLineNumber++,
          });
        } else if (change.type === 'del') {
          lines.push({
            type: 'deleted',
            content: change.content,
            oldLineNumber: oldLineNumber++,
          });
        } else if (change.type === 'normal') {
          lines.push({
            type: 'unchanged',
            content: change.content,
            oldLineNumber: oldLineNumber++,
            newLineNumber: newLineNumber++,
          });
        }
      }

      return {
        header,
        oldStart: chunk.fromFileRange?.start || 1,
        oldLines: chunk.fromFileRange?.lines || 0,
        newStart: chunk.toFileRange?.start || 1,
        newLines: chunk.toFileRange?.lines || 0,
        lines,
      };
    });
  }

  /**
   * Generate and parse a diff in one step
   * 
   * @param oldPath - Path to the old file
   * @param newPath - Path to the new file
   * @param oldContent - Original content
   * @param newContent - New content
   * @returns Parsed diff object
   */
  generateAndParse(
    oldPath: string,
    newPath: string,
    oldContent: string,
    newContent: string
  ): ParsedDiff {
    const diff = this.generateDiff(oldPath, newPath, oldContent, newContent);
    const parsed = this.parseDiff(diff);
    
    if (parsed.length > 0) {
      parsed[0].oldContent = oldContent;
      parsed[0].newContent = newContent;
      return parsed[0];
    }

    return {
      oldPath,
      newPath,
      status: this.determineStatus(oldContent, newContent),
      language: this.detectLanguage(newPath),
      hunks: [],
      oldContent,
      newContent,
    };
  }

  /**
   * Determine file status based on content
   */
  private determineStatus(
    oldContent: string,
    newContent: string
  ): 'added' | 'modified' | 'deleted' | 'unchanged' {
    const oldEmpty = !oldContent || oldContent === '';
    const newEmpty = !newContent || newContent === '';

    if (oldEmpty && !newEmpty) return 'added';
    if (!oldEmpty && newEmpty) return 'deleted';
    if (oldContent === newContent) return 'unchanged';
    return 'modified';
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DiffEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DiffEngineConfig {
    return { ...this.config };
  }
}

export default DiffEngine;
