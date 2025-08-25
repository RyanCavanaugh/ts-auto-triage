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

    // Check if summaries.json exists and get issue keys without loading all data
    const summariesPath = '.data/summaries.json';
    const repoPrefix = `${owner.toLowerCase()}/${repo.toLowerCase()}#`;
    
    let issueKeys: string[];
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      const summariesData = SummariesDataSchema.parse(JSON.parse(summariesContent));
      // Filter to only process issues for this repository
      issueKeys = Object.keys(summariesData).filter(key => key.startsWith(repoPrefix));
      // Don't keep the full summariesData in memory - we'll read individual entries as needed
    } catch {
      logger.error(`No summaries data found at ${summariesPath}. Run summarize-issues first.`);
      process.exit(1);
    }

    if (issueKeys.length === 0) {
      logger.warn(`No summaries found for repository ${owner}/${repo}. Run summarize-issues for this repository first.`);
      process.exit(0);
    }

    logger.info(`Found ${issueKeys.length} issues with summaries to process`);

    // Create embeddings file updater with smaller auto-flush interval for memory efficiency
    const embeddingsUpdater = createFileUpdater<string[]>('.data/embeddings.json', {
      autoFlushInterval: 3, // Flush more frequently to reduce memory usage
      logger,
    });

    let processedCount = 0;
    let skippedCount = 0;

    // Process in smaller batches to avoid memory accumulation
    const batchSize = 50; // Process 50 issues at a time
    
    for (let batchStart = 0; batchStart < issueKeys.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, issueKeys.length);
      const batchKeys = issueKeys.slice(batchStart, batchEnd);
      
      logger.info(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(issueKeys.length / batchSize)} (${batchKeys.length} issues)`);
      
      // Load only the current batch of summaries to save memory
      let batchSummariesData: Record<string, string[]>;
      try {
        const summariesContent = await readFile(summariesPath, 'utf-8');
        const fullSummariesData = SummariesDataSchema.parse(JSON.parse(summariesContent));
        batchSummariesData = {};
        for (const key of batchKeys) {
          if (fullSummariesData[key]) {
            batchSummariesData[key] = fullSummariesData[key];
          }
        }
      } catch (error) {
        logger.error(`Failed to load summaries for batch: ${error}`);
        continue;
      }

      for (const issueKey of batchKeys) {
        // Skip if embeddings already exist
        const existingEmbeddings = embeddingsUpdater.get(issueKey);
        
        if (existingEmbeddings && Array.isArray(existingEmbeddings) && existingEmbeddings.length > 0) {
          skippedCount++;
          continue;
        }

        logger.debug(`Computing embeddings for ${issueKey}...`);

        try {
          const summariesForIssue = batchSummariesData[issueKey] ?? [];
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
            
            // Clear the embedding response from memory immediately
            (embeddingResponse as unknown) = null;
          }

          embeddingsUpdater.set(issueKey, embeddingBase64Array);
          logger.debug(`Created embeddings for ${issueKey} (${embeddingBase64Array.length} embeddings)`);

          processedCount++;

          // Log progress and suggest garbage collection
          if (processedCount % 10 === 0) {
            logger.info(`Processed ${processedCount} issues (pending: embeddings=${embeddingsUpdater.getPendingWrites()})`);
            // Hint garbage collector to clean up
            if (global.gc) {
              global.gc();
            }
          }

        } catch (error) {
          logger.error(`Failed to compute embeddings for ${issueKey}: ${error}`);
          continue;
        }
      }
      
      // Clear batch data from memory after processing
      batchSummariesData = {};
      
      // Force flush after each batch to prevent memory accumulation
      await embeddingsUpdater.flush();
      
      // Clear file updater memory cache to prevent memory leaks
      embeddingsUpdater.clearMemoryCache();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.debug(`Completed batch ${Math.floor(batchStart / batchSize) + 1}, forced garbage collection`);
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