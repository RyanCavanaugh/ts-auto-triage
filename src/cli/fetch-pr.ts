#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, getGitHubAuthToken, createAuthenticatedOctokit } from '../lib/utils.js';
import { createPRFetcher } from '../lib/pr-fetcher.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main(): Promise<void> {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first to get defaultRepo
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: fetch-pr <pr-ref>');
      console.error('Example: fetch-pr Microsoft/TypeScript#59998');
      console.error('Example: fetch-pr https://github.com/Microsoft/TypeScript/pull/59998');
      if (config.github.defaultRepo) {
        console.error(`Example: fetch-pr #59998 (uses default repo: ${config.github.defaultRepo})`);
      }
      process.exit(1);
    }

    const prRefInput = args[0]!;
    const prRef = parseIssueRef(prRefInput, config.github.defaultRepo);
    
    logger.info(`Fetching PR: ${prRef.owner}/${prRef.repo}#${prRef.number}`);

    // Create authenticated Octokit client and PR fetcher
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const prFetcher = createPRFetcher(octokit, config, logger, authToken);

    // Fetch the PR
    const pr = await prFetcher.fetchPR(prRef);
    
    logger.info(`Successfully fetched PR: ${pr.title}`);
    logger.info(`State: ${pr.state}`);
    logger.info(`Comments: ${pr.comments.length}`);
    logger.info(`Labels: ${pr.labels.map(l => l.name).join(', ')}`);
    logger.info(`Author: ${pr.user.login}`);
    logger.info(`Created: ${pr.created_at}`);
    logger.info(`Updated: ${pr.updated_at}`);

  } catch (error) {
    logger.error(`Failed to fetch PR: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
