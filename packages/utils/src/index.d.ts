import { z } from 'zod';
export declare const issueRefSchema: z.ZodObject<{
    owner: z.ZodString;
    repo: z.ZodString;
    number: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    number: number;
    owner: string;
    repo: string;
}, {
    number: number;
    owner: string;
    repo: string;
}>;
export type IssueRef = z.infer<typeof issueRefSchema>;
export interface Logger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
}
export declare const createConsoleLogger: () => Logger;
export declare function parseIssueRef(input: string): IssueRef;
export declare function sleep(ms: number): Promise<void>;
export declare function hashString(input: string): string;
export declare function formatCacheKey(key: string): {
    dir: string;
    subdir: string;
    filename: string;
};
export declare function capText(text: string, maxLength?: number): string;
export declare function retry<T>(operation: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
//# sourceMappingURL=index.d.ts.map