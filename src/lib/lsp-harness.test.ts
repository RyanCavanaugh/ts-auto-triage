import { createLSPHarness } from './lsp-harness.js';
import { createMockLogger } from './utils.js';
import type { Position } from './lsp-harness.js';

describe('LSP Harness', () => {
  const logger = createMockLogger();

  describe('createLSPHarness', () => {
    it('should create an LSP harness with all methods', () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      
      expect(harness).toBeDefined();
      expect(typeof harness.start).toBe('function');
      expect(typeof harness.stop).toBe('function');
      expect(typeof harness.openDocument).toBe('function');
      expect(typeof harness.closeDocument).toBe('function');
      expect(typeof harness.getDiagnostics).toBe('function');
      expect(typeof harness.getSignatureHelp).toBe('function');
      expect(typeof harness.getHover).toBe('function');
      expect(typeof harness.getCompletions).toBe('function');
    });

    it('should throw error when sending message without started process', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      
      await expect(harness.openDocument('/test/file.ts', 'const x = 1;'))
        .rejects
        .toThrow('LSP process not available');
    });

    it('should throw error when getting hover without started process', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      const position: Position = { line: 0, character: 0 };
      
      await expect(harness.getHover('/test/file.ts', position))
        .rejects
        .toThrow('LSP process not available');
    });

    it('should throw error when getting signature help without started process', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      const position: Position = { line: 0, character: 0 };
      
      await expect(harness.getSignatureHelp('/test/file.ts', position))
        .rejects
        .toThrow('LSP process not available');
    });

    it('should throw error when getting completions without started process', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      const position: Position = { line: 0, character: 0 };
      
      await expect(harness.getCompletions('/test/file.ts', position))
        .rejects
        .toThrow('LSP process not available');
    });

    it('should return empty diagnostics array', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      
      const diagnostics = await harness.getDiagnostics('/test/file.ts');
      expect(diagnostics).toEqual([]);
    });

    it('should handle stop without started process', async () => {
      const harness = createLSPHarness('typescript-language-server', logger);
      
      await expect(harness.stop()).resolves.not.toThrow();
    });
  });

  describe('Position interface', () => {
    it('should have correct position structure', () => {
      const position: Position = { line: 5, character: 10 };
      
      expect(position.line).toBe(5);
      expect(position.character).toBe(10);
    });
  });
});
