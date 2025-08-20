#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger } from '../lib/utils.js';
import { createTwoslashParser } from '../lib/twoslash.js';
import { createLSPHarness, type LSPSignatureHelp, type LSPHover, type LSPCompletion } from '../lib/lsp-harness.js';
import { ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error('Usage: twoslash <filename.md> <command> [options]');
      console.error('Commands: signature-help, hover, completions');
      console.error('Options: --cwd <directory>');
      process.exit(1);
    }

    const filename = args[0]!;
    const command = args[1]!;
    
    // Parse optional arguments
    let cwd = process.cwd();
    const cwdIndex = args.indexOf('--cwd');
    if (cwdIndex !== -1 && cwdIndex + 1 < args.length) {
      cwd = args[cwdIndex + 1]!;
    }
    
    logger.info(`Processing twoslash file: ${filename}`);
    logger.info(`Command: ${command}`);
    logger.info(`Working directory: ${cwd}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Read and parse the markdown file
    const markdownContent = await readFile(filename, 'utf-8');
    const parser = createTwoslashParser(logger);
    const twoslashConfig = parser.parse(markdownContent);
    
    if (twoslashConfig.files.length === 0) {
      logger.error('No TypeScript files found in the markdown');
      process.exit(1);
    }
    
    if (!twoslashConfig.query) {
      logger.error('No query position (/*!*/) found in the files');
      process.exit(1);
    }

    // Write files to a temporary directory
    const tempDir = `.working/repros/twoslash-${Date.now()}`;
    await parser.writeFiles(twoslashConfig, tempDir);
    
    // Start LSP server
    const lspHarness = createLSPHarness(config.typescript.lspEntryPoint, logger);
    await lspHarness.start(tempDir);
    
    try {
      // Open the document with the query
      const queryFile = `${tempDir}/${twoslashConfig.query.filename}`;
      const queryFileContent = twoslashConfig.files.find(f => f.filename === twoslashConfig.query!.filename)?.content ?? '';
      
      await lspHarness.openDocument(queryFile, queryFileContent);
      
      // Execute the requested command
      let result: LSPSignatureHelp | LSPHover | LSPCompletion[] | null;
      switch (command) {
        case 'signature-help':
          result = await lspHarness.getSignatureHelp(queryFile, twoslashConfig.query.position);
          if (result?.signatures?.[0]) {
            console.log(result.signatures[0].label);
            if (result.signatures[0].documentation) {
              console.log(result.signatures[0].documentation);
            }
          } else {
            console.log('No signature help available');
          }
          break;
          
        case 'hover':
          result = await lspHarness.getHover(queryFile, twoslashConfig.query.position);
          if (result?.contents) {
            console.log(result.contents);
          } else {
            console.log('No hover information available');
          }
          break;
          
        case 'completions':
          result = await lspHarness.getCompletions(queryFile, twoslashConfig.query.position);
          if (result && result.length > 0) {
            result.forEach((completion: LSPCompletion) => {
              console.log(`${completion.label} - ${completion.detail || 'no detail'}`);
            });
          } else {
            console.log('No completions available');
          }
          break;
          
        default:
          logger.error(`Unknown command: ${command}`);
          console.error('Available commands: signature-help, hover, completions');
          process.exit(1);
      }
      
    } finally {
      await lspHarness.stop();
    }

  } catch (error) {
    logger.error(`Failed to process twoslash: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);