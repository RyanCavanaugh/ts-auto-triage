#!/usr/bin/env node

import { createIssueFetcher, parseIssueRef } from '../../packages/issue-fetcher/src/index.js';
import { getGitHubToken, createLogger } from '../../packages/utils/src/index.js';

const logger = createLogger('fetch-issue');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: fetch-issue.js <issue-ref>');
    console.error('Example: fetch-issue.js Microsoft/TypeScript#9998');
    console.error('         fetch-issue.js https://github.com/Microsoft/TypeScript/issues/9998');
    process.exit(1);
  }
  
  try {
    const issueRefStr = args[0];
    const issueRef = parseIssueRef(issueRefStr);
    const token = await getGitHubToken();
    
    const fetcher = createIssueFetcher({ 
      token, 
      logger,
      dataPath: '.data'
    });
    
    logger.info(`Fetching issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    
    const issue = await fetcher.fetchIssue(issueRef, true); // Force fresh fetch
    
    logger.info(`Successfully fetched issue: "${issue.title}"`);
    logger.info(`State: ${issue.state}, Comments: ${issue.comments_data.length}, Events: ${issue.events_data.length}`);
    
  } catch (error) {
    logger.error(`Failed to fetch issue: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});