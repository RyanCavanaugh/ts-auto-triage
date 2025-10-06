import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdir, writeFile, rm } from 'fs/promises';
import { createFAQMatcher } from '../lib/faq-matcher.js';
import type { AIWrapper } from '../lib/ai-wrapper.js';
import type { Logger } from '../lib/utils.js';
import type { IssueRef } from '../lib/schemas.js';

describe('First Response Integration', () => {
  const tmpDir = '/tmp/first-response-integration-test';
  const faqPath = `${tmpDir}/FAQ.md`;

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

  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('should merge multiple FAQ responses into a single comment', async () => {
    // Create a realistic FAQ file with multiple sections
    await writeFile(faqPath, `# Frequently Asked Questions

### Why can't I use typeof T in my generic function?

> I want to write some code like this:
> \`\`\`ts
> function doSomething<T>(x: T) {
>   let xType = typeof T; // Error
> }
> \`\`\`

Generics are erased during compilation. This means there is no *value* \`T\` at runtime inside \`doSomething\`.

The normal pattern is to use a construct signature and provide it as a parameter.

### Why doesn't type inference work on this interface?

> I wrote some code and expected type inference to work:
> \`\`\`ts
> interface Named<T> {
>   name: string;
> }
> function findByName<T>(x: Named<T>): T {
>   return undefined;
> }
> \`\`\`

TypeScript uses a structural type system. When inferring the type of \`T\`, we try to find *members* of type \`T\` on the argument to figure out what \`T\` should be.

Because there are no members which use \`T\`, there is nothing to infer from.
`);

    let callIndex = 0;
    const mockAI: AIWrapper = {
      structuredCompletion: jest.fn().mockImplementation(async () => {
        const responses = [
          {
            match: 'yes' as const,
            confidence: 9,
            writeup: 'Your issue is asking about using `typeof T` in a generic function. This is a common question!\n\nIn TypeScript, generic type parameters like `T` only exist at compile time and are erased during compilation. At runtime, there is no `T` value to check with `typeof`.\n\nThe standard solution is to pass a constructor function as a parameter instead, which gives you a runtime value to work with.',
          },
          {
            match: 'no' as const,
          },
        ];
        return responses[callIndex++ % responses.length];
      }),
    } as unknown as AIWrapper;

    const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

    const matches = await faqMatcher.checkAllFAQMatches(
      "Why doesn't typeof T work in my generic function?",
      'I am trying to use typeof T in my generic function but getting an error. Can you help?',
      mockIssueRef
    );

    // Should have one match
    expect(matches).toHaveLength(1);
    expect(matches[0]!.confidence).toBe(9);
    expect(matches[0]!.entry.title).toBe("Why can't I use typeof T in my generic function?");
    expect(matches[0]!.writeup).toContain('generic type parameters');
    expect(matches[0]!.writeup).toContain('erased during compilation');

    // Verify the merged comment format
    let mergedComment = '## FAQ Responses\n\n';
    for (const match of matches) {
      mergedComment += `### ${match.entry.title}\n\n`;
      mergedComment += `${match.writeup}\n\n`;
    }

    expect(mergedComment).toContain('## FAQ Responses');
    expect(mergedComment).toContain("### Why can't I use typeof T in my generic function?");
    expect(mergedComment).toContain('generic type parameters');
  });

  test('should create a combined comment with FAQ responses and similar issues', async () => {
    await writeFile(faqPath, `# FAQ

### Test FAQ Entry

This is a test FAQ entry that addresses the user's question.
`);

    const mockAI: AIWrapper = {
      structuredCompletion: jest.fn().mockResolvedValue({
        match: 'yes' as const,
        confidence: 8,
        writeup: 'This FAQ entry addresses your concern about XYZ.',
      }),
    } as unknown as AIWrapper;

    const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

    const faqMatches = await faqMatcher.checkAllFAQMatches(
      'Test Issue',
      'Test issue body',
      mockIssueRef
    );

    // Simulate similar issues
    const similarIssues = [
      '🔥 #42 (85% similar): Similar issue about XYZ',
      '#123 (65% similar): Another related issue',
    ];

    // Build merged comment
    let combinedComment = '';

    if (faqMatches.length > 0) {
      combinedComment += '## FAQ Responses\n\n';
      for (const match of faqMatches) {
        combinedComment += `### ${match.entry.title}\n\n`;
        combinedComment += `${match.writeup}\n\n`;
      }
    }

    if (similarIssues.length > 0) {
      if (combinedComment) {
        combinedComment += '---\n\n';
      }
      combinedComment += '## Similar Issues\n\n';
      combinedComment += `Here are the most similar issues I found:\n\n${similarIssues.map(s => `- ${s}`).join('\n')}\n\n`;
      combinedComment += 'Please check if any of these resolve your issue before proceeding.\n';
    }

    // Verify the structure
    expect(combinedComment).toContain('## FAQ Responses');
    expect(combinedComment).toContain('### Test FAQ Entry');
    expect(combinedComment).toContain('This FAQ entry addresses your concern');
    expect(combinedComment).toContain('---');
    expect(combinedComment).toContain('## Similar Issues');
    expect(combinedComment).toContain('🔥 #42');
    expect(combinedComment).toContain('#123');
    expect(combinedComment).toContain('Please check if any of these resolve your issue');
  });

  test('should handle case with no FAQ matches but similar issues', async () => {
    await writeFile(faqPath, `# FAQ

### Unrelated FAQ Entry

This does not match the issue.
`);

    const mockAI: AIWrapper = {
      structuredCompletion: jest.fn().mockResolvedValue({
        match: 'no' as const,
      }),
    } as unknown as AIWrapper;

    const faqMatcher = createFAQMatcher(mockAI, mockLogger, faqPath);

    const faqMatches = await faqMatcher.checkAllFAQMatches(
      'Test Issue',
      'Test issue body',
      mockIssueRef
    );

    expect(faqMatches).toHaveLength(0);

    // Simulate similar issues
    const similarIssues = ['#100 (70% similar): Related issue'];

    // Build merged comment
    let combinedComment = '';

    if (faqMatches.length > 0) {
      combinedComment += '## FAQ Responses\n\n';
    }

    if (similarIssues.length > 0) {
      if (combinedComment) {
        combinedComment += '---\n\n';
      }
      combinedComment += '## Similar Issues\n\n';
      combinedComment += `Here are the most similar issues I found:\n\n${similarIssues.map(s => `- ${s}`).join('\n')}\n\n`;
      combinedComment += 'Please check if any of these resolve your issue before proceeding.\n';
    }

    // Should only have similar issues section
    expect(combinedComment).not.toContain('## FAQ Responses');
    expect(combinedComment).toContain('## Similar Issues');
    expect(combinedComment).toContain('#100');
  });

  test('should sort FAQ matches by confidence descending', async () => {
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
          { match: 'yes' as const, confidence: 3, writeup: 'Low confidence' },
          { match: 'yes' as const, confidence: 9, writeup: 'High confidence' },
          { match: 'yes' as const, confidence: 6, writeup: 'Medium confidence' },
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

    // Should be sorted by confidence descending
    expect(matches).toHaveLength(3);
    expect(matches[0]!.confidence).toBe(9);
    expect(matches[0]!.entry.title).toBe('High Confidence Match');
    expect(matches[1]!.confidence).toBe(6);
    expect(matches[1]!.entry.title).toBe('Medium Confidence Match');
    expect(matches[2]!.confidence).toBe(3);
    expect(matches[2]!.entry.title).toBe('Low Confidence Match');
  });
});
