#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, type GitHubIssue } from '../lib/schemas.js';
import { createReproExtractor } from '../lib/repro-extractor.js';
import { createReproFormatter } from '../lib/repro-formatter.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first to get defaultRepo
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: get-repro-steps <issue-ref>');
      console.error('Example: get-repro-steps Microsoft/TypeScript#9998');
      if (config.github.defaultRepo) {
        console.error(`Example: get-repro-steps #9998 (uses default repo: ${config.github.defaultRepo})`);
      }
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput, config.github.defaultRepo);
    const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
    
    logger.info(`Generating reproduction steps for: ${issueKey}`);

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load the issue data
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue: GitHubIssue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.error(`Issue data not found at ${issueFilePath}. Run fetch-issue first.`);
      process.exit(1);
    }

    logger.info(`Analyzing: ${issue.title}`);

    // Step 1: Classify the bug
    const extractor = createReproExtractor(ai, {
      maxIssueBodyLength: config.github.maxIssueBodyLength,
      maxCommentLength: config.github.maxCommentLength,
    }, logger);

    const classification = await extractor.classifyBug(issue, issueKey);
    logger.info(`Bug type: ${classification.bugType}`);
    logger.info(`Reasoning: ${classification.reasoning}`);

    // Step 2: Generate reproduction steps
    const reproSteps = await extractor.generateReproSteps(issue, classification, issueKey);
    
    if (!reproSteps) {
      logger.info('No reproduction steps generated (unknown bug type)');
      
      // Save classification only
      const outputDir = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}`;
      ensureDirectoryExists(join(outputDir, 'dummy'));
      
      const classificationPath = join(outputDir, 'classification.json');
      await writeFile(classificationPath, JSON.stringify(classification, null, 2));
      
      const formatter = createReproFormatter();
      const markdownPath = join(outputDir, 'report.md');
      await writeFile(markdownPath, formatter.formatFullReport(classification, null, null));
      
      logger.info(`Results saved to ${outputDir}`);
      logger.info(`  - classification.json: Bug classification`);
      logger.info(`  - report.md: Human-readable report`);
      
      // Print summary
      console.log('\n=========================');
      console.log('Classification Result:');
      console.log('=========================');
      console.log(`Bug Type: ${classification.bugType}`);
      console.log(`Reasoning: ${classification.reasoning}`);
      console.log(`\nOutput saved to: ${outputDir}\n`);
      
      return;
    }

    logger.info(`Generated ${reproSteps.type} reproduction steps`);

    // Save the outputs
    const outputDir = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}`;
    ensureDirectoryExists(join(outputDir, 'dummy'));
    
    const classificationPath = join(outputDir, 'classification.json');
    const reproStepsPath = join(outputDir, 'repro-steps.json');
    
    await writeFile(classificationPath, JSON.stringify(classification, null, 2));
    await writeFile(reproStepsPath, JSON.stringify(reproSteps, null, 2));

    // Generate human-readable markdown
    const formatter = createReproFormatter();
    const markdownPath = join(outputDir, 'report.md');
    await writeFile(markdownPath, formatter.formatFullReport(classification, reproSteps, null));

    logger.info(`Results saved to ${outputDir}`);
    logger.info(`  - classification.json: Bug classification`);
    logger.info(`  - repro-steps.json: Reproduction steps`);
    logger.info(`  - report.md: Human-readable report`);

    // Print summary
    console.log('\n=========================');
    console.log('Summary:');
    console.log('=========================');
    console.log(`Bug Type: ${classification.bugType}`);
    console.log(`Repro Type: ${reproSteps.type}`);
    
    if (reproSteps.type === 'compiler-repro') {
      console.log(`Files: ${Object.keys(reproSteps.fileMap).join(', ')}`);
      console.log(`Command Line: tsc ${reproSteps.cmdLineArgs.join(' ')}`);
    } else {
      console.log('Twoslash file generated for language service testing');
    }
    
    console.log(`\nInstructions: ${reproSteps.instructions.substring(0, 100)}...`);
    console.log(`\nFull details available in: ${outputDir}/report.md\n`);

  } catch (error) {
    logger.error(`Failed to generate reproduction steps: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
