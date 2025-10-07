import { readFile } from 'fs/promises';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { IssueRef, FAQResponse, FAQEntryMatch } from './schemas.js';
import { FAQResponseSchema, FAQEntryMatchSchema } from './schemas.js';
import { loadPrompt } from './prompts.js';
import { parseFAQ, type FAQEntry } from './faq-parser.js';

export interface FAQMatchResult {
  /** The FAQ entry that matched */
  entry: FAQEntry;
  /** The confidence score (1-10) */
  confidence: number;
  /** The tailored writeup for the user */
  writeup: string;
  /** The full URL to the FAQ entry including anchor */
  url: string;
}

/**
 * Create an FAQ matcher that uses AI to find matches between issues and FAQ content
 * @param ai The AI wrapper for making completions
 * @param logger Logger for debug messages
 * @param faqFilePath Path to the FAQ markdown file (defaults to 'FAQ.md')
 * @param faqUrl Base URL for the FAQ (e.g., 'https://github.com/microsoft/TypeScript/wiki/FAQ')
 */
export function createFAQMatcher(
  ai: AIWrapper,
  logger: Logger,
  faqFilePath: string = 'FAQ.md',
  faqUrl?: string
) {
  return {
    async checkAllFAQMatches(
      issueTitle: string,
      issueBody: string,
      issueRef: IssueRef
    ): Promise<FAQMatchResult[]> {
      try {
        // Load and parse FAQ content
        const faqContent = await readFile(faqFilePath, 'utf-8');
        const faqEntries = parseFAQ(faqContent);

        logger.debug(`Checking ${faqEntries.length} FAQ entries`);

        const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
        const truncatedBody = issueBody.slice(0, 4000);

        // Check each FAQ entry separately
        const matches: FAQMatchResult[] = [];

        for (const entry of faqEntries) {
          const systemPrompt = await loadPrompt('faq-entry-match-system');
          const userPrompt = await loadPrompt('faq-entry-match-user', {
            issueTitle,
            issueBody: truncatedBody,
            faqContent: entry.content,
          });

          const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt },
          ];

          const response = await ai.structuredCompletion(messages, FAQEntryMatchSchema, {
            maxTokens: 500,
            context: `Check FAQ entry match for ${issueKey}: ${entry.title}`,
          });

          // Unwrap the result from the wrapper object
          const match = response.result;
          if (match.match === 'yes') {
            const url = faqUrl ? `${faqUrl}#${entry.anchor}` : '';
            matches.push({
              entry,
              confidence: match.confidence,
              writeup: match.writeup,
              url,
            });
            logger.debug(`FAQ match: ${entry.title} (confidence: ${match.confidence})`);
          }
        }

        // Sort by confidence (highest first)
        matches.sort((a, b) => b.confidence - a.confidence);

        return matches;
      } catch (error) {
        logger.debug(`FAQ checking failed: ${error}`);
        return [];
      }
    },
  };
}
