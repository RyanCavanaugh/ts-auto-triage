import { parseIssueRef, formatIssueRef, createCacheKey, createCachePath, escapeTextForPrompt, formatActionsAsMarkdown, parseRepoRef } from './utils.js';
import type { IssueAction } from './schemas.js';

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

    it('should parse bare issue number with defaultRepo', () => {
      const result = parseIssueRef('#1234', 'Microsoft/TypeScript');
      expect(result).toEqual({
        owner: 'Microsoft',
        repo: 'TypeScript',
        number: 1234,
      });
    });

    it('should throw error for bare issue number without defaultRepo', () => {
      expect(() => parseIssueRef('#1234')).toThrow('requires a default repository');
    });

    it('should throw error for invalid format', () => {
      expect(() => parseIssueRef('invalid-format')).toThrow('Invalid issue reference format');
    });
  });

  describe('parseRepoRef', () => {
    it('should parse valid repo reference', () => {
      const [owner, repo] = parseRepoRef('Microsoft/TypeScript');
      expect(owner).toBe('Microsoft');
      expect(repo).toBe('TypeScript');
    });

    it('should throw error for invalid format without slash', () => {
      expect(() => parseRepoRef('MicrosoftTypeScript')).toThrow('Invalid repository format');
    });

    it('should throw error for invalid format with too many parts', () => {
      expect(() => parseRepoRef('Microsoft/TypeScript/extra')).toThrow('Invalid repository format');
    });

    it('should throw error for empty parts', () => {
      expect(() => parseRepoRef('/TypeScript')).toThrow('Invalid repository format');
      expect(() => parseRepoRef('Microsoft/')).toThrow('Invalid repository format');
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

  describe('formatActionsAsMarkdown', () => {
    it('should format add_label action', () => {
      const actions: IssueAction[] = [
        { kind: 'add_label', label: 'Bug' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Add label "Bug"');
    });

    it('should format remove_label action', () => {
      const actions: IssueAction[] = [
        { kind: 'remove_label', label: 'Help wanted' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Remove label "Help wanted"');
    });

    it('should format close_issue action with completed', () => {
      const actions: IssueAction[] = [
        { kind: 'close_issue', reason: 'completed' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Close issue as completed');
    });

    it('should format close_issue action with not_planned', () => {
      const actions: IssueAction[] = [
        { kind: 'close_issue', reason: 'not_planned' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Close issue as not planned');
    });

    it('should format add_comment action', () => {
      const actions: IssueAction[] = [
        { kind: 'add_comment', body: 'This is a test comment' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('Post comment:\n---\nThis is a test comment\n---');
    });

    it('should escape closing star-slash in comment body', () => {
      const actions: IssueAction[] = [
        { kind: 'add_comment', body: 'This has a closing */ sequence' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('Post comment:\n---\nThis has a closing *\\/ sequence\n---');
      expect(result).not.toContain('*/');
    });

    it('should format set_milestone action', () => {
      const actions: IssueAction[] = [
        { kind: 'set_milestone', milestone: 'v2.0' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Set milestone "v2.0"');
    });

    it('should format assign_user action', () => {
      const actions: IssueAction[] = [
        { kind: 'assign_user', user: 'octocat' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Assign to user "octocat"');
    });

    it('should format multiple actions', () => {
      const actions: IssueAction[] = [
        { kind: 'add_label', label: 'Bug' },
        { kind: 'remove_label', label: 'Help wanted' },
        { kind: 'add_comment', body: 'Thank you for reporting this issue.' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('- Add label "Bug"\n- Remove label "Help wanted"\nPost comment:\n---\nThank you for reporting this issue.\n---');
    });

    it('should handle empty actions array', () => {
      const actions: IssueAction[] = [];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('');
    });

    it('should format multi-line comment body', () => {
      const actions: IssueAction[] = [
        { kind: 'add_comment', body: 'Line 1\nLine 2\nLine 3' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('Post comment:\n---\nLine 1\nLine 2\nLine 3\n---');
    });

    it('should escape multiple closing star-slash sequences', () => {
      const actions: IssueAction[] = [
        { kind: 'add_comment', body: 'First */ and second */ sequence' }
      ];
      const result = formatActionsAsMarkdown(actions);
      expect(result).toBe('Post comment:\n---\nFirst *\\/ and second *\\/ sequence\n---');
      expect(result).not.toContain('*/');
    });
  });
});