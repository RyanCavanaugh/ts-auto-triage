#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger } from '../lib/utils.js';
import { ConfigSchema } from '../lib/schemas.js';

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

    // TODO: This would normally use AI to create summaries and embeddings
    
    logger.warn('AI integration not yet implemented');
    logger.info('This command would normally:');
    logger.info('1. Read all cached issue files for the repository');
    logger.info('2. Generate AI summaries for each issue');
    logger.info('3. Create embeddings for semantic search');
    logger.info('4. Save summaries to .data/summaries.json');
    logger.info('5. Save embeddings to .data/embeddings.json');
    
    logger.info('To implement: Add AI wrapper and embedding generation logic');

  } catch (error) {
    logger.error(`Failed to summarize issues: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);