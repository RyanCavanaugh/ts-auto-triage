import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import type { IssueRef, Config, IssueAction } from './schemas.js';

export function parseIssueRef(input: string, defaultRepo?: string): IssueRef {
  // Handle URL format: https://github.com/owner/repo/issues/123 or /pull/123
  const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1]!,
      repo: urlMatch[2]!,
      number: parseInt(urlMatch[4]!, 10),
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

  // Handle bare issue number: #123 (requires defaultRepo)
  const bareMatch = input.match(/^#(\d+)$/);
  if (bareMatch) {
    if (!defaultRepo) {
      throw new Error(`Bare issue number ${input} requires a default repository to be configured`);
    }
    const [owner, repo] = parseRepoRef(defaultRepo);
    return {
      owner,
      repo,
      number: parseInt(bareMatch[1]!, 10),
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

export function createIssueEmbeddingPath(ref: IssueRef): string {
  return `.data/${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}.embeddings.json`;
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

/**
 * Escapes special characters in text to prevent JSON parsing errors.
 * This is needed when text will be embedded in prompts that are later JSON-stringified.
 * Handles backslashes, quotes, newlines, and other control characters.
 */
export function escapeTextForPrompt(text: string): string {
  return text
    .replace(/\\/g, '\\\\')         // Escape backslashes first
    .replace(/"/g, '\\"')           // Escape double quotes
    .replace(/\n/g, '\\n')          // Escape newlines
    .replace(/\r/g, '\\r')          // Escape carriage returns
    .replace(/\t/g, '\\t')          // Escape tabs
    .replace(/\f/g, '\\f')          // Escape form feeds
    .replace(/[\b]/g, '\\b');       // Escape backspaces (using character class to avoid word boundary)
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

export function getGitHubAuthToken(): string {
  return execSync('gh auth token', { encoding: 'utf-8' }).trim();
}

export async function createAuthenticatedOctokit(authToken?: string): Promise<import('@octokit/rest').Octokit> {
  const { Octokit } = await import('@octokit/rest');
  
  // Get auth token if not provided
  const token = authToken ?? getGitHubAuthToken();
  
  // Create GitHub client
  const octokit = new Octokit({
    auth: token,
  });

  return octokit;
}

import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Simple conversion for basic Zod schemas to JSON Schema
  // This is a minimal implementation for the schemas we use
  // Note: For OpenAI's strict mode, ALL properties must be in the required array
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      // For OpenAI strict mode, all properties must be required
      // Optional fields are handled by including them but allowing null/undefined
      required.push(key);
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
    // For optional fields, allow null or the underlying type
    const innerSchema = zodToJsonSchema(schema.unwrap());
    return {
      anyOf: [
        innerSchema,
        { type: 'null' }
      ]
    };
  }
  
  // Fallback for unsupported types
  return { type: 'string' };
}

// Re-export file updater
export { createFileUpdater, type FileUpdater, type FileUpdaterOptions } from './file-updater.js';

/**
 * Converts an embedding array to compact base64 representation.
 * This provides ~3.8x compression vs JSON representation.
 */
export function embeddingToBase64(embedding: number[]): string {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer).toString('base64');
}

/**
 * Converts a base64 embedding back to Float32Array for computation.
 * Used for duplicate detection and similarity calculations.
 */
export function embeddingFromBase64(base64: string): Float32Array {
  const buffer = Buffer.from(base64, 'base64');
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/**
 * Calculate cosine similarity between two embeddings.
 * Optimized for Float32Array inputs from embeddingFromBase64().
 */
export function calculateCosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export interface SimilarIssue {
  issueKey: string;
  similarity: number;
  summary: string;
}

/**
 * Find similar issues using embeddings-based similarity search.
 * Returns issues sorted by similarity score in descending order.
 */
export async function findSimilarIssuesUsingEmbeddings(
  issueTitle: string,
  issueBody: string,
  currentIssueRef: IssueRef,
  ai: { getEmbedding: (text: string, context: string) => Promise<{ embedding: number[] }> },
  config: { ai: { maxEmbeddingInputLength: number } },
  maxResults = 5
): Promise<SimilarIssue[]> {
  const { readFile, readdir } = await import('fs/promises');
  const { join } = await import('path');

  try {
    // Load summaries to get issue descriptions
    const summariesContent = await readFile('.data/summaries.json', 'utf-8');
    const summaries = JSON.parse(summariesContent) as Record<string, string[]>;

    // Create embedding for current issue
    const currentIssueText = `${issueTitle}\n\n${issueBody.slice(0, 2000)}`;
    const cappedText = currentIssueText.length > config.ai.maxEmbeddingInputLength
      ? currentIssueText.slice(0, config.ai.maxEmbeddingInputLength - 3) + '...'
      : currentIssueText;
    const issueKey = `${currentIssueRef.owner}/${currentIssueRef.repo}#${currentIssueRef.number}`;
    const currentEmbedding = await ai.getEmbedding(cappedText, `Get embedding for current issue ${issueKey}`);

    // Calculate similarities by finding and reading all embedding files
    const similarities: Array<{ issueKey: string; similarity: number; summary: string }> = [];

    // Recursively find all .embeddings.json files in .data directory
    const embeddingFiles = await findEmbeddingFiles('.data');

    for (const filePath of embeddingFiles) {
      // Extract issue key from file path: .data/owner/repo/123.embeddings.json -> owner/repo#123
      const pathParts = filePath.replace(/\\/g, '/').split('/');
      const filename = pathParts[pathParts.length - 1]!;
      const repo = pathParts[pathParts.length - 2];
      const owner = pathParts[pathParts.length - 3];

      const numberStr = filename.replace('.embeddings.json', '');
      const number = parseInt(numberStr, 10);

      const fileIssueKey = `${owner}/${repo}#${number}`;

      // Skip self
      const currentIssueKeyStr = `${currentIssueRef.owner.toLowerCase()}/${currentIssueRef.repo.toLowerCase()}#${currentIssueRef.number}`;
      if (fileIssueKey === currentIssueKeyStr) continue;

      // Read individual embedding file
      const embeddingContent = await readFile(filePath, 'utf-8');
      const embeddingList: string[] = JSON.parse(embeddingContent);

      let bestSim = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < embeddingList.length; i++) {
        const base64 = embeddingList[i]!;
        const embeddingArray = embeddingFromBase64(base64);

        // Use optimized Float32Array similarity calculation
        const currentEmbeddingFloat32 = new Float32Array(currentEmbedding.embedding);
        const similarity = calculateCosineSimilarity(currentEmbeddingFloat32, embeddingArray);

        if (similarity > bestSim) {
          bestSim = similarity;
          bestIndex = i;
        }
      }

      // Use the best similarity for the issue and the corresponding summary (if available)
      if (bestIndex >= 0) {
        const summariesForKey = summaries[fileIssueKey];
        const summary = summariesForKey?.[bestIndex] ?? '';
        similarities.push({ issueKey: fileIssueKey, similarity: bestSim, summary });
      }
    }

    // Sort by similarity and return top results
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, maxResults);
  } catch (error) {
    // If embeddings system is not available, return empty array
    return [];
  }
}

/**
 * Recursively find all .embeddings.json files in a directory
 */
async function findEmbeddingFiles(dir: string): Promise<string[]> {
  const { readdir } = await import('fs/promises');
  const { join } = await import('path');
  const result: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findEmbeddingFiles(fullPath);
        result.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.embeddings.json')) {
        result.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return result;
}

/**
 * Format actions as markdown for human-readable display in action files.
 * Escapes closing star-slash sequences in comment bodies to avoid breaking the block comment.
 */
export function formatActionsAsMarkdown(actions: IssueAction[]): string {
  const lines: string[] = [];

  for (const action of actions) {
    switch (action.kind) {
      case 'add_label':
        lines.push(`- Add label "${action.label}"`);
        break;
      case 'remove_label':
        lines.push(`- Remove label "${action.label}"`);
        break;
      case 'close_issue':
        lines.push(`- Close issue as ${action.reason === 'completed' ? 'completed' : 'not planned'}`);
        break;
      case 'add_comment':
        lines.push('Post comment:');
        lines.push('---');
        // Escape closing star-slash to avoid breaking the block comment.
        // We use backslash-escaping (*\/) which is readable but doesn't actually
        // close the comment block, allowing the markdown to remain inside the /* */ comment.
        const escapedBody = action.body.replace(/\*\//g, '*\\/');
        lines.push(escapedBody);
        lines.push('---');
        break;
      case 'set_milestone':
        lines.push(`- Set milestone "${action.milestone}"`);
        break;
      case 'assign_user':
        lines.push(`- Assign to user "${action.user}"`);
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Parse a repository reference in the format "owner/repo"
 */
export function parseRepoRef(input: string): [owner: string, repo: string] {
  const parts = input.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository format: ${input}. Expected format: owner/repo`);
  }
  return [parts[0], parts[1]];
}

/**
 * Load config from config.jsonc file
 */
export async function loadConfig(): Promise<Config> {
  const { readFile } = await import('fs/promises');
  const { ConfigSchema } = await import('./schemas.js');
  const jsonc = await import('jsonc-parser');
  
  const configContent = await readFile('config.jsonc', 'utf-8');
  return ConfigSchema.parse(jsonc.parse(configContent));
}
