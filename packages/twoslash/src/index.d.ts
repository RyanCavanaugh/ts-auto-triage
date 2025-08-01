import { type TwoslashDocument } from './schemas.js';
/**
 * Parses a twoslash markdown file
 */
export declare function parseTwoslashFile(filePath: string): Promise<TwoslashDocument>;
/**
 * Parses twoslash content from a string
 */
export declare function parseTwoslashContent(content: string): TwoslashDocument;
/**
 * Writes files from a twoslash document to disk
 */
export declare function writeTwoslashFiles(document: TwoslashDocument, outputDir: string): Promise<void>;
/**
 * Finds the position of a marker in a specific file
 */
export declare function findMarkerInFile(document: TwoslashDocument, filename: string, markerIndex?: number): {
    line: number;
    character: number;
} | null;
/**
 * Gets the content of a specific file without markers
 */
export declare function getCleanFileContent(document: TwoslashDocument, filename: string): string | null;
/**
 * Creates a file URI for LSP operations
 */
export declare function createFileUri(baseDir: string, filename: string): string;
//# sourceMappingURL=index.d.ts.map