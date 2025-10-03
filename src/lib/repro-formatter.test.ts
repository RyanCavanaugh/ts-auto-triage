import { describe, expect, test } from '@jest/globals';
import { createReproFormatter } from '../lib/repro-formatter.js';

describe('Repro Formatter', () => {
  const formatter = createReproFormatter();

  test('should format classification', () => {
    const classification = {
      bugType: 'compiler' as const,
      reasoning: 'Issue describes type checking error'
    };

    const output = formatter.formatClassification(classification);
    expect(output).toContain('# Bug Classification');
    expect(output).toContain('compiler');
    expect(output).toContain('type checking error');
  });

  test('should format compiler repro steps', () => {
    const reproSteps = {
      type: 'compiler-repro' as const,
      fileMap: {
        'index.ts': 'const x: number = "hello";',
        'tsconfig.json': '{"compilerOptions": {"strict": true}}'
      },
      cmdLineArgs: ['--noEmit'],
      instructions: 'The bug still exists if tsc reports error TS2322'
    };

    const output = formatter.formatReproSteps(reproSteps);
    expect(output).toContain('# Compiler Reproduction Steps');
    expect(output).toContain('index.ts');
    expect(output).toContain('tsconfig.json');
    expect(output).toContain('--noEmit');
    expect(output).toContain('TS2322');
  });

  test('should format LS repro steps', () => {
    const reproSteps = {
      type: 'ls-repro' as const,
      twoslash: '// @fileName: main.ts\ninterface Foo { bar: string; }',
      instructions: 'The bug still exists if completion list does not include bar'
    };

    const output = formatter.formatReproSteps(reproSteps);
    expect(output).toContain('# Language Service Reproduction Steps');
    expect(output).toContain('Twoslash File');
    expect(output).toContain('interface Foo');
    expect(output).toContain('completion list');
  });

  test('should format validation', () => {
    const validation = {
      bug_status: 'present' as const,
      relevant_output: 'Error: Type string is not assignable to type number',
      reasoning: 'The expected type error was present'
    };

    const output = formatter.formatValidation(validation);
    expect(output).toContain('# Bug Validation');
    expect(output).toContain('present');
    expect(output).toContain('Type string is not assignable');
  });

  test('should format full report with unknown classification', () => {
    const classification = {
      bugType: 'unknown' as const,
      reasoning: 'Issue is too vague'
    };

    const output = formatter.formatFullReport(classification, null, null);
    expect(output).toContain('# Reproduction Report');
    expect(output).toContain('unknown');
    expect(output).toContain('too vague');
    expect(output).toContain('No reproduction steps were generated');
  });

  test('should format full report with repro steps and validation', () => {
    const classification = {
      bugType: 'compiler' as const,
      reasoning: 'Issue describes type checking error'
    };

    const reproSteps = {
      type: 'compiler-repro' as const,
      fileMap: { 'test.ts': 'code' },
      cmdLineArgs: ['--noEmit'],
      instructions: 'The bug still exists if error is reported'
    };

    const validation = {
      bug_status: 'present' as const,
      relevant_output: 'Error found',
      reasoning: 'Error was present'
    };

    const output = formatter.formatFullReport(classification, reproSteps, validation);
    expect(output).toContain('# Reproduction Report');
    expect(output).toContain('## Classification');
    expect(output).toContain('## Reproduction Steps');
    expect(output).toContain('## Validation Results');
    expect(output).toContain('compiler');
    expect(output).toContain('present');
  });
});
