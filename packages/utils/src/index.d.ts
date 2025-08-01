import { type Config } from './schemas.js';
/**
 * Loads and validates configuration from a JSONC file
 */
export declare function loadConfig(configPath?: string): Promise<Config>;
/**
 * Gets GitHub auth token from gh CLI
 */
export declare function getGitHubToken(): Promise<string>;
/**
 * Truncates text to a maximum length, preserving structure when possible
 */
export declare function truncateText(text: string, maxLength: number): string;
/**
 * Formats bytes into human-readable format
 */
export declare function formatBytes(bytes: number): string;
/**
 * Sleeps for the specified number of milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Creates a simple console logger with prefixes
 */
export declare function createLogger(prefix: string): {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
};
/**
 * Validates that a string is a valid GitHub repository reference
 */
export declare function validateRepoRef(ref: string): boolean;
/**
 * Parses command line arguments into key-value pairs
 */
export declare function parseArgs(args: string[]): Record<string, string | boolean>;
/**
 * Creates a hash from a string (useful for generating keys)
 */
export declare function createHash(input: string): Promise<string>;
/**
 * Retries an async operation with exponential backoff
 */
export declare function retry<T>(operation: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number): Promise<T>;
//# sourceMappingURL=index.d.ts.map