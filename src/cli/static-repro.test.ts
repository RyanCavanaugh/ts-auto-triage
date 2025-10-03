import { describe, expect, test } from '@jest/globals';
import { 
  BugClassificationSchema, 
  CompilerReproStepsSchema, 
  LSReproStepsSchema, 
  BugRevalidationSchema 
} from '../lib/schemas.js';

describe('New Repro Extraction schemas', () => {
  test('should validate bug classification', () => {
    const classification = {
      bugType: 'compiler',
      reasoning: 'The issue describes a type checking error'
    };

    const result = BugClassificationSchema.safeParse(classification);
    expect(result.success).toBe(true);
    expect(result.data?.bugType).toBe('compiler');
  });

  test('should validate compiler repro steps', () => {
    const reproSteps = {
      type: 'compiler-repro',
      fileMap: {
        'test.ts': 'const x: number = "hello";',
        'tsconfig.json': '{"compilerOptions": {"strict": true}}'
      },
      cmdLineArgs: ['--noEmit'],
      instructions: 'The bug still exists if tsc reports a type error'
    };

    const result = CompilerReproStepsSchema.safeParse(reproSteps);
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('compiler-repro');
    expect(Object.keys(result.data?.fileMap ?? {})).toContain('test.ts');
  });

  test('should validate LS repro steps', () => {
    const reproSteps = {
      type: 'ls-repro',
      twoslash: '// @fileName: test.ts\ninterface Foo { bar: string; }\nconst x: Foo = { /**/ };',
      instructions: 'The bug still exists if completion list does not include bar'
    };

    const result = LSReproStepsSchema.safeParse(reproSteps);
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('ls-repro');
    expect(result.data?.twoslash).toContain('interface Foo');
  });

  test('should validate bug revalidation', () => {
    const validation = {
      bug_status: 'present',
      relevant_output: 'Error: Type string is not assignable to type number',
      reasoning: 'The expected type error was present in the output'
    };

    const result = BugRevalidationSchema.safeParse(validation);
    expect(result.success).toBe(true);
    expect(result.data?.bug_status).toBe('present');
  });

  test('should reject invalid bug type', () => {
    const classification = {
      bugType: 'invalid',
      reasoning: 'test'
    };

    const result = BugClassificationSchema.safeParse(classification);
    expect(result.success).toBe(false);
  });

  test('should require instructions in compiler repro', () => {
    const reproSteps = {
      type: 'compiler-repro',
      fileMap: { 'test.ts': 'code' },
      cmdLineArgs: ['--noEmit']
      // missing instructions
    };

    const result = CompilerReproStepsSchema.safeParse(reproSteps);
    expect(result.success).toBe(false);
  });

  test('should require instructions in LS repro', () => {
    const reproSteps = {
      type: 'ls-repro',
      twoslash: 'code'
      // missing instructions
    };

    const result = LSReproStepsSchema.safeParse(reproSteps);
    expect(result.success).toBe(false);
  });
});