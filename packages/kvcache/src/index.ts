import { promises as fs } from 'fs';
import path from 'path';
import { formatCacheKey } from '@ryancavanaugh/utils';

export interface CacheOptions {
  cacheDir: string;
  maxAge?: number;
}

// Create a disk-based key-value cache
export function createKVCache(options: CacheOptions) {
  const { cacheDir, maxAge } = options;

  async function ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async function getCachePath(key: string): Promise<string> {
    const { dir, subdir, filename } = formatCacheKey(key);
    const fullDir = path.join(cacheDir, dir, subdir);
    await ensureDir(fullDir);
    return path.join(fullDir, filename);
  }

  async function get<T>(key: string): Promise<T | null> {
    try {
      const cachePath = await getCachePath(key);
      const data = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(data) as { value: T; timestamp: number };
      
      // Check if cache entry has expired
      if (maxAge && Date.now() - parsed.timestamp > maxAge) {
        await fs.unlink(cachePath).catch(() => {}); // Ignore errors
        return null;
      }
      
      return parsed.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function set<T>(key: string, value: T): Promise<void> {
    const cachePath = await getCachePath(key);
    const data = {
      value,
      timestamp: Date.now()
    };
    await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
  }

  async function has(key: string): Promise<boolean> {
    try {
      const cachePath = await getCachePath(key);
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  async function del(key: string): Promise<void> {
    try {
      const cachePath = await getCachePath(key);
      await fs.unlink(cachePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Memoize function with cache
  async function memoize<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = await get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await compute();
    await set(key, result);
    return result;
  }

  return {
    get,
    set,
    has,
    del,
    memoize
  };
}