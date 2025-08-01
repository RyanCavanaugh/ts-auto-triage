#!/usr/bin/env node

import { createIssueFetcher } from '@ryancavanaugh/issue-fetcher';
import { createCLIOptions, getGitHubToken, handleError } from './utils.js';
import { parseIssueRef } from '@ryancavanaugh/utils';

async function main() {
  const options = createCLIOptions();
  const { logger, dataDir } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Issue reference required. Usage: fetch-issue Microsoft/TypeScript#9998');
    }

    const issueRefString = args[0];
    const issueRef = parseIssueRef(issueRefString!);

    logger.info(`Fetching issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    const githubToken = await getGitHubToken();
    const fetcher = createIssueFetcher({
      logger,
      dataDir,
      githubToken
    });

    const issue = await fetcher.fetchSingleIssue(issueRef);
    await fetcher.saveIssue(issueRef, issue);

    logger.info(`Successfully fetched and saved issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    logger.info(`Title: ${issue.title}`);
    logger.info(`State: ${issue.state}`);
    logger.info(`Comments: ${issue.comments.length}`);
    logger.info(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();