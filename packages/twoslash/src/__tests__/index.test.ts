import { parseTwoslashContent, findMarkerInFile, getCleanFileContent } from '../index.js';

describe('Twoslash Parser', () => {
  test('parses simple twoslash content', () => {
    const content = `
// @strict: true

// foo.ts
export function test() {
  return 42;
}

// bar.ts
import { test } from "./foo.js";
const result = test(/*!*/);
`;
    
    const document = parseTwoslashContent(content);
    
    expect(document.options.strict).toBe(true);
    expect(document.files).toHaveLength(2);
    expect(document.files[0].filename).toBe('foo.ts');
    expect(document.files[1].filename).toBe('bar.ts');
    expect(document.markers).toHaveLength(1);
  });

  test('finds markers in files', () => {
    const content = `
// file.ts
function test() {
  return /*!*/"hello";
}
`;
    
    const document = parseTwoslashContent(content);
    const markerPos = findMarkerInFile(document, 'file.ts', 0);
    
    expect(markerPos).not.toBeNull();
    expect(markerPos?.line).toBe(1);
    expect(markerPos?.character).toBeGreaterThan(0);
  });

  test('cleans marker comments from content', () => {
    const content = `
// file.ts
function test() {
  return /*!*/"hello";
}
`;
    
    const document = parseTwoslashContent(content);
    const cleanContent = getCleanFileContent(document, 'file.ts');
    
    expect(cleanContent).not.toContain('/*!*/');
    expect(cleanContent).toContain('return "hello"');
  });

  test('parses multiple compiler options', () => {
    const content = `
// @strict: true
// @target: ES2020
// @module: ESNext

// file.ts
export const x = 1;
`;
    
    const document = parseTwoslashContent(content);
    
    expect(document.options.strict).toBe(true);
    expect(document.options.target).toBe('ES2020');
    expect(document.options.module).toBe('ESNext');
  });
});