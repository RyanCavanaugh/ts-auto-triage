import { describe, expect, test } from '@jest/globals';
import { StaticReproSchema } from '../lib/schemas.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { ensureDirectoryExists } from '../lib/utils.js';

describe('Static Repro Integration', () => {
  test('should create valid output file format', async () => {
    // Test CLI format
    const cliOutput = {
      type: 'cli' as const,
      files: [
        {
          name: 'input.ts',
          content: 'let x = [1, , , ,];'
        }
      ],
      args: ['--noEmit', 'false'],
      check: 'Read the produced file input.js. It should contain the sequence `[1, , , ,]`'
    };

    const outputPath = '/tmp/test-static-repro-cli.json';
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, JSON.stringify(cliOutput, null, 2));

    // Verify the file can be read and parsed
    const readContent = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(readContent);
    const validated = StaticReproSchema.parse(parsed);

    expect(validated.type).toBe('cli');
    expect(validated.files).toHaveLength(1);
    expect(validated.files[0]?.name).toBe('input.ts');

    // Test LS format
    const lsOutput = {
      type: 'ls' as const,
      files: [
        {
          name: 'main.ts',
          content: 'interface Foo { bar: string; }\nconst x: Foo = { /*!*/ };'
        }
      ],
      check: 'Hover at the query position should show completion options for Foo properties'
    };

    const lsOutputPath = '/tmp/test-static-repro-ls.json';
    ensureDirectoryExists(lsOutputPath);
    await writeFile(lsOutputPath, JSON.stringify(lsOutput, null, 2));

    const lsReadContent = await readFile(lsOutputPath, 'utf-8');
    const lsParsed = JSON.parse(lsReadContent);
    const lsValidated = StaticReproSchema.parse(lsParsed);

    expect(lsValidated.type).toBe('ls');
    expect(lsValidated.files).toHaveLength(1);
    expect(lsValidated.files[0]?.content).toContain('/*!*/');

    // Test unknown format
    const unknownOutput = {
      type: 'unknown' as const,
      reasoning: 'The issue description is too vague to determine the reproduction type'
    };

    const unknownOutputPath = '/tmp/test-static-repro-unknown.json';
    ensureDirectoryExists(unknownOutputPath);
    await writeFile(unknownOutputPath, JSON.stringify(unknownOutput, null, 2));

    const unknownReadContent = await readFile(unknownOutputPath, 'utf-8');
    const unknownParsed = JSON.parse(unknownReadContent);
    const unknownValidated = StaticReproSchema.parse(unknownParsed);

    expect(unknownValidated.type).toBe('unknown');
    expect(unknownValidated.reasoning).toBeTruthy();
  });
});