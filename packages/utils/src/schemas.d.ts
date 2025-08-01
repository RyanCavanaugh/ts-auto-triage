import { z } from 'zod';
export declare const ConfigSchema: z.ZodObject<{
    azure: z.ZodObject<{
        endpoints: z.ZodObject<{
            gpt4: z.ZodString;
            gpt35: z.ZodString;
            embeddings: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        }, {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        }>;
        deployments: z.ZodObject<{
            gpt4: z.ZodString;
            gpt35: z.ZodString;
            embeddings: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        }, {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        deployments: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
        endpoints: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
    }, {
        deployments: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
        endpoints: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
    }>;
    typescript: z.ZodObject<{
        tscPath: z.ZodString;
        lspPath: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        lspPath: string;
        tscPath: string;
    }, {
        lspPath: string;
        tscPath: string;
    }>;
    github: z.ZodObject<{
        defaultRepo: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        defaultRepo: string;
    }, {
        defaultRepo: string;
    }>;
    ai: z.ZodObject<{
        primaryModel: z.ZodString;
        fallbackModel: z.ZodString;
        embeddingsModel: z.ZodString;
        maxTokens: z.ZodNumber;
        temperature: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxTokens: number;
        temperature: number;
        primaryModel: string;
        fallbackModel: string;
        embeddingsModel: string;
    }, {
        maxTokens: number;
        temperature: number;
        primaryModel: string;
        fallbackModel: string;
        embeddingsModel: string;
    }>;
    cache: z.ZodObject<{
        ttlHours: z.ZodNumber;
        maxCacheSize: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        ttlHours: number;
        maxCacheSize: string;
    }, {
        ttlHours: number;
        maxCacheSize: string;
    }>;
}, "strip", z.ZodTypeAny, {
    typescript: {
        lspPath: string;
        tscPath: string;
    };
    azure: {
        deployments: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
        endpoints: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
    };
    github: {
        defaultRepo: string;
    };
    ai: {
        maxTokens: number;
        temperature: number;
        primaryModel: string;
        fallbackModel: string;
        embeddingsModel: string;
    };
    cache: {
        ttlHours: number;
        maxCacheSize: string;
    };
}, {
    typescript: {
        lspPath: string;
        tscPath: string;
    };
    azure: {
        deployments: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
        endpoints: {
            gpt4: string;
            gpt35: string;
            embeddings: string;
        };
    };
    github: {
        defaultRepo: string;
    };
    ai: {
        maxTokens: number;
        temperature: number;
        primaryModel: string;
        fallbackModel: string;
        embeddingsModel: string;
    };
    cache: {
        ttlHours: number;
        maxCacheSize: string;
    };
}>;
export type Config = z.infer<typeof ConfigSchema>;
//# sourceMappingURL=schemas.d.ts.map