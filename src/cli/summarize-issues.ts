#!/usr/bin/env node

import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, zodToJsonSchema, createFileUpdater } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, type GitHubIssue, type Config, type IssueSummaries, IssueSummariesSchema } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

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

    // Create file updaters with auto-flush every 5 writes for better performance
    const summariesUpdater = createFileUpdater<string[]>('.data/summaries.json', {
      autoFlushInterval: 5,
      logger,
    });
    
    const embeddingsUpdater = createFileUpdater<string[]>('.data/embeddings.json', {
      autoFlushInterval: 5, 
      logger,
    });

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

      // Skip if already processed (both summaries and embeddings must be present)
      const existingSummaries = summariesUpdater.get(issueKey);
      const existingEmbeddings = embeddingsUpdater.get(issueKey);
      
      if (
        existingSummaries && Array.isArray(existingSummaries) && existingSummaries.length > 0 &&
        existingEmbeddings && Array.isArray(existingEmbeddings) && existingEmbeddings.length > 0
      ) {
        skippedCount++;
        continue;
      }

      logger.info(`Processing ${issueKey}...`);

      try {
        // Load issue data
        const issueContent = await readFile(filePath, 'utf-8');
        const issue = GitHubIssueSchema.parse(JSON.parse(issueContent));

        // Create summaries (array) if not exists
        if (!existingSummaries || existingSummaries.length === 0) {
          const summaries = await createIssueSummaries(ai, issue, config, 3);
          summariesUpdater.set(issueKey, summaries);
          logger.debug(`Created summaries for ${issueKey}`);
        }

        // Create embeddings array (one per summary) if not exists
        if (!existingEmbeddings || existingEmbeddings.length === 0) {
          const summariesForIssue = summariesUpdater.get(issueKey) ?? [];
          const embeddingBase64Array: string[] = [];
          for (const s of summariesForIssue) {
            // Cap the string length for embedding input to avoid API errors
            const cappedSummary = truncateText(s, config.ai.maxEmbeddingInputLength);
            const embeddingResponse = await ai.getEmbedding(cappedSummary);
            const embeddingBase64 = Buffer.from(new Float32Array(embeddingResponse.embedding).buffer).toString('base64');
            embeddingBase64Array.push(embeddingBase64);
          }
          embeddingsUpdater.set(issueKey, embeddingBase64Array);
          logger.debug(`Created embeddings for ${issueKey}`);
        }

        processedCount++;

        // Log progress without forced flushes (auto-flush handles this)
        if (processedCount % 10 === 0) {
          logger.info(`Processed ${processedCount} issues (pending: summaries=${summariesUpdater.getPendingWrites()}, embeddings=${embeddingsUpdater.getPendingWrites()})`);
        }

      } catch (error) {
        logger.error(`Failed to process ${issueKey}: ${error}`);
        continue;
      }
    }

    // Ensure all changes are saved
    await summariesUpdater.dispose();
    await embeddingsUpdater.dispose();

    logger.info(`Summarization complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${issueFiles.length}`);

  } catch (error) {
    logger.error(`Failed to summarize issues: ${error}`);
    process.exit(1);
  }
}

async function createIssueSummaries(ai: AIWrapper, issue: GitHubIssue, config: Config, count = 3): Promise<string[]> {
  // Truncate body and comments to stay within context limits
  const body = issue.body ? truncateText(issue.body, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-5) // Only use last 5 comments
    .map((c) => truncateText(c.body, config.github.maxCommentLength))
    .join('\n---\n');

  const systemPrompt = await loadPrompt('summarize-issue-system');
  const userPrompt = await loadPrompt('summarize-issue-user', {
    issueNumber: String(issue.number),
    issueTitle: issue.title,
    issueState: issue.state,
    labels: issue.labels.map((l) => l.name).join(', '),
    body,
    recentComments,
  });

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const jsonSchema = zodToJsonSchema(IssueSummariesSchema);
  const response = await ai.structuredCompletion<IssueSummaries>(messages, jsonSchema, { maxTokens: 1200 });
  return response.summaries;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

main().catch(console.error);