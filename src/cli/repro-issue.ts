#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { createLSPHarness } from '../lib/lsp-harness.js';
import { createTwoslashParser } from '../lib/twoslash.js';
import { ConfigSchema, GitHubIssueSchema } from '../lib/schemas.js';

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

async function setupWorkspace(workspaceDir: string, config: any, logger: any): Promise<void> {
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
  ai: any,
  lspHarness: any,
  twoslashParser: any,
  issue: any,
  workspaceDir: string,
  attemptNum: number,
  previousAttempts: ReproAttempt[],
  config: any,
  logger: any
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
    } catch (error: any) {
      attempt.tscOutput = error.stdout + error.stderr;
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

async function generateReproductionCode(ai: any, issue: any, previousAttempts: ReproAttempt[], config: any): Promise<{ approach: string; files: Array<{ filename: string; content: string }> }> {
  const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-3)
    .map((c: any) => c.body.slice(0, config.github.maxCommentLength))
    .join('\n---\n');

  const previousAttemptsText = previousAttempts.map(a => 
    `Attempt ${a.attempt}: ${a.approach}\nResult: ${a.success ? 'SUCCESS' : 'FAILED'}\nAnalysis: ${a.analysis}`
  ).join('\n\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert TypeScript developer who reproduces GitHub issues. Create minimal, focused reproduction cases.

Respond with JSON containing:
{
  "approach": "Brief description of your reproduction strategy",
  "files": [
    {"filename": "main.ts", "content": "// TypeScript code here"}
  ]
}

Guidelines:
- Create the smallest possible reproduction
- Use modern TypeScript syntax
- Include /*!*/ markers for LSP queries when relevant
- Focus on the core issue, not edge cases
- If it's a compiler error, show the error
- If it's LSP behavior, use hover/completion queries`,
    },
    {
      role: 'user' as const,
      content: `Issue #${issue.number}: ${issue.title}

Body:
${body}

Recent Comments:
${recentComments}

Previous Attempts:
${previousAttemptsText}

Create a reproduction case for this issue.`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 2000 });
  
  try {
    return JSON.parse(response.content);
  } catch {
    // Fallback if JSON parsing fails
    return {
      approach: 'Generated basic reproduction case',
      files: [
        {
          filename: 'main.ts',
          content: '// Failed to parse AI response\nconsole.log("Unable to generate reproduction");',
        },
      ],
    };
  }
}

async function analyzeReproResults(ai: any, issue: any, attempt: ReproAttempt, logger: any): Promise<{ analysis: string; success: boolean }> {
  const messages = [
    {
      role: 'system' as const,
      content: `You are analyzing a TypeScript issue reproduction attempt. Determine if the reproduction successfully demonstrates the reported issue.

Respond with JSON:
{
  "success": true/false,
  "analysis": "Detailed explanation of the results and whether they match the reported issue"
}`,
    },
    {
      role: 'user' as const,
      content: `Original Issue: ${issue.title}

Approach: ${attempt.approach}

TSC Output:
${attempt.tscOutput ?? 'No TSC output'}

LSP Output:
${attempt.lspOutput ?? 'No LSP output'}

Does this reproduction successfully demonstrate the reported issue?`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 500 });
  
  try {
    return JSON.parse(response.content);
  } catch {
    return {
      success: false,
      analysis: 'Failed to analyze reproduction results',
    };
  }
}

async function generateFinalAnalysis(ai: any, issue: any, attempts: ReproAttempt[], logger: any): Promise<{ summary: string; recommendation: string }> {
  const attemptsText = attempts.map(a => 
    `Attempt ${a.attempt}: ${a.approach}\n${a.success ? 'SUCCESS' : 'FAILED'} - ${a.analysis}`
  ).join('\n\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You are summarizing TypeScript issue reproduction results. Create a professional summary suitable for showing to the issue reporter.

Focus on:
- Whether the issue was successfully reproduced
- Technical details of the findings
- Recommendations for next steps`,
    },
    {
      role: 'user' as const,
      content: `Issue: ${issue.title}

Reproduction Attempts:
${attemptsText}

Provide a summary and recommendation.`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 800 });
  
  const parts = response.content.split('RECOMMENDATION:');
  return {
    summary: parts[0]?.trim() ?? response.content,
    recommendation: parts[1]?.trim() ?? 'No specific recommendation provided',
  };
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