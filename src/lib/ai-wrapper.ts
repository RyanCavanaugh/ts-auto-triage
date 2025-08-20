// Azure OpenAI integration for TypeScript issue management
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type { Logger } from './utils.js';
import { createKVCache } from './kvcache.js';

export interface AIConfig {
  endpoint: string;
  deployments: {
    chat: string;
    embeddings: string;
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
  }): Promise<ChatCompletionResponse>;

  structuredCompletion<T>(
    messages: ChatMessage[],
    jsonSchema: Record<string, unknown>,
    options?: {
      maxTokens?: number;
      temperature?: number;
      model?: string;
    }
  ): Promise<T>;

  getEmbedding(text: string, model?: string): Promise<EmbeddingResponse>;
}

export function createAIWrapper(config: AIConfig, logger: Logger, enableCache = true): AIWrapper {
  const cache = enableCache ? createKVCache(logger) : null;

  // Create Azure OpenAI client with authentication
  const client = (() => {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (apiKey) {
      logger.debug('Using Azure OpenAI API key authentication');
      return new AzureOpenAI({
        endpoint: config.endpoint,
        apiKey,
        apiVersion: "2024-10-21"
      });
    } else {
      logger.debug('Using Azure managed identity authentication');
      const credential = new DefaultAzureCredential();
      const scope = "https://cognitiveservices.azure.com/.default";
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);
      return new AzureOpenAI({
        endpoint: config.endpoint,
        azureADTokenProvider,
        apiVersion: "2024-10-21"
      });
    }
  })();

  return {
    async chatCompletion(messages: ChatMessage[], options = {}): Promise<ChatCompletionResponse> {
      const model = options.model ?? config.deployments.chat;
      const cacheKey = cache ? JSON.stringify({ messages, model, options }) : null;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, async () => null);
        if (cached) {
          logger.debug('Using cached chat completion');
          return cached as ChatCompletionResponse;
        }
      }

      logger.debug(`Making chat completion request to ${model}`);
      
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
          await cache.memoize(cacheKey, async () => result);
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
      jsonSchema: Record<string, unknown>,
      options: {
        maxTokens?: number;
        temperature?: number;
        model?: string;
      } = {}
    ): Promise<T> {
      const model = options.model ?? config.deployments.chat;
      const cacheKey = cache ? JSON.stringify({ messages, model, options, jsonSchema }) : null;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, async () => null);
        if (cached) {
          logger.debug('Using cached structured completion');
          return cached as T;
        }
      }

      logger.debug(`Making structured completion request to ${model}`);
      
      try {
        const response = await client.chat.completions.create({
          model: model,
          messages: messages,
          max_tokens: options.maxTokens ?? null,
          temperature: options.temperature ?? null,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "response",
              schema: jsonSchema,
              strict: true,
            },
          },
        });

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          throw new Error('No content received from Azure OpenAI');
        }

        let result: T;
        try {
          result = JSON.parse(choice.message.content) as T;
        } catch (parseError) {
          throw new Error(`Failed to parse JSON response: ${parseError}`);
        }

        if (cache && cacheKey) {
          await cache.memoize(cacheKey, async () => result);
        }

        logger.debug(`Structured completion successful, ${response.usage?.total_tokens ?? 0} tokens used`);
        return result;
      } catch (error) {
        logger.error(`Azure OpenAI structured completion failed: ${error}`);
        throw error;
      }
    },

    async getEmbedding(text: string, model?: string): Promise<EmbeddingResponse> {
      const embeddingModel = model ?? config.deployments.embeddings;
      const cacheKey = cache ? JSON.stringify({ text, model: embeddingModel }) : null;
      
      if (cache && cacheKey) {
        const cached = await cache.memoize(cacheKey, async () => null);
        if (cached) {
          logger.debug('Using cached embedding');
          return cached as EmbeddingResponse;
        }
      }

      logger.debug(`Making embedding request to ${embeddingModel}`);
      
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
          await cache.memoize(cacheKey, async () => result);
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