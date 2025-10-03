#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, zodToJsonSchema, embeddingToBase64, embeddingFromBase64, calculateCosineSimilarity } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, ActionFileSchema, SummariesDataSchema, type IssueRef, type Config } from '../lib/schemas.js';
import { createFAQMatcher } from '../lib/faq-matcher.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';

async function main() {
  const logger = createConsoleLogger();

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: first-response <issue-ref>');
      console.error('Example: first-response Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);

    logger.info(`Checking first response for: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load the issue data - fetch if not available locally
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.info(`Issue data not found locally, fetching from GitHub...`);
      
      // Get GitHub auth token
      const { execSync } = await import('child_process');
      const authToken = execSync('gh auth token', { encoding: 'utf-8' }).trim();
      
      // Create GitHub client
      const octokit = new Octokit({
        auth: authToken,
      });

      // Create issue fetcher and fetch the issue
      const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);
      issue = await issueFetcher.fetchIssue(issueRef);
      
      logger.info(`Successfully fetched issue from GitHub`);
    }

    // Only process issue body, not comments (as per spec)
    const issueBody = issue.body ?? '';
    if (!issueBody.trim()) {
      logger.info('Issue has no body content to analyze');
      return;
    }

    logger.info(`Analyzing issue: ${issue.title}`);

    // Create FAQ matcher
    const faqMatcher = createFAQMatcher(ai, logger);

    // Check FAQ entries
    let faqResponse: string | null = null;
    try {
      faqResponse = await faqMatcher.checkFAQMatch(issue.title, issueBody, issueRef);
    } catch {
      logger.debug('No FAQ.md file found, skipping FAQ check');
    }

    // Check for duplicates and similar issues
    let similarIssues: string[] = [];
    try {
      similarIssues = await findDuplicates(ai, issueBody, issue.title, issueRef, config);
      logger.debug(`Found ${similarIssues.length} similar issues`);
    } catch (error) {
      logger.debug(`Similar issue search failed: ${error}`);
    }

    // Generate action if needed
    const actions = [];

    if (faqResponse) {
      logger.info('Found relevant FAQ entry, creating response action');
      actions.push({
        kind: 'add_comment' as const,
        body: faqResponse,
      });
    }

    if (similarIssues.length > 0) {
      logger.info(`Found ${similarIssues.length} similar issues`);
      const similarComment = `Here are the most similar issues I found:\n\n${similarIssues.map(s => `- ${s}`).join('\n')}\n\nPlease check if any of these resolve your issue before proceeding.`;
      actions.push({
        kind: 'add_comment' as const,
        body: similarComment,
      });
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
${JSON.stringify(actionFile, null, 2)}`;

      await writeFile(actionFilePath, actionFileContent);
      logger.info(`Action file written to ${actionFilePath}`);
    } else {
      logger.info('No automatic response needed');
    }

  } catch (error) {
    logger.error(`Failed to check first response: ${error}`);
    process.exit(1);
  }
}

async function findDuplicates(ai: AIWrapper, issueBody: string, issueTitle: string, issueRef: IssueRef, config: Config): Promise<string[]> {
  // Load summaries 
  const summariesContent = await readFile('.data/summaries.json', 'utf-8');
  const summaries = SummariesDataSchema.parse(JSON.parse(summariesContent));

  // Create embedding for current issue
  const currentIssueText = `${issueTitle}\n\n${issueBody.slice(0, 2000)}`;
  // Cap the string length for embedding input to avoid API errors
  const cappedText = currentIssueText.length > config.ai.maxEmbeddingInputLength
    ? currentIssueText.slice(0, config.ai.maxEmbeddingInputLength - 3) + '...'
    : currentIssueText;
  const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
  const currentEmbedding = await ai.getEmbedding(cappedText, undefined, `Get embedding for current issue ${issueKey}`);

  // Calculate similarities by finding and reading all embedding files
  const similarities: Array<{ issueKey: string; similarity: number; summary: string }> = [];

  // Recursively find all .embeddings.json files in .data directory
  const embeddingFiles = await findEmbeddingFiles('.data');

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
    let bestIndex = -1;

    for (let i = 0; i < embeddingList.length; i++) {
      const base64 = embeddingList[i]!;
      const embeddingArray = embeddingFromBase64(base64);

      // Use optimized Float32Array similarity calculation
      const currentEmbeddingFloat32 = new Float32Array(currentEmbedding.embedding);
      const similarity = calculateCosineSimilarity(currentEmbeddingFloat32, embeddingArray);

      if (similarity > bestSim) {
        bestSim = similarity;
        bestIndex = i;
      }
    }

    // Use the best similarity for the issue and the corresponding summary (if available)
    if (bestIndex >= 0) {
      const summariesForKey = summaries[fileIssueKey];
      similarities.push({ issueKey: fileIssueKey, similarity: bestSim, summary: '' });
    }
  }

  // Sort by similarity and return top 5 with emojis for high similarity
  similarities.sort((a, b) => b.similarity - a.similarity);
  const top5 = similarities.slice(0, 5);

  const HIGH_SIMILARITY_THRESHOLD = 0.7; // Threshold for high similarity emoji

  return top5.map(s => {
    const emoji = s.similarity >= HIGH_SIMILARITY_THRESHOLD ? '🔥 ' : '';
    const percentage = Math.round(s.similarity * 100);
    return `${emoji}#${s.issueKey.split('#')[1]} (${percentage}% similar): ${s.summary.slice(0, 200)}...`;
  });
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