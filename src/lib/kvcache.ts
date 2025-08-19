import * as fs from 'fs/promises';
import type { Logger } from './utils.js';
import { createCacheKey, createCachePath, ensureDirectoryExists } from './utils.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface KVCache {
  memoize<T>(key: string, compute: () => Promise<T>): Promise<T>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

export function createKVCache(logger: Logger, enabled: boolean = true): KVCache {
  return {
    async memoize<T>(key: string, compute: () => Promise<T>): Promise<T> {
      if (!enabled) {
        logger.debug(`Cache disabled, computing fresh value for key: ${key}`);
        return await compute();
      }

      const cacheKey = createCacheKey(key, 'default');
      const cachePath = createCachePath(cacheKey);
      
      try {
        // Try to read from cache
        const cacheData = await fs.readFile(cachePath, 'utf-8');
        const entry: CacheEntry<T> = JSON.parse(cacheData);
        logger.debug(`Cache hit for key: ${key}`);
        return entry.data;
      } catch (error) {
        // Cache miss, compute and store
        logger.debug(`Cache miss for key: ${key}, computing...`);
        const result = await compute();
        
        try {
          ensureDirectoryExists(cachePath);
          const entry: CacheEntry<T> = {
            data: result,
            timestamp: Date.now(),
          };
          await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));
          logger.debug(`Cached result for key: ${key}`);
        } catch (writeError) {
          logger.warn(`Failed to write cache for key ${key}: ${writeError}`);
        }
        
        return result;
      }
    },

    async clear(): Promise<void> {
      try {
        await fs.rm('.kvcache', { recursive: true, force: true });
        logger.info('Cache cleared');
      } catch (error) {
        logger.warn(`Failed to clear cache: ${error}`);
      }
    },

    async size(): Promise<number> {
      try {
        const stats = await getCacheStats('.kvcache');
        return stats.fileCount;
      } catch (error) {
        return 0;
      }
    },
  };
}

async function getCacheStats(dir: string): Promise<{ fileCount: number; totalSize: number }> {
  let fileCount = 0;
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      
      if (entry.isDirectory()) {
        const subStats = await getCacheStats(fullPath);
        fileCount += subStats.fileCount;
        totalSize += subStats.totalSize;
      } else if (entry.name.endsWith('.json')) {
        const stat = await fs.stat(fullPath);
        fileCount++;
        totalSize += stat.size;
      }
    }
  } catch (error) {
    // Directory doesn't exist or other error
  }

  return { fileCount, totalSize };
}