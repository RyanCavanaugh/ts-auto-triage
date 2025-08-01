import { promises as fs } from 'fs';
import { ConfigSchema } from './schemas.js';
/**
 * Loads and validates configuration from a JSONC file
 */
export async function loadConfig(configPath = 'config.jsonc') {
    try {
        const content = await fs.readFile(configPath, 'utf-8');
        // Simple JSONC parsing - remove comments and trailing commas
        const jsonContent = content
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
        const parsed = JSON.parse(jsonContent);
        return ConfigSchema.parse(parsed);
    }
    catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
}
/**
 * Gets GitHub auth token from gh CLI
 */
export async function getGitHubToken() {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
        const { stdout } = await execAsync('gh auth token');
        return stdout.trim();
    }
    catch (error) {
        throw new Error('Failed to get GitHub token. Make sure you are logged in with "gh auth login"');
    }
}
/**
 * Truncates text to a maximum length, preserving structure when possible
 */
export function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    // Try to truncate at a natural break point
    const truncated = text.substring(0, maxLength - 3);
    const lastNewline = truncated.lastIndexOf('\n');
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    // Find the best break point
    const breakPoint = Math.max(lastNewline, lastPeriod, lastSpace);
    if (breakPoint > maxLength * 0.8) {
        return text.substring(0, breakPoint) + '...';
    }
    return truncated + '...';
}
/**
 * Formats bytes into human-readable format
 */
export function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}
/**
 * Sleeps for the specified number of milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Creates a simple console logger with prefixes
 */
export function createLogger(prefix) {
    return {
        info: (message) => console.log(`[${prefix}] ${message}`),
        warn: (message) => console.warn(`[${prefix}] WARNING: ${message}`),
        error: (message) => console.error(`[${prefix}] ERROR: ${message}`)
    };
}
/**
 * Validates that a string is a valid GitHub repository reference
 */
export function validateRepoRef(ref) {
    return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(ref);
}
/**
 * Parses command line arguments into key-value pairs
 */
export function parseArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('--')) {
                result[key] = nextArg;
                i++; // Skip next argument
            }
            else {
                result[key] = true;
            }
        }
    }
    return result;
}
/**
 * Creates a hash from a string (useful for generating keys)
 */
export async function createHash(input) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(input).digest('hex');
}
/**
 * Retries an async operation with exponential backoff
 */
export async function retry(operation, maxAttempts = 3, baseDelayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                break;
            }
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
    throw lastError;
}
//# sourceMappingURL=index.js.map