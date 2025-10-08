import type { AIWrapper, ChatMessage } from './ai-wrapper.js';
import type { FileLogger } from './file-logger.js';
import type z from 'zod';

/**
 * Create a logging wrapper around an AI wrapper that logs all LLM interactions
 * to a file logger
 */
export function createLoggingAIWrapper(
  ai: AIWrapper,
  fileLogger: FileLogger
): AIWrapper {
  return {
    async completion<T = any>(
      messages: ChatMessage[],
      options?: {
        jsonSchema?: z.ZodSchema<T>;
        maxTokens?: number;
        temperature?: number;
        model?: string;
        context?: string;
      }
    ): Promise<any> {
      const context = options?.context ?? (options?.jsonSchema ? 'Structured completion' : 'Chat completion');
      
      // Log input
      await fileLogger.logLLMInput(context, messages);
      
      // Make the actual call
      const result = await ai.completion(messages, options as any);
      
      // Log output
      if (options?.jsonSchema) {
        // Structured completion - log the parsed result
        await fileLogger.logLLMOutput(context, result);
      } else {
        // Chat completion - log content and usage
        await fileLogger.logLLMOutput(context, { content: (result as any).content }, (result as any).usage);
      }
      
      return result;
    },

    async getEmbedding(text: string, model?: string, context?: string) {
      const embeddingContext = context ?? 'Get embedding';
      
      // Log input
      await fileLogger.logInfo(`**Embedding Input (${embeddingContext}):**`);
      await fileLogger.logData('Text', text.length > 500 ? text.slice(0, 500) + '... (truncated)' : text);
      
      // Make the actual call
      const result = await ai.getEmbedding(text, model, context);
      
      // Log output (just metadata, not the full embedding array)
      await fileLogger.logInfo(`**Embedding Output:** Generated ${result.embedding.length} dimensional embedding`);
      if (result.usage) {
        await fileLogger.logInfo(`**Token Usage:** Prompt: ${result.usage.prompt_tokens ?? 'N/A'}, Total: ${result.usage.total_tokens ?? 'N/A'}`);
      }
      
      return result;
    },
  };
}
