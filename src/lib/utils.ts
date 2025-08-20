import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
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
  // Use Node's built-in crypto to create a SHA-256 hash and return the full hex digest.
  // The caller (createCacheKey) slices the first N hex chars when needed.
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function ensureDirectoryExists(filePath: string): void {
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

import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Simple conversion for basic Zod schemas to JSON Schema
  // This is a minimal implementation for the schemas we use
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }
  
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }
  
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }
  
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  
  // Fallback for unsupported types
  return { type: 'string' };
}