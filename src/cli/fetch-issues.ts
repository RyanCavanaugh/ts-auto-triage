#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, getGitHubAuthToken, createAuthenticatedOctokit, parseRepoRef } from '../lib/utils.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    let repoList: Array<{ owner: string; repo: string }> = [];

    if (args.length === 0) {
      // No arguments provided - use repositories from config
      if (!config.repositories || config.repositories.length === 0) {
        console.error('Usage: fetch-issues [<owner/repo>...]');
        console.error('Example: fetch-issues Microsoft/TypeScript');
        console.error('Or configure repositories in config.jsonc to run without arguments');
        process.exit(1);
      }
      repoList = config.repositories.map(parseRepoRef);
      logger.info(`Using repositories from config: ${config.repositories.join(', ')}`);
    } else {
      // Parse each provided repository argument
      for (const repoInput of args) {
        try {
          repoList.push(parseRepoRef(repoInput));
        } catch (error) {
          console.error(`Invalid repository format: ${repoInput}. Use: owner/repo`);
          process.exit(1);
        }
      }
    }

    if (repoList.length === 0) {
      console.error('No repositories to process');
      process.exit(1);
    }

    // Create authenticated Octokit client and issue fetcher
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);

    // Fetch all issues for each repository
    for (const { owner, repo } of repoList) {
      logger.info(`Fetching all issues for: ${owner}/${repo}`);
      await issueFetcher.fetchAllIssues(owner, repo);
      logger.info(`Completed fetching all issues for ${owner}/${repo}`);
    }

    logger.info(`All repositories processed successfully`);

  } catch (error) {
    logger.error(`Failed to fetch issues: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);