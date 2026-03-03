declare module 'diff' {
  export interface PatchOptions {
    context?: number;
  }

  export interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }

  export interface ParsedPatch {
    oldFileName: string;
    newFileName: string;
    oldHeader: string;
    newHeader: string;
    hunks: Hunk[];
  }

  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader: string,
    newHeader: string,
    options?: PatchOptions
  ): string;

  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions
  ): string;

  export function structuredPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions
  ): ParsedPatch;

  export function applyPatch(source: string, patch: string | ParsedPatch): string;

  export function parsePatch(patch: string): ParsedPatch[];

  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  export function diffLines(oldStr: string, newStr: string, options?: any): Change[];
  export function diffWords(oldStr: string, newStr: string, options?: any): Change[];
  export function diffWordsWithSpace(oldStr: string, newStr: string, options?: any): Change[];
  export function diffChars(oldStr: string, newStr: string, options?: any): Change[];
}
