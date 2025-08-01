#!/usr/bin/env node

import { createTwoslashParser } from '@ryancavanaugh/twoslash';
import { createLSPHarness } from '@ryancavanaugh/lsp-harness';
import { createCLIOptions, loadConfig, handleError } from './utils.js';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const options = createCLIOptions();
  const { logger, workingDir } = options;

  try {
    const args = process.argv.slice(2);
    const [filename, command, ...rest] = args;

    if (!filename || !command) {
      throw new Error('Usage: twoslash <filename.md> <command> [options]');
    }

    const config = await loadConfig();
    const parser = createTwoslashParser({ logger });

    // Parse command line options
    let cwd = process.cwd();
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--cwd' && rest[i + 1]) {
        cwd = rest[i + 1]!;
        break;
      }
    }

    logger.info(`Processing twoslash file: ${filename}`);
    logger.info(`Command: ${command}`);
    logger.info(`Working directory: ${cwd}`);

    // Read and parse the twoslash file
    const content = await fs.readFile(filename, 'utf-8');
    const document = parser.parseDocument(content);

    logger.debug(`Parsed ${document.files.length} files and ${document.queries.length} queries`);

    // Create a temporary workspace for the files
    const workspaceDir = path.join(workingDir, 'twoslash', Date.now().toString());
    await fs.mkdir(workspaceDir, { recursive: true });

    try {
      // Write tsconfig.json
      const tsconfig = parser.generateTsconfig(document);
      await fs.writeFile(path.join(workspaceDir, 'tsconfig.json'), tsconfig);

      // Write all files to disk
      for (const file of document.files) {
        const filePath = path.join(workspaceDir, file.filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content);
      }

      // Copy any additional files from the cwd if different
      if (cwd !== workspaceDir) {
        try {
          const packageJsonPath = path.join(cwd, 'package.json');
          await fs.access(packageJsonPath);
          const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
          await fs.writeFile(path.join(workspaceDir, 'package.json'), packageJson);
        } catch {
          // package.json doesn't exist, that's ok
        }
      }

      // Start LSP harness
      const lspPath = config.typescript?.lspEntryPoint || 'typescript/lib/tsserver.js';
      const harness = createLSPHarness({
        logger,
        tsServerPath: lspPath,
        workspaceRoot: workspaceDir
      });

      await harness.start();

      try {
        // Open all files in the LSP
        for (const file of document.files) {
          await harness.openFile(path.join(workspaceDir, file.filename), file.content);
        }

        // Find the query position
        const query = parser.findQueryPosition(document, command);
        if (!query) {
          throw new Error(`No query found for command: ${command}`);
        }

        // Convert position to line/character
        const fileContent = document.files.find(f => f.filename === query.filename)?.content || '';
        const lines = fileContent.substring(0, query.position).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1]?.length || 0;

        logger.debug(`Query position: ${query.filename}:${line}:${character}`);

        // Execute the appropriate LSP command
        let result: unknown;
        const filePath = path.join(workspaceDir, query.filename);

        switch (command) {
          case 'signature-help':
            result = await harness.getSignatureHelp(filePath, { line, character });
            break;
          case 'completions':
            result = await harness.getCompletions(filePath, { line, character });
            break;
          case 'hover':
            result = await harness.getHover(filePath, { line, character });
            break;
          case 'navigate':
          case 'definition':
            result = await harness.getDefinition(filePath, { line, character });
            break;
          default:
            throw new Error(`Unsupported command: ${command}`);
        }

        // Output the result
        if (result) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('No result');
        }

      } finally {
        await harness.stop();
      }

    } finally {
      // Clean up workspace
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();