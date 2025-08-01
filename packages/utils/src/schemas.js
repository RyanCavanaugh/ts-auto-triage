import { z } from 'zod';
export const ConfigSchema = z.object({
    azure: z.object({
        endpoints: z.object({
            gpt4: z.string(),
            gpt35: z.string(),
            embeddings: z.string()
        }),
        deployments: z.object({
            gpt4: z.string(),
            gpt35: z.string(),
            embeddings: z.string()
        })
    }),
    typescript: z.object({
        tscPath: z.string(),
        lspPath: z.string()
    }),
    github: z.object({
        defaultRepo: z.string()
    }),
    ai: z.object({
        primaryModel: z.string(),
        fallbackModel: z.string(),
        embeddingsModel: z.string(),
        maxTokens: z.number(),
        temperature: z.number()
    }),
    cache: z.object({
        ttlHours: z.number(),
        maxCacheSize: z.string()
    })
});
//# sourceMappingURL=schemas.js.map