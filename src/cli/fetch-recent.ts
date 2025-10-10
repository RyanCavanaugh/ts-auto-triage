#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, getGitHubAuthToken, createAuthenticatedOctokit, parseRepoRef } from '../lib/utils.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';
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
        console.error('Usage: fetch-recent [--force] [<owner/repo>...]');
        console.error('Example: fetch-recent Microsoft/TypeScript');
        console.error('Example: fetch-recent --force Microsoft/TypeScript facebook/react');
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
      logger.info('Force mode enabled - will re-fetch all recent items regardless of cache status');
    }

    // Calculate the date 14 days ago
    const since = new Date();
    since.setDate(since.getDate() - 14);
    logger.info(`Fetching issues and PRs modified or created since ${since.toISOString()}`);

    // Create authenticated Octokit client and fetchers
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);
    const prFetcher = createPRFetcher(octokit, config, logger, authToken);

    // Fetch recent issues and PRs for each repo
    const failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Fetching recent issues and PRs for: ${owner}/${repo}`);
      try {
        await issueFetcher.fetchRecentIssues(owner, repo, since, force);
        await prFetcher.fetchRecentPRs(owner, repo, since, force);
        logger.info(`Completed fetching recent issues and PRs for ${owner}/${repo}`);
      } catch (error) {
        logger.error(`Failed to fetch recent items for ${owner}/${repo}: ${error}`);
        failedRepos.push(`${owner}/${repo}`);
      }
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
      process.exit(1);
    }
    logger.info(`All repositories processed successfully`);

  } catch (error) {
    logger.error(`Failed to fetch recent items: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
