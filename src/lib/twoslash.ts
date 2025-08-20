import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from './utils.js';
import { ensureDirectoryExists } from './utils.js';

export interface TwoslashFile {
  filename: string;
  content: string;
}

export interface TwoslashQuery {
  position: { line: number; character: number };
  filename: string;
}

export interface TwoslashConfig {
  compilerOptions?: Record<string, unknown>;
  files: TwoslashFile[];
  query?: TwoslashQuery;
}

export interface TwoslashParser {
  parse(markdownContent: string): TwoslashConfig;
  extractQuery(content: string): TwoslashQuery | null;
  writeFiles(config: TwoslashConfig, outputDir: string): Promise<void>;
}

export function createTwoslashParser(logger: Logger): TwoslashParser {
  return {
    parse(markdownContent: string): TwoslashConfig {
      const lines = markdownContent.split('\n');
      const config: TwoslashConfig = { files: [] };
      
      let currentFile: TwoslashFile | null = null;
      let inCodeBlock = false;
      let codeBlockContent: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        
        // Check for compiler options
        if (line.startsWith('// @')) {
          if (!config.compilerOptions) {
            config.compilerOptions = {};
          }
          const option = line.slice(4).trim(); // Skip '// @'
          const [key, value] = option.split(':').map(s => s.trim());
          if (key && value) {
            config.compilerOptions[key] = parseCompilerOptionValue(value);
          }
          continue;
        }
        
        // Check for file declarations
        if (line.startsWith('// ') && line.includes('.ts')) {
          // Finish previous file if it exists
          if (currentFile && currentFile.content) {
            config.files.push(currentFile);
          }
          
          const filename = line.slice(3).trim();
          currentFile = { filename, content: '' };
          continue;
        }
        
        // Handle code blocks
        if (line.startsWith('```')) {
          if (inCodeBlock) {
            // End of code block
            if (currentFile) {
              currentFile.content = codeBlockContent.join('\n');
              config.files.push(currentFile);
              currentFile = null;
            }
            codeBlockContent = [];
            inCodeBlock = false;
          } else {
            // Start of code block
            inCodeBlock = true;
          }
          continue;
        }
        
        if (inCodeBlock) {
          codeBlockContent.push(line);
          
          // Check for query markers
          const query = this.extractQuery(line);
          if (query && currentFile) {
            config.query = {
              ...query,
              filename: currentFile.filename,
              position: {
                line: codeBlockContent.length - 1,
                character: query.position.character,
              },
            };
          }
        } else if (currentFile) {
          // Direct file content (not in code block)
          if (currentFile.content) {
            currentFile.content += '\n';
          }
          currentFile.content += line;
          
          // Check for query markers
          const query = this.extractQuery(line);
          if (query) {
            const contentLines = currentFile.content.split('\n');
            config.query = {
              ...query,
              filename: currentFile.filename,
              position: {
                line: contentLines.length - 1,
                character: query.position.character,
              },
            };
          }
        }
      }
      
      // Handle final file if not in code block
      if (currentFile && currentFile.content) {
        config.files.push(currentFile);
      }
      
      logger.debug(`Parsed twoslash config with ${config.files.length} files`);
      return config;
    },

    extractQuery(content: string): TwoslashQuery | null {
      const queryMatch = content.match(/\/\*!\*\//);
      if (queryMatch) {
        return {
          position: {
            line: 0, // Will be set by caller
            character: queryMatch.index ?? 0,
          },
          filename: '', // Will be set by caller
        };
      }
      return null;
    },

    async writeFiles(config: TwoslashConfig, outputDir: string): Promise<void> {
      logger.debug(`Writing ${config.files.length} files to ${outputDir}`);
      
      // Ensure output directory exists
      ensureDirectoryExists(path.join(outputDir, 'dummy'));
      
      // Write tsconfig.json if compiler options exist
      if (config.compilerOptions) {
        const tsconfig = {
          compilerOptions: {
            target: 'esnext',
            module: 'esnext',
            moduleResolution: 'bundler',
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            ...config.compilerOptions,
          },
        };
        
        const tsconfigPath = path.join(outputDir, 'tsconfig.json');
        await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        logger.debug(`Wrote tsconfig.json to ${tsconfigPath}`);
      }
      
      // Write each file
      for (const file of config.files) {
        const filePath = path.join(outputDir, file.filename);
        ensureDirectoryExists(filePath);
        await fs.writeFile(filePath, file.content);
        logger.debug(`Wrote ${file.filename} to ${filePath}`);
      }
      
      // Write package.json for module resolution
      const packageJson = {
        name: 'twoslash-repro',
        type: 'module',
        private: true,
      };
      
      const packagePath = path.join(outputDir, 'package.json');
      await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
      logger.debug(`Wrote package.json to ${packagePath}`);
    },
  };
}

function parseCompilerOptionValue(value: string): unknown {
  // Remove quotes if present
  const cleanValue = value.replace(/^["']|["']$/g, '');
  
  // Try to parse as boolean
  if (cleanValue === 'true') return true;
  if (cleanValue === 'false') return false;
  
  // Try to parse as number
  const numValue = Number(cleanValue);
  if (!isNaN(numValue)) return numValue;
  
  // Return as string
  return cleanValue;
}