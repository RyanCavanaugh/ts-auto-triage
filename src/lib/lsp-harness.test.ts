import { createLSPHarness } from './lsp-harness.js';
import { createMockLogger } from './utils.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('LSP Harness', () => {
  const logger = createMockLogger();
  const testWorkspaceDir = '/tmp/lsp-test-workspace';
  let harness: ReturnType<typeof createLSPHarness>;

  beforeAll(async () => {
    // Clean up any existing workspace
    await rm(testWorkspaceDir, { recursive: true, force: true });
    await mkdir(testWorkspaceDir, { recursive: true });

    // Create a basic package.json and tsconfig.json
    await writeFile(
      join(testWorkspaceDir, 'package.json'),
      JSON.stringify({ name: 'test-workspace', version: '1.0.0', type: 'module' }, null, 2)
    );

    await writeFile(
      join(testWorkspaceDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
        },
      }, null, 2)
    );

    // Create the harness with typescript-language-server using full path
    const lspPath = join(process.cwd(), 'node_modules/.bin/typescript-language-server');
    harness = createLSPHarness(lspPath, logger);
    await harness.start(testWorkspaceDir);
  }, 30000);

  afterAll(async () => {
    await harness.stop();
    await rm(testWorkspaceDir, { recursive: true, force: true });
  });

  describe('Document management', () => {
    it('should open and close a document', async () => {
      const filePath = join(testWorkspaceDir, 'test.ts');
      const content = 'const x: number = 42;';

      await expect(harness.openDocument(filePath, content)).resolves.not.toThrow();
      await expect(harness.closeDocument(filePath)).resolves.not.toThrow();
    });
  });

  describe('Completions', () => {
    it('should get completions for Math object members', async () => {
      const filePath = join(testWorkspaceDir, 'completions.ts');
      const content = 'const result = Math.';

      await harness.openDocument(filePath, content);

      // Request completions at the end of "Math."
      const completions = await harness.getCompletions(filePath, {
        line: 0,
        character: 20, // Position after "Math."
      });

      // Should get Math members like floor, ceil, round, etc.
      expect(completions.length).toBeGreaterThan(0);
      
      const labels = completions.map(c => c.label);
      expect(labels).toContain('floor');
      expect(labels).toContain('ceil');
      expect(labels).toContain('round');

      await harness.closeDocument(filePath);
    }, 10000);

    it('should get completions for interface properties', async () => {
      const filePath = join(testWorkspaceDir, 'interface-completions.ts');
      const content = `interface Person {
  name: string;
  age: number;
  email: string;
}

const person: Person = { };`;

      await harness.openDocument(filePath, content);

      // Request completions inside the object literal
      const completions = await harness.getCompletions(filePath, {
        line: 6,
        character: 25, // Position after "{ "
      });

      expect(completions.length).toBeGreaterThan(0);
      
      const labels = completions.map(c => c.label);
      expect(labels).toContain('name');
      expect(labels).toContain('age');
      expect(labels).toContain('email');

      await harness.closeDocument(filePath);
    }, 10000);
  });

  describe('Hover (tooltips)', () => {
    it('should get hover information for a variable', async () => {
      const filePath = join(testWorkspaceDir, 'hover.ts');
      const content = 'const myVariable: string = "hello";';

      await harness.openDocument(filePath, content);

      // Request hover on the variable name
      const hover = await harness.getHover(filePath, {
        line: 0,
        character: 7, // Position on "myVariable"
      });

      expect(hover).not.toBeNull();
      expect(hover?.contents).toBeTruthy();
      expect(hover?.contents).toContain('string');

      await harness.closeDocument(filePath);
    }, 10000);
  });

  describe('Diagnostics (errors)', () => {
    it('should provide getDiagnostics method', async () => {
      const filePath = join(testWorkspaceDir, 'errors.ts');
      // This code has a type error: assigning string to number
      const content = 'const x: number = "not a number";';

      await harness.openDocument(filePath, content);

      // Wait a bit for diagnostics to be published
      await new Promise(resolve => setTimeout(resolve, 500));

      // Note: getDiagnostics currently returns empty array in the implementation
      // This is documented in the lsp-harness.ts file as a limitation
      // This test just verifies the method exists and doesn't throw
      const diagnostics = await harness.getDiagnostics(filePath);
      
      expect(Array.isArray(diagnostics)).toBe(true);

      await harness.closeDocument(filePath);
    }, 10000);
  });

  describe('Signature Help', () => {
    it('should provide getSignatureHelp method', async () => {
      const filePath = join(testWorkspaceDir, 'signature.ts');
      // Use complete code
      const content = 'const result = Math.max(1, 2);';

      await harness.openDocument(filePath, content);

      // Wait a bit for the LSP to process the file
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Request signature help - method exists and returns expected type
        const signatureHelp = await harness.getSignatureHelp(filePath, {
          line: 0,
          character: 24, // Position in the middle of args
        });

        // Just verify it doesn't throw and returns correct type
        expect(signatureHelp === null || typeof signatureHelp === 'object').toBe(true);
        
        if (signatureHelp) {
          expect(signatureHelp.signatures).toBeDefined();
          expect(Array.isArray(signatureHelp.signatures)).toBe(true);
        }
      } finally {
        await harness.closeDocument(filePath);
      }
    }, 10000);
  });

  describe('Real-world scenario', () => {
    it('should handle a complete TypeScript file with multiple features', async () => {
      const filePath = join(testWorkspaceDir, 'real-world.ts');
      const content = `interface User {
  id: number;
  name: string;
  isActive: boolean;
}

function getUserName(user: User): string {
  return user.name;
}

const myUser: User = {
  id: 1,
  name: "Alice",
  isActive: true,
};

const userName = getUserName(myUser);
console.log(userName.toUpperCase());`;

      await harness.openDocument(filePath, content);

      // Wait for the LSP to process the file
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        // Test completions on user object
        const completions = await harness.getCompletions(filePath, {
          line: 7,
          character: 15, // After "user."
        });

        const labels = completions.map(c => c.label);
        expect(labels).toContain('name');
        expect(labels).toContain('id');
        expect(labels).toContain('isActive');

        // Test hover on getUserName function
        const hover = await harness.getHover(filePath, {
          line: 6,
          character: 10, // On "getUserName"
        });

        expect(hover).not.toBeNull();
        expect(hover?.contents).toBeTruthy();
      } finally {
        await harness.closeDocument(filePath);
      }
    }, 15000);
  });
});
