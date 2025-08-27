import { parseIssueRef, formatIssueRef, createCacheKey, createCachePath } from './utils.js';

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
});