#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, getGitHubAuthToken, createAuthenticatedOctokit, parseRepoRef } from '../lib/utils.js';
import { createPRFetcher } from '../lib/pr-fetcher.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main(): Promise<void> {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    let repos: Array<[owner: string, repo: string]> = [];
    let force = false;

    // Check for --force flag
    const forceIndex = args.indexOf('--force');
    if (forceIndex >= 0) {
      force = true;
      args.splice(forceIndex, 1);
    }

    if (args.length === 0) {
      // No arguments - use config repos
      if (!config.github.repos || config.github.repos.length === 0) {
        console.error('Usage: fetch-prs [--force] [<owner/repo>...]');
        console.error('Example: fetch-prs Microsoft/TypeScript');
        console.error('Example: fetch-prs --force Microsoft/TypeScript facebook/react');
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

    if (force) {
      logger.info('Force mode enabled - will re-fetch all PRs regardless of cache status');
    }

    // Create authenticated Octokit client and PR fetcher
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const prFetcher = createPRFetcher(octokit, config, logger, authToken);

    // Fetch all PRs for each repo
    const failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Fetching all PRs for: ${owner}/${repo}`);
      try {
        await prFetcher.fetchAllPRs(owner, repo, force);
        logger.info(`Completed fetching all PRs for ${owner}/${repo}`);
      } catch (error) {
        logger.error(`Failed to fetch PRs for ${owner}/${repo}: ${error}`);
        failedRepos.push(`${owner}/${repo}`);
      }
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
      process.exit(1);
    }
    logger.info(`All repositories processed successfully`);

  } catch (error) {
    logger.error(`Failed to fetch PRs: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
