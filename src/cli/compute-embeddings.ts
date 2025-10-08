#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, embeddingToBase64, ensureDirectoryExists, createIssueEmbeddingPath, parseIssueRef, parseRepoRef } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, type Config, SummariesDataSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    let repos: Array<[owner: string, repo: string]> = [];

    if (args.length === 0) {
      // No arguments - use config repos
      if (!config.github.repos || config.github.repos.length === 0) {
        console.error('Usage: compute-embeddings [<owner/repo>...]');
        console.error('Example: compute-embeddings Microsoft/TypeScript');
        console.error('Example: compute-embeddings Microsoft/TypeScript facebook/react');
        console.error('');
        console.error('Or configure default repositories in config.jsonc under github.repos');
        process.exit(1);
      }
      repos = config.github.repos.map(r => parseRepoRef(r));
      logger.info(`Using repos from config: ${config.github.repos.join(', ')}`);
    } else {
      // Use repos from arguments
      repos = args.map(repoInput => parseRepoRef(repoInput));
    }

    // Create AI wrapper (only for embeddings)
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load summaries data once
    const summariesPath = '.data/summaries.json';
    let summariesData;
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      summariesData = SummariesDataSchema.parse(JSON.parse(summariesContent));
    } catch {
      logger.error(`No summaries data found at ${summariesPath}. Run summarize-issues first.`);
      process.exit(1);
    }

    // Process each repository
    let failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Computing embeddings for: ${owner}/${repo}`);

      const repoPrefix = `${owner.toLowerCase()}/${repo.toLowerCase()}#`;
      const issueKeys = Object.keys(summariesData).filter(key => key.startsWith(repoPrefix));

      if (issueKeys.length === 0) {
        logger.warn(`No summaries found for repository ${owner}/${repo}. Run summarize-issues for this repository first.`);
        failedRepos.push(`${owner}/${repo}`);
        continue;
      }

      logger.info(`Found ${issueKeys.length} issues with summaries to process`);

      let processedCount = 0;
      let skippedCount = 0;

      // Process each issue individually
      for (const issueKey of issueKeys) {
        // Parse issue key to get owner/repo/number
        const [ownerRepo, numberStr] = issueKey.split('#');
        if (!ownerRepo || !numberStr) {
          logger.warn(`Invalid issue key format: ${issueKey}`);
          continue;
        }
        
        const [issueOwner, issueRepo] = ownerRepo.split('/');
        if (!issueOwner || !issueRepo) {
          logger.warn(`Invalid owner/repo format in key: ${issueKey}`);
          continue;
        }
        
        const number = parseInt(numberStr, 10);
        if (isNaN(number)) {
          logger.warn(`Invalid issue number in key: ${issueKey}`);
          continue;
        }

        // Create individual embedding file path using utility function
        const issueRef = { owner: issueOwner, repo: issueRepo, number };
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
            const embeddingResponse = await ai.getEmbedding(cappedSummary, `Get embedding of summary ${i + 1} for issue ${issueKey}`);
            
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

      logger.info(`Embedding computation for ${owner}/${repo} complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${issueKeys.length}`);
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
    }
    logger.info(`All repositories processed. Success: ${repos.length - failedRepos.length}/${repos.length}`);

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