#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, escapeTextForPrompt } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, SuggestionSummarySchema, type IssueRef, type GitHubIssue, type Config, type SuggestionSummary } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: resummarize-suggestion <issue-ref>');
      console.error('Example: resummarize-suggestion Microsoft/TypeScript#202');
      console.error('Example: resummarize-suggestion https://github.com/Microsoft/TypeScript/issues/202');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Resummarizing suggestion: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load the issue data
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue: GitHubIssue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.error(`Issue data not found at ${issueFilePath}. Run fetch-issue first.`);
      process.exit(1);
    }

    // Process the suggestion
    const summary = await processSuggestion(ai, issue, issueRef, config, logger);

    // Generate markdown output
    const markdown = generateMarkdown(summary, issue, issueRef);

    // Write to .working/actions
    const outputPath = `.working/actions/${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.suggestion-summary.md`;
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, markdown);

    logger.info(`Suggestion summary written to ${outputPath}`);
    logger.info(`Processed ${issue.comments.length} comments`);
    logger.info(`Found ${summary.contributions.length} contributions`);

  } catch (error) {
    logger.error(`Failed to resummarize suggestion: ${error}`);
    process.exit(1);
  }
}

async function processSuggestion(
  ai: unknown,
  issue: GitHubIssue,
  issueRef: IssueRef,
  config: Config,
  logger: unknown
): Promise<SuggestionSummary> {
  const aiWrapper = ai as { structuredCompletion: <T>(messages: Array<{ role: string; content: string }>, schema: unknown, options?: { maxTokens?: number; context?: string }) => Promise<T> };
  const log = logger as { info: (msg: string) => void; debug: (msg: string) => void };

  // Step 1: Create initial summary from issue body
  log.info('Creating initial summary from issue body...');
  
  const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
  
  const systemPrompt = await loadPrompt('resummarize-suggestion-system');
  const initialPrompt = await loadPrompt('resummarize-suggestion-initial', {
    issueNumber: String(issue.number),
    issueTitle: escapeTextForPrompt(issue.title),
    body: escapeTextForPrompt(body),
  });

  let currentSummary = await aiWrapper.structuredCompletion<SuggestionSummary>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialPrompt },
    ],
    SuggestionSummarySchema,
    {
      maxTokens: 2000,
      context: `Initial summary for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
    }
  );

  log.debug(`Initial summary created with ${currentSummary.contributions.length} contributions`);

  // Step 2: Iterate through comments, refining the summary
  for (let i = 0; i < issue.comments.length; i++) {
    const comment = issue.comments[i]!;
    log.info(`Processing comment ${i + 1}/${issue.comments.length} by ${comment.user.login}...`);

    const commentBody = comment.body.slice(0, config.github.maxCommentLength);
    
    const refinePrompt = await loadPrompt('resummarize-suggestion-refine', {
      currentSummary: JSON.stringify(currentSummary, null, 2),
      commentNumber: String(i + 1),
      commentAuthor: comment.user.login,
      authorAssociation: comment.author_association,
      commentBody: escapeTextForPrompt(commentBody),
    });

    currentSummary = await aiWrapper.structuredCompletion<SuggestionSummary>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: refinePrompt },
      ],
      SuggestionSummarySchema,
      {
        maxTokens: 3000,
        context: `Refine summary with comment ${i + 1} for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
      }
    );

    log.debug(`Updated summary now has ${currentSummary.contributions.length} contributions`);
  }

  log.info('Summary refinement complete');
  return currentSummary;
}

function generateMarkdown(summary: SuggestionSummary, issue: GitHubIssue, issueRef: IssueRef): string {
  const lines: string[] = [];
  
  lines.push(`# Suggestion Summary: ${issue.title}`);
  lines.push('');
  lines.push(`**Issue:** ${formatIssueRef(issueRef)}`);
  lines.push(`**Status:** ${issue.state}`);
  lines.push('');
  
  lines.push('## Suggestion');
  lines.push('');
  lines.push(summary.suggestion);
  lines.push('');
  
  if (summary.contributions.length > 0) {
    lines.push('## Contributions');
    lines.push('');
    
    for (let i = 0; i < summary.contributions.length; i++) {
      const contribution = summary.contributions[i]!;
      lines.push(`### Contribution ${i + 1}`);
      lines.push('');
      lines.push(`**By:** ${contribution.contributedBy.join(', ')}`);
      lines.push('');
      lines.push(contribution.body);
      lines.push('');
      
      if (contribution.followUps && contribution.followUps.length > 0) {
        lines.push('**Follow-ups:**');
        lines.push('');
        for (const followUp of contribution.followUps) {
          lines.push(`- **${followUp.contributedBy.join(', ')}:** ${followUp.body}`);
        }
        lines.push('');
      }
    }
  }
  
  if (summary.concerns) {
    lines.push('## Maintainer Concerns');
    lines.push('');
    lines.push(summary.concerns);
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by resummarize-suggestion on ${new Date().toISOString()}*`);
  
  return lines.join('\n');
}

main().catch(console.error);
