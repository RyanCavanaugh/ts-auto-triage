/**
 * Creates a hash-based key for caching
 */
export declare function createCacheKey(input: string, endpoint?: string): string;
/**
 * Splits a cache key into directory structure
 * e.g. "283cabh182d124fa" -> { dir: "28", subdir: "3c", filename: "abh182d124fa.json" }
 */
export declare function splitCacheKey(key: string): {
    dir: string;
    subdir: string;
    filename: string;
};
/**
 * Key-value cache with automatic directory structure and TTL support
 */
export declare function createKVCache(basePath?: string): {
    memoize: <T>(key: string, compute: () => Promise<T>, options?: {
        ttlHours?: number;
        endpoint?: string;
    }) => Promise<T>;
    clearExpired: (maxAgeHours?: number) => Promise<void>;
    getStats: () => Promise<{
        fileCount: number;
        totalSize: number;
    }>;
};
export type KVCache = ReturnType<typeof createKVCache>;
//# sourceMappingURL=index.d.ts.map