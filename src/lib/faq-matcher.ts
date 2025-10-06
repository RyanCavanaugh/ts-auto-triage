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
}

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

  /**
   * Check each FAQ entry separately and return all matches
   * @param issueTitle The title of the issue
   * @param issueBody The body/description of the issue
   * @param issueRef Reference to the issue (owner/repo#number)
   * @returns Array of FAQ matches sorted by confidence (highest first)
   */
  checkAllFAQMatches(
    issueTitle: string,
    issueBody: string,
    issueRef: IssueRef
  ): Promise<FAQMatchResult[]>;
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
            faqEntry: entry.content,
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
            matches.push({
              entry,
              confidence: match.confidence,
              writeup: match.writeup,
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
