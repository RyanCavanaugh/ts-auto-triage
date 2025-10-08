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

  describe('checkAllFAQMatches', () => {
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
        completion: jest.fn().mockImplementation(async () => {
          callCount++;
          // All entries return no match (stage 1 check only)
          return { result: { match: 'no', reasoning: 'Not a match' } };
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      // Should be called once for each FAQ entry (3 entries, stage 1 check only)
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
        completion: jest.fn().mockImplementation(async () => {
          // Two-stage responses: check then writeup for each matched entry
          const responses = [
            // Entry 1: Low confidence - check
            { result: { match: 'yes' as const, confidence: 3, reasoning: 'Match' } },
            // Entry 1: Low confidence - writeup
            { writeup: 'Low confidence response' },
            // Entry 2: High confidence - check
            { result: { match: 'yes' as const, confidence: 9, reasoning: 'Match' } },
            // Entry 2: High confidence - writeup
            { writeup: 'High confidence response' },
            // Entry 3: Medium confidence - check
            { result: { match: 'yes' as const, confidence: 6, reasoning: 'Match' } },
            // Entry 3: Medium confidence - writeup
            { writeup: 'Medium confidence response' },
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
        completion: jest.fn().mockImplementation(async () => {
          const responses = [
            // Entry 1: Match - check
            { result: { match: 'yes' as const, confidence: 7, reasoning: 'Match' } },
            // Entry 1: Match - writeup
            { writeup: 'First match' },
            // Entry 2: No match - check only
            { result: { match: 'no' as const, reasoning: 'Not a match' } },
            // Entry 3: Match - check
            { result: { match: 'yes' as const, confidence: 8, reasoning: 'Match' } },
            // Entry 3: Match - writeup
            { writeup: 'Second match' },
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
        completion: jest.fn().mockImplementation(async (messages) => {
          const userMessage = messages.find((m: { role: string }) => m.role === 'user');
          if (userMessage) {
            capturedBody = userMessage.content;
          }
          return { result: { match: 'no', reasoning: 'Not a match' } };
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

    test('should use two-stage approach: check first, then writeup only if match', async () => {
      const tmpDir = '/tmp/faq-test-two-stage';
      const faqPath = `${tmpDir}/FAQ.md`;
      await mkdir(tmpDir, { recursive: true });
      await writeFile(faqPath, `# FAQ

### Match Entry
This matches

### No Match Entry
This does not match
`);

      const callLog: string[] = [];
      let callCount = 0;
      const mockAI: AIWrapper = {
        completion: jest.fn().mockImplementation(async (messages, schema) => {
          // Track calls by counting - check stage returns discriminated union, writeup returns simple object
          callCount++;
          // Pattern: check, writeup, check (for 2 FAQ entries where 1st matches, 2nd doesn't)
          if (callCount === 1) {
            // First check - matches
            callLog.push('check');
            return { result: { match: 'yes' as const, confidence: 7, reasoning: 'Match' } };
          } else if (callCount === 2) {
            // First writeup
            callLog.push('writeup');
            return { writeup: 'Generated response' };
          } else if (callCount === 3) {
            // Second check - no match
            callLog.push('check');
            return { result: { match: 'no' as const, reasoning: 'Not a match' } };
          }
          throw new Error('Unexpected call count');
        }),
      } as unknown as AIWrapper;

      const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

      const matches = await faqMatcher.checkAllFAQMatches(
        'Test Issue',
        'Test issue body',
        mockIssueRef
      );

      // Should have: check, writeup, check
      expect(callLog).toEqual(['check', 'writeup', 'check']);
      expect(matches).toHaveLength(1);

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
