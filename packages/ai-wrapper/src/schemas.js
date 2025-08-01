import { z } from 'zod';
export const AIMessageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
});
export const AIRequestSchema = z.object({
    messages: z.array(AIMessageSchema),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
    temperature: z.number().optional(),
    stream: z.boolean().optional()
});
export const AIResponseSchema = z.object({
    id: z.string(),
    object: z.string(),
    created: z.number(),
    model: z.string(),
    choices: z.array(z.object({
        index: z.number(),
        message: AIMessageSchema,
        finish_reason: z.string().nullable()
    })),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number()
    })
});
export const EmbeddingRequestSchema = z.object({
    input: z.union([z.string(), z.array(z.string())]),
    model: z.string().optional()
});
export const EmbeddingResponseSchema = z.object({
    object: z.string(),
    data: z.array(z.object({
        object: z.string(),
        embedding: z.array(z.number()),
        index: z.number()
    })),
    model: z.string(),
    usage: z.object({
        prompt_tokens: z.number(),
        total_tokens: z.number()
    })
});
//# sourceMappingURL=schemas.js.map