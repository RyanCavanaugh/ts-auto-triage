import { DefaultAzureCredential } from '@azure/identity';
import { OpenAIClient } from '@azure/openai';
import { promises as fs } from 'fs';
import path from 'path';

// Logger interface for dependency injection
interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// Sleep utility for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cap text length for AI models to avoid context window issues
function capText(text: string, maxLength: number = 8000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '\n\n[Content truncated for length]';
}

// Retry utility with exponential backoff
async function retry<T>(
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

// Hash function for cache keys
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Format cache key for file storage
function formatCacheKey(key: string): { dir: string; subdir: string; filename: string } {
  const hash = hashString(key).substring(0, 16);
  return {
    dir: hash.substring(0, 2),
    subdir: hash.substring(2, 4),
    filename: hash.substring(4) + '.json'
  };
}

// Create a disk-based key-value cache
function createKVCache(options: { cacheDir: string; maxAge?: number }) {
  const { cacheDir, maxAge } = options;

  async function ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async function getCachePath(key: string): Promise<string> {
    const { dir, subdir, filename } = formatCacheKey(key);
    const fullDir = path.join(cacheDir, dir, subdir);
    await ensureDir(fullDir);
    return path.join(fullDir, filename);
  }

  async function get<T>(key: string): Promise<T | null> {
    try {
      const cachePath = await getCachePath(key);
      const data = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(data) as { value: T; timestamp: number };
      
      // Check if cache entry has expired
      if (maxAge && Date.now() - parsed.timestamp > maxAge) {
        await fs.unlink(cachePath).catch(() => {}); // Ignore errors
        return null;
      }
      
      return parsed.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function set<T>(key: string, value: T): Promise<void> {
    const cachePath = await getCachePath(key);
    const data = {
      value,
      timestamp: Date.now()
    };
    await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
  }

  return { get, set };
}

export interface AIConfig {
  deployments: {
    azure?: {
      endpoint: string;
      deploymentName: string;
      apiVersion: string;
    };
  };
  embeddings?: {
    endpoint: string;
    deploymentName: string;
    apiVersion: string;
  };
}

export interface AIOptions {
  config: AIConfig;
  logger: Logger;
  cacheDir: string;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletion {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | undefined;
}

export function createAIClient(options: AIOptions) {
  const { config, logger, cacheDir } = options;
  const cache = createKVCache({ cacheDir });

  // Initialize Azure OpenAI client if configured
  let azureClient: OpenAIClient | null = null;
  if (config.deployments.azure) {
    const credential = new DefaultAzureCredential();
    azureClient = new OpenAIClient(
      config.deployments.azure.endpoint,
      credential
    );
  }

  // Initialize embeddings client if configured
  let embeddingsClient: OpenAIClient | null = null;
  if (config.embeddings) {
    const credential = new DefaultAzureCredential();
    embeddingsClient = new OpenAIClient(
      config.embeddings.endpoint,
      credential
    );
  }

  async function generateChatCompletion(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      useCache?: boolean;
    } = {}
  ): Promise<ChatCompletion> {
    const { temperature = 0.1, maxTokens = 2000, useCache = true } = options;

    // Create cache key from messages and parameters
    const cacheKey = `chat:${JSON.stringify({ messages, temperature, maxTokens })}`;

    if (useCache) {
      const cached = await cache.get<ChatCompletion>(cacheKey);
      if (cached) {
        logger.debug('Using cached chat completion');
        return cached;
      }
    }

    if (!azureClient || !config.deployments.azure) {
      throw new Error('Azure OpenAI not configured');
    }

    const result = await retry(async () => {
      logger.debug(`Generating chat completion with ${messages.length} messages`);
      
      const response = await azureClient!.getChatCompletions(
        config.deployments.azure!.deploymentName,
        messages.map(msg => ({
          role: msg.role,
          content: capText(msg.content, 8000) // Cap content to avoid context window issues
        })),
        {
          temperature,
          maxTokens
        }
      );

      const choice = response.choices[0];
      if (!choice || !choice.message?.content) {
        throw new Error('No completion generated');
      }

      return {
        content: choice.message.content,
        usage: response.usage ? {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens
        } : undefined
      };
    }, 3, 2000);

    if (useCache) {
      await cache.set(cacheKey, result);
    }

    return result;
  }

  async function generateEmbedding(text: string, useCache: boolean = true): Promise<number[]> {
    const cacheKey = `embedding:${text}`;

    if (useCache) {
      const cached = await cache.get<number[]>(cacheKey);
      if (cached) {
        logger.debug('Using cached embedding');
        return cached;
      }
    }

    if (!embeddingsClient || !config.embeddings) {
      throw new Error('Embeddings not configured');
    }

    const result = await retry(async () => {
      logger.debug(`Generating embedding for text (${text.length} chars)`);
      
      const response = await embeddingsClient!.getEmbeddings(
        config.embeddings!.deploymentName,
        [capText(text, 8000)]
      );

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding generated');
      }

      return embedding;
    }, 3, 2000);

    if (useCache) {
      await cache.set(cacheKey, result);
    }

    return result;
  }

  async function generateBatchEmbeddings(texts: string[], useCache: boolean = true): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (text) => {
        const embedding = await generateEmbedding(text, useCache);
        return { text, embedding };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  function findSimilarEmbeddings(
    query: number[],
    embeddings: EmbeddingResult[],
    topK: number = 5,
    threshold: number = 0.7
  ): Array<EmbeddingResult & { similarity: number }> {
    const similarities = embeddings
      .map(item => ({
        ...item,
        similarity: cosineSimilarity(query, item.embedding)
      }))
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return similarities;
  }

  async function generateStructuredCompletion(
    messages: ChatMessage[],
    schema: object,
    options: {
      temperature?: number;
      maxTokens?: number;
      useCache?: boolean;
    } = {}
  ): Promise<any> {
    const { temperature = 0.1, maxTokens = 2000, useCache = true } = options;

    // Create cache key from messages, schema, and parameters
    const cacheKey = `structured:${JSON.stringify({ messages, schema, temperature, maxTokens })}`;

    if (useCache) {
      const cached = await cache.get<any>(cacheKey);
      if (cached) {
        logger.debug('Using cached structured completion');
        return cached;
      }
    }

    if (!azureClient || !config.deployments.azure) {
      throw new Error('Azure OpenAI not configured');
    }

    // Handle array schemas by wrapping them in an object
    let isArrayResponse = false;
    let schemaDescription = '';
    
    if (typeof schema === 'object' && schema !== null && 'type' in schema && schema.type === 'array') {
      isArrayResponse = true;
      schemaDescription = `Respond with a JSON object with an "items" property containing an array matching this schema: ${JSON.stringify(schema)}`;
    } else {
      schemaDescription = `Respond with JSON matching this schema: ${JSON.stringify(schema)}`;
    }

    // Add schema instructions to the system message
    const systemMessage = messages.find(m => m.role === 'system');
    const enhancedMessages = messages.map(msg => {
      if (msg.role === 'system') {
        return {
          ...msg,
          content: `${msg.content}\n\nIMPORTANT: ${schemaDescription} Respond with valid JSON only, no additional text.`
        };
      }
      return msg;
    });

    // If no system message, add one
    if (!systemMessage) {
      enhancedMessages.unshift({
        role: 'system',
        content: `${schemaDescription} Respond with valid JSON only, no additional text.`
      });
    }

    const result = await retry(async () => {
      logger.debug('Making structured completion request to gpt-4o');
      
      const response = await azureClient!.getChatCompletions(
        config.deployments.azure!.deploymentName,
        enhancedMessages.map(msg => ({
          role: msg.role,
          content: capText(msg.content, 8000)
        })),
        {
          temperature,
          maxTokens,
          responseFormat: {
            type: 'json_object'
          }
        }
      );

      const choice = response.choices[0];
      if (!choice || !choice.message?.content) {
        throw new Error('No completion generated');
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(choice.message.content);
      } catch (error) {
        throw new Error(`Failed to parse JSON response: ${error}`);
      }

      // If we're expecting an array and got a wrapped object, unwrap it
      if (isArrayResponse && parsedResult.items && Array.isArray(parsedResult.items)) {
        parsedResult = parsedResult.items;
      }

      return parsedResult;
    }, 3, 2000);

    if (useCache) {
      await cache.set(cacheKey, result);
    }

    return result;
  }

  return {
    generateChatCompletion,
    generateStructuredCompletion,
    generateEmbedding,
    generateBatchEmbeddings,
    cosineSimilarity,
    findSimilarEmbeddings
  };
}