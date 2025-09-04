import { describe, expect, test } from '@jest/globals';
import { StaticReproSchema, StaticReproCliSchema, StaticReproLsSchema, StaticReproUnknownSchema } from '../lib/schemas.js';

describe('StaticRepro schemas', () => {
  test('should validate CLI reproduction format', () => {
    const cliRepro = {
      type: 'cli',
      files: [
        {
          name: 'input.ts',
          content: 'let x = [1, , , ,];'
        }
      ],
      args: ['--noEmit', 'false'],
      check: 'Read the produced file input.js. It should contain the sequence `[1, , , ,]`'
    };

    const result = StaticReproCliSchema.safeParse(cliRepro);
    expect(result.success).toBe(true);
    
    const staticResult = StaticReproSchema.safeParse(cliRepro);
    expect(staticResult.success).toBe(true);
    expect(staticResult.data?.type).toBe('cli');
  });

  test('should validate LS reproduction format', () => {
    const lsRepro = {
      type: 'ls',
      files: [
        {
          name: 'main.ts',
          content: 'interface Foo { bar: string; }\nconst x: Foo = { /*!*/ };'
        }
      ],
      check: 'Hover at the query position should show completion options for Foo properties'
    };

    const result = StaticReproLsSchema.safeParse(lsRepro);
    expect(result.success).toBe(true);
    
    const staticResult = StaticReproSchema.safeParse(lsRepro);
    expect(staticResult.success).toBe(true);
    expect(staticResult.data?.type).toBe('ls');
  });

  test('should validate unknown reproduction format', () => {
    const unknownRepro = {
      type: 'unknown',
      reasoning: 'The issue description is too vague to determine if it requires CLI or LS testing'
    };

    const result = StaticReproUnknownSchema.safeParse(unknownRepro);
    expect(result.success).toBe(true);
    
    const staticResult = StaticReproSchema.safeParse(unknownRepro);
    expect(staticResult.success).toBe(true);
    expect(staticResult.data?.type).toBe('unknown');
  });

  test('should reject invalid type', () => {
    const invalidRepro = {
      type: 'invalid',
      files: [],
      check: 'test'
    };

    const result = StaticReproSchema.safeParse(invalidRepro);
    expect(result.success).toBe(false);
  });

  test('should require all CLI fields', () => {
    const incompleteCli = {
      type: 'cli',
      files: [{ name: 'test.ts', content: 'test' }]
      // missing args and check
    };

    const result = StaticReproCliSchema.safeParse(incompleteCli);
    expect(result.success).toBe(false);
  });

  test('should require all LS fields', () => {
    const incompleteLs = {
      type: 'ls',
      files: [{ name: 'test.ts', content: 'test' }]
      // missing check
    };

    const result = StaticReproLsSchema.safeParse(incompleteLs);
    expect(result.success).toBe(false);
  });

  test('should require reasoning for unknown type', () => {
    const incompleteUnknown = {
      type: 'unknown'
      // missing reasoning
    };

    const result = StaticReproUnknownSchema.safeParse(incompleteUnknown);
    expect(result.success).toBe(false);
  });
});