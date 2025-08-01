import { z } from 'zod';

export const CacheEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  timestamp: z.number(),
  ttl: z.number().optional()
});

export type CacheEntry = z.infer<typeof CacheEntrySchema>;