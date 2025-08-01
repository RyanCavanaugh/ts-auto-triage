#!/usr/bin/env node

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { createCLIOptions, handleError } from './utils.js';
import { createTwoslashParser } from '@ryancavanaugh/twoslash';
import { createLSPHarness } from '@ryancavanaugh/lsp-harness';

interface TwoslashResult {
  queryType: string;
  filename: string;
  position: number;
  result: unknown;
}

async function main() {
  const options = createCLIOptions();
  const { logger } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      throw new Error('Usage: twoslash <file.md> <query-type>');
    }

    const filename = args[0]!;
    const queryType = args[1]!;

    if (!existsSync(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    logger.info(`Processing twoslash queries in ${filename} for ${queryType}`);

    // Read and parse the markdown file
    const content = await readFile(filename, 'utf-8');
    const codeBlocks = extractTypeScriptCodeBlocks(content);

    if (codeBlocks.length === 0) {
      logger.warn('No TypeScript code blocks found in markdown file');
      return;
    }

    logger.info(`Found ${codeBlocks.length} TypeScript code block(s)`);

    // Process each code block
    const results: TwoslashResult[] = [];
    for (let i = 0; i < codeBlocks.length; i++) {
      const block = codeBlocks[i]!;
      logger.info(`Processing code block ${i + 1}/${codeBlocks.length}`);
      
      try {
        const result = await processCodeBlock(block, queryType, logger);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        logger.error(`Failed to process code block ${i + 1}: ${(error as Error).message}`);
      }
    }

    // Output results
    if (results.length > 0) {
      const outputDir = '.working/outputs';
      await mkdir(outputDir, { recursive: true });
      
      const outputFile = join(outputDir, `twoslash-${queryType}-${Date.now()}.json`);
      await writeFile(outputFile, JSON.stringify(results, null, 2));
      
      logger.info(`Results written to ${outputFile}`);
      
      // Also log a summary
      for (const result of results) {
        logger.info(`Query result for ${result.filename} at position ${result.position}:`);
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      logger.warn('No results generated');
    }

  } catch (error) {
    handleError(error as Error, logger);
  }
}

function extractTypeScriptCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let currentBlock: string[] = [];
  
  for (const line of lines) {
    if (line.trim().startsWith('```typescript') || line.trim().startsWith('```ts')) {
      inCodeBlock = true;
      currentBlock = [];
    } else if (line.trim() === '```' && inCodeBlock) {
      inCodeBlock = false;
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
      }
      currentBlock = [];
    } else if (inCodeBlock) {
      currentBlock.push(line);
    }
  }
  
  return blocks;
}

async function processCodeBlock(
  codeBlock: string, 
  queryType: string, 
  logger: any
): Promise<TwoslashResult | null> {
  const parser = createTwoslashParser({ logger });
  
  try {
    // Parse the twoslash document
    const document = parser.parseDocument(codeBlock);
    
    if (document.files.length === 0) {
      logger.warn('No files found in code block');
      return null;
    }

    // Find query position
    const query = parser.findQueryPosition(document, queryType);
    if (!query) {
      logger.warn(`No query of type '${queryType}' found in code block`);
      return null;
    }

    // Create temporary workspace
    const tempDir = resolve('.tmp', `twoslash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await mkdir(tempDir, { recursive: true });

    try {
      // Write files to temp directory
      for (const file of document.files) {
        const filePath = join(tempDir, file.filename);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content);
      }

      // Write tsconfig.json
      const tsconfigContent = parser.generateTsconfig(document);
      await writeFile(join(tempDir, 'tsconfig.json'), tsconfigContent);

      // Find TypeScript server path
      const tsServerPath = await findTypeScriptServer();
      
      // Create LSP harness
      const lsp = createLSPHarness({
        logger,
        tsServerPath,
        workspaceRoot: tempDir
      });

      await lsp.start();

      try {
        // Open the file with the query
        const targetFile = join(tempDir, query.filename);
        const fileContent = document.files.find(f => f.filename === query.filename)?.content || '';
        await lsp.openFile(targetFile, fileContent);

        // Convert position to line/character
        const position = offsetToPosition(fileContent, query.position);

        // Execute the appropriate query
        let result: unknown = null;
        switch (queryType) {
          case 'completions':
            result = await lsp.getCompletions(targetFile, position);
            break;
          case 'hover':
            result = await lsp.getHover(targetFile, position);
            break;
          case 'signature-help':
            result = await lsp.getSignatureHelp(targetFile, position);
            break;
          case 'navigate':
          case 'definition':
            result = await lsp.getDefinition(targetFile, position);
            break;
          default:
            throw new Error(`Unsupported query type: ${queryType}`);
        }

        return {
          queryType,
          filename: query.filename,
          position: query.position,
          result
        };
      } finally {
        await lsp.stop();
      }
    } finally {
      // Clean up temp directory
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Failed to clean up temp directory: ${(error as Error).message}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to process code block: ${(error as Error).message}`);
    return null;
  }
}

function offsetToPosition(content: string, offset: number): { line: number; character: number } {
  const lines = content.substring(0, offset).split('\n');
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1]?.length || 0
  };
}

async function findTypeScriptServer(): Promise<string> {
  // Try common locations for TypeScript server
  const commonPaths = [
    'node_modules/typescript/lib/tsserver.js',
    '../../../node_modules/typescript/lib/tsserver.js',
    '/usr/local/lib/node_modules/typescript/lib/tsserver.js'
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return resolve(path);
    }
  }

  // Fallback: assume typescript is in PATH
  return 'tsserver';
}

main();