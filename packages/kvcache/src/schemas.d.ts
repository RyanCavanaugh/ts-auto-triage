import { z } from 'zod';
export declare const CacheEntrySchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
    timestamp: z.ZodNumber;
    ttl: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    value: string;
    key: string;
    timestamp: number;
    ttl?: number | undefined;
}, {
    value: string;
    key: string;
    timestamp: number;
    ttl?: number | undefined;
}>;
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
//# sourceMappingURL=schemas.d.ts.map