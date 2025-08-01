import OpenAI from 'openai';
import { AIMessageSchema, AIResponseSchema, EmbeddingResponseSchema } from './schemas.js';
/**
 * Creates an AI wrapper that can dispatch to multiple Azure OpenAI models
 */
export function createAIWrapper(options) {
    const { config, logger = console, maxRetries = 3, defaultMaxTokens = 4096, defaultTemperature = 0.1 } = options;
    // Create OpenAI clients for each endpoint
    const clients = {
        gpt4: new OpenAI({
            baseURL: `${config.endpoints.gpt4}/openai/deployments/${config.deployments.gpt4}`,
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: {
                'api-key': process.env.AZURE_OPENAI_API_KEY || ''
            }
        }),
        gpt35: new OpenAI({
            baseURL: `${config.endpoints.gpt35}/openai/deployments/${config.deployments.gpt35}`,
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: {
                'api-key': process.env.AZURE_OPENAI_API_KEY || ''
            }
        }),
        embeddings: new OpenAI({
            baseURL: `${config.endpoints.embeddings}/openai/deployments/${config.deployments.embeddings}`,
            defaultQuery: { 'api-version': '2024-02-01' },
            defaultHeaders: {
                'api-key': process.env.AZURE_OPENAI_API_KEY || ''
            }
        })
    };
    /**
     * Retry wrapper with exponential backoff
     */
    async function withRetry(operation) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    break;
                }
                // Exponential backoff
                const delay = Math.pow(2, attempt - 1) * 1000;
                logger.warn(`AI request failed, retrying in ${delay}ms: ${error}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    /**
     * Chat completion with the specified model
     */
    async function chat(messages, options = {}) {
        const { model = 'gpt4', maxTokens = defaultMaxTokens, temperature = defaultTemperature, systemPrompt } = options;
        // Validate messages
        const validatedMessages = messages.map(msg => AIMessageSchema.parse(msg));
        // Add system prompt if provided
        const allMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...validatedMessages]
            : validatedMessages;
        logger.info(`Making chat request to ${model} with ${allMessages.length} messages`);
        const client = clients[model];
        if (!client) {
            throw new Error(`Unknown model: ${model}`);
        }
        const response = await withRetry(async () => {
            return await client.chat.completions.create({
                model: config.deployments[model],
                messages: allMessages,
                max_tokens: maxTokens,
                temperature
            });
        });
        const validatedResponse = AIResponseSchema.parse(response);
        logger.info(`AI response: ${validatedResponse.usage.total_tokens} tokens used`);
        return validatedResponse;
    }
    /**
     * Get embeddings for text
     */
    async function getEmbeddings(input) {
        logger.info(`Getting embeddings for ${Array.isArray(input) ? input.length : 1} inputs`);
        const client = clients.embeddings;
        const response = await withRetry(async () => {
            return await client.embeddings.create({
                input,
                model: config.deployments.embeddings
            });
        });
        const validatedResponse = EmbeddingResponseSchema.parse(response);
        logger.info(`Embeddings response: ${validatedResponse.usage.total_tokens} tokens used`);
        return validatedResponse;
    }
    /**
     * Summarize text using AI
     */
    async function summarize(text, options = {}) {
        const { maxLength = 200, model = 'gpt35' } = options;
        const systemPrompt = `You are a technical summarizer. Create a concise summary of the given text in no more than ${maxLength} words. Focus on the key technical details and main points. Be succinct and technical.`;
        const response = await chat([
            { role: 'user', content: text }
        ], { systemPrompt, model, maxTokens: Math.ceil(maxLength * 1.5) });
        return response.choices[0]?.message.content || '';
    }
    /**
     * Analyze text for specific purposes (FAQ matching, duplicate detection, etc.)
     */
    async function analyze(text, prompt, options = {}) {
        const response = await chat([
            { role: 'user', content: `${prompt}\n\nText to analyze:\n${text}` }
        ], options);
        return response.choices[0]?.message.content || '';
    }
    /**
     * Generate structured response using JSON mode
     */
    async function generateStructured(messages, schema, options = {}) {
        const systemPrompt = `${options.systemPrompt || ''}\n\nRespond with valid JSON only. No additional text or explanation.`;
        const response = await chat(messages, {
            ...options,
            systemPrompt
        });
        const content = response.choices[0]?.message.content || '{}';
        try {
            const parsed = JSON.parse(content);
            return schema.parse(parsed);
        }
        catch (error) {
            logger.error(`Failed to parse AI response as JSON: ${error}`);
            logger.error(`Response content: ${content}`);
            throw new Error('AI response was not valid JSON');
        }
    }
    return {
        chat,
        getEmbeddings,
        summarize,
        analyze,
        generateStructured
    };
}
//# sourceMappingURL=index.js.map