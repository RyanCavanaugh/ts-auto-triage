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
      console.error('Usage: repro-issue <issue-ref>');
      console.error('Example: repro-issue Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Testing issue reproduction: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // TODO: This would normally use AI to understand and reproduce the issue
    
    logger.warn('AI integration not yet implemented');
    logger.info('This command would normally:');
    logger.info('1. Fetch issue data if not already cached');
    logger.info('2. Use AI to understand the reported problem');
    logger.info('3. Generate reproduction steps and test files');
    logger.info('4. Run TypeScript compiler/LSP to test behavior');
    logger.info('5. Compare results with expected behavior');
    logger.info('6. Generate markdown summary of reproduction attempt');
    logger.info('7. Save results to .working/outputs/');
    
    logger.info('To implement: Add AI wrapper and TSC/LSP testing logic');

  } catch (error) {
    logger.error(`Failed to test issue reproduction: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);