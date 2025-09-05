#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, zodToJsonSchema, type Logger } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, StaticReproSchema, type GitHubIssue, type Config, type StaticRepro, type IssueRef } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: static-repro <issue-ref>');
      console.error('Example: static-repro Microsoft/TypeScript#9998');
      console.error('Example: static-repro https://github.com/Microsoft/TypeScript/issues/9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Analyzing issue for static reproduction: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

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

    // Generate static reproduction analysis
    const staticRepro = await generateStaticRepro(ai, issue, issueRef, config, logger);

    // Save results
    const outputPath = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}-static-repro.json`;
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, JSON.stringify(staticRepro, null, 2));

    logger.info(`Static reproduction type: ${staticRepro.type}`);
    if (staticRepro.type === 'unknown') {
      logger.info(`Reasoning: ${staticRepro.reasoning}`);
    } else {
      logger.info(`Files: ${staticRepro.files.length}`);
      if (staticRepro.type === 'cli') {
        logger.info(`Args: ${staticRepro.args.join(' ')}`);
      }
    }
    logger.info(`Analysis saved to ${outputPath}`);

  } catch (error) {
    logger.error(`Failed to analyze issue for static reproduction: ${error}`);
    process.exit(1);
  }
}

async function generateStaticRepro(ai: AIWrapper, issue: GitHubIssue, issueRef: IssueRef, config: Config, logger: Logger): Promise<StaticRepro> {
  const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-3)
    .map((c) => c.body.slice(0, config.github.maxCommentLength))
    .join('\n---\n');

  const messages = [
    { role: 'system' as const, content: await loadPrompt('static-repro-system') },
    { 
      role: 'user' as const, 
      content: await loadPrompt('static-repro-user', { 
        issueNumber: String(issue.number), 
        issueTitle: issue.title, 
        body, 
        recentComments 
      }) 
    },
  ];
 
  const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
  const response = await ai.structuredCompletion(messages, StaticReproSchema, { 
    maxTokens: 1500,
    context: `Generate static reproduction analysis for ${issueKey}`,
  });
  
  return response;
}

main().catch(console.error);