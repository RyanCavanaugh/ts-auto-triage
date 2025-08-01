import { z } from 'zod';

// GitHub issue reference schema
export const issueRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number()
});

export type IssueRef = z.infer<typeof issueRefSchema>;

// Console logger interface for dependency injection
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// Simple console logger implementation
export const createConsoleLogger = (): Logger => ({
  info: (message: string, ...args: unknown[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.debug(`[DEBUG] ${message}`, ...args)
});

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

// Sleep utility for rate limiting
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Hash function for cache keys
export function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Format cache key for file storage
export function formatCacheKey(key: string): { dir: string; subdir: string; filename: string } {
  const hash = hashString(key).substring(0, 16);
  return {
    dir: hash.substring(0, 2),
    subdir: hash.substring(2, 4),
    filename: hash.substring(4) + '.json'
  };
}

// Cap text length for AI models to avoid context window issues
export function capText(text: string, maxLength: number = 8000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '\n\n[Content truncated for length]';
}

// Retry utility with exponential backoff
export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}