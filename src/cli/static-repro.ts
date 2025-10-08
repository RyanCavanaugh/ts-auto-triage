#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, type Logger } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { createLSPHarness } from '../lib/lsp-harness.js';
import { ConfigSchema, GitHubIssueSchema, type GitHubIssue, type Config, type IssueRef } from '../lib/schemas.js';
import { createReproExtractor } from '../lib/repro-extractor.js';
import { createReproValidator } from '../lib/repro-validator.js';
import { createReproFormatter } from '../lib/repro-formatter.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first to get defaultRepo
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    const validateFlag = args.includes('--validate');
    const issueRefInput = args.find(arg => !arg.startsWith('--'));

    if (!issueRefInput) {
      console.error('Usage: static-repro <issue-ref> [--validate]');
      console.error('Example: static-repro Microsoft/TypeScript#9998');
      console.error('Example: static-repro #9998 (uses defaultRepo from config)');
      console.error('Example: static-repro Microsoft/TypeScript#9998 --validate');
      console.error('');
      console.error('Options:');
      console.error('  --validate    Run the reproduction steps and validate the bug status');
      process.exit(1);
    }

    const issueRef = parseIssueRef(issueRefInput, config.defaultRepo);
    const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
    
    logger.info(`Analyzing issue for reproduction: ${issueKey}`);

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
      return;
    }

    logger.info(`Generated ${reproSteps.type} reproduction steps`);

    // Step 3: Optionally validate the reproduction
    let validation = null;
    if (validateFlag) {
      logger.info('Running validation...');
      
      const workspaceDir = `.working/repro-workspace-${issueRef.owner}-${issueRef.repo}-${issueRef.number}`;
      
      // Clean and create workspace
      try {
        await rm(workspaceDir, { recursive: true, force: true });
      } catch {
        // Ignore errors
      }
      await mkdir(workspaceDir, { recursive: true });

      const lspHarness = createLSPHarness(config.typescript.lspEntryPoint, logger);
      const validator = createReproValidator(ai, lspHarness, logger);
      
      try {
        await lspHarness.start(workspaceDir);
        validation = await validator.validateReproSteps(reproSteps, workspaceDir, issue.title, issueKey);
        logger.info(`Validation result: ${validation.bug_status}`);
        logger.info(`Reasoning: ${validation.reasoning}`);
      } finally {
        await lspHarness.stop();
      }
    }

    // Step 4: Save results in both JSON and markdown formats
    const outputDir = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}`;
    ensureDirectoryExists(join(outputDir, 'dummy'));

    const classificationPath = join(outputDir, 'classification.json');
    await writeFile(classificationPath, JSON.stringify(classification, null, 2));

    const reproStepsPath = join(outputDir, 'repro-steps.json');
    await writeFile(reproStepsPath, JSON.stringify(reproSteps, null, 2));

    if (validation) {
      const validationPath = join(outputDir, 'validation.json');
      await writeFile(validationPath, JSON.stringify(validation, null, 2));
    }

    // Generate human-readable markdown
    const formatter = createReproFormatter();
    const markdownPath = join(outputDir, 'report.md');
    await writeFile(markdownPath, formatter.formatFullReport(classification, reproSteps, validation));

    logger.info(`Results saved to ${outputDir}`);
    logger.info(`  - classification.json: Bug classification`);
    logger.info(`  - repro-steps.json: Reproduction steps`);
    if (validation) {
      logger.info(`  - validation.json: Validation results`);
    }
    logger.info(`  - report.md: Human-readable report`);

  } catch (error) {
    logger.error(`Failed to analyze issue for reproduction: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);