import { createKVCache, createCacheKey, splitCacheKey } from '../index.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('KVCache', () => {
  const testCacheDir = './test-cache';
  
  beforeEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });
  
  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  test('createCacheKey generates consistent keys', () => {
    const key1 = createCacheKey('test-input');
    const key2 = createCacheKey('test-input');
    const key3 = createCacheKey('different-input');
    
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toHaveLength(16);
  });

  test('splitCacheKey creates proper directory structure', () => {
    const key = '283cabh182d124fa';
    const split = splitCacheKey(key);
    
    expect(split.dir).toBe('28');
    expect(split.subdir).toBe('3c');
    expect(split.filename).toBe('abh182d124fa.json');
  });

  test('memoize caches and returns results', async () => {
    const cache = createKVCache(testCacheDir);
    let callCount = 0;
    
    const expensiveOperation = async () => {
      callCount++;
      return `result-${callCount}`;
    };
    
    // First call should execute the operation
    const result1 = await cache.memoize('test-key', expensiveOperation);
    expect(result1).toBe('result-1');
    expect(callCount).toBe(1);
    
    // Second call should use cached result
    const result2 = await cache.memoize('test-key', expensiveOperation);
    expect(result2).toBe('result-1');
    expect(callCount).toBe(1); // Should not increment
  });

  test('cache respects TTL', async () => {
    const cache = createKVCache(testCacheDir);
    let callCount = 0;
    
    const expensiveOperation = async () => {
      callCount++;
      return `result-${callCount}`;
    };
    
    // Mock Date.now to simulate time passing
    const originalNow = Date.now;
    let mockTime = 1000;
    Date.now = jest.fn(() => mockTime);
    
    try {
      // First call
      const result1 = await cache.memoize('test-key', expensiveOperation, { ttlHours: 1 });
      expect(result1).toBe('result-1');
      expect(callCount).toBe(1);
      
      // Advance time by 2 hours
      mockTime += 2 * 60 * 60 * 1000;
      
      // Second call should not use cache (expired)
      const result2 = await cache.memoize('test-key', expensiveOperation, { ttlHours: 1 });
      expect(result2).toBe('result-2');
      expect(callCount).toBe(2);
    } finally {
      Date.now = originalNow;
    }
  });
});