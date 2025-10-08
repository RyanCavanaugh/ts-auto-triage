import { writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { ReproSteps, CompilerReproSteps, LSReproSteps, BugRevalidation } from './schemas.js';
import { BugRevalidationSchema } from './schemas.js';
import { loadPrompt } from './prompts.js';
import { ensureDirectoryExists } from './utils.js';
import type { LSPHarness } from './lsp-harness.js';
import { createTwoslashParser } from './twoslash.js';

export interface ReproValidator {
  validateReproSteps(
    reproSteps: ReproSteps,
    workspaceDir: string,
    issueTitle: string,
    issueKey: string
  ): Promise<BugRevalidation>;
}

export function createReproValidator(
  ai: AIWrapper,
  lspHarness: LSPHarness,
  logger: Logger
): ReproValidator {
  return {
    async validateReproSteps(
      reproSteps: ReproSteps,
      workspaceDir: string,
      issueTitle: string,
      issueKey: string
    ): Promise<BugRevalidation> {
      if (reproSteps.type === 'compiler-repro') {
        return await validateCompilerRepro(reproSteps, workspaceDir, issueTitle, issueKey, ai, logger);
      } else {
        return await validateLSRepro(reproSteps, workspaceDir, issueTitle, issueKey, ai, lspHarness, logger);
      }
    },
  };
}

async function validateCompilerRepro(
  reproSteps: CompilerReproSteps,
  workspaceDir: string,
  issueTitle: string,
  issueKey: string,
  ai: AIWrapper,
  logger: Logger
): Promise<BugRevalidation> {
  logger.debug(`Validating compiler repro for ${issueKey}`);

  // Write files to workspace
  for (const [filename, content] of Object.entries(reproSteps.fileMap)) {
    const filePath = join(workspaceDir, filename);
    ensureDirectoryExists(filePath);
    await writeFile(filePath, content);
    logger.debug(`Wrote ${filename}`);
  }

  // Run TypeScript compiler
  let tscOutput = '';
  let exitCode = 0;
  try {
    const args = reproSteps.cmdLineArgs.join(' ');
    const cmd = `npx tsc ${args}`;
    logger.debug(`Running: ${cmd}`);
    tscOutput = execSync(cmd, { 
      cwd: workspaceDir, 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error && 'status' in error) {
      tscOutput = String((error as { stdout?: unknown }).stdout ?? '') + '\n' + String((error as { stderr?: unknown }).stderr ?? '');
      exitCode = Number((error as { status?: unknown }).status ?? 1);
    } else {
      tscOutput = `Error running tsc: ${error}`;
      exitCode = 1;
    }
  }

  // Get file outputs if they exist
  let fileOutputs = '';
  try {
    const jsFiles = Object.keys(reproSteps.fileMap)
      .filter(f => f.endsWith('.ts'))
      .map(f => f.replace('.ts', '.js'));
    
    for (const jsFile of jsFiles) {
      try {
        const { readFile } = await import('fs/promises');
        const content = await readFile(join(workspaceDir, jsFile), 'utf-8');
        fileOutputs += `\n--- ${jsFile} ---\n${content}\n`;
      } catch {
        // File doesn't exist, skip
      }
    }
  } catch {
    // Ignore errors reading output files
  }

  const output = `Exit code: ${exitCode}\n${tscOutput}${fileOutputs}`;

  // Ask AI to validate the bug status
  const messages = [
    { role: 'system' as const, content: await loadPrompt('repro-validate-system') },
    { 
      role: 'user' as const, 
      content: await loadPrompt('repro-validate-user', { 
        issueTitle,
        instructions: reproSteps.instructions,
        output: output.slice(0, 5000), // Limit output size
      }) 
    },
  ];

  const validation = await ai.completion(messages, { 
    jsonSchema: BugRevalidationSchema,
    maxTokens: 500,
    context: `Validate compiler repro for ${issueKey}`,
    effort: 'High',
  });

  return validation;
}

async function validateLSRepro(
  reproSteps: LSReproSteps,
  workspaceDir: string,
  issueTitle: string,
  issueKey: string,
  ai: AIWrapper,
  lspHarness: LSPHarness,
  logger: Logger
): Promise<BugRevalidation> {
  logger.debug(`Validating language service repro for ${issueKey}`);

  // Parse twoslash content
  const twoslashParser = createTwoslashParser(logger);
  const config = twoslashParser.parse(reproSteps.twoslash);

  // Write files
  await twoslashParser.writeFiles(config, workspaceDir);

  // Start LSP
  await lspHarness.start(workspaceDir);

  // Get query position and make LSP request
  let lspOutput = '';
  if (config.query) {
    const filePath = join(workspaceDir, config.query.filename);
    logger.debug(`Querying LSP at ${config.query.filename}:${config.query.position.line}:${config.query.position.character}`);
    
    // Open document first
    const { readFile } = await import('fs/promises');
    const fileContent = await readFile(filePath, 'utf-8');
    await lspHarness.openDocument(filePath, fileContent);
    
    try {
      const completions = await lspHarness.getCompletions(
        filePath,
        config.query.position
      );
      lspOutput = JSON.stringify(completions, null, 2);
    } catch (error) {
      lspOutput = `Error querying LSP: ${error}`;
    }
  } else {
    lspOutput = 'No query position found in twoslash content';
  }

  // Ask AI to validate the bug status
  const messages = [
    { role: 'system' as const, content: await loadPrompt('repro-validate-system') },
    { 
      role: 'user' as const, 
      content: await loadPrompt('repro-validate-user', { 
        issueTitle,
        instructions: reproSteps.instructions,
        output: lspOutput.slice(0, 5000),
      }) 
    },
  ];

  const validation = await ai.completion(messages, { 
    jsonSchema: BugRevalidationSchema,
    maxTokens: 500,
    context: `Validate LS repro for ${issueKey}`,
    effort: 'High',
  });

  return validation;
}
