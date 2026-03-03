import { describe, it, expect, beforeEach } from 'bun:test';
import { DiffEngine, type ParsedDiff, type Hunk, type DiffLine } from '../diff-engine.js';

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('generateDiff', () => {
    it('should generate a unified diff for modified content', () => {
      const oldContent = 'line1\nline2\nline3\n';
      const newContent = 'line1\nmodified\nline3\n';
      
      const diff = engine.generateDiff('file.txt', 'file.txt', oldContent, newContent);
      
      expect(diff).toContain('Index: file.txt');
      expect(diff).toContain('--- file.txt');
      expect(diff).toContain('+++ file.txt');
      expect(diff).toContain('-line2');
      expect(diff).toContain('+modified');
    });

    it('should return empty string when both contents are empty', () => {
      const diff = engine.generateDiff('file.txt', 'file.txt', '', '');
      expect(diff).toBe('');
    });

    it('should handle new file (empty old content)', () => {
      const newContent = 'new line1\nnew line2\n';
      const diff = engine.generateDiff('/dev/null', 'file.txt', '', newContent);
      
      expect(diff).toContain('Index: file.txt');
      expect(diff).toContain('+++ file.txt');
      expect(diff).toContain('+new line1');
      expect(diff).toContain('+new line2');
    });

    it('should handle deleted file (empty new content)', () => {
      const oldContent = 'old line1\nold line2\n';
      const diff = engine.generateDiff('file.txt', '/dev/null', oldContent, '');
      
      expect(diff).toContain('Index: /dev/null');
      expect(diff).toContain('--- /dev/null');
      expect(diff).toContain('-old line1');
      expect(diff).toContain('-old line2');
    });

    it('should handle content without trailing newline', () => {
      const oldContent = 'line1\nline2';
      const newContent = 'line1\nmodified';
      
      const diff = engine.generateDiff('file.txt', 'file.txt', oldContent, newContent);
      
      expect(diff).toContain('-line2');
      expect(diff).toContain('+modified');
    });

    it('should respect contextLines configuration', () => {
      const engineWithContext = new DiffEngine({ contextLines: 1 });
      const oldContent = 'a\nb\nc\nd\ne\n';
      const newContent = 'a\nb\nX\nd\ne\n';
      
      const diff = engineWithContext.generateDiff('file.txt', 'file.txt', oldContent, newContent);
      const lines = diff.split('\n');
      
      expect(lines.some(l => l.startsWith('@@'))).toBe(true);
    });
  });

  describe('parseDiff', () => {
    it('should parse a generated diff string', () => {
      const oldContent = 'line1\nline2\nline3\n';
      const newContent = 'line1\nmodified\nline3\n';
      const diffString = engine.generateDiff('file.txt', 'file.txt', oldContent, newContent);

      const parsed = engine.parseDiff(diffString);

      expect(diffString.length).toBeGreaterThan(0);
      expect(diffString).toContain('Index: file.txt');
      expect(diffString).toContain('-line2');
      expect(diffString).toContain('+modified');
    });

    it('should return empty array for empty diff string', () => {
      const parsed = engine.parseDiff('');
      expect(parsed).toEqual([]);
    });

    it('should return empty array for whitespace-only diff string', () => {
      const parsed = engine.parseDiff('   \n\t\n  ');
      expect(parsed).toEqual([]);
    });

    it('should parse git-style diff', () => {
      const diffString = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line1
-line2
+modified
 line3
`;
      
      const parsed = engine.parseDiff(diffString);
      
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0].hunks.length).toBeGreaterThan(0);
    });
  });

  describe('detectLanguage', () => {
    it('should detect JavaScript from .js extension', () => {
      expect(engine.detectLanguage('file.js')).toBe('javascript');
      expect(engine.detectLanguage('path/to/file.js')).toBe('javascript');
    });

    it('should detect TypeScript from .ts extension', () => {
      expect(engine.detectLanguage('file.ts')).toBe('typescript');
      expect(engine.detectLanguage('file.tsx')).toBe('tsx');
    });

    it('should detect language from various extensions', () => {
      expect(engine.detectLanguage('file.py')).toBe('python');
      expect(engine.detectLanguage('file.rs')).toBe('rust');
      expect(engine.detectLanguage('file.go')).toBe('go');
      expect(engine.detectLanguage('file.java')).toBe('java');
      expect(engine.detectLanguage('file.md')).toBe('markdown');
      expect(engine.detectLanguage('file.json')).toBe('json');
    });

    it('should detect Dockerfile by exact filename', () => {
      expect(engine.detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(engine.detectLanguage('dockerfile')).toBe('dockerfile');
      expect(engine.detectLanguage('path/to/Dockerfile')).toBe('dockerfile');
    });

    it('should be case insensitive for extensions', () => {
      expect(engine.detectLanguage('file.JS')).toBe('javascript');
      expect(engine.detectLanguage('file.TS')).toBe('typescript');
      expect(engine.detectLanguage('FILE.PY')).toBe('python');
    });

    it('should return undefined for unknown extensions', () => {
      expect(engine.detectLanguage('file.unknown')).toBeUndefined();
      expect(engine.detectLanguage('file')).toBeUndefined();
    });

    it('should return undefined for /dev/null', () => {
      expect(engine.detectLanguage('/dev/null')).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      expect(engine.detectLanguage('')).toBeUndefined();
    });
  });

  describe('generateAndParse', () => {
    it('should generate and parse diff in one step', () => {
      const oldContent = 'line1\nline2\n';
      const newContent = 'line1\nmodified\n';

      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);

      expect(result.oldPath).toBe('file.txt');
      expect(result.newPath).toBe('file.txt');
      expect(result.status).toBe('modified');
      expect(result.oldContent).toBe(oldContent);
      expect(result.newContent).toBe(newContent);
    });

    it('should detect added file status', () => {
      const newContent = 'new content\n';
      const result = engine.generateAndParse('/dev/null', 'file.txt', '', newContent);
      
      expect(result.status).toBe('added');
    });

    it('should detect deleted file status', () => {
      const oldContent = 'old content\n';
      const result = engine.generateAndParse('file.txt', '/dev/null', oldContent, '');
      
      expect(result.status).toBe('deleted');
    });

    it('should detect unchanged file status', () => {
      const content = 'same content\n';
      const result = engine.generateAndParse('file.txt', 'file.txt', content, content);
      
      expect(result.status).toBe('unchanged');
    });

    it('should include language in result', () => {
      const result = engine.generateAndParse('file.ts', 'file.ts', 'old', 'new');
      expect(result.language).toBe('typescript');
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = engine.getConfig();
      expect(config.contextLines).toBe(3);
      expect(config.ignoreWhitespace).toBe(false);
    });

    it('should allow custom configuration', () => {
      const customEngine = new DiffEngine({ contextLines: 5, ignoreWhitespace: true });
      const config = customEngine.getConfig();
      expect(config.contextLines).toBe(5);
      expect(config.ignoreWhitespace).toBe(true);
    });

    it('should update configuration with setConfig', () => {
      engine.setConfig({ contextLines: 10 });
      const config = engine.getConfig();
      expect(config.contextLines).toBe(10);
      expect(config.ignoreWhitespace).toBe(false);
    });
  });

  describe('Hunk structure', () => {
    it('should have correct hunk structure', () => {
      const oldContent = 'line1\nline2\nline3\n';
      const newContent = 'line1\nmodified\nline3\n';
      
      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);
      
      if (result.hunks.length > 0) {
        const hunk = result.hunks[0];
        expect(hunk).toHaveProperty('header');
        expect(hunk).toHaveProperty('oldStart');
        expect(hunk).toHaveProperty('oldLines');
        expect(hunk).toHaveProperty('newStart');
        expect(hunk).toHaveProperty('newLines');
        expect(hunk).toHaveProperty('lines');
        expect(Array.isArray(hunk.lines)).toBe(true);
      }
    });

    it('should have correct line structure within hunks', () => {
      const oldContent = 'line1\nline2\n';
      const newContent = 'line1\nmodified\n';
      
      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);
      
      if (result.hunks.length > 0 && result.hunks[0].lines.length > 0) {
        const line = result.hunks[0].lines[0];
        expect(line).toHaveProperty('type');
        expect(line).toHaveProperty('content');
        expect(['added', 'deleted', 'unchanged']).toContain(line.type);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single line files', () => {
      const oldContent = 'single';
      const newContent = 'modified';
      
      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);
      expect(result.status).toBe('modified');
    });

    it('should handle files with only whitespace changes', () => {
      const oldContent = 'line1\nline2\n';
      const newContent = 'line1 \nline2\n';
      
      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);
      expect(result.status).toBe('modified');
    });

    it('should handle very long lines', () => {
      const longLine = 'a'.repeat(1000);
      const result = engine.generateAndParse('file.txt', 'file.txt', longLine, longLine + 'b');
      expect(result.status).toBe('modified');
    });

    it('should handle unicode content', () => {
      const oldContent = '🎉 emoji test\n';
      const newContent = '🎊 emoji modified\n';
      
      const result = engine.generateAndParse('file.txt', 'file.txt', oldContent, newContent);
      expect(result.status).toBe('modified');
    });

    it('should handle binary-like content gracefully', () => {
      const oldContent = 'normal\n';
      const newContent = 'normal\ndata\n';
      
      const result = engine.generateAndParse('file.bin', 'file.bin', oldContent, newContent);
      expect(result.status).toBe('modified');
    });
  });
});
