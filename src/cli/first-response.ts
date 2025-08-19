#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger } from '../lib/utils.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: first-response <issue-ref>');
      console.error('Example: first-response Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Checking first response for: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // TODO: This would normally use AI to check FAQ entries and duplicates
    
    logger.warn('AI integration not yet implemented');
    logger.info('This command would normally:');
    logger.info('1. Read FAQ.md for relevant entries');
    logger.info('2. Use AI to match issue against FAQ entries');
    logger.info('3. Search existing summaries/embeddings for duplicates');
    logger.info('4. Generate personalized response if FAQ match found');
    logger.info('5. Write action file for posting response');
    
    logger.info('To implement: Add AI wrapper and FAQ matching logic');

  } catch (error) {
    logger.error(`Failed to check first response: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);