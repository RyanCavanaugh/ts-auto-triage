#!/usr/bin/env node

import { createCLIOptions, handleError } from './utils.js';

async function main() {
  const options = createCLIOptions();
  const { logger } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Repository required. Usage: fetch-issues Microsoft/TypeScript');
    }

    // For fetch-issues, we accept just owner/repo format
    const repoString = args[0]!;
    const repoMatch = repoString.match(/^([^\/]+)\/([^\/]+)$/);
    if (!repoMatch) {
      throw new Error('Invalid repository format. Usage: fetch-issues Microsoft/TypeScript');
    }

    const issueRef = {
      owner: repoMatch[1]!,
      repo: repoMatch[2]!,
      number: 0 // Not used for this command
    };

    logger.info(`Would fetch all issues for ${issueRef.owner}/${issueRef.repo}`);
    logger.info('Bulk issue fetching functionality requires GitHub token setup and additional configuration.');
    logger.info('This is a placeholder implementation. In production, this would:');
    logger.info('1. Authenticate with GitHub API');
    logger.info('2. Fetch all issues and PRs with pagination');
    logger.info('3. Save structured data to .data directory');
    logger.info('4. Resume from last fetched issue if interrupted');

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();