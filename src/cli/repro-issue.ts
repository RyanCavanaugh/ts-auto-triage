#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef, zodToJsonSchema, type Logger } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { createLSPHarness, type LSPHarness } from '../lib/lsp-harness.js';
import { createTwoslashParser, type TwoslashParser } from '../lib/twoslash.js';
import { ConfigSchema, GitHubIssueSchema, ReproCodeSchema, ReproAnalysisSchema, FinalAnalysisSchema, type GitHubIssue, type Config, type ReproCode, type ReproAnalysis, type FinalAnalysis } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

interface ReproAttempt {
  attempt: number;
  approach: string;
  files: Array<{ filename: string; content: string }>;
  tscOutput?: string;
  lspOutput?: string;
  success: boolean;
  analysis: string;
}

interface ReproResult {
  issueRef: string;
  title: string;
  reproduced: boolean;
  attempts: ReproAttempt[];
  summary: string;
  recommendation: string;
}

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

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

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

    logger.info(`Reproducing: ${issue.title}`);

    // Set up reproduction workspace
    const workspaceDir = `.working/repros/${issueRef.owner}-${issueRef.repo}-${issueRef.number}`;
    await setupWorkspace(workspaceDir, config, logger);

    // Create LSP harness and twoslash parser
    const lspHarness = createLSPHarness(config.typescript.lspEntryPoint, logger);
    const twoslashParser = createTwoslashParser(logger);

    // Run reproduction attempts
    const result: ReproResult = {
      issueRef: formatIssueRef(issueRef),
      title: issue.title,
      reproduced: false,
      attempts: [],
      summary: '',
      recommendation: '',
    };

    for (let attemptNum = 1; attemptNum <= config.ai.maxReproAttempts; attemptNum++) {
      logger.info(`Reproduction attempt ${attemptNum}/${config.ai.maxReproAttempts}`);
      
      const attempt = await runReproAttempt(
        ai,
        lspHarness,
        twoslashParser,
        issue,
        workspaceDir,
        attemptNum,
        result.attempts,
        config,
        logger
      );
      
      result.attempts.push(attempt);
      
      if (attempt.success) {
        result.reproduced = true;
        logger.info(`Successfully reproduced issue on attempt ${attemptNum}`);
        break;
      }
    }

    // Generate final summary and recommendation
    const finalAnalysis = await generateFinalAnalysis(ai, issue, result.attempts, logger);
    result.summary = finalAnalysis.summary;
    result.recommendation = finalAnalysis.recommendation;

    // Save results
    const outputPath = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}-repro.md`;
    const markdownReport = generateMarkdownReport(result);
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, markdownReport);

    const jsonPath = `.working/outputs/${issueRef.owner}-${issueRef.repo}-${issueRef.number}-repro.json`;
    await writeFile(jsonPath, JSON.stringify(result, null, 2));

    logger.info(`Reproduction ${result.reproduced ? 'SUCCESS' : 'FAILED'}`);
    logger.info(`Report saved to ${outputPath}`);
    logger.info(`JSON data saved to ${jsonPath}`);

    // Clean up LSP
    await lspHarness.stop();

  } catch (error) {
    logger.error(`Failed to test issue reproduction: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);

async function setupWorkspace(workspaceDir: string, config: Config, logger: Logger): Promise<void> {
  logger.debug(`Setting up workspace at ${workspaceDir}`);
  
  // Clean and create directory
  try {
    await rm(workspaceDir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, that's fine
  }
  
  await mkdir(workspaceDir, { recursive: true });

  // Initialize TypeScript project
  const tsconfigContent = {
    compilerOptions: {
      strict: true,
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
    },
  };

  await writeFile(join(workspaceDir, 'tsconfig.json'), JSON.stringify(tsconfigContent, null, 2));

  // Initialize package.json
  const packageJsonContent = {
    name: 'repro-workspace',
    version: '1.0.0',
    type: 'module',
  };

  await writeFile(join(workspaceDir, 'package.json'), JSON.stringify(packageJsonContent, null, 2));
}

async function runReproAttempt(
  ai: AIWrapper,
  lspHarness: LSPHarness,
  twoslashParser: TwoslashParser,
  issue: GitHubIssue,
  workspaceDir: string,
  attemptNum: number,
  previousAttempts: ReproAttempt[],
  config: Config,
  logger: Logger
): Promise<ReproAttempt> {
  const attempt: ReproAttempt = {
    attempt: attemptNum,
    approach: '',
    files: [],
    success: false,
    analysis: '',
  };

  try {
    // Get AI to generate reproduction approach and files
    const reproCode = await generateReproductionCode(ai, issue, previousAttempts, config);
    attempt.approach = reproCode.approach;
    attempt.files = reproCode.files;

    // Write files to workspace
    for (const file of attempt.files) {
      const filePath = join(workspaceDir, file.filename);
      ensureDirectoryExists(filePath);
      await writeFile(filePath, file.content);
    }

    // Run TypeScript compiler
    try {
      const tscOutput = execSync(`cd "${workspaceDir}" && ${config.typescript.tscPath} --noEmit`, {
        encoding: 'utf-8',
        timeout: 30000,
      });
      attempt.tscOutput = tscOutput;
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string };
      attempt.tscOutput = (execError.stdout ?? '') + (execError.stderr ?? '');
    }

    // Run LSP analysis if there's a twoslash-style query
    const mainFile = attempt.files.find(f => f.filename.includes('main') || f.filename.includes('index') || f.filename.endsWith('.ts'));
    if (mainFile && mainFile.content.includes('/*!*/')) {
      try {
        const twoslashContent = `// @strict: true\n\n// ${mainFile.filename}\n${mainFile.content}`;
        const twoslashConfig = twoslashParser.parse(twoslashContent);
        
        if (twoslashConfig.query) {
          await lspHarness.start(workspaceDir);
          const lspResult = await lspHarness.getHover(
            twoslashConfig.query.filename,
            twoslashConfig.query.position
          );
          attempt.lspOutput = JSON.stringify(lspResult, null, 2);
        }
      } catch (error) {
        logger.debug(`LSP analysis failed: ${error}`);
      }
    }

    // Analyze results with AI
    const analysis = await analyzeReproResults(ai, issue, attempt, logger);
    attempt.analysis = analysis.analysis;
    attempt.success = analysis.success;

  } catch (error) {
    attempt.analysis = `Reproduction attempt failed: ${error}`;
    attempt.success = false;
  }

  return attempt;
}

async function generateReproductionCode(ai: AIWrapper, issue: GitHubIssue, previousAttempts: ReproAttempt[], config: Config): Promise<{ approach: string; files: Array<{ filename: string; content: string }> }> {
  const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-3)
    .map((c) => c.body.slice(0, config.github.maxCommentLength))
    .join('\n---\n');

  const previousAttemptsText = previousAttempts.map(a => 
    `Attempt ${a.attempt}: ${a.approach}\nResult: ${a.success ? 'SUCCESS' : 'FAILED'}\nAnalysis: ${a.analysis}`
  ).join('\n\n');

  const messages = [
    { role: 'system' as const, content: await loadPrompt('repro-issue-system') },
    { role: 'user' as const, content: await loadPrompt('repro-issue-user', { issueNumber: String(issue.number), issueTitle: issue.title, body, recentComments, previousAttemptsText }) },
  ];
 
  const jsonSchema = zodToJsonSchema(ReproCodeSchema);
  const response = await ai.structuredCompletion<ReproCode>(messages, jsonSchema, { maxTokens: 2000 });
  
  return response;
}
 
 async function analyzeReproResults(ai: AIWrapper, issue: GitHubIssue, attempt: ReproAttempt, logger: Logger): Promise<{ analysis: string; success: boolean }> {
   const systemPrompt = await loadPrompt('repro-analyze-system');
   const userPrompt = await loadPrompt('repro-analyze-user', {
     issueTitle: issue.title,
     attemptApproach: attempt.approach,
     tscOutput: attempt.tscOutput ?? 'No TSC output',
     lspOutput: attempt.lspOutput ?? 'No LSP output',
   });
 
   const messages = [
     { role: 'system' as const, content: systemPrompt },
     { role: 'user' as const, content: userPrompt },
   ];
 
   const jsonSchema = zodToJsonSchema(ReproAnalysisSchema);
   const response = await ai.structuredCompletion<ReproAnalysis>(messages, jsonSchema, { maxTokens: 500 });
   
   return response;
 }
 
 async function generateFinalAnalysis(ai: AIWrapper, issue: GitHubIssue, attempts: ReproAttempt[], logger: Logger): Promise<{ summary: string; recommendation: string }> {
   const attemptsText = attempts.map(a => 
     `Attempt ${a.attempt}: ${a.approach}\n${a.success ? 'SUCCESS' : 'FAILED'} - ${a.analysis}`
   ).join('\n\n');
 
   const systemPrompt = await loadPrompt('repro-final-analysis-system');
   const userPrompt = await loadPrompt('repro-final-analysis-user', { issueTitle: issue.title, attemptsText });
 
   const messages = [
     { role: 'system' as const, content: systemPrompt },
     { role: 'user' as const, content: userPrompt },
   ];
 
   const jsonSchema = zodToJsonSchema(FinalAnalysisSchema);
   const response = await ai.structuredCompletion<FinalAnalysis>(messages, jsonSchema, { maxTokens: 800 });
   
   return response;
 }

function generateMarkdownReport(result: ReproResult): string {
  return `# Issue Reproduction Report

**Issue**: ${result.issueRef}  
**Title**: ${result.title}  
**Status**: ${result.reproduced ? '✅ REPRODUCED' : '❌ NOT REPRODUCED'}

## Summary

${result.summary}

## Reproduction Attempts

${result.attempts.map(attempt => `
### Attempt ${attempt.attempt}

**Approach**: ${attempt.approach}

**Files Created**:
${attempt.files.map(f => `- \`${f.filename}\``).join('\n')}

**Result**: ${attempt.success ? '✅ SUCCESS' : '❌ FAILED'}

**Analysis**: ${attempt.analysis}

${attempt.tscOutput ? `**TypeScript Output**:
\`\`\`
${attempt.tscOutput}
\`\`\`` : ''}

${attempt.lspOutput ? `**LSP Output**:
\`\`\`json
${attempt.lspOutput}
\`\`\`` : ''}
`).join('\n')}

## Recommendation

${result.recommendation}
`;
}