#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, createFileUpdater } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, type Config, SummariesDataSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: compute-embeddings <owner/repo>');
      console.error('Example: compute-embeddings Microsoft/TypeScript');
      process.exit(1);
    }

    const repoInput = args[0]!;
    const [owner, repo] = repoInput.split('/');
    
    if (!owner || !repo) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }
    
    logger.info(`Computing embeddings for: ${owner}/${repo}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper (only for embeddings)
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Check if summaries.json exists
    const summariesPath = '.data/summaries.json';
    let summariesData: Record<string, string[]>;
    
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      summariesData = SummariesDataSchema.parse(JSON.parse(summariesContent));
    } catch {
      logger.error(`No summaries data found at ${summariesPath}. Run summarize-issues first.`);
      process.exit(1);
    }

    // Create embeddings file updater with auto-flush every 5 writes for better performance
    const embeddingsUpdater = createFileUpdater<string[]>('.data/embeddings.json', {
      autoFlushInterval: 5, 
      logger,
    });

    // Filter to only process issues for this repository
    const repoPrefix = `${owner.toLowerCase()}/${repo.toLowerCase()}#`;
    const issueKeys = Object.keys(summariesData).filter(key => key.startsWith(repoPrefix));

    if (issueKeys.length === 0) {
      logger.warn(`No summaries found for repository ${owner}/${repo}. Run summarize-issues for this repository first.`);
      process.exit(0);
    }

    logger.info(`Found ${issueKeys.length} issues with summaries to process`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const issueKey of issueKeys) {
      // Skip if embeddings already exist
      const existingEmbeddings = embeddingsUpdater.get(issueKey);
      
      if (existingEmbeddings && Array.isArray(existingEmbeddings) && existingEmbeddings.length > 0) {
        skippedCount++;
        continue;
      }

      logger.info(`Computing embeddings for ${issueKey}...`);

      try {
        const summariesForIssue = summariesData[issueKey] ?? [];
        if (summariesForIssue.length === 0) {
          logger.warn(`No summaries found for ${issueKey}, skipping...`);
          continue;
        }

        // Create embeddings array (one per summary)
        const embeddingBase64Array: string[] = [];
        for (let i = 0; i < summariesForIssue.length; i++) {
          const summary = summariesForIssue[i]!;
          // Cap the string length for embedding input to avoid API errors
          const cappedSummary = truncateText(summary, config.ai.maxEmbeddingInputLength);
          const embeddingResponse = await ai.getEmbedding(cappedSummary, undefined, `Get embedding of summary ${i + 1} for issue ${issueKey}`);
          const embeddingBase64 = Buffer.from(new Float32Array(embeddingResponse.embedding).buffer).toString('base64');
          embeddingBase64Array.push(embeddingBase64);
        }

        embeddingsUpdater.set(issueKey, embeddingBase64Array);
        logger.debug(`Created embeddings for ${issueKey} (${embeddingBase64Array.length} embeddings)`);

        processedCount++;

        // Log progress without forced flushes (auto-flush handles this)
        if (processedCount % 10 === 0) {
          logger.info(`Processed ${processedCount} issues (pending: embeddings=${embeddingsUpdater.getPendingWrites()})`);
        }

      } catch (error) {
        logger.error(`Failed to compute embeddings for ${issueKey}: ${error}`);
        continue;
      }
    }

    // Ensure all changes are saved
    await embeddingsUpdater.dispose();

    logger.info(`Embedding computation complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${issueKeys.length}`);

  } catch (error) {
    logger.error(`Failed to compute embeddings: ${error}`);
    process.exit(1);
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

main().catch(console.error);