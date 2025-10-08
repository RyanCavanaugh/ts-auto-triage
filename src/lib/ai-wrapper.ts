// Azure OpenAI integration for TypeScript issue management
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type { Logger } from './utils.js';
import { createKVCache } from './kvcache.js';
import type z from 'zod';
import { zodResponseFormat, zodTextFormat } from 'openai/helpers/zod.js';

/**
 * Cognitive effort level for AI operations
 * - Low: Fast, simple tasks (e.g., quick checks, simple classifications)
 * - Medium: Standard complexity tasks (default)
 * - High: Complex reasoning tasks (e.g., generating reproduction steps, deep analysis)
 */
export type CognitiveEffort = 'Low' | 'Medium' | 'High';

export interface AIConfig {
  endpoints: {
    low: string;
    medium: string;
    high: string;
  };
  deployments: {
    low: {
      chat: string;
      embeddings: string;
    };
    medium: {
      chat: string;
      embeddings: string;
    };
    high: {
      chat: string;
      embeddings: string;
    };
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | undefined;
}

export interface EmbeddingResponse {
  embedding: number[];
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  } | undefined;
}

export interface AIWrapper {
  /**
   * Make a completion request with structured output via a Zod schema
   * 
   * IMPORTANT: For nullable fields in schemas, use z.union([type, z.null()]) instead of .nullable()
   * Azure OpenAI doesn't support the "nullable: true" JSON Schema property.
   * 
   * ✅ Correct: z.union([z.string(), z.null()])
   * ❌ Wrong:   z.string().nullable()
   */
  completion<T>(
    messages: ChatMessage[],
    options: {
      jsonSchema: z.ZodSchema<T>;
      context: string; // Required context for logging and debugging
      maxTokens?: number;
      effort?: CognitiveEffort; // Cognitive effort level (defaults to Medium)
    }
  ): Promise<T>;

  getEmbedding(text: string, context: string, effort?: CognitiveEffort): Promise<EmbeddingResponse>;
}

export function createAIWrapper(config: AIConfig, logger: Logger, enableCache = true): AIWrapper {
  const cache = enableCache ? createKVCache(logger) : null;

  // Helper to create Azure OpenAI client with authentication for a given endpoint
  const createClient = (endpoint: string): AzureOpenAI => {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (apiKey) {
      logger.debug(`Using Azure OpenAI API key authentication for ${endpoint}`);
      return new AzureOpenAI({
        endpoint,
        apiKey,
        apiVersion: "2025-04-01-preview"
      });
    } else {
      logger.debug(`Using Azure managed identity authentication for ${endpoint}`);
      const credential = new DefaultAzureCredential();
      const scope = "https://cognitiveservices.azure.com/.default";
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      return new AzureOpenAI({
        endpoint,
        azureADTokenProvider,
        apiVersion: "2025-04-01-preview"
      });
    }
  };

  // Create clients for each effort level
  const clients = {
    Low: createClient(config.endpoints.low),
    Medium: createClient(config.endpoints.medium),
    High: createClient(config.endpoints.high),
  };

  return {
    async completion<T>(
      messages: ChatMessage[],
      options: {
        jsonSchema: z.ZodSchema<T>;
        context: string;
        maxTokens?: number;
        effort?: CognitiveEffort;
      }
    ): Promise<T> {
      const effort = options.effort ?? 'Medium';
      const client = clients[effort];
      const model = config.deployments[effort.toLowerCase() as 'low' | 'medium' | 'high'].chat;
      const zodSchema = options.jsonSchema;
      
      // Include jsonSchema in cache key
      const cacheKey = cache ? JSON.stringify({ 
        messages, 
        model, 
        maxTokens: options.maxTokens,
        effort,
        jsonSchema: zodTextFormat(zodSchema, "response")
      }) : null;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, options.context, async () => null);
        if (cached) {
          return cached as T;
        }
      }
      
      // Retry logic: try up to 3 times
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Convert messages to responses API format
          const inputItems = messages.map(msg => ({
            type: 'message' as const,
            role: msg.role,
            content: msg.content
          }));

          const response = await client.responses.create({
            model: model,
            input: inputItems,
            max_output_tokens: options.maxTokens ?? null,
            temperature: null,
            text: {
              format: zodTextFormat(zodSchema, "response")
            }
          });

          // Extract and parse the JSON output
          if (!response.output_text) {
            throw new Error(`No content received from Azure OpenAI. Response: ${JSON.stringify(response, null, 2)}`);
          }

          const parseResult: object = JSON.parse(response.output_text);
          const result: T = zodSchema.parse(parseResult);

          if (cache && cacheKey) {
            await cache.memoize(cacheKey, options.context, async () => result);
          }

          logger.debug(`Completion successful (attempt ${attempt}/3), ${response.usage?.total_tokens ?? 0} tokens used`);
          return result;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            logger.warn(`Completion failed (attempt ${attempt}/3), retrying: ${error}`);
          }
        }
      }
      
      // All retries failed
      logger.error(`AI completion failed after 3 attempts for: ${options.context}`);
      logger.error(`Last error: ${lastError}`);
      logger.error(`Messages: ${JSON.stringify(messages, null, 2)}`);
      logger.error(`Options: ${JSON.stringify({ effort, model, maxTokens: options.maxTokens }, null, 2)}`);
      process.exit(1);
    },

    async getEmbedding(text: string, context: string, effort?: CognitiveEffort): Promise<EmbeddingResponse> {
      const effortLevel = effort ?? 'Medium';
      const client = clients[effortLevel];
      const embeddingModel = config.deployments[effortLevel.toLowerCase() as 'low' | 'medium' | 'high'].embeddings;
      const cacheKey = cache ? JSON.stringify({ text, model: embeddingModel, effort: effortLevel }) : null;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, context, async () => null);
        if (cached) {
          return cached as EmbeddingResponse;
        }
      }
      
      // Retry logic: try up to 3 times
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await client.embeddings.create({
            model: embeddingModel,
            input: text,
          });

          const embedding = response.data[0]?.embedding;
          if (!embedding) {
            throw new Error('No embedding received from Azure OpenAI');
          }

          const result: EmbeddingResponse = {
            embedding,
            usage: response.usage ? {
              prompt_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens,
            } : undefined,
          };

          if (cache && cacheKey) {
            await cache.memoize(cacheKey, context, async () => result);
          }

          logger.debug(`Embedding successful (attempt ${attempt}/3), ${result.usage?.total_tokens ?? 0} tokens used`);
          return result;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            logger.warn(`Embedding failed (attempt ${attempt}/3), retrying: ${error}`);
          }
        }
      }
      
      // All retries failed
      logger.error(`AI embedding failed after 3 attempts for: ${context}`);
      logger.error(`Last error: ${lastError}`);
      logger.error(`Text length: ${text.length}`);
      logger.error(`Model: ${embeddingModel}, Effort: ${effortLevel}`);
      process.exit(1);
    },
  };
}