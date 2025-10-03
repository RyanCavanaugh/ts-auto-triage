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
