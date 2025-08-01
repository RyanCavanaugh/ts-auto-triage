import { type AIMessage, type AIResponse, type EmbeddingResponse } from './schemas.js';
export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export interface AIConfig {
    endpoints: {
        gpt4: string;
        gpt35: string;
        embeddings: string;
    };
    deployments: {
        gpt4: string;
        gpt35: string;
        embeddings: string;
    };
}
export interface AIWrapperOptions {
    config: AIConfig;
    logger?: Logger;
    maxRetries?: number;
    defaultMaxTokens?: number;
    defaultTemperature?: number;
}
export interface ChatOptions {
    model?: 'gpt4' | 'gpt35';
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}
/**
 * Creates an AI wrapper that can dispatch to multiple Azure OpenAI models
 */
export declare function createAIWrapper(options: AIWrapperOptions): {
    chat: (messages: AIMessage[], options?: ChatOptions) => Promise<AIResponse>;
    getEmbeddings: (input: string | string[]) => Promise<EmbeddingResponse>;
    summarize: (text: string, options?: {
        maxLength?: number;
        model?: "gpt4" | "gpt35";
    }) => Promise<string>;
    analyze: (text: string, prompt: string, options?: ChatOptions) => Promise<string>;
    generateStructured: <T>(messages: AIMessage[], schema: any, options?: ChatOptions) => Promise<T>;
};
export type AIWrapper = ReturnType<typeof createAIWrapper>;
//# sourceMappingURL=index.d.ts.map