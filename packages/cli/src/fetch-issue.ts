#!/usr/bin/env node

import { createCLIOptions, parseIssueRef, handleError, getGitHubToken } from './utils.js';
import { createIssueFetcher } from '@ryancavanaugh/issue-fetcher';
import { promises as fs } from 'fs';

async function main() {
  const options = createCLIOptions();
  const { logger, dataDir } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Issue reference required. Usage: fetch-issue Microsoft/TypeScript#9998');
    }

    const issueRef = parseIssueRef(args[0]!);

    logger.info(`Fetching issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

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

    // Check if issue already exists locally
    const existingIssue = await fetcher.loadIssue(issueRef);
    if (existingIssue) {
      logger.info(`Issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number} already exists locally`);
      logger.info(`Title: ${existingIssue.title}`);
      logger.info(`State: ${existingIssue.state}`);
      logger.info(`Comments: ${existingIssue.comments.length}`);
      logger.info(`Events: ${existingIssue.events.length}`);
      return;
    }

    // Fetch the issue
    const issue = await fetcher.fetchSingleIssue(issueRef);
    
    // Save the issue
    await fetcher.saveIssue(issueRef, issue);

    logger.info(`Successfully fetched and saved issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    logger.info(`Title: ${issue.title}`);
    logger.info(`State: ${issue.state}`);
    logger.info(`Comments: ${issue.comments.length}`);
    logger.info(`Events: ${issue.events.length}`);
    logger.info(`Created: ${issue.created_at}`);
    logger.info(`Updated: ${issue.updated_at}`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();