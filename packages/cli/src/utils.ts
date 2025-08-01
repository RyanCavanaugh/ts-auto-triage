import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Issue reference type
export interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

// Logger interface for dependency injection
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// Parse issue reference from string (e.g., "Microsoft/TypeScript#9998" or URL)
export function parseIssueRef(input: string): IssueRef {
  // Handle URL format: https://github.com/Microsoft/TypeScript/issues/9998
  const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:issues|pull)\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1]!,
      repo: urlMatch[2]!,
      number: parseInt(urlMatch[3]!, 10)
    };
  }

  // Handle short format: Microsoft/TypeScript#9998
  const shortMatch = input.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1]!,
      repo: shortMatch[2]!,
      number: parseInt(shortMatch[3]!, 10)
    };
  }

  throw new Error(`Invalid issue reference format: ${input}`);
}

export interface CLIOptions {
  logger: Logger;
  dataDir: string;
  cacheDir: string;
  workingDir: string;
  ai: any; // Simple any type for now
  config: any;
}

export async function getGitHubToken(): Promise<string> {
  try {
    const { stdout } = await execAsync('gh auth token');
    return stdout.trim();
  } catch (error) {
    throw new Error('Failed to get GitHub token. Please run "gh auth login" first.');
  }
}

export async function loadConfig(): Promise<any> {
  try {
    const configPath = path.join(process.cwd(), 'config.jsonc');
    const content = await readFile(configPath, 'utf-8');
    // Simple JSONC parser - remove comments
    const cleanJson = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    return JSON.parse(cleanJson);
  } catch (error) {
    throw new Error(`Failed to load config.jsonc: ${(error as Error).message}`);
  }
}

export function parseCliArgs(args: string[]): { command: string; issueRef?: IssueRef; options: Record<string, string> } {
  const [command, ...rest] = args;
  
  if (!command) {
    throw new Error('No command provided');
  }

  const options: Record<string, string> = {};
  let issueRefString: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      if (key && value) {
        options[key.substring(2)] = value;
      } else if (key && rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
        options[key.substring(2)] = rest[i + 1]!;
        i++; // Skip next arg since we used it as value
      }
    } else if (!issueRefString) {
      issueRefString = arg;
    }
  }

  const issueRef = issueRefString ? parseIssueRef(issueRefString) : undefined;

  if (issueRef) {
    return { command, issueRef, options };
  } else {
    return { command, options };
  }
}

export function createCLIOptions(): CLIOptions {
  const cwd = process.cwd();
  const logger = {
    info: (message: string, ...args: unknown[]) => console.log(`[INFO] ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
    debug: (message: string, ...args: unknown[]) => {
      if (process.env.DEBUG) {
        console.debug(`[DEBUG] ${message}`, ...args);
      }
    }
  };

  // Load config synchronously for simplicity
  let config: any;
  try {
    const configPath = path.join(cwd, 'config.jsonc');
    const content = require('fs').readFileSync(configPath, 'utf-8');
    const cleanJson = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    config = JSON.parse(cleanJson);
  } catch (error) {
    // Use default config if file doesn't exist
    config = {
      ai: {
        deployments: {
          azure: {
            endpoint: "https://your-resource.openai.azure.com/",
            deploymentName: "gpt-4",
            apiVersion: "2024-02-15-preview"
          }
        },
        embeddings: {
          endpoint: "https://your-resource.openai.azure.com/",
          deploymentName: "text-embedding-ada-002",
          apiVersion: "2024-02-15-preview"
        }
      }
    };
  }

  // Create a simple AI client placeholder
  const ai = {
    generateChatCompletion: async (_messages: any[], _options: any) => {
      // For demo purposes, return a placeholder response
      logger.warn('AI integration not fully configured - returning placeholder response');
      return {
        content: 'This is a placeholder AI response. Please configure Azure OpenAI in config.jsonc to enable full AI functionality.',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    },
    generateEmbedding: async (_text: string) => {
      // Return a placeholder embedding
      logger.warn('AI integration not fully configured - returning placeholder embedding');
      return new Array(1536).fill(0);
    }
  };

  return {
    logger,
    dataDir: path.join(cwd, '.data'),
    cacheDir: path.join(cwd, '.kvcache'),
    workingDir: path.join(cwd, '.working'),
    ai,
    config
  };
}

export function createCache(_cacheDir: string) {
  // Simple cache implementation
  return {
    get: async <T>(_key: string): Promise<T | null> => null,
    set: async <T>(_key: string, _value: T): Promise<void> => {},
    has: async (_key: string): Promise<boolean> => false,
    del: async (_key: string): Promise<void> => {}
  };
}

export function handleError(error: Error, logger: Logger): void {
  logger.error(`Error: ${error.message}`);
  if (process.env.DEBUG) {
    logger.error(error.stack || '');
  }
  process.exit(1);
}