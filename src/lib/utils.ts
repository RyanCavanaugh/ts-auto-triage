import type { IssueRef } from './schemas.js';

export function parseIssueRef(input: string): IssueRef {
  // Handle URL format: https://github.com/owner/repo/issues/123
  const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1]!,
      repo: urlMatch[2]!,
      number: parseInt(urlMatch[3]!, 10),
    };
  }

  // Handle short format: owner/repo#123
  const shortMatch = input.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1]!,
      repo: shortMatch[2]!,
      number: parseInt(shortMatch[3]!, 10),
    };
  }

  throw new Error(`Invalid issue reference format: ${input}`);
}

export function formatIssueRef(ref: IssueRef): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

export function createIssueDataPath(ref: IssueRef): string {
  return `.data/${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}.json`;
}

export function createActionFilePath(ref: IssueRef): string {
  return `.working/actions/${ref.owner.toLowerCase()}.${ref.repo.toLowerCase()}.${ref.number}.jsonc`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

export function createCacheKey(content: string, endpoint: string): string {
  const combined = `${endpoint}:${content}`;
  const hash = createSimpleHash(combined);
  return hash.slice(0, 16);
}

export function createCachePath(key: string): string {
  const dir1 = key.slice(0, 2);
  const dir2 = key.slice(2, 4);
  const filename = key.slice(4);
  return `.kvcache/${dir1}/${dir2}/${filename}.json`;
}

function createSimpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

export function ensureDirectoryExists(filePath: string): void {
  const path = require('path');
  const fs = require('fs');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface Logger {
  info(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export function createConsoleLogger(): Logger {
  return {
    info: (message) => console.log(`[INFO] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`),
    debug: (message) => console.log(`[DEBUG] ${message}`),
  };
}

export function createMockLogger(): Logger {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };
}