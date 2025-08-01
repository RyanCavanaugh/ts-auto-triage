#!/usr/bin/env node

import { createCLIOptions, parseCliArgs, handleError } from './utils.js';

async function main() {
  const options = createCLIOptions();
  const { logger } = options;

  try {
    const args = process.argv.slice(2);
    const { issueRef } = parseCliArgs(args);

    if (!issueRef) {
      throw new Error('Issue reference required. Usage: first-response Microsoft/TypeScript#9998');
    }

    logger.info(`Generating first response for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    
    // TODO: Implement automated first response
    // This would involve:
    // 1. Loading the issue body (not comments)
    // 2. Checking FAQ.md entries against the issue using AI
    // 3. Searching for similar issues using embeddings
    // 4. Generating personalized FAQ responses if applicable
    // 5. Writing suggested response to .working/outputs/
    
    logger.warn('first-response command not yet implemented');
    logger.info('This command will check new issues against FAQs and find potential duplicates');

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();