import { type Issue, type IssueRef } from './schemas.js';
export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export interface IssueFetcherOptions {
    token: string;
    dataPath?: string;
    logger?: Logger;
    rateLimit?: {
        maxRetries: number;
        backoffMs: number;
    };
}
/**
 * Parses issue reference from string format
 */
export declare function parseIssueRef(ref: string): IssueRef;
/**
 * Creates an issue fetcher with GitHub API integration
 */
export declare function createIssueFetcher(options: IssueFetcherOptions): {
    fetchIssue: (issueRef: IssueRef, force?: boolean) => Promise<Issue>;
    fetchAllIssues: (owner: string, repo: string) => Promise<void>;
    loadIssue: (issueRef: IssueRef) => Promise<Issue | null>;
    listCachedIssues: (owner: string, repo: string) => Promise<IssueRef[]>;
    parseIssueRef: typeof parseIssueRef;
};
export type IssueFetcher = ReturnType<typeof createIssueFetcher>;
//# sourceMappingURL=index.d.ts.map