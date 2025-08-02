#!/usr/bin/env node

import { createCLIOptions, handleError, getGitHubToken } from './utils.js';
import { createIssueFetcher } from '@ryancavanaugh/issue-fetcher';
import { promises as fs } from 'fs';

async function main() {
  const options = createCLIOptions();
  const { logger, dataDir } = options;

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

    const owner = repoMatch[1]!;
    const repo = repoMatch[2]!;

    logger.info(`Fetching all issues for ${owner}/${repo}`);

    // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true });

    // Get GitHub token
    let githubToken: string;
    try {
      githubToken = await getGitHubToken();
    } catch (error) {
      throw new Error('GitHub authentication required. Please run "gh auth login" first.');
    }

    // Create issue fetcher
    const fetcher = createIssueFetcher({
      logger,
      dataDir,
      githubToken,
      rateLimitDelay: 1000,
      maxRetries: 3
    });

    // Get all issue numbers for the repository
    logger.info('Fetching issue numbers...');
    const issueNumbers = await fetcher.getIssueNumbers(owner, repo);
    logger.info(`Found ${issueNumbers.length} issues/PRs to fetch`);

    let fetchedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Fetch each issue
    for (const number of issueNumbers) {
      const issueRef = { owner, repo, number };
      
      try {
        // Check if already exists
        const existingIssue = await fetcher.loadIssue(issueRef);
        if (existingIssue) {
          logger.debug(`Skipping ${owner}/${repo}#${number} - already exists`);
          skippedCount++;
          continue;
        }

        // Fetch and save the issue
        logger.info(`Fetching ${owner}/${repo}#${number}...`);
        const issue = await fetcher.fetchSingleIssue(issueRef);
        await fetcher.saveIssue(issueRef, issue);
        fetchedCount++;

        // Progress update every 10 issues
        if (fetchedCount % 10 === 0) {
          logger.info(`Progress: ${fetchedCount} fetched, ${skippedCount} skipped, ${errorCount} errors`);
        }

      } catch (error) {
        logger.error(`Failed to fetch ${owner}/${repo}#${number}: ${(error as Error).message}`);
        errorCount++;
        
        // If we're getting too many errors, bail out
        if (errorCount > 10) {
          throw new Error('Too many consecutive errors - stopping bulk fetch');
        }
      }
    }

    logger.info(`Bulk fetch completed for ${owner}/${repo}`);
    logger.info(`Summary: ${fetchedCount} fetched, ${skippedCount} skipped, ${errorCount} errors`);
    logger.info(`Total issues/PRs in repository: ${issueNumbers.length}`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();