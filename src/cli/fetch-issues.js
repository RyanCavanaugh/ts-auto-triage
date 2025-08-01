#!/usr/bin/env node

import { createIssueFetcher } from '../../packages/issue-fetcher/src/index.js';
import { getGitHubToken, createLogger, validateRepoRef } from '../../packages/utils/src/index.js';

const logger = createLogger('fetch-issues');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: fetch-issues.js <owner/repo>');
    console.error('Example: fetch-issues.js Microsoft/TypeScript');
    process.exit(1);
  }
  
  try {
    const repoRef = args[0];
    
    if (!validateRepoRef(repoRef)) {
      throw new Error(`Invalid repository reference: ${repoRef}. Expected format: owner/repo`);
    }
    
    const [owner, repo] = repoRef.split('/');
    const token = await getGitHubToken();
    
    const fetcher = createIssueFetcher({ 
      token, 
      logger,
      dataPath: '.data'
    });
    
    logger.info(`Starting to fetch all issues from ${owner}/${repo}`);
    
    await fetcher.fetchAllIssues(owner, repo);
    
    logger.info(`Completed fetching all issues from ${owner}/${repo}`);
    
  } catch (error) {
    logger.error(`Failed to fetch issues: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});