#!/usr/bin/env node

import { createCLIOptions, parseCliArgs, handleError } from './utils.js';

async function main() {
  const options = createCLIOptions();
  const { logger } = options;

  try {
    const args = process.argv.slice(2);
    const { issueRef } = parseCliArgs(args);

    if (!issueRef) {
      throw new Error('Repository required. Usage: summarize-issues Microsoft/TypeScript');
    }

    logger.info(`Creating summaries and embeddings for ${issueRef.owner}/${issueRef.repo}`);
    
    // TODO: Implement AI summarization and embeddings
    // This would involve:
    // 1. Loading all issues from .data for the repo
    // 2. For each issue, use AI to create a one-paragraph summary
    // 3. Generate embeddings for each summary using Azure OpenAI
    // 4. Store summaries in .data/summaries.json
    // 5. Store embeddings in binary format in .data/embeddings.json
    // 6. Handle rate limiting and caching
    
    logger.warn('summarize-issues command not yet implemented');
    logger.info('This command will generate AI summaries and embeddings for all issues in a repository');

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();