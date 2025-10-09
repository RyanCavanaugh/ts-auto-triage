#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, zodToJsonSchema, embeddingToBase64, embeddingFromBase64, calculateCosineSimilarity, getGitHubAuthToken, createAuthenticatedOctokit, formatActionsAsMarkdown } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, ActionFileSchema, SummariesDataSchema, type IssueRef, type Config } from '../lib/schemas.js';
import { createFAQMatcher } from '../lib/faq-matcher.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';
import { createFileLogger } from '../lib/file-logger.js';
import { createLoggingAIWrapper } from '../lib/logging-ai-wrapper.js';

async function main() {
  const logger = createConsoleLogger();

  try {
    // Load configuration first to get defaultRepo
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: first-response <issue-ref>');
      console.error('Example: first-response Microsoft/TypeScript#9998');
      if (config.github.defaultRepo) {
        console.error(`Example: first-response #9998 (uses default repo: ${config.github.defaultRepo})`);
      }
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput, config.github.defaultRepo);

    logger.info(`Checking first response for: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Create file logger for this issue
    const fileLogger = createFileLogger(issueRef, 'first-response');
    await fileLogger.logSection('Initialization');
    await fileLogger.logInfo(`Processing issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    await fileLogger.logInfo('Configuration loaded successfully');

    // Create AI wrapper
    const baseAI = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);
    const ai = createLoggingAIWrapper(baseAI, fileLogger);
    await fileLogger.logInfo('AI wrapper initialized');

    // Load the issue data - fetch if not available locally
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
      await fileLogger.logSection('Issue Data');
      await fileLogger.logInfo(`Loaded issue data from local cache: ${issueFilePath}`);
    } catch {
      await fileLogger.logInfo(`Issue data not found locally, fetching from GitHub...`);
      logger.info(`Issue data not found locally, fetching from GitHub...`);
      
      // Create authenticated Octokit client and issue fetcher
      const authToken = getGitHubAuthToken();
      const octokit = await createAuthenticatedOctokit();
      const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);
      issue = await issueFetcher.fetchIssue(issueRef);
      
      await fileLogger.logInfo(`Successfully fetched issue from GitHub`);
      logger.info(`Successfully fetched issue from GitHub`);
    }

    await fileLogger.logData('Issue Metadata', {
      title: issue.title,
      number: issue.number,
      state: issue.state,
      created_at: issue.created_at,
      user: issue.user.login,
      body_length: issue.body?.length ?? 0,
      comments_count: issue.comments?.length ?? 0,
    });

    // Only process issue body, not comments (as per spec)
    const issueBody = issue.body ?? '';
    if (!issueBody.trim()) {
      await fileLogger.logDecision('No action needed', 'Issue has no body content to analyze');
      await fileLogger.finalize();
      logger.info('Issue has no body content to analyze');
      return;
    }

    logger.info(`Analyzing issue: ${issue.title}`);
    await fileLogger.logSection('Issue Analysis');
    await fileLogger.logInfo(`Issue title: ${issue.title}`);
    await fileLogger.logInfo(`Issue body length: ${issueBody.length} characters`);

    // Create FAQ matcher
    const faqMatcher = createFAQMatcher(ai, logger, 'FAQ.md', config.github.faqUrl);

    // Run FAQ matching and duplicate detection concurrently
    await fileLogger.logSection('FAQ Matching and Duplicate Detection');
    await fileLogger.logInfo('Starting concurrent FAQ matching and duplicate detection...');
    await fileLogger.logInfo('- Checking for FAQ matches');
    await fileLogger.logInfo('- Searching for similar issues');

    const [faqResult, duplicateResult] = await Promise.allSettled([
      // FAQ matching
      faqMatcher.checkAllFAQMatches(issue.title, issueBody, issueRef),
      // Duplicate detection
      findDuplicates(ai, issueBody, issue.title, issueRef, config, fileLogger)
    ]);

    // Process FAQ results
    await fileLogger.logSection('FAQ Matching Results');
    let faqMatches: Awaited<ReturnType<typeof faqMatcher.checkAllFAQMatches>> = [];
    if (faqResult.status === 'fulfilled') {
      faqMatches = faqResult.value;
      if (faqMatches.length > 0) {
        await fileLogger.logDecision(`Found ${faqMatches.length} FAQ match(es)`);
        await fileLogger.logData('FAQ Matches', faqMatches.map(m => ({
          title: m.entry.title,
          confidence: m.confidence,
          writeup_length: m.writeup.length,
        })));
        logger.info(`Found ${faqMatches.length} FAQ match(es)`);
      } else {
        await fileLogger.logDecision('No FAQ matches found');
      }
    } else {
      await fileLogger.logInfo(`FAQ check failed: ${faqResult.reason}`);
      logger.debug(`FAQ check failed: ${faqResult.reason}`);
    }

    // Process duplicate detection results
    await fileLogger.logSection('Duplicate Detection Results');
    let similarIssues: string[] = [];
    if (duplicateResult.status === 'fulfilled') {
      similarIssues = duplicateResult.value;
      await fileLogger.logDecision(`Found ${similarIssues.length} similar issues`);
      if (similarIssues.length > 0) {
        await fileLogger.logData('Similar Issues', similarIssues);
      }
      logger.debug(`Found ${similarIssues.length} similar issues`);
    } else {
      await fileLogger.logInfo(`Similar issue search failed: ${duplicateResult.reason}`);
      logger.debug(`Similar issue search failed: ${duplicateResult.reason}`);
    }

    // Generate combined action if needed
    await fileLogger.logSection('Action Generation');
    const actions = [];

    if (faqMatches.length > 0 || similarIssues.length > 0) {
      await fileLogger.logDecision('Creating combined response action', `FAQ matches: ${faqMatches.length}, Similar issues: ${similarIssues.length}`);
      
      // Merge FAQ responses and duplicate detection into a single comment
      let combinedComment = '';

      combinedComment += `🤖 Thank you for your issue! I've done some analysis to help get you started. This response is automatically generated; feel free to 👍 or 👎 this comment according to its usefulness.\n\n`;

      if (faqMatches.length > 0) {
        combinedComment += '## Possible Relevant FAQs\n\n';
        
        for (const match of faqMatches) {
          if (match.url) {
            combinedComment += `### [${match.entry.title}](${match.url})\n\n`;
          } else {
            combinedComment += `### ${match.entry.title}\n\n`;
          }
          combinedComment += `${match.writeup}\n\n`;
        }
      }

      if (similarIssues.length > 0) {
        if (combinedComment) {
          combinedComment += '---\n\n';
        }
        combinedComment += `## Similar Issues\n\n`;
        combinedComment += `Here are the most similar issues I found:\n\n${similarIssues.map(s => `- ${s}`).join('\n')}\n\n`;
        combinedComment += `If your issue is a duplicate of one of these, feel free to close this issue. Otherwise, no action is needed. Thanks!\n`;
      }

      logger.info('Creating combined response action');
      actions.push({
        kind: 'add_comment' as const,
        body: combinedComment,
      });
      
      await fileLogger.logData('Generated Comment', combinedComment);
    } else {
      await fileLogger.logDecision('No action needed', 'No FAQ matches or similar issues found');
    }

    if (actions.length > 0) {
      // Write action file
      const actionFile = {
        issue_ref: issueRef,
        actions,
      };

      const actionFilePath = `.working/actions/${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`;
      ensureDirectoryExists(actionFilePath);

      const actionFileContent = `/* Proposed actions for ${formatIssueRef(issueRef)}
   AI-generated first response based on FAQ matching and duplicate detection */
${JSON.stringify(actionFile, null, 2)}
/*
${formatActionsAsMarkdown(actions)}
*/`;

      await writeFile(actionFilePath, actionFileContent);
      await fileLogger.logInfo(`Action file written to ${actionFilePath}`);
      await fileLogger.logData('Action File', actionFile);
      logger.info(`Action file written to ${actionFilePath}`);
    } else {
      logger.info('No automatic response needed');
    }

    await fileLogger.finalize();

  } catch (error) {
    logger.error(`Failed to check first response: ${error}`);
    process.exit(1);
  }
}

async function findDuplicates(ai: AIWrapper, issueBody: string, issueTitle: string, issueRef: IssueRef, config: Config, fileLogger: ReturnType<typeof createFileLogger>): Promise<string[]> {
  // Load summaries 
  const summariesContent = await readFile('.data/summaries.json', 'utf-8');
  const summaries = SummariesDataSchema.parse(JSON.parse(summariesContent));

  await fileLogger.logInfo('Creating embedding for current issue...');
  // Create embedding for current issue
  const currentIssueText = `${issueTitle}\n\n${issueBody.slice(0, 2000)}`;
  // Cap the string length for embedding input to avoid API errors
  const cappedText = currentIssueText.length > config.ai.maxEmbeddingInputLength
    ? currentIssueText.slice(0, config.ai.maxEmbeddingInputLength - 3) + '...'
    : currentIssueText;
  const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
  const currentEmbedding = await ai.getEmbedding(cappedText, `Get embedding for current issue ${issueKey}`);

  // Get current issue's summaries for later use
  const currentIssueSummaries = summaries[issueKey] ?? [];

  // Calculate similarities by finding and reading all embedding files
  const similarities: Array<{ issueKey: string; similarity: number; summary: string; summaryIndex: number; currentSummaryIndex: number }> = [];

  // Recursively find all .embeddings.json files in .data directory
  const embeddingFiles = await findEmbeddingFiles('.data');
  await fileLogger.logInfo(`Found ${embeddingFiles.length} embedding files to compare against`);

  for (const filePath of embeddingFiles) {
    // Extract issue key from file path: .data/owner/repo/123.embeddings.json -> owner/repo#123
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const filename = pathParts[pathParts.length - 1]!;
    const repo = pathParts[pathParts.length - 2];
    const owner = pathParts[pathParts.length - 3];

    const numberStr = filename.replace('.embeddings.json', '');
    const number = parseInt(numberStr, 10);

    const fileIssueKey = `${owner}/${repo}#${number}`;

    // Skip self
    const currentIssueKeyStr = `${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}#${issueRef.number}`;
    if (fileIssueKey === currentIssueKeyStr) continue;

    // Read individual embedding file
    const embeddingContent = await readFile(filePath, 'utf-8');
    const embeddingList: string[] = JSON.parse(embeddingContent);

    let bestSim = -Infinity;
    let bestSummaryIndex = -1;
    let bestCurrentSummaryIndex = -1;

    // Compare against all combinations of current and other issue summaries
    for (let otherIdx = 0; otherIdx < embeddingList.length; otherIdx++) {
      const base64 = embeddingList[otherIdx]!;
      const embeddingArray = embeddingFromBase64(base64);

      // Use optimized Float32Array similarity calculation
      const currentEmbeddingFloat32 = new Float32Array(currentEmbedding.embedding);
      const similarity = calculateCosineSimilarity(currentEmbeddingFloat32, embeddingArray);

      if (similarity > bestSim) {
        bestSim = similarity;
        bestSummaryIndex = otherIdx;
        bestCurrentSummaryIndex = 0; // We only have one embedding for current issue
      }
    }

    // Use the best similarity for the issue and the corresponding summary (if available)
    if (bestSummaryIndex >= 0) {
      const summariesForKey = summaries[fileIssueKey];
      const matchedSummary = summariesForKey?.[bestSummaryIndex] ?? '';
      similarities.push({ 
        issueKey: fileIssueKey, 
        similarity: bestSim, 
        summary: matchedSummary,
        summaryIndex: bestSummaryIndex,
        currentSummaryIndex: bestCurrentSummaryIndex
      });
    }
  }

  // Sort by similarity and return top 5 with emojis for high similarity
  similarities.sort((a, b) => b.similarity - a.similarity);
  const top5 = similarities.slice(0, 5);

  await fileLogger.logInfo(`Computed similarities for ${similarities.length} issues`);
  await fileLogger.logData('Top 5 Similar Issues', top5.map(s => ({
    issueKey: s.issueKey,
    similarity: s.similarity,
    percentage: Math.round(s.similarity * 100),
  })));


  // Load issue data to get titles
  const formattedIssues: string[] = [];
  for (const s of top5) {
    const percentage = Math.round(s.similarity * 100);
    
    // Parse issue key to get owner/repo/number
    const parts = s.issueKey.split('/');
    const owner = parts[0]!;
    const repoAndNumber = parts[1]!.split('#');
    const repo = repoAndNumber[0]!;
    const number = repoAndNumber[1]!;

    // Try to load issue data to get the title
    let issueTitle = 'Unknown Title';
    try {
      const issueFilePath = `.data/${owner}/${repo}/${number}.json`;
      const issueContent = await readFile(issueFilePath, 'utf-8');
      const issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
      issueTitle = issue.title;
    } catch {
      // If we can't load the issue, use a placeholder
      issueTitle = 'Issue';
    }

    // Create redirect.github.com URL
    const redirectUrl = `https://redirect.github.com/${owner}/${repo}/issues/${number}`;
    
    // Format the output
    const formattedIssue = `(${percentage}%) [#${number} - ${issueTitle}](${redirectUrl}) - ${s.summary}\n`;
    formattedIssues.push(formattedIssue);
  }

  return formattedIssues;
}

/**
 * Recursively find all .embeddings.json files in a directory
 */
async function findEmbeddingFiles(dir: string): Promise<string[]> {
  const result: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findEmbeddingFiles(fullPath);
        result.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.embeddings.json')) {
        result.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

main().catch(console.error);