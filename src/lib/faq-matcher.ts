import { readFile } from 'fs/promises';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { IssueRef, FAQResponse } from './schemas.js';
import { FAQResponseSchema } from './schemas.js';
import { loadPrompt } from './prompts.js';

export interface FAQMatcher {
  /**
   * Check if an issue matches any FAQ entries and return a response if so
   * @param issueTitle The title of the issue
   * @param issueBody The body/description of the issue
   * @param issueRef Reference to the issue (owner/repo#number)
   * @returns A helpful response string if FAQ matches, null otherwise
   */
  checkFAQMatch(
    issueTitle: string,
    issueBody: string,
    issueRef: IssueRef
  ): Promise<string | null>;
}

/**
 * Create an FAQ matcher that uses AI to find matches between issues and FAQ content
 * @param ai The AI wrapper for making completions
 * @param logger Logger for debug messages
 * @param faqFilePath Path to the FAQ markdown file (defaults to 'FAQ.md')
 */
export function createFAQMatcher(
  ai: AIWrapper,
  logger: Logger,
  faqFilePath: string = 'FAQ.md'
): FAQMatcher {
  return {
    async checkFAQMatch(
      issueTitle: string,
      issueBody: string,
      issueRef: IssueRef
    ): Promise<string | null> {
      try {
        // Try to load FAQ content
        const faqContent = await readFile(faqFilePath, 'utf-8');

        const systemPrompt = await loadPrompt('first-response-system');
        const userPrompt = await loadPrompt('first-response-user', {
          issueTitle,
          issueBody: issueBody.slice(0, 4000),
          faqContent,
        });

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userPrompt },
        ];

        const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
        const response = await ai.structuredCompletion(messages, FAQResponseSchema, {
          maxTokens: 500,
          context: `Check FAQ matches for ${issueKey}`,
        });

        return response.has_match ? response.response ?? null : null;
      } catch (error) {
        logger.debug(`FAQ file not found or error reading: ${error}`);
        return null;
      }
    },
  };
}
