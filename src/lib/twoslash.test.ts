import { createTwoslashParser } from '../src/lib/twoslash.js';
import { createMockLogger } from '../src/lib/utils.js';

describe('Twoslash Parser', () => {
  const logger = createMockLogger();
  const parser = createTwoslashParser(logger);

  it('should parse basic twoslash format', () => {
    const markdown = `
// @strict: true

// foo.ts
export function test() {
  return 42;
}

// bar.ts
import { test } from "./foo.js";
const result = test(/*!*/);
`;

    const config = parser.parse(markdown);
    
    expect(config.compilerOptions).toEqual({ strict: true });
    expect(config.files).toHaveLength(2);
    expect(config.files[0]?.filename).toBe('foo.ts');
    expect(config.files[1]?.filename).toBe('bar.ts');
    expect(config.query).toBeDefined();
    expect(config.query?.filename).toBe('bar.ts');
  });

  it('should extract query position', () => {
    const result = parser.extractQuery('const x = func(/*!*/);');
    expect(result).toEqual({
      position: { line: 0, character: 15 },
      filename: '',
    });
  });

  it('should return null for no query marker', () => {
    const result = parser.extractQuery('const x = func();');
    expect(result).toBeNull();
  });
});