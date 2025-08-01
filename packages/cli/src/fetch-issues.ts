#!/usr/bin/env node

import { createIssueFetcher } from '@ryancavanaugh/issue-fetcher';
import { createCLIOptions, getGitHubToken, handleError } from './utils.js';
import { parseIssueRef } from '@ryancavanaugh/utils';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const options = createCLIOptions();
  const { logger, dataDir } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Repository required. Usage: fetch-issues Microsoft/TypeScript');
    }

    const repoString = args[0]!;
    let owner: string, repo: string;
    
    // Handle both "owner/repo" and "owner/repo#number" formats
    if (repoString.includes('#')) {
      const issueRef = parseIssueRef(repoString);
      owner = issueRef.owner;
      repo = issueRef.repo;
    } else {
      const parts = repoString.split('/');
      if (parts.length !== 2) {
        throw new Error('Invalid repository format. Use: owner/repo');
      }
      owner = parts[0]!;
      repo = parts[1]!;
    }
    logger.info(`Fetching all issues for ${owner}/${repo}`);

    const githubToken = await getGitHubToken();
    const fetcher = createIssueFetcher({
      logger,
      dataDir,
      githubToken,
      rateLimitDelay: 1000,
      maxRetries: 3
    });

    // Get all issue numbers first
    logger.info('Getting list of all issues and PRs...');
    const issueNumbers = await fetcher.getIssueNumbers(owner, repo);
    logger.info(`Found ${issueNumbers.length} issues/PRs to fetch`);

    // Check which issues we already have
    const repoDir = path.join(dataDir, owner.toLowerCase(), repo.toLowerCase());
    await fs.mkdir(repoDir, { recursive: true });
    
    const existingFiles = await fs.readdir(repoDir).catch(() => []);
    const existingNumbers = new Set(
      existingFiles
        .filter(f => f.endsWith('.json'))
        .map(f => parseInt(f.replace('.json', ''), 10))
        .filter(n => !isNaN(n))
    );

    const toFetch = issueNumbers.filter(n => !existingNumbers.has(n));
    logger.info(`Already have ${existingNumbers.size} issues, need to fetch ${toFetch.length} more`);

    let fetched = 0;
    let errors = 0;

    for (const number of toFetch) {
      try {
        logger.info(`Fetching ${owner}/${repo}#${number} (${fetched + 1}/${toFetch.length})`);
        
        const issue = await fetcher.fetchSingleIssue({ owner, repo, number });
        await fetcher.saveIssue({ owner, repo, number }, issue);
        
        fetched++;
        
        if (fetched % 10 === 0) {
          logger.info(`Progress: ${fetched}/${toFetch.length} fetched`);
        }

      } catch (error) {
        logger.error(`Failed to fetch ${owner}/${repo}#${number}: ${(error as Error).message}`);
        errors++;
        
        // Stop if too many errors
        if (errors > 10) {
          logger.error('Too many errors, stopping fetch');
          break;
        }
      }
    }

    logger.info(`Fetch completed: ${fetched} issues fetched, ${errors} errors`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();