#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, getGitHubAuthToken, createAuthenticatedOctokit } from '../lib/utils.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first to get defaultRepo
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: fetch-issue <issue-ref>');
      console.error('Example: fetch-issue Microsoft/TypeScript#9998');
      console.error('Example: fetch-issue https://github.com/Microsoft/TypeScript/issues/9998');
      if (config.github.defaultRepo) {
        console.error(`Example: fetch-issue #9998 (uses default repo: ${config.github.defaultRepo})`);
      }
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput, config.github.defaultRepo);
    
    logger.info(`Fetching issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Create authenticated Octokit client and issue fetcher
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);

    // Fetch the issue
    const issue = await issueFetcher.fetchIssue(issueRef);
    
    logger.info(`Successfully fetched issue: ${issue.title}`);
    logger.info(`State: ${issue.state}`);
    logger.info(`Comments: ${issue.comments.length}`);
    logger.info(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);
    logger.info(`Author: ${issue.user.login}`);
    logger.info(`Created: ${issue.created_at}`);
    logger.info(`Updated: ${issue.updated_at}`);

  } catch (error) {
    logger.error(`Failed to fetch issue: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);