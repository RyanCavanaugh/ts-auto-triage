#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, embeddingToBase64, ensureDirectoryExists, createIssueEmbeddingPath, parseIssueRef } from '../lib/utils.js';
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

    let processedCount = 0;
    let skippedCount = 0;

    // Load summaries data once
    let summariesData: Record<string, string[]>;
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      summariesData = SummariesDataSchema.parse(JSON.parse(summariesContent));
    } catch (error) {
      logger.error(`Failed to load summaries: ${error}`);
      process.exit(1);
    }

    // Process each issue individually
    for (const issueKey of issueKeys) {
      // Parse issue key to get owner/repo/number
      const [ownerRepo, numberStr] = issueKey.split('#');
      if (!ownerRepo || !numberStr) {
        logger.warn(`Invalid issue key format: ${issueKey}`);
        continue;
      }
      
      const [owner, repo] = ownerRepo.split('/');
      if (!owner || !repo) {
        logger.warn(`Invalid owner/repo format in key: ${issueKey}`);
        continue;
      }
      
      const number = parseInt(numberStr, 10);
      if (isNaN(number)) {
        logger.warn(`Invalid issue number in key: ${issueKey}`);
        continue;
      }

      // Create individual embedding file path using utility function
      const issueRef = { owner, repo, number };
      const embeddingFilePath = createIssueEmbeddingPath(issueRef);
      
      // Skip if embeddings already exist
      try {
        const existingContent = await readFile(embeddingFilePath, 'utf-8');
        const existingEmbeddings = JSON.parse(existingContent) as string[];
        if (Array.isArray(existingEmbeddings) && existingEmbeddings.length > 0) {
          skippedCount++;
          continue;
        }
      } catch {
        // File doesn't exist, continue to create embeddings
      }

      logger.debug(`Computing embeddings for ${issueKey}...`);

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
          
          // Convert to compact binary format (~3.8x compression vs JSON)
          const embeddingBase64 = embeddingToBase64(embeddingResponse.embedding);
          embeddingBase64Array.push(embeddingBase64);
        }

        // Write individual embedding file
        ensureDirectoryExists(embeddingFilePath);
        await writeFile(embeddingFilePath, JSON.stringify(embeddingBase64Array, null, 2));
        
        logger.debug(`Created embeddings for ${issueKey} (${embeddingBase64Array.length} embeddings)`);

        processedCount++;

        // Log progress
        if (processedCount % 10 === 0) {
          logger.info(`Processed ${processedCount} issues`);
        }

      } catch (error) {
        logger.error(`Failed to compute embeddings for ${issueKey}: ${error}`);
        continue;
      }
    }

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