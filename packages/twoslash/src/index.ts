import { Logger } from '@ryancavanaugh/utils';
import { TwoslashDocument, FileEntry, QueryPosition, twoslashDocumentSchema } from './schemas.js';

export interface TwoslashParserOptions {
  logger: Logger;
}

export function createTwoslashParser(options: TwoslashParserOptions) {
  const { logger } = options;

  function parseDocument(content: string): TwoslashDocument {
    const lines = content.split('\n');
    const compilerOptions: Record<string, unknown> = {};
    const files: FileEntry[] = [];
    const queries: QueryPosition[] = [];
    
    let currentFile: { filename: string; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // Parse compiler options
      if (trimmed.startsWith('// @')) {
        const optionMatch = trimmed.match(/^\/\/ @(\w+):\s*(.+)$/);
        if (optionMatch) {
          const [, optionName, optionValue] = optionMatch;
          if (optionName && optionValue) {
            // Parse boolean values
            if (optionValue === 'true') {
              compilerOptions[optionName] = true;
            } else if (optionValue === 'false') {
              compilerOptions[optionName] = false;
            } else if (!isNaN(Number(optionValue))) {
              compilerOptions[optionName] = Number(optionValue);
            } else {
              compilerOptions[optionName] = optionValue;
            }
          }
        }
        continue;
      }

      // Parse file declarations
      if (trimmed.startsWith('// ') && trimmed.endsWith('.ts')) {
        // Save previous file if exists
        if (currentFile) {
          files.push({
            filename: currentFile.filename,
            content: currentFile.lines.join('\n')
          });
        }

        // Start new file
        const filename = trimmed.substring(3);
        currentFile = {
          filename,
          lines: []
        };
        continue;
      }

      // Parse query markers
      if (line.includes('/*!*/')) {
        if (currentFile) {
          const position = line.indexOf('/*!*/');
          const contentBeforeMarker = currentFile.lines.join('\n') + '\n' + line.substring(0, position);
          queries.push({
            filename: currentFile.filename,
            position: contentBeforeMarker.length,
            type: 'signature-help' // Default type, can be overridden
          });
          
          // Remove the marker from the line
          const cleanLine = line.replace('/*!*/', '');
          if (cleanLine.trim()) {
            currentFile.lines.push(cleanLine);
          }
        }
        continue;
      }

      // Add content to current file
      if (currentFile) {
        currentFile.lines.push(line);
      }
    }

    // Save last file if exists
    if (currentFile) {
      files.push({
        filename: currentFile.filename,
        content: currentFile.lines.join('\n')
      });
    }

    const document = {
      compilerOptions,
      files,
      queries
    };

    logger.debug(`Parsed twoslash document with ${files.length} files and ${queries.length} queries`);
    
    return twoslashDocumentSchema.parse(document);
  }

  function findQueryPosition(document: TwoslashDocument, queryType: string): QueryPosition | null {
    return document.queries.find(q => q.type === queryType) || document.queries[0] || null;
  }

  function generateTsconfig(document: TwoslashDocument): string {
    const config = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        ...document.compilerOptions
      }
    };

    return JSON.stringify(config, null, 2);
  }

  return {
    parseDocument,
    findQueryPosition,
    generateTsconfig
  };
}