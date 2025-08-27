import { createKVCache } from './kvcache.js';
import { createMockLogger } from './utils.js';

describe('KVCache', () => {
  const logger = createMockLogger();

  it('should compute value when cache is disabled', async () => {
    const cache = createKVCache(logger, false);
    let computeCount = 0;
    
    const compute = async () => {
      computeCount++;
      return 'test-value';
    };

    const result1 = await cache.memoize('test-key', 'Test operation 1', compute);
    const result2 = await cache.memoize('test-key', 'Test operation 2', compute);

    expect(result1).toBe('test-value');
    expect(result2).toBe('test-value');
    expect(computeCount).toBe(2); // Should compute both times when disabled
  });

  it('should return cache size', async () => {
    const cache = createKVCache(logger, false);
    const size = await cache.size();
    expect(typeof size).toBe('number');
  });
});