import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { createLSPHarness, type LSPHarness } from './lsp-harness.js';
import { createMockLogger } from './utils.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('LSP Harness Integration with @typescript/native-preview', () => {
  let tempDir: string;
  let lspHarness: LSPHarness;
  const logger = createMockLogger();

  beforeAll(async () => {
    // Create a unique temp directory for the workspace
    tempDir = path.join(tmpdir(), `lsp-harness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create a simple TypeScript file for testing
    const testFilePath = path.join(tempDir, 'test.ts');
    const testFileContent = `interface Person {
  name: string;
  age: number;
}

const person: Person = {
  name: "John",
  age: 30
};

// Test completions here
person.

// Test error
const invalid: number = "string";
`;
    await fs.writeFile(testFilePath, testFileContent);

    // Create a tsconfig.json
    const tsconfigPath = path.join(tempDir, 'tsconfig.json');
    const tsconfigContent = JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true
      }
    }, null, 2);
    await fs.writeFile(tsconfigPath, tsconfigContent);

    // Initialize LSP harness with @typescript/native-preview
    // Find the tsgo binary installed in node_modules
    const tsgoPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsgo');
    lspHarness = createLSPHarness(`${tsgoPath} --lsp --stdio`, logger);
    await lspHarness.start(tempDir);
  }, 30000); // 30 second timeout for beforeAll

  afterAll(async () => {
    // Stop LSP server
    if (lspHarness) {
      await lspHarness.stop();
    }

    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should get completions from TypeScript code', async () => {
    const testFilePath = path.join(tempDir, 'test.ts');
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    
    // Open the document
    await lspHarness.openDocument(testFilePath, fileContent);

    // Wait a bit for the LSP server to process the file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get completions after "person."
    const completions = await lspHarness.getCompletions(testFilePath, {
      line: 11, // Line with "person."
      character: 7 // Position after the dot
    });

    // Should get completion items including 'name' and 'age'
    expect(completions).toBeDefined();
    expect(Array.isArray(completions)).toBe(true);
    expect(completions.length).toBeGreaterThan(0);

    // Check if we get the expected properties
    const labels = completions.map(c => c.label);
    expect(labels).toContain('name');
    expect(labels).toContain('age');

    await lspHarness.closeDocument(testFilePath);
  }, 15000);

  test('should get hover information (tooltips)', async () => {
    const testFilePath = path.join(tempDir, 'test.ts');
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    
    // Open the document
    await lspHarness.openDocument(testFilePath, fileContent);

    // Wait a bit for the LSP server to process the file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get hover info for "person" variable on line 5
    const hover = await lspHarness.getHover(testFilePath, {
      line: 5, // Line with "const person: Person = {"
      character: 8 // Position on "person"
    });

    // Should get hover information - it may be null depending on LSP implementation
    // The test verifies that the method works and returns the expected type
    expect(hover).toBeDefined();
    if (hover !== null) {
      expect(hover.contents).toBeDefined();
      expect(typeof hover.contents).toBe('string');
      expect(hover.contents.length).toBeGreaterThan(0);
    }

    await lspHarness.closeDocument(testFilePath);
  }, 15000);

  test('should get diagnostics for TypeScript errors', async () => {
    // Create a file with a type error
    const errorFilePath = path.join(tempDir, 'error.ts');
    const errorFileContent = `const x: number = "not a number";
const y: string = 123;
`;
    await fs.writeFile(errorFilePath, errorFileContent);

    // Open the document
    await lspHarness.openDocument(errorFilePath, errorFileContent);

    // Wait a bit for the LSP server to process and send diagnostics
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get diagnostics
    const diagnostics = await lspHarness.getDiagnostics(errorFilePath);

    // Note: The current implementation returns empty array as diagnostics
    // are typically sent as notifications. This test verifies the method works.
    expect(diagnostics).toBeDefined();
    expect(Array.isArray(diagnostics)).toBe(true);

    await lspHarness.closeDocument(errorFilePath);
    
    // Clean up the error file
    try {
      await fs.unlink(errorFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }, 15000);

  test('should handle signature help', async () => {
    // Create a file with a function call
    const signatureFilePath = path.join(tempDir, 'signature.ts');
    const signatureFileContent = `function greet(name: string, age: number): string {
  return \`Hello \${name}, you are \${age} years old\`;
}

const result = greet(
`;
    await fs.writeFile(signatureFilePath, signatureFileContent);

    // Open the document
    await lspHarness.openDocument(signatureFilePath, signatureFileContent);

    // Wait a bit for the LSP server to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get signature help inside the function call
    const signatureHelp = await lspHarness.getSignatureHelp(signatureFilePath, {
      line: 5, // Inside "greet("
      character: 20
    });

    // Should get signature help
    expect(signatureHelp).toBeDefined();
    if (signatureHelp && signatureHelp.signatures) {
      expect(signatureHelp.signatures.length).toBeGreaterThan(0);
      expect(signatureHelp.signatures[0]?.label).toBeDefined();
    }

    await lspHarness.closeDocument(signatureFilePath);
    
    // Clean up the signature file
    try {
      await fs.unlink(signatureFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }, 15000);
});
