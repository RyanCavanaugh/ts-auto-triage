import { z } from 'zod';
// GitHub issue reference schema
export const issueRefSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    number: z.number()
});
// Simple console logger implementation
export const createConsoleLogger = () => ({
    info: (message, ...args) => console.log(`[INFO] ${message}`, ...args),
    warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
    error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args),
    debug: (message, ...args) => console.debug(`[DEBUG] ${message}`, ...args)
});
// Parse issue reference from string (e.g., "Microsoft/TypeScript#9998" or URL)
export function parseIssueRef(input) {
    // Handle URL format: https://github.com/Microsoft/TypeScript/issues/9998
    const urlMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:issues|pull)\/(\d+)/);
    if (urlMatch) {
        return {
            owner: urlMatch[1],
            repo: urlMatch[2],
            number: parseInt(urlMatch[3], 10)
        };
    }
    // Handle short format: Microsoft/TypeScript#9998
    const shortMatch = input.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
    if (shortMatch) {
        return {
            owner: shortMatch[1],
            repo: shortMatch[2],
            number: parseInt(shortMatch[3], 10)
        };
    }
    throw new Error(`Invalid issue reference format: ${input}`);
}
// Sleep utility for rate limiting
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Hash function for cache keys
export function hashString(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}
// Format cache key for file storage
export function formatCacheKey(key) {
    const hash = hashString(key).substring(0, 16);
    return {
        dir: hash.substring(0, 2),
        subdir: hash.substring(2, 4),
        filename: hash.substring(4) + '.json'
    };
}
// Cap text length for AI models to avoid context window issues
export function capText(text, maxLength = 8000) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '\n\n[Content truncated for length]';
}
// Retry utility with exponential backoff
export async function retry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                break;
            }
            const delay = baseDelay * Math.pow(2, attempt);
            await sleep(delay);
        }
    }
    throw lastError;
}
//# sourceMappingURL=index.js.map