// Azure OpenAI integration for TypeScript issue management
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type { Logger } from './utils.js';
import { createKVCache } from './kvcache.js';
import type z from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod.js';

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
  chatCompletion(messages: ChatMessage[], options?: {
    maxTokens?: number;
    temperature?: number;
    model?: string;
    context?: string; // Optional context for cache logging
    effort?: CognitiveEffort; // Cognitive effort level (defaults to Medium)
  }): Promise<ChatCompletionResponse>;

  /**
   * Make a structured completion request with a Zod schema
   * 
   * IMPORTANT: For nullable fields, use z.union([type, z.null()]) instead of .nullable()
   * Azure OpenAI doesn't support the "nullable: true" JSON Schema property.
   * 
   * ✅ Correct: z.union([z.string(), z.null()])
   * ❌ Wrong:   z.string().nullable()
   */
  structuredCompletion<T>(
    messages: ChatMessage[],
    jsonSchema: z.ZodSchema<T>,
    options?: {
      maxTokens?: number;
      temperature?: number;
      model?: string;
      context?: string; // Optional context for cache logging
      effort?: CognitiveEffort; // Cognitive effort level (defaults to Medium)
    }
  ): Promise<T>;

  getEmbedding(text: string, model?: string, context?: string, effort?: CognitiveEffort): Promise<EmbeddingResponse>;
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
        apiVersion: "2024-10-21"
      });
    } else {
      logger.debug(`Using Azure managed identity authentication for ${endpoint}`);
      const credential = new DefaultAzureCredential();
      const scope = "https://cognitiveservices.azure.com/.default";
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      return new AzureOpenAI({
        endpoint,
        azureADTokenProvider,
        apiVersion: "2024-10-21"
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
    async chatCompletion(messages: ChatMessage[], options = {}): Promise<ChatCompletionResponse> {
      const effort = options.effort ?? 'Medium';
      const client = clients[effort];
      const model = options.model ?? config.deployments[effort.toLowerCase() as 'low' | 'medium' | 'high'].chat;
      const cacheKey = cache ? JSON.stringify({ messages, model, options, effort }) : null;
      
      // Create human-readable description for cache logging
      const description = options.context ?? `Chat completion with ${model} (${effort} effort)`;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, description, async () => null);
        if (cached) {
          logger.debug('Using cached chat completion');
          return cached as ChatCompletionResponse;
        }
      }

      logger.debug(`Making chat completion request to ${model} (${effort} effort)`);
      
      try {
        const response = await client.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: options.maxTokens ?? null,
          temperature: options.temperature ?? null,
        });

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          throw new Error('No content received from Azure OpenAI');
        }

        const result: ChatCompletionResponse = {
          content: choice.message.content,
          usage: response.usage ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          } : undefined,
        };

        if (cache && cacheKey) {
          await cache.memoize(cacheKey, description, async () => result);
        }

        logger.debug(`Chat completion successful, ${result.usage?.total_tokens ?? 0} tokens used`);
        return result;
      } catch (error) {
        logger.error(`Azure OpenAI chat completion failed: ${error}`);
        throw error;
      }
    },

    async structuredCompletion<T>(
      messages: ChatMessage[],
      zodSchema: z.ZodSchema<T>,
      options: {
        maxTokens?: number;
        temperature?: number;
        model?: string;
        context?: string; // Optional context for cache logging
        effort?: CognitiveEffort; // Cognitive effort level (defaults to Medium)
      } = {}
    ): Promise<T> {
      const effort = options.effort ?? 'Medium';
      const client = clients[effort];
      const model = options.model ?? config.deployments[effort.toLowerCase() as 'low' | 'medium' | 'high'].chat;
      const cacheKey = cache ? JSON.stringify({ messages, model, options, effort, jsonSchema: zodResponseFormat(zodSchema, "response") }) : null;
      
      // Create human-readable description for cache logging
      const description = options.context ?? `Structured completion with ${model} (${effort} effort)`;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, description, async () => null);
        if (cached) {
          logger.debug('Using cached structured completion');
          return cached as T;
        }
      }

      logger.debug(`Making structured completion request to ${model} (${effort} effort)`);
      
      try {
        const response = await client.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: options.maxTokens ?? null,
          temperature: options.temperature ?? null,
          response_format: zodResponseFormat(zodSchema, "response")
        });

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          throw new Error('No content received from Azure OpenAI');
        }

        let result: T = zodSchema.parse(JSON.parse(choice.message.content));

        if (cache && cacheKey) {
          await cache.memoize(cacheKey, description, async () => result);
        }

        logger.debug(`Structured completion successful, ${response.usage?.total_tokens ?? 0} tokens used`);
        return result;
      } catch (error) {
        logger.error(`Azure OpenAI structured completion failed: ${error}`);
        throw error;
      }
    },

    async getEmbedding(text: string, model?: string, context?: string, effort?: CognitiveEffort): Promise<EmbeddingResponse> {
      const effortLevel = effort ?? 'Medium';
      const client = clients[effortLevel];
      const embeddingModel = model ?? config.deployments[effortLevel.toLowerCase() as 'low' | 'medium' | 'high'].embeddings;
      const cacheKey = cache ? JSON.stringify({ text, model: embeddingModel, effort: effortLevel }) : null;
      
      // Create human-readable description for cache logging
      let description: string;
      if (context) {
        description = context;
      } else {
        const textPreview = text.length > 50 ? text.slice(0, 50) + '...' : text;
        description = `Embedding for text: "${textPreview}" (${effortLevel} effort)`;
      }
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, description, async () => null);
        if (cached) {
          logger.debug('Using cached embedding');
          return cached as EmbeddingResponse;
        }
      }

      logger.debug(`Making embedding request to ${embeddingModel} (${effortLevel} effort)`);
      
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
          await cache.memoize(cacheKey, description, async () => result);
        }

        logger.debug(`Embedding successful, ${result.usage?.total_tokens ?? 0} tokens used`);
        return result;
      } catch (error) {
        logger.error(`Azure OpenAI embedding failed: ${error}`);
        throw error;
      }
    },
  };
}