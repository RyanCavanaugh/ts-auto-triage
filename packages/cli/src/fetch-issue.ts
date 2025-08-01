#!/usr/bin/env node

import { createCLIOptions, parseIssueRef, handleError } from './utils.js';

async function main() {
  const options = createCLIOptions();
  const { logger } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Issue reference required. Usage: fetch-issue Microsoft/TypeScript#9998');
    }

    const issueRef = parseIssueRef(args[0]!);

    logger.info(`Would fetch issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    logger.info('Issue fetching functionality requires GitHub token setup and additional configuration.');
    logger.info('This is a placeholder implementation. In production, this would:');
    logger.info('1. Authenticate with GitHub API');
    logger.info('2. Fetch issue data including comments and events');
    logger.info('3. Save structured data to .data directory');

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();