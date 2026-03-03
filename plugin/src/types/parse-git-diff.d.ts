declare module 'parse-git-diff' {
  export interface GitDiffChange {
    type: 'add' | 'del' | 'normal';
    content: string;
    ln1?: number;
    ln2?: number;
  }

  export interface GitDiffChunk {
    header: string;
    fromFileRange: {
      start: number;
      lines: number;
    };
    toFileRange: {
      start: number;
      lines: number;
    };
    changes: GitDiffChange[];
  }

  export interface GitDiffFile {
    type?: string;
    from?: string;
    to?: string;
    path?: string;
    chunks: GitDiffChunk[];
  }

  export interface GitDiff {
    files: GitDiffFile[];
  }

  export default function parseGitDiff(diff: string): GitDiff;
}
