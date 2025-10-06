import { describe, test, expect, jest } from '@jest/globals';
import { createFAQMatcher } from './faq-matcher.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { IssueRef } from './schemas.js';
import { writeFile, mkdir, rm } from 'fs/promises';

describe('FAQ Matcher', () => {
  const mockLogger: Logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  const mockIssueRef: IssueRef = {
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
  };

  describe('checkFAQMatch (legacy)', () => {
    test('should return null when FAQ file does not exist', async () => {
      const mockAI: AIWrapper = {} as AIWrapper;
      const faqMatcher = createFAQMatcher(mockAI, mockLogger, '/nonexistent/FAQ.md');

      const result = await faqMatcher.checkFAQMatch(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    test('should return response when FAQ match is found', async () => {
      // Create a temporary FAQ file
      const tmpDir = '/tmp/faq-test';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, '# FAQ\n\n## Question 1\nAnswer 1');

      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockResolvedValue({
          has_match: true,
          response: 'This is addressed in FAQ section 1',
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const result = await faqMatcher.checkFAQMatch(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(result).toBe('This is addressed in FAQ section 1');
      expect(mockAI.structuredCompletion).toHaveBeenCalled();

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should return null when FAQ match is not found', async () => {
      // Create a temporary FAQ file
      const tmpDir = '/tmp/faq-test-2';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, '# FAQ\n\n## Question 1\nAnswer 1');

      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockResolvedValue({
          has_match: false,
          response: null,
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const result = await faqMatcher.checkFAQMatch(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(result).toBeNull();
      expect(mockAI.structuredCompletion).toHaveBeenCalled();

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should handle null response correctly when has_match is false', async () => {
      const tmpDir = '/tmp/faq-test-null';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, '# FAQ\n\n## Question 1\nAnswer 1');

      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockResolvedValue({
          has_match: false,
          response: null, // Explicitly null as OpenAI API returns
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const result = await faqMatcher.checkFAQMatch(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(result).toBeNull();
      expect(mockAI.structuredCompletion).toHaveBeenCalled();

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should truncate issue body to 4000 characters', async () => {
      const tmpDir = '/tmp/faq-test-3';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, '# FAQ\n\n## Question 1\nAnswer 1');

      let capturedBody = '';
      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockImplementation(async (messages) => {
          // Capture the user prompt to verify body truncation
          const userMessage = messages.find((m: { role: string }) => m.role === 'user');
          if (userMessage) {
            capturedBody = userMessage.content;
          }
          return {
            has_match: false,
            response: null,
          };
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      // Create a body longer than 4000 characters
      const longBody = 'x'.repeat(5000);
      await faqMatcher.checkFAQMatch(
        'Test Issue',
        longBody,
        mockIssueRef
      );

      // The captured prompt should not contain the full 5000 character body
      expect(capturedBody.length).toBeLessThan(5000);
      expect(mockAI.structuredCompletion).toHaveBeenCalled();

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe('checkAllFAQMatches (new)', () => {
    test('should return empty array when FAQ file does not exist', async () => {
      const mockAI: AIWrapper = {} as AIWrapper;
      const faqMatcher = createFAQMatcher(mockAI, mockLogger, '/nonexistent/FAQ.md');

      const result = await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(result).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    test('should check each FAQ entry separately', async () => {
      const tmpDir = '/tmp/faq-test-multi';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, `# FAQ

### Question 1
Answer 1

### Question 2
Answer 2

### Question 3
Answer 3
`);

      let callCount = 0;
      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockImplementation(async () => {
          callCount++;
          return { match: 'no' };
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      // Should be called once for each FAQ entry (3 entries)
      expect(callCount).toBe(3);

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should return matches sorted by confidence', async () => {
      const tmpDir = '/tmp/faq-test-matches';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, `# FAQ

### Low Confidence Match
Answer 1

### High Confidence Match
Answer 2

### Medium Confidence Match
Answer 3
`);

      let callIndex = 0;
      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockImplementation(async () => {
          const responses = [
            { match: 'yes' as const, confidence: 3, writeup: 'Low confidence response' },
            { match: 'yes' as const, confidence: 9, writeup: 'High confidence response' },
            { match: 'yes' as const, confidence: 6, writeup: 'Medium confidence response' },
          ];
          return responses[callIndex++];
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const matches = await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(matches).toHaveLength(3);
      // Should be sorted by confidence descending
      expect(matches[0]!.confidence).toBe(9);
      expect(matches[0]!.writeup).toBe('High confidence response');
      expect(matches[1]!.confidence).toBe(6);
      expect(matches[2]!.confidence).toBe(3);

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should only return matches, not non-matches', async () => {
      const tmpDir = '/tmp/faq-test-filtered';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, `# FAQ

### Match Entry
This matches

### No Match Entry
This does not match

### Another Match
This also matches
`);

      let callIndex = 0;
      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockImplementation(async () => {
          const responses = [
            { match: 'yes' as const, confidence: 7, writeup: 'First match' },
            { match: 'no' as const },
            { match: 'yes' as const, confidence: 8, writeup: 'Second match' },
          ];
          return responses[callIndex++];
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const matches = await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      expect(matches).toHaveLength(2);
      expect(matches[0]!.confidence).toBe(8);
      expect(matches[1]!.confidence).toBe(7);

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });

    test('should truncate issue body to 4000 characters', async () => {
      const tmpDir = '/tmp/faq-test-truncate';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, `# FAQ

### Test Entry
Test answer
`);

      let capturedBody = '';
      const mockAI: AIWrapper = {
        structuredCompletion: jest.fn().mockImplementation(async (messages) => {
          const userMessage = messages.find((m: { role: string }) => m.role === 'user');
          if (userMessage) {
            capturedBody = userMessage.content;
          }
          return { match: 'no' };
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const longBody = 'x'.repeat(5000);
      await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        longBody,
        mockIssueRef
      );

      // Verify body was truncated in the prompt
      expect(capturedBody.length).toBeLessThan(5000);

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
