import { type LSPPosition, type LSPHover, type LSPSignatureHelp, type LSPCompletionItem, type LSPDiagnostic } from './schemas.js';
export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export interface LSPHarnessOptions {
    lspPath: string;
    logger?: Logger;
    timeout?: number;
}
/**
 * Converts line/column to LSP position (0-based)
 */
export declare function createPosition(line: number, character: number): LSPPosition;
/**
 * Creates an LSP harness for communicating with TypeScript language server
 */
export declare function createLSPHarness(options: LSPHarnessOptions): {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    openDocument: (uri: string, content: string, languageId?: string) => Promise<void>;
    getHover: (uri: string, position: LSPPosition) => Promise<LSPHover | null>;
    getSignatureHelp: (uri: string, position: LSPPosition) => Promise<LSPSignatureHelp | null>;
    getCompletions: (uri: string, position: LSPPosition) => Promise<LSPCompletionItem[]>;
    getDiagnostics: (uri: string) => Promise<LSPDiagnostic[]>;
};
export type LSPHarness = ReturnType<typeof createLSPHarness>;
//# sourceMappingURL=index.d.ts.map