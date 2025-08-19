#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, ensureDirectoryExists } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, EmbeddingsDataSchema, SummariesDataSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: summarize-issues <owner/repo>');
      console.error('Example: summarize-issues Microsoft/TypeScript');
      process.exit(1);
    }

    const repoInput = args[0]!;
    const [owner, repo] = repoInput.split('/');
    
    if (!owner || !repo) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }
    
    logger.info(`Summarizing issues for: ${owner}/${repo}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Read existing summaries and embeddings
    const summariesPath = '.data/summaries.json';
    const embeddingsPath = '.data/embeddings.json';
    
    let existingSummaries: Record<string, string> = {};
    let existingEmbeddings: Record<string, string> = {};
    
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      existingSummaries = SummariesDataSchema.parse(JSON.parse(summariesContent));
    } catch {
      // File doesn't exist yet, start fresh
    }
    
    try {
      const embeddingsContent = await readFile(embeddingsPath, 'utf-8');
      existingEmbeddings = EmbeddingsDataSchema.parse(JSON.parse(embeddingsContent));
    } catch {
      // File doesn't exist yet, start fresh
    }

    // Find all issue files for this repository
    const dataDir = `.data/${owner.toLowerCase()}/${repo.toLowerCase()}`;
    let issueFiles: string[] = [];
    
    try {
      const files = await readdir(dataDir);
      issueFiles = files.filter(f => f.endsWith('.json')).map(f => join(dataDir, f));
    } catch {
      logger.error(`No issue data found in ${dataDir}. Run fetch-issues first.`);
      process.exit(1);
    }

    logger.info(`Found ${issueFiles.length} issue files to process`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const filePath of issueFiles) {
      const issueNumber = basename(filePath, '.json');
      const issueKey = `${owner.toLowerCase()}/${repo.toLowerCase()}#${issueNumber}`;

      // Skip if already processed
      if (existingSummaries[issueKey] && existingEmbeddings[issueKey]) {
        skippedCount++;
        continue;
      }

      logger.info(`Processing ${issueKey}...`);

      try {
        // Load issue data
        const issueContent = await readFile(filePath, 'utf-8');
        const issue = GitHubIssueSchema.parse(JSON.parse(issueContent));

        // Create summary if not exists
        if (!existingSummaries[issueKey]) {
          const summary = await createIssueSummary(ai, issue, config);
          existingSummaries[issueKey] = summary;
          logger.debug(`Created summary for ${issueKey}`);
        }

        // Create embedding if not exists
        if (!existingEmbeddings[issueKey]) {
          const summary = existingSummaries[issueKey]!;
          const embeddingResponse = await ai.getEmbedding(summary);
          const embeddingBase64 = Buffer.from(new Float32Array(embeddingResponse.embedding).buffer).toString('base64');
          existingEmbeddings[issueKey] = embeddingBase64;
          logger.debug(`Created embedding for ${issueKey}`);
        }

        processedCount++;

        // Save progress every 10 issues
        if (processedCount % 10 === 0) {
          await saveData(summariesPath, existingSummaries);
          await saveData(embeddingsPath, existingEmbeddings);
          logger.info(`Processed ${processedCount} issues, saved progress`);
        }

      } catch (error) {
        logger.error(`Failed to process ${issueKey}: ${error}`);
        continue;
      }
    }

    // Save final results
    await saveData(summariesPath, existingSummaries);
    await saveData(embeddingsPath, existingEmbeddings);

    logger.info(`Summarization complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${issueFiles.length}`);

  } catch (error) {
    logger.error(`Failed to summarize issues: ${error}`);
    process.exit(1);
  }
}

async function createIssueSummary(ai: any, issue: any, config: any): Promise<string> {
  // Truncate body and comments to stay within context limits
  const body = issue.body ? truncateText(issue.body, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-5) // Only use last 5 comments
    .map((c: any) => truncateText(c.body, config.github.maxCommentLength))
    .join('\n---\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert at summarizing GitHub issues for a TypeScript repository. Create a concise one-paragraph summary that captures:
1. The main problem or feature request
2. Key technical details
3. Current status/resolution if apparent
4. Impact or importance

Be technical but clear. Focus on facts, not emotions. Keep it under 200 words.`,
    },
    {
      role: 'user' as const,
      content: `Issue #${issue.number}: ${issue.title}

State: ${issue.state}
Labels: ${issue.labels.map((l: any) => l.name).join(', ')}

Body:
${body}

Recent Comments:
${recentComments}`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 300 });
  return response.content.trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

async function saveData(filePath: string, data: Record<string, string>): Promise<void> {
  ensureDirectoryExists(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

main().catch(console.error);