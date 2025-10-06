import { parseIssueRef, formatIssueRef, createCacheKey, createCachePath, escapeTextForPrompt } from './utils.js';

describe('Utils', () => {
  describe('parseIssueRef', () => {
    it('should parse short format issue ref', () => {
      const result = parseIssueRef('Microsoft/TypeScript#1234');
      expect(result).toEqual({
        owner: 'Microsoft',
        repo: 'TypeScript',
        number: 1234,
      });
    });

    it('should parse URL format issue ref', () => {
      const result = parseIssueRef('https://github.com/Microsoft/TypeScript/issues/1234');
      expect(result).toEqual({
        owner: 'Microsoft',
        repo: 'TypeScript',
        number: 1234,
      });
    });

    it('should throw error for invalid format', () => {
      expect(() => parseIssueRef('invalid-format')).toThrow('Invalid issue reference format');
    });
  });

  describe('formatIssueRef', () => {
    it('should format issue ref correctly', () => {
      const ref = { owner: 'Microsoft', repo: 'TypeScript', number: 1234 };
      const result = formatIssueRef(ref);
      expect(result).toBe('Microsoft/TypeScript#1234');
    });
  });

  describe('createCacheKey', () => {
    it('should create deterministic cache key', () => {
      const key1 = createCacheKey('test content', 'endpoint1');
      const key2 = createCacheKey('test content', 'endpoint1');
      const key3 = createCacheKey('different content', 'endpoint1');
      
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toHaveLength(16);
    });
  });

  describe('createCachePath', () => {
    it('should create correct directory structure', () => {
      const path = createCachePath('abcdef1234567890');
      expect(path).toBe('.kvcache/ab/cd/ef1234567890.json');
    });
  });

  describe('escapeTextForPrompt', () => {
    it('should escape backslashes', () => {
      const result = escapeTextForPrompt('path\\to\\file');
      expect(result).toBe('path\\\\to\\\\file');
    });

    it('should escape double quotes', () => {
      const result = escapeTextForPrompt('He said "hello"');
      expect(result).toBe('He said \\"hello\\"');
    });

    it('should escape newlines', () => {
      const result = escapeTextForPrompt('line1\nline2');
      expect(result).toBe('line1\\nline2');
    });

    it('should escape carriage returns', () => {
      const result = escapeTextForPrompt('line1\rline2');
      expect(result).toBe('line1\\rline2');
    });

    it('should escape tabs', () => {
      const result = escapeTextForPrompt('col1\tcol2');
      expect(result).toBe('col1\\tcol2');
    });

    it('should escape multiple special characters', () => {
      const result = escapeTextForPrompt('text with "quotes" and\nnewlines\tand\\backslashes');
      expect(result).toBe('text with \\"quotes\\" and\\nnewlines\\tand\\\\backslashes');
    });

    it('should handle text with no special characters', () => {
      const result = escapeTextForPrompt('simple text');
      expect(result).toBe('simple text');
    });

    it('should handle empty string', () => {
      const result = escapeTextForPrompt('');
      expect(result).toBe('');
    });

    it('should handle complex real-world comment with multiple issues', () => {
      // This simulates a comment that could cause JSON parsing errors
      const problematicComment = 'Code snippet:\n```typescript\nconst path = "C:\\\\Users\\\\test";\nconsole.log("Hello\\nWorld");\n```\nThis "breaks" JSON parsing.';
      const result = escapeTextForPrompt(problematicComment);
      
      // Verify the result can be safely used in JSON.stringify
      const testObject = { message: result };
      expect(() => JSON.stringify(testObject)).not.toThrow();
      
      // Verify it escapes all special characters
      expect(result).toContain('\\\\');  // backslashes escaped
      expect(result).toContain('\\"');   // quotes escaped
      expect(result).toContain('\\n');   // newlines escaped
    });
  });
});