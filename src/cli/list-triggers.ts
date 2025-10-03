#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, type IssueRef } from '../lib/schemas.js';
import { getAllTriggers, type RepositoryMetadata } from '../lib/curation-triggers.js';
import { getRepositoryMetadata } from './curate-issue.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: list-triggers <issue-ref>');
      console.error('Example: list-triggers Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Checking triggers for: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Load the issue data
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.error(`Issue data not found at ${issueFilePath}. Run fetch-issue first.`);
      process.exit(1);
    }

    // Get repository metadata for valid labels and milestones
    const { labels, milestones } = await getRepositoryMetadata(issueRef);
    const metadata: RepositoryMetadata = { labels, milestones };

    // Get all triggers and check which would activate
    const triggers = getAllTriggers();
    
    console.log('\nTrigger Activation Status:');
    console.log('=========================\n');
    
    let activeCount = 0;
    let inactiveCount = 0;

    for (const trigger of triggers) {
      const wouldActivate = trigger.shouldActivate(issue, issueRef, metadata);
      const status = wouldActivate ? '✓ ACTIVE' : '✗ inactive';
      const color = wouldActivate ? '\x1b[32m' : '\x1b[90m';
      const reset = '\x1b[0m';
      
      console.log(`${color}${status}${reset} - ${trigger.name}`);
      
      if (trigger.description) {
        console.log(`  ${trigger.description}`);
      }
      
      if (wouldActivate) {
        activeCount++;
      } else {
        inactiveCount++;
      }
      console.log('');
    }

    console.log('=========================');
    console.log(`Total: ${activeCount} active, ${inactiveCount} inactive\n`);

  } catch (error) {
    logger.error(`Failed to check triggers: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
