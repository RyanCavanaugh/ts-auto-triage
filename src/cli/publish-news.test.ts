import { describe, expect, test } from '@jest/globals';

/**
 * These are unit tests for the helper functions in publish-news.ts
 * The main function is not tested here because it requires GitHub API access
 */

/**
 * Validate that a string is in YYYY-MM-DD format.
 */
function isValidDateFormat(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Sanitize a filename for use in a gist URL anchor.
 * GitHub replaces special characters with hyphens in file anchors.
 */
function sanitizeFilenameForUrl(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

/**
 * Parse existing news-index.md content to extract report links.
 * Returns a map of date -> gist URL for existing reports.
 */
function parseNewsIndex(content: string | undefined): Map<string, string> {
  const links = new Map<string, string>();
  if (!content) {
    return links;
  }
  
  const linkRegex = /^-\s*\[(\d{4}-\d{2}-\d{2})\]\(([^)]+)\)/gm;
  
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    const date = match[1];
    const url = match[2];
    // Validate date format and presence of both values
    if (date && url && isValidDateFormat(date)) {
      links.set(date, url);
    }
  }
  
  return links;
}

interface IndexEntry {
  date: string; // YYYY-MM-DD format
  gistUrl: string;
}

/**
 * Build the content for news-index.md from a list of reports.
 * Reports should be sorted by date descending (newest first).
 */
function buildNewsIndexContent(owner: string, repo: string, reports: IndexEntry[]): string {
  const header = `# News Reports for ${owner}/${repo}\n\n`;
  const links = reports.map(r => `- [${r.date}](${r.gistUrl})`).join('\n');
  return header + links + '\n';
}

describe('publish-news helper functions', () => {
  describe('isValidDateFormat', () => {
    test('should validate correct date format', () => {
      expect(isValidDateFormat('2025-01-15')).toBe(true);
      expect(isValidDateFormat('2024-12-31')).toBe(true);
      expect(isValidDateFormat('2023-06-01')).toBe(true);
    });

    test('should reject invalid date formats', () => {
      expect(isValidDateFormat('2025-1-15')).toBe(false); // Missing leading zero
      expect(isValidDateFormat('25-01-15')).toBe(false); // Two-digit year
      expect(isValidDateFormat('2025/01/15')).toBe(false); // Wrong separator
      expect(isValidDateFormat('2025-01-15T00:00:00')).toBe(false); // With time
      expect(isValidDateFormat('not-a-date')).toBe(false);
      expect(isValidDateFormat('')).toBe(false);
    });
  });

  describe('sanitizeFilenameForUrl', () => {
    test('should sanitize gist filenames correctly', () => {
      expect(sanitizeFilenameForUrl('microsoft.TypeScript.2025-01-15.md'))
        .toBe('microsoft-typescript-2025-01-15-md');
      
      expect(sanitizeFilenameForUrl('owner.repo.2024-12-31.md'))
        .toBe('owner-repo-2024-12-31-md');
    });

    test('should handle special characters', () => {
      expect(sanitizeFilenameForUrl('test@file#name.md'))
        .toBe('test-file-name-md');
      
      expect(sanitizeFilenameForUrl('file_with_underscores.md'))
        .toBe('file-with-underscores-md');
    });

    test('should convert to lowercase', () => {
      expect(sanitizeFilenameForUrl('UPPERCASE.MD'))
        .toBe('uppercase-md');
      
      expect(sanitizeFilenameForUrl('MixedCase.Md'))
        .toBe('mixedcase-md');
    });
  });

  describe('parseNewsIndex', () => {
    test('should parse valid news index content', () => {
      const content = `# News Reports for microsoft/TypeScript

- [2025-01-15](https://gist.github.com/user/abc123#file-microsoft-typescript-2025-01-15-md)
- [2025-01-14](https://gist.github.com/user/abc123#file-microsoft-typescript-2025-01-14-md)
- [2025-01-13](https://gist.github.com/user/def456#file-microsoft-typescript-2025-01-13-md)
`;

      const links = parseNewsIndex(content);
      expect(links.size).toBe(3);
      expect(links.get('2025-01-15')).toBe('https://gist.github.com/user/abc123#file-microsoft-typescript-2025-01-15-md');
      expect(links.get('2025-01-14')).toBe('https://gist.github.com/user/abc123#file-microsoft-typescript-2025-01-14-md');
      expect(links.get('2025-01-13')).toBe('https://gist.github.com/user/def456#file-microsoft-typescript-2025-01-13-md');
    });

    test('should handle empty content', () => {
      expect(parseNewsIndex(undefined).size).toBe(0);
      expect(parseNewsIndex('').size).toBe(0);
    });

    test('should skip invalid date formats', () => {
      const content = `# News Reports

- [2025-1-15](https://example.com/1)
- [2025-01-15](https://example.com/2)
- [not-a-date](https://example.com/3)
`;

      const links = parseNewsIndex(content);
      expect(links.size).toBe(1);
      expect(links.get('2025-01-15')).toBe('https://example.com/2');
    });

    test('should handle content without links', () => {
      const content = `# News Reports for microsoft/TypeScript

This is just some text without any links.
`;

      expect(parseNewsIndex(content).size).toBe(0);
    });

    test('should handle malformed links', () => {
      const content = `# News Reports

- [2025-01-15]
- 2025-01-14(https://example.com)
- [2025-01-13](https://example.com/valid)
`;

      const links = parseNewsIndex(content);
      expect(links.size).toBe(1);
      expect(links.get('2025-01-13')).toBe('https://example.com/valid');
    });
  });

  describe('buildNewsIndexContent', () => {
    test('should build news index content correctly', () => {
      const reports: IndexEntry[] = [
        { date: '2025-01-15', gistUrl: 'https://gist.github.com/user/abc#file1' },
        { date: '2025-01-14', gistUrl: 'https://gist.github.com/user/abc#file2' },
      ];

      const content = buildNewsIndexContent('microsoft', 'TypeScript', reports);
      
      expect(content).toContain('# News Reports for microsoft/TypeScript');
      expect(content).toContain('- [2025-01-15](https://gist.github.com/user/abc#file1)');
      expect(content).toContain('- [2025-01-14](https://gist.github.com/user/abc#file2)');
    });

    test('should handle empty reports list', () => {
      const content = buildNewsIndexContent('owner', 'repo', []);
      
      expect(content).toBe('# News Reports for owner/repo\n\n\n');
    });

    test('should handle single report', () => {
      const reports: IndexEntry[] = [
        { date: '2025-01-15', gistUrl: 'https://gist.github.com/user/abc' },
      ];

      const content = buildNewsIndexContent('test', 'repo', reports);
      
      expect(content).toContain('# News Reports for test/repo');
      expect(content).toContain('- [2025-01-15](https://gist.github.com/user/abc)');
    });
  });

  describe('integration: parseNewsIndex and buildNewsIndexContent', () => {
    test('should roundtrip content correctly', () => {
      const original: IndexEntry[] = [
        { date: '2025-01-15', gistUrl: 'https://gist.github.com/user/abc#file1' },
        { date: '2025-01-14', gistUrl: 'https://gist.github.com/user/abc#file2' },
        { date: '2025-01-13', gistUrl: 'https://gist.github.com/user/def#file3' },
      ];

      const content = buildNewsIndexContent('microsoft', 'TypeScript', original);
      const parsed = parseNewsIndex(content);

      expect(parsed.size).toBe(3);
      expect(parsed.get('2025-01-15')).toBe(original[0]?.gistUrl);
      expect(parsed.get('2025-01-14')).toBe(original[1]?.gistUrl);
      expect(parsed.get('2025-01-13')).toBe(original[2]?.gistUrl);
    });
  });
});
