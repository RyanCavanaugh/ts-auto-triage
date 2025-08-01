#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createIssueFetcher, parseIssueRef } from '../../packages/issue-fetcher/src/index.js';
import { createAIWrapper } from '../../packages/ai-wrapper/src/index.js';
import { createKVCache } from '../../packages/kvcache/src/index.js';
import { parseTwoslashContent, writeTwoslashFiles } from '../../packages/twoslash/src/index.js';
import { createLSPHarness } from '../../packages/lsp-harness/src/index.js';
import { loadConfig, getGitHubToken, createLogger, truncateText } from '../../packages/utils/src/index.js';
import { z } from 'zod';

const execAsync = promisify(exec);
const logger = createLogger('repro-issue');

const ReproStepSchema = z.object({
  type: z.enum(['create_file', 'run_command', 'check_output']),
  description: z.string(),
  filename: z.string().optional(),
  content: z.string().optional(),
  command: z.string().optional(),
  expected: z.string().optional()
});

const ReproAnalysisSchema = z.object({
  understanding: z.string(),
  reproduction_steps: z.array(ReproStepSchema),
  expected_behavior: z.string(),
  actual_behavior: z.string()
});

const ReproResultSchema = z.object({
  success: z.boolean(),
  reproduced: z.boolean(),
  summary: z.string(),
  details: z.string(),
  files_created: z.array(z.string()),
  commands_run: z.array(z.string())
});

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: repro-issue.js <issue-ref>');
    console.error('Example: repro-issue.js Microsoft/TypeScript#9998');
    console.error('         repro-issue.js https://github.com/Microsoft/TypeScript/issues/9998');
    process.exit(1);
  }
  
  try {
    const issueRefStr = args[0];
    const issueRef = parseIssueRef(issueRefStr);
    const token = await getGitHubToken();
    const config = await loadConfig();
    
    // Initialize services
    const fetcher = createIssueFetcher({ token, logger, dataPath: '.data' });
    const ai = createAIWrapper({ config: config.azure, logger });
    const cache = createKVCache('.kvcache');
    
    // Load the issue
    logger.info(`Loading issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    const issue = await fetcher.fetchIssue(issueRef, false);
    
    if (!issue) {
      throw new Error(`Could not load issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    }
    
    logger.info(`Reproducing issue: "${issue.title}"`);
    
    // Create working directory
    const reproDir = join('.working', 'repros', `${issueRef.owner}-${issueRef.repo}-${issueRef.number}`);
    await fs.mkdir(reproDir, { recursive: true });
    
    // Create issue text for analysis
    let issueText = `Title: ${issue.title}\\n\\n`;
    if (issue.body) {
      issueText += `Body: ${truncateText(issue.body, 6000)}\\n\\n`;
    }
    
    // Add relevant comments with code examples
    const codeComments = issue.comments_data
      .filter(comment => comment.body.includes('```') || comment.body.includes('reproduce'))
      .slice(0, 3)
      .map(comment => `Comment by ${comment.user.login}: ${truncateText(comment.body, 1000)}`)
      .join('\\n\\n');
    
    if (codeComments) {
      issueText += `Relevant comments with code: ${codeComments}\\n\\n`;
    }
    
    // Analyze the issue and create reproduction plan
    logger.info('Analyzing issue and creating reproduction plan...');
    
    const analysisPrompt = `You are an expert TypeScript developer tasked with reproducing a bug report. Analyze this GitHub issue and create a detailed reproduction plan.

Issue:
${issueText}

Create a step-by-step reproduction plan that includes:
1. Understanding what the issue is about
2. Files to create (with realistic content)
3. Commands to run (tsc, npm install, etc.)
4. What to check in the output

Focus on minimal reproduction. If the issue mentions specific TypeScript features, create focused examples.
If it mentions compilation errors, create code that should trigger those errors.
If it mentions LSP behavior, create code suitable for LSP testing.

Respond with JSON:
{
  "understanding": "Brief summary of what this issue is about",
  "reproduction_steps": [
    {
      "type": "create_file",
      "description": "Create main TypeScript file",
      "filename": "test.ts", 
      "content": "// TypeScript code here"
    },
    {
      "type": "run_command",
      "description": "Compile with TypeScript",
      "command": "tsc test.ts"
    },
    {
      "type": "check_output", 
      "description": "Check for expected error",
      "expected": "Error message or file content"
    }
  ],
  "expected_behavior": "What should happen",
  "actual_behavior": "What the issue reporter says happens"
}`;
    
    const analysis = await cache.memoize(
      `repro-analysis-${issueRef.owner}-${issueRef.repo}-${issueRef.number}`,
      async () => {
        return await ai.generateStructured(
          [{ role: 'user', content: analysisPrompt }],
          ReproAnalysisSchema,
          { model: 'gpt4', maxTokens: 2000 }
        );
      },
      { ttlHours: 24 }
    );
    
    logger.info(`Analysis complete: ${analysis.understanding}`);
    logger.info(`Reproduction steps: ${analysis.reproduction_steps.length}`);
    
    // Execute reproduction steps
    const result = await executeReproduction(analysis, reproDir, config);
    
    // Generate final report
    const reportPath = join('.working', 'outputs', `repro-${issueRef.owner}-${issueRef.repo}-${issueRef.number}.md`);
    await fs.mkdir(join('.working', 'outputs'), { recursive: true });
    
    let report = `# Issue Reproduction: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}\\n\\n`;
    report += `**Issue Title:** ${issue.title}\\n\\n`;
    report += `**Analysis Date:** ${new Date().toISOString()}\\n\\n`;
    report += `**Working Directory:** ${reproDir}\\n\\n`;
    
    report += `## Understanding\\n\\n${analysis.understanding}\\n\\n`;
    
    report += `## Expected vs Actual Behavior\\n\\n`;
    report += `**Expected:** ${analysis.expected_behavior}\\n\\n`;
    report += `**Actual (Reported):** ${analysis.actual_behavior}\\n\\n`;
    
    report += `## Reproduction Result\\n\\n`;
    report += `**Success:** ${result.success ? 'Yes' : 'No'}\\n`;
    report += `**Bug Reproduced:** ${result.reproduced ? 'Yes' : 'No'}\\n\\n`;
    report += `**Summary:** ${result.summary}\\n\\n`;
    
    report += `## Details\\n\\n${result.details}\\n\\n`;
    
    report += `## Files Created\\n\\n`;
    for (const file of result.files_created) {
      report += `- ${file}\\n`;
    }
    
    report += `\\n## Commands Run\\n\\n`;
    for (const cmd of result.commands_run) {
      report += `- \`${cmd}\`\\n`;
    }
    
    report += `\\n## Reproduction Steps\\n\\n`;
    for (let i = 0; i < analysis.reproduction_steps.length; i++) {
      const step = analysis.reproduction_steps[i];
      report += `${i + 1}. **${step.type}**: ${step.description}\\n`;
      if (step.filename) report += `   - File: ${step.filename}\\n`;
      if (step.command) report += `   - Command: \`${step.command}\`\\n`;
      if (step.expected) report += `   - Expected: ${step.expected}\\n`;
      report += `\\n`;
    }
    
    await fs.writeFile(reportPath, report);
    
    logger.info(`Reproduction completed`);
    logger.info(`Success: ${result.success}`);
    logger.info(`Bug reproduced: ${result.reproduced}`);
    logger.info(`Report: ${reportPath}`);
    
    // Output summary to console
    console.log('\\n=== ISSUE REPRODUCTION RESULT ===');
    console.log(`Issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    console.log(`Title: ${issue.title}`);
    console.log(`Success: ${result.success}`);
    console.log(`Bug Reproduced: ${result.reproduced}`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Working Directory: ${reproDir}`);
    console.log(`Full Report: ${reportPath}`);
    
  } catch (error) {
    logger.error(`Failed to reproduce issue: ${error}`);
    process.exit(1);
  }
}

async function executeReproduction(analysis: z.infer<typeof ReproAnalysisSchema>, reproDir: string, config: any): Promise<z.infer<typeof ReproResultSchema>> {
  const filesCreated: string[] = [];
  const commandsRun: string[] = [];
  let details = '';
  let success = true;
  let reproduced = false;
  
  try {
    // Initialize TypeScript project if needed
    const hasTypeScriptSteps = analysis.reproduction_steps.some(step => 
      step.command?.includes('tsc') || step.filename?.endsWith('.ts')
    );
    
    if (hasTypeScriptSteps) {
      logger.info('Initializing TypeScript project...');
      await execAsync('tsc --init', { cwd: reproDir });
      commandsRun.push('tsc --init');
      details += 'Initialized TypeScript project\\n';
      
      // Also initialize npm project for dependencies
      await execAsync('npm init -y', { cwd: reproDir });
      commandsRun.push('npm init -y');
      details += 'Initialized npm project\\n';
    }
    
    // Execute each step
    for (let i = 0; i < analysis.reproduction_steps.length; i++) {
      const step = analysis.reproduction_steps[i];
      logger.info(`Executing step ${i + 1}: ${step.description}`);
      
      try {
        switch (step.type) {
          case 'create_file':
            if (step.filename && step.content) {
              const filePath = join(reproDir, step.filename);
              await fs.writeFile(filePath, step.content);
              filesCreated.push(step.filename);
              details += `Created file: ${step.filename}\\n`;
            }
            break;
            
          case 'run_command':
            if (step.command) {
              try {
                const { stdout, stderr } = await execAsync(step.command, { 
                  cwd: reproDir,
                  timeout: 30000 // 30 second timeout
                });
                commandsRun.push(step.command);
                details += `Command: ${step.command}\\n`;
                if (stdout) details += `STDOUT: ${stdout}\\n`;
                if (stderr) details += `STDERR: ${stderr}\\n`;
              } catch (error: any) {
                commandsRun.push(step.command);
                details += `Command: ${step.command} (FAILED)\\n`;
                details += `Error: ${error.message}\\n`;
                if (error.stdout) details += `STDOUT: ${error.stdout}\\n`;
                if (error.stderr) details += `STDERR: ${error.stderr}\\n`;
                
                // Command failure might be expected for bug reproduction
                if (step.expected && (error.stderr?.includes(step.expected) || error.stdout?.includes(step.expected))) {
                  reproduced = true;
                  details += `Expected error found - bug reproduced!\\n`;
                }
              }
            }
            break;
            
          case 'check_output':
            if (step.expected) {
              // Check if we can find the expected output in recent command outputs or files
              const recentOutput = details.slice(-2000); // Last 2000 characters
              if (recentOutput.includes(step.expected)) {
                reproduced = true;
                details += `Expected output found: ${step.expected}\\n`;
              } else {
                details += `Expected output NOT found: ${step.expected}\\n`;
              }
            }
            break;
        }
      } catch (error) {
        logger.warn(`Step ${i + 1} failed: ${error}`);
        details += `Step ${i + 1} failed: ${error}\\n`;
        success = false;
      }
    }
    
  } catch (error) {
    logger.error(`Reproduction execution failed: ${error}`);
    details += `Execution failed: ${error}\\n`;
    success = false;
  }
  
  let summary: string;
  if (!success) {
    summary = 'Reproduction attempt failed due to execution errors';
  } else if (reproduced) {
    summary = 'Successfully reproduced the reported issue';
  } else {
    summary = 'Reproduction completed but issue was not reproduced - may be fixed or require different conditions';
  }
  
  return {
    success,
    reproduced,
    summary,
    details,
    files_created: filesCreated,
    commands_run: commandsRun
  };
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});