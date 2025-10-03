import { describe, expect, test } from '@jest/globals';
import { 
  CompilerReproStepsSchema, 
  LSReproStepsSchema, 
  BugClassificationSchema 
} from '../lib/schemas.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { ensureDirectoryExists } from '../lib/utils.js';

describe('Repro Extraction Integration', () => {
  test('should create valid compiler repro output', async () => {
    const classification = {
      bugType: 'compiler',
      reasoning: 'Issue describes type checking error'
    };

    const reproSteps = {
      type: 'compiler-repro',
      fileMap: {
        'index.ts': 'const x: number = "hello";'
      },
      cmdLineArgs: ['--noEmit'],
      instructions: 'The bug still exists if tsc reports error TS2322'
    };

    const outputPath = '/tmp/test-repro-compiler.json';
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, JSON.stringify(reproSteps, null, 2));

    const readContent = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(readContent);
    const validated = CompilerReproStepsSchema.parse(parsed);

    expect(validated.type).toBe('compiler-repro');
    expect(validated.fileMap['index.ts']).toBeTruthy();
    expect(validated.instructions).toContain('bug still exists');
  });

  test('should create valid LS repro output', async () => {
    const reproSteps = {
      type: 'ls-repro',
      twoslash: '// @fileName: main.ts\ninterface Foo { bar: string; }\nconst x: Foo = { /*!*/ };',
      instructions: 'The bug still exists if completion list does not include bar'
    };

    const outputPath = '/tmp/test-repro-ls.json';
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, JSON.stringify(reproSteps, null, 2));

    const readContent = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(readContent);
    const validated = LSReproStepsSchema.parse(parsed);

    expect(validated.type).toBe('ls-repro');
    expect(validated.twoslash).toContain('/*!*/');
    expect(validated.instructions).toContain('bug still exists');
  });

  test('should create valid classification output', async () => {
    const classification = {
      bugType: 'unknown',
      reasoning: 'Issue description is too vague'
    };

    const outputPath = '/tmp/test-classification.json';
    ensureDirectoryExists(outputPath);
    await writeFile(outputPath, JSON.stringify(classification, null, 2));

    const readContent = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(readContent);
    const validated = BugClassificationSchema.parse(parsed);

    expect(validated.bugType).toBe('unknown');
    expect(validated.reasoning).toBeTruthy();
  });
});