#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, createAuthenticatedIssueFetcher } from '../lib/utils.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: fetch-issues <owner/repo>');
      console.error('Example: fetch-issues Microsoft/TypeScript');
      process.exit(1);
    }

    const repoInput = args[0]!;
    const [owner, repo] = repoInput.split('/');
    
    if (!owner || !repo) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }
    
    logger.info(`Fetching all issues for: ${owner}/${repo}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create issue fetcher
    const issueFetcher = await createAuthenticatedIssueFetcher(config, logger);

    // Fetch all issues
    await issueFetcher.fetchAllIssues(owner, repo);
    
    logger.info(`Completed fetching all issues for ${owner}/${repo}`);

  } catch (error) {
    logger.error(`Failed to fetch issues: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);