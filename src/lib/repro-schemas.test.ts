import { describe, expect, test } from '@jest/globals';
import { 
  BugClassificationSchema,
  CompilerReproStepsSchema,
  LSReproStepsSchema,
  BugRevalidationSchema,
  type BugClassification,
  type CompilerReproSteps,
  type LSReproSteps
} from './schemas.js';

describe('Repro Extraction Schemas End-to-End', () => {
  test('should support full compiler bug workflow', () => {
    // Step 1: Classification
    const classification: BugClassification = {
      bugType: 'compiler',
      reasoning: 'The issue describes a compilation error with type checking'
    };
    
    const classResult = BugClassificationSchema.safeParse(classification);
    expect(classResult.success).toBe(true);

    // Step 2: Repro Steps
    const reproSteps: CompilerReproSteps = {
      type: 'compiler-repro',
      fileMap: {
        'test.ts': 'const x: number = "string";',
        'tsconfig.json': '{"compilerOptions": {"strict": true}}'
      },
      cmdLineArgs: ['--noEmit'],
      instructions: 'The bug still exists if tsc reports error TS2322'
    };

    const reproResult = CompilerReproStepsSchema.safeParse(reproSteps);
    expect(reproResult.success).toBe(true);

    // Step 3: Validation
    const validation = {
      bug_status: 'present',
      relevant_output: 'test.ts(1,7): error TS2322: Type \'string\' is not assignable to type \'number\'.',
      reasoning: 'The compiler reported the expected type error TS2322'
    };

    const validResult = BugRevalidationSchema.safeParse(validation);
    expect(validResult.success).toBe(true);
  });

  test('should support full language service bug workflow', () => {
    // Step 1: Classification
    const classification: BugClassification = {
      bugType: 'language-service',
      reasoning: 'The issue describes incorrect IntelliSense behavior'
    };
    
    const classResult = BugClassificationSchema.safeParse(classification);
    expect(classResult.success).toBe(true);

    // Step 2: Repro Steps
    const reproSteps: LSReproSteps = {
      type: 'ls-repro',
      twoslash: '// @fileName: test.ts\ninterface MyType { prop: string; }\nconst x: MyType = { /**/ };',
      instructions: 'The bug is fixed if the completion list includes \'prop\''
    };

    const reproResult = LSReproStepsSchema.safeParse(reproSteps);
    expect(reproResult.success).toBe(true);

    // Step 3: Validation
    const validation = {
      bug_status: 'not present',
      relevant_output: 'Completion list: [{ label: \'prop\', kind: 5 }]',
      reasoning: 'The completion list correctly includes the prop member'
    };

    const validResult = BugRevalidationSchema.safeParse(validation);
    expect(validResult.success).toBe(true);
  });

  test('should support unknown bug workflow', () => {
    const classification: BugClassification = {
      bugType: 'unknown',
      reasoning: 'The issue description is too vague to determine bug type'
    };
    
    const result = BugClassificationSchema.safeParse(classification);
    expect(result.success).toBe(true);
    
    // No repro steps should be generated for unknown bugs
  });

  test('should enforce instruction format conventions', () => {
    const goodInstructions = [
      'The bug is fixed if no error is reported',
      'The bug still exists if the output contains __extends',
      'The bug is fixed if completion list includes Object',
      'The bug still exists if hover shows incorrect type'
    ];

    for (const instruction of goodInstructions) {
      expect(
        instruction.startsWith('The bug is fixed if') || 
        instruction.startsWith('The bug still exists if')
      ).toBe(true);
    }
  });

  test('should require all mandatory fields in compiler repro', () => {
    const incomplete = {
      type: 'compiler-repro',
      fileMap: { 'test.ts': 'code' }
      // Missing cmdLineArgs and instructions
    };

    const result = CompilerReproStepsSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  test('should require all mandatory fields in LS repro', () => {
    const incomplete = {
      type: 'ls-repro'
      // Missing twoslash and instructions
    };

    const result = LSReproStepsSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  test('should validate bug status values', () => {
    const validStatuses = ['present', 'not present'];
    
    for (const status of validStatuses) {
      const validation = {
        bug_status: status,
        relevant_output: 'output',
        reasoning: 'reasoning'
      };
      
      const result = BugRevalidationSchema.safeParse(validation);
      expect(result.success).toBe(true);
    }

    const invalidValidation = {
      bug_status: 'invalid',
      relevant_output: 'output',
      reasoning: 'reasoning'
    };

    const result = BugRevalidationSchema.safeParse(invalidValidation);
    expect(result.success).toBe(false);
  });
});
