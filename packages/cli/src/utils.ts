import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { Logger, parseIssueRef, IssueRef } from '@ryancavanaugh/utils';
import { createKVCache } from '@ryancavanaugh/kvcache';
import path from 'path';

const execAsync = promisify(exec);

export interface CLIOptions {
  logger: Logger;
  dataDir: string;
  cacheDir: string;
  workingDir: string;
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
  return {
    logger: {
      info: (message: string, ...args: unknown[]) => console.log(`[INFO] ${message}`, ...args),
      warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
      error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
      debug: (message: string, ...args: unknown[]) => {
        if (process.env.DEBUG) {
          console.debug(`[DEBUG] ${message}`, ...args);
        }
      }
    },
    dataDir: path.join(cwd, '.data'),
    cacheDir: path.join(cwd, '.kvcache'),
    workingDir: path.join(cwd, '.working')
  };
}

export function createCache(cacheDir: string) {
  return createKVCache({ cacheDir });
}

export function handleError(error: Error, logger: Logger): void {
  logger.error(`Error: ${error.message}`);
  if (process.env.DEBUG) {
    logger.error(error.stack || '');
  }
  process.exit(1);
}