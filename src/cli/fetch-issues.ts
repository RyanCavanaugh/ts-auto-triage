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
    let repos: Array<[owner: string, repo: string]> = [];

    if (args.length === 0) {
      // No arguments - use config repos
      if (!config.github.repos || config.github.repos.length === 0) {
        console.error('Usage: fetch-issues [<owner/repo>...]');
        console.error('Example: fetch-issues Microsoft/TypeScript');
        console.error('Example: fetch-issues Microsoft/TypeScript facebook/react');
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

    // Create authenticated Octokit client and issue fetcher
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);

    // Fetch all issues for each repo
    let failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Fetching all issues for: ${owner}/${repo}`);
      try {
        await issueFetcher.fetchAllIssues(owner, repo);
        logger.info(`Completed fetching all issues for ${owner}/${repo}`);
      } catch (error) {
        logger.error(`Failed to fetch issues for ${owner}/${repo}: ${error}`);
        failedRepos.push(`${owner}/${repo}`);
      }
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
      process.exit(1);
    }
    logger.info(`All repositories processed successfully`);

  } catch (error) {
    logger.error(`Failed to fetch issues: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);