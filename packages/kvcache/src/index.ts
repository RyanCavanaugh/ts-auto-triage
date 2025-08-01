import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { CacheEntrySchema, type CacheEntry } from './schemas.js';

/**
 * Creates a hash-based key for caching
 */
export function createCacheKey(input: string, endpoint?: string): string {
  const content = endpoint ? `${endpoint}:${input}` : input;
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Splits a cache key into directory structure
 * e.g. "283cabh182d124fa" -> { dir: "28", subdir: "3c", filename: "abh182d124fa.json" }
 */
export function splitCacheKey(key: string): { dir: string; subdir: string; filename: string } {
  if (key.length < 4) {
    throw new Error('Cache key must be at least 4 characters long');
  }
  
  return {
    dir: key.substring(0, 2),
    subdir: key.substring(2, 4),
    filename: `${key.substring(4)}.json`
  };
}

/**
 * Ensures a directory exists, creating it if necessary
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Key-value cache with automatic directory structure and TTL support
 */
export function createKVCache(basePath: string = '.kvcache') {
  /**
   * Memoized function that caches results of expensive operations
   */
  async function memoize<T>(
    key: string, 
    compute: () => Promise<T>,
    options: { ttlHours?: number; endpoint?: string } = {}
  ): Promise<T> {
    const { ttlHours = 24, endpoint } = options;
    const cacheKey = createCacheKey(key, endpoint);
    const { dir, subdir, filename } = splitCacheKey(cacheKey);
    
    const cachePath = join(basePath, dir, subdir, filename);
    
    try {
      // Try to read from cache
      const cached = await fs.readFile(cachePath, 'utf-8');
      const entry = CacheEntrySchema.parse(JSON.parse(cached));
      
      // Check if entry is still valid
      const now = Date.now();
      const maxAge = ttlHours * 60 * 60 * 1000;
      if (entry.timestamp && (now - entry.timestamp) < maxAge) {
        return JSON.parse(entry.value) as T;
      }
    } catch {
      // Cache miss or invalid entry, continue to compute
    }
    
    // Compute new value
    const result = await compute();
    
    // Store in cache
    const entry: CacheEntry = {
      key: cacheKey,
      value: JSON.stringify(result),
      timestamp: Date.now(),
      ttl: ttlHours
    };
    
    // Ensure directory structure exists
    await ensureDir(dirname(cachePath));
    
    // Write to cache
    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));
    
    return result;
  }

  /**
   * Clear cache entries older than specified hours
   */
  async function clearExpired(maxAgeHours: number = 24): Promise<void> {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    async function clearDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await clearDirectory(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const cacheEntry = CacheEntrySchema.parse(JSON.parse(content));
              
              if (cacheEntry.timestamp && cacheEntry.timestamp < cutoff) {
                await fs.unlink(fullPath);
              }
            } catch {
              // Invalid cache file, remove it
              await fs.unlink(fullPath);
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }
    
    await clearDirectory(basePath);
  }

  /**
   * Get cache statistics
   */
  async function getStats(): Promise<{ fileCount: number; totalSize: number }> {
    let fileCount = 0;
    let totalSize = 0;
    
    async function scanDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            fileCount++;
            totalSize += stats.size;
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }
    
    await scanDirectory(basePath);
    return { fileCount, totalSize };
  }
  
  return {
    memoize,
    clearExpired,
    getStats
  };
}

export type KVCache = ReturnType<typeof createKVCache>;