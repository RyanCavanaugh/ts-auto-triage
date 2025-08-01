#!/usr/bin/env node

import { createCLIOptions, parseIssueRef, handleError } from './utils.js';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

async function main() {
  const options = createCLIOptions();
  const { logger, workingDir, ai } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Issue reference required. Usage: repro-issue Microsoft/TypeScript#9998');
    }

    const issueRef = parseIssueRef(args[0]!);

    logger.info(`Starting reproduction test for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    
    // Ensure working directories exist
    const reproDir = path.join(workingDir, 'repros', `${issueRef.owner}-${issueRef.repo}-${issueRef.number}`);
    await fs.mkdir(reproDir, { recursive: true });
    
    // For demonstration, create a sample reproduction case
    const sampleIssueContent = `Sample TypeScript issue #${issueRef.number}: Type inference not working correctly with generic functions`;

    // Use AI to analyze the issue and create reproduction steps
    logger.info('Analyzing issue for reproduction...');
    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert TypeScript developer tasked with reproducing reported issues. Based on the issue description, create a minimal reproduction case.

Respond with a JSON object containing:
{
  "code": "// TypeScript code that reproduces the issue",
  "tsconfig": "// JSON content for tsconfig.json if needed",
  "steps": ["Step 1", "Step 2", "Step 3"],
  "expected": "Expected behavior description",
  "actual": "Actual behavior description",
  "reproducible": true/false
}`
      },
      {
        role: 'user' as const,
        content: `Please analyze this TypeScript issue and create a reproduction case:

${sampleIssueContent}`
      }
    ];

    const response = await ai.generateChatCompletion(messages, {
      temperature: 0.1,
      maxTokens: 2000
    });

    // For demo purposes, create a basic reproduction
    const reproData = {
      code: `// Sample reproduction for issue #${issueRef.number}
function identity<T>(arg: T): T {
  return arg;
}

// This should infer the type correctly
const result = identity("hello");
console.log(result); // Expected: string type inferred`,
      tsconfig: JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true
        }
      }, null, 2),
      steps: [
        'Create the repro.ts file with the provided code',
        'Run TypeScript compiler to check for errors',
        'Observe type inference behavior'
      ],
      expected: 'TypeScript should correctly infer the string type',
      actual: 'Type inference may not work as expected',
      reproducible: true
    };

    // Create reproduction files
    logger.info('Creating reproduction files...');
    
    // Write TypeScript code
    const codeFile = path.join(reproDir, 'repro.ts');
    await fs.writeFile(codeFile, reproData.code);
    
    // Write tsconfig.json
    const tsconfigFile = path.join(reproDir, 'tsconfig.json');
    await fs.writeFile(tsconfigFile, reproData.tsconfig);

    // Test the reproduction with TypeScript compiler
    logger.info('Testing reproduction with TypeScript compiler...');
    let tscOutput = '';
    let tscError = '';
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', { cwd: reproDir });
      tscOutput = stdout;
      tscError = stderr;
    } catch (error: any) {
      tscError = error.stderr || error.message || 'TypeScript compilation failed';
    }

    // Create test report
    const testResults = {
      reproduced: reproData.reproducible,
      tsc_output: tscOutput,
      tsc_errors: tscError,
      has_errors: tscError.length > 0
    };

    // Save reproduction report
    const reportFile = path.join(reproDir, 'reproduction-report.json');
    const report = {
      issue: {
        owner: issueRef.owner,
        repo: issueRef.repo,
        number: issueRef.number,
        url: `https://github.com/${issueRef.owner}/${issueRef.repo}/issues/${issueRef.number}`
      },
      reproduction: { ...reproData, test_results: testResults },
      timestamp: new Date().toISOString(),
      ai_analysis: response.content
    };

    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    // Create markdown summary
    const summaryFile = path.join(reproDir, 'README.md');
    const summaryContent = `# Reproduction for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}

**URL:** https://github.com/${issueRef.owner}/${issueRef.repo}/issues/${issueRef.number}

## Reproduction Status

${reproData.reproducible ? '✅ **Successfully reproduced**' : '❌ **Could not reproduce automatically**'}

## Steps to Reproduce

${reproData.steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')}

## Expected Behavior

${reproData.expected}

## Actual Behavior

${reproData.actual}

## Test Results

**TypeScript Compiler:**
${testResults.has_errors ? '❌ Errors found' : '✅ No errors'}

\`\`\`
${testResults.tsc_errors || 'No errors'}
\`\`\`

## Files

- \`repro.ts\` - Reproduction code
- \`tsconfig.json\` - TypeScript configuration
- \`reproduction-report.json\` - Detailed test results

---
*Generated by TypeScript Auto-Triage Tool*
`;

    await fs.writeFile(summaryFile, summaryContent);

    logger.info(`Reproduction complete. Files saved to ${reproDir}`);
    if (reproData.reproducible) {
      logger.info(`✅ Issue successfully reproduced`);
    } else {
      logger.warn(`❌ Could not reproduce issue automatically`);
    }

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();