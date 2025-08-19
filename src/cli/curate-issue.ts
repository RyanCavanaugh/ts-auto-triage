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
      console.error('Usage: curate-issue <issue-ref>');
      console.error('Example: curate-issue Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Curating issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // TODO: This would normally use AI to analyze the issue and POLICY.md
    // For now, we'll just create a placeholder action file
    
    logger.warn('AI integration not yet implemented');
    logger.info('This command would normally:');
    logger.info('1. Read POLICY.md for curation guidelines');
    logger.info('2. Analyze the issue content with AI');
    logger.info('3. Generate proposed actions based on policy');
    logger.info('4. Write action file to .working/actions/');
    
    logger.info('To implement: Add AI wrapper and policy analysis logic');

  } catch (error) {
    logger.error(`Failed to curate issue: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);