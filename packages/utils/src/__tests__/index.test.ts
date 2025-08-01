import { parseIssueRef, hashString, formatCacheKey, capText } from '../index.js';

describe('parseIssueRef', () => {
  test('parses short format', () => {
    const result = parseIssueRef('Microsoft/TypeScript#9998');
    expect(result).toEqual({
      owner: 'Microsoft',
      repo: 'TypeScript',
      number: 9998
    });
  });

  test('parses URL format', () => {
    const result = parseIssueRef('https://github.com/Microsoft/TypeScript/issues/9998');
    expect(result).toEqual({
      owner: 'Microsoft',
      repo: 'TypeScript',
      number: 9998
    });
  });

  test('parses PR URL format', () => {
    const result = parseIssueRef('https://github.com/Microsoft/TypeScript/pull/9998');
    expect(result).toEqual({
      owner: 'Microsoft',
      repo: 'TypeScript',
      number: 9998
    });
  });

  test('throws on invalid format', () => {
    expect(() => parseIssueRef('invalid')).toThrow('Invalid issue reference format');
  });
});

describe('hashString', () => {
  test('produces consistent hash', () => {
    const hash1 = hashString('test');
    const hash2 = hashString('test');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{8}$/);
  });

  test('produces different hashes for different strings', () => {
    const hash1 = hashString('test1');
    const hash2 = hashString('test2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('formatCacheKey', () => {
  test('formats cache key correctly', () => {
    const result = formatCacheKey('test');
    expect(result.dir).toMatch(/^[0-9a-f]{2}$/);
    expect(result.subdir).toMatch(/^[0-9a-f]{2}$/);
    expect(result.filename).toMatch(/^[0-9a-f]+\.json$/);
  });
});

describe('capText', () => {
  test('returns text unchanged if under limit', () => {
    const text = 'short text';
    const result = capText(text, 100);
    expect(result).toBe(text);
  });

  test('truncates long text', () => {
    const text = 'x'.repeat(1000);
    const result = capText(text, 100);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain('[Content truncated for length]');
  });
});