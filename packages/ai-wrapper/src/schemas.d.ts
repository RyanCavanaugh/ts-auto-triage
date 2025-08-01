import { z } from 'zod';
export declare const AIMessageSchema: z.ZodObject<{
    role: z.ZodEnum<["system", "user", "assistant"]>;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    role: "system" | "user" | "assistant";
    content: string;
}, {
    role: "system" | "user" | "assistant";
    content: string;
}>;
export declare const AIRequestSchema: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["system", "user", "assistant"]>;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        role: "system" | "user" | "assistant";
        content: string;
    }, {
        role: "system" | "user" | "assistant";
        content: string;
    }>, "many">;
    model: z.ZodOptional<z.ZodString>;
    max_tokens: z.ZodOptional<z.ZodNumber>;
    temperature: z.ZodOptional<z.ZodNumber>;
    stream: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    messages: {
        role: "system" | "user" | "assistant";
        content: string;
    }[];
    model?: string | undefined;
    temperature?: number | undefined;
    max_tokens?: number | undefined;
    stream?: boolean | undefined;
}, {
    messages: {
        role: "system" | "user" | "assistant";
        content: string;
    }[];
    model?: string | undefined;
    temperature?: number | undefined;
    max_tokens?: number | undefined;
    stream?: boolean | undefined;
}>;
export declare const AIResponseSchema: z.ZodObject<{
    id: z.ZodString;
    object: z.ZodString;
    created: z.ZodNumber;
    model: z.ZodString;
    choices: z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        message: z.ZodObject<{
            role: z.ZodEnum<["system", "user", "assistant"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            role: "system" | "user" | "assistant";
            content: string;
        }, {
            role: "system" | "user" | "assistant";
            content: string;
        }>;
        finish_reason: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: {
            role: "system" | "user" | "assistant";
            content: string;
        };
        index: number;
        finish_reason: string | null;
    }, {
        message: {
            role: "system" | "user" | "assistant";
            content: string;
        };
        index: number;
        finish_reason: string | null;
    }>, "many">;
    usage: z.ZodObject<{
        prompt_tokens: z.ZodNumber;
        completion_tokens: z.ZodNumber;
        total_tokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }, {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }>;
}, "strip", z.ZodTypeAny, {
    object: string;
    id: string;
    created: number;
    model: string;
    choices: {
        message: {
            role: "system" | "user" | "assistant";
            content: string;
        };
        index: number;
        finish_reason: string | null;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}, {
    object: string;
    id: string;
    created: number;
    model: string;
    choices: {
        message: {
            role: "system" | "user" | "assistant";
            content: string;
        };
        index: number;
        finish_reason: string | null;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}>;
export declare const EmbeddingRequestSchema: z.ZodObject<{
    input: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    input: string | string[];
    model?: string | undefined;
}, {
    input: string | string[];
    model?: string | undefined;
}>;
export declare const EmbeddingResponseSchema: z.ZodObject<{
    object: z.ZodString;
    data: z.ZodArray<z.ZodObject<{
        object: z.ZodString;
        embedding: z.ZodArray<z.ZodNumber, "many">;
        index: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        object: string;
        index: number;
        embedding: number[];
    }, {
        object: string;
        index: number;
        embedding: number[];
    }>, "many">;
    model: z.ZodString;
    usage: z.ZodObject<{
        prompt_tokens: z.ZodNumber;
        total_tokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        prompt_tokens: number;
        total_tokens: number;
    }, {
        prompt_tokens: number;
        total_tokens: number;
    }>;
}, "strip", z.ZodTypeAny, {
    object: string;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
    data: {
        object: string;
        index: number;
        embedding: number[];
    }[];
}, {
    object: string;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
    data: {
        object: string;
        index: number;
        embedding: number[];
    }[];
}>;
export type AIMessage = z.infer<typeof AIMessageSchema>;
export type AIRequest = z.infer<typeof AIRequestSchema>;
export type AIResponse = z.infer<typeof AIResponseSchema>;
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;
//# sourceMappingURL=schemas.d.ts.map