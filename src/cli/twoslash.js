#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { parseTwoslashFile, writeTwoslashFiles, findMarkerInFile, getCleanFileContent, createFileUri } from '../../packages/twoslash/src/index.js';
import { createLSPHarness, createPosition } from '../../packages/lsp-harness/src/index.js';
import { loadConfig, createLogger, parseArgs } from '../../packages/utils/src/index.js';

const logger = createLogger('twoslash');

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (args.length < 2) {
    console.error('Usage: twoslash.js <filename.md> <command> [--cwd <directory>]');
    console.error('Commands: signature-help, hover, completions, diagnostics');
    console.error('Example: twoslash.js example.md signature-help');
    process.exit(1);
  }
  
  try {
    const filename = args[0];
    const command = args[1];
    const cwd = options.cwd as string || process.cwd();
    
    // Parse the twoslash file
    logger.info(`Parsing twoslash file: ${filename}`);
    const document = await parseTwoslashFile(filename);
    
    if (document.files.length === 0) {
      throw new Error('No TypeScript files found in twoslash document');
    }
    
    // Create a temporary directory for the files
    const tempDir = join(cwd, '.twoslash-temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    try {
      // Write files to temp directory
      await writeTwoslashFiles(document, tempDir);
      
      // Load config and start LSP
      const config = await loadConfig();
      const lsp = createLSPHarness({
        lspPath: config.typescript.lspPath,
        logger
      });
      
      await lsp.start();
      
      try {
        // Open all files in LSP
        for (const file of document.files) {
          const uri = createFileUri(tempDir, file.filename);
          const cleanContent = getCleanFileContent(document, file.filename);
          if (cleanContent) {
            await lsp.openDocument(uri, cleanContent);
          }
        }
        
        // Find the first marker in the first file
        const firstFile = document.files[0];
        const markerPos = findMarkerInFile(document, firstFile.filename, 0);
        
        if (!markerPos) {
          throw new Error('No marker (/*!*/) found in the first file');
        }
        
        const uri = createFileUri(tempDir, firstFile.filename);
        const position = createPosition(markerPos.line, markerPos.character);
        
        // Execute the requested command
        let result: any;
        
        switch (command) {
          case 'signature-help':
            result = await lsp.getSignatureHelp(uri, position);
            break;
          case 'hover':
            result = await lsp.getHover(uri, position);
            break;
          case 'completions':
            result = await lsp.getCompletions(uri, position);
            break;
          case 'diagnostics':
            result = await lsp.getDiagnostics(uri);
            break;
          default:
            throw new Error(`Unknown command: ${command}`);
        }
        
        // Output the result
        if (result) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('No result');
        }
        
      } finally {
        await lsp.stop();
      }
      
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to clean up temp directory: ${error}`);
      }
    }
    
  } catch (error) {
    logger.error(`Failed to process twoslash file: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});