import { readFile } from 'fs/promises';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { IssueRef, FAQEntryCheck, FAQEntryWriteup } from './schemas.js';
import { FAQEntryCheckSchema, FAQEntryWriteupSchema } from './schemas.js';
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

        // Check each FAQ entry separately using two-stage approach
        const matches: FAQMatchResult[] = [];

        for (const entry of faqEntries) {
          // Stage 1: Check if this FAQ entry matches
          const checkSystemPrompt = await loadPrompt('faq-entry-check-system');
          const checkUserPrompt = await loadPrompt('faq-entry-check-user', {
            issueTitle,
            issueBody: truncatedBody,
            faqContent: entry.content,
          });

          const checkMessages = [
            { role: 'system' as const, content: checkSystemPrompt },
            { role: 'user' as const, content: checkUserPrompt },
          ];

          const checkResponse = await ai.completion(checkMessages, {
            jsonSchema: FAQEntryCheckSchema,
            maxTokens: 200,
            context: `Check FAQ entry match for ${issueKey}: ${entry.title}`,
            effort: 'Low',
          });

          // Unwrap the result from the wrapper object
          const check = checkResponse.result;
          if (check.match === 'no') {
            // No match, skip to next entry
            continue;
          }

          // Stage 2: Generate writeup for this matched entry
          const writeupSystemPrompt = await loadPrompt('faq-entry-writeup-system');
          const writeupUserPrompt = await loadPrompt('faq-entry-writeup-user', {
            issueTitle,
            issueBody: truncatedBody,
            faqContent: entry.content,
          });

          const writeupMessages = [
            { role: 'system' as const, content: writeupSystemPrompt },
            { role: 'user' as const, content: writeupUserPrompt },
          ];

          const writeupResponse = await ai.completion(writeupMessages, {
            jsonSchema: FAQEntryWriteupSchema,
            maxTokens: 500,
            context: `Generate FAQ writeup for ${issueKey}: ${entry.title}`,
            effort: 'High',
          });

          const url = faqUrl ? `${faqUrl}#${entry.anchor}` : '';
          matches.push({
            entry,
            confidence: check.confidence,
            writeup: writeupResponse.writeup,
            url,
          });
          logger.debug(`FAQ match: ${entry.title} (confidence: ${check.confidence})`);
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
