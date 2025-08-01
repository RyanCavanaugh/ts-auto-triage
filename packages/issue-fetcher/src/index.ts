import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { 
  IssueSchema, 
  CommentSchema, 
  EventSchema, 
  type Issue, 
  type IssueRef,
  type Comment,
  type Event
} from './schemas.js';

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
export function parseIssueRef(ref: string): IssueRef {
  // Support both "owner/repo#123" and "https://github.com/owner/repo/issues/123" formats
  const urlMatch = ref.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:issues|pull)\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      number: parseInt(urlMatch[3], 10)
    };
  }
  
  const refMatch = ref.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (refMatch) {
    return {
      owner: refMatch[1],
      repo: refMatch[2],
      number: parseInt(refMatch[3], 10)
    };
  }
  
  throw new Error(`Invalid issue reference format: ${ref}. Expected "owner/repo#123" or GitHub URL`);
}

/**
 * Creates an issue fetcher with GitHub API integration
 */
export function createIssueFetcher(options: IssueFetcherOptions) {
  const { 
    token, 
    dataPath = '.data', 
    logger = console,
    rateLimit = { maxRetries: 3, backoffMs: 5000 }
  } = options;
  
  const octokit = new Octokit({ auth: token });

  /**
   * Ensures directory exists for storing issue data
   */
  async function ensureDataDir(owner: string, repo: string): Promise<string> {
    const dir = join(dataPath, owner.toLowerCase(), repo.toLowerCase());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Gets the file path for storing issue data
   */
  function getIssueFilePath(owner: string, repo: string, number: number): string {
    return join(dataPath, owner.toLowerCase(), repo.toLowerCase(), `${number}.json`);
  }

  /**
   * Rate-limited API call with retry logic
   */
  async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= rateLimit.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === rateLimit.maxRetries) {
          break;
        }
        
        // Check if it's a rate limit error
        if (error instanceof Error && error.message.includes('rate limit')) {
          logger.warn(`Rate limited, waiting ${rateLimit.backoffMs}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, rateLimit.backoffMs));
        } else if (error instanceof Error && error.message.includes('network')) {
          logger.warn(`Network error, waiting ${rateLimit.backoffMs}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, rateLimit.backoffMs));
        } else {
          throw error;
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Fetches all comments for an issue
   */
  async function fetchComments(owner: string, repo: string, number: number): Promise<Comment[]> {
    const comments: Comment[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      const response = await withRetry(() => 
        octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: number,
          page,
          per_page: perPage
        })
      );
      
      const validComments = response.data
        .map(comment => {
          try {
            return CommentSchema.parse({
              id: comment.id,
              user: comment.user,
              created_at: comment.created_at,
              updated_at: comment.updated_at,
              body: comment.body || '',
              reactions: comment.reactions || {},
              author_association: comment.author_association
            });
          } catch (error) {
            logger.warn(`Failed to parse comment ${comment.id}: ${error}`);
            return null;
          }
        })
        .filter((comment): comment is Comment => comment !== null);
      
      comments.push(...validComments);
      
      if (response.data.length < perPage) {
        break;
      }
      page++;
    }
    
    return comments;
  }

  /**
   * Fetches all events for an issue
   */
  async function fetchEvents(owner: string, repo: string, number: number): Promise<Event[]> {
    const events: Event[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      const response = await withRetry(() => 
        octokit.rest.issues.listEvents({
          owner,
          repo,
          issue_number: number,
          page,
          per_page: perPage
        })
      );
      
      const validEvents = response.data
        .map(event => {
          try {
            return EventSchema.parse({
              id: event.id,
              event: event.event,
              created_at: event.created_at,
              actor: event.actor,
              label: (event as any).label || null,
              assignee: (event as any).assignee || null,
              milestone: (event as any).milestone || null
            });
          } catch (error) {
            logger.warn(`Failed to parse event ${event.id}: ${error}`);
            return null;
          }
        })
        .filter((event): event is Event => event !== null);
      
      events.push(...validEvents);
      
      if (response.data.length < perPage) {
        break;
      }
      page++;
    }
    
    return events;
  }

  /**
   * Fetches a single issue with all its data
   */
  async function fetchIssue(issueRef: IssueRef, force = false): Promise<Issue> {
    const { owner, repo, number } = issueRef;
    const filePath = getIssueFilePath(owner, repo, number);
    
    // Check if we already have this issue (unless force refresh)
    if (!force) {
      try {
        const existingData = await fs.readFile(filePath, 'utf-8');
        const existingIssue = IssueSchema.parse(JSON.parse(existingData));
        logger.info(`Using cached issue ${owner}/${repo}#${number}`);
        return existingIssue;
      } catch {
        // File doesn't exist or is invalid, fetch fresh
      }
    }
    
    logger.info(`Fetching issue ${owner}/${repo}#${number}`);
    
    // Fetch issue data
    const issueResponse = await withRetry(() => 
      octokit.rest.issues.get({
        owner,
        repo,
        issue_number: number
      })
    );
    
    const issue = issueResponse.data;
    
    // Fetch comments and events in parallel
    const [comments, events] = await Promise.all([
      fetchComments(owner, repo, number),
      fetchEvents(owner, repo, number)
    ]);
    
    // Parse and validate the complete issue data
    const completeIssue: Issue = IssueSchema.parse({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      user: issue.user,
      labels: issue.labels,
      state: issue.state,
      locked: issue.locked,
      assignee: issue.assignee,
      assignees: issue.assignees,
      milestone: issue.milestone,
      comments: issue.comments,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      author_association: issue.author_association,
      reactions: issue.reactions || {},
      pull_request: issue.pull_request || null,
      comments_data: comments,
      events_data: events,
      is_pull_request: !!issue.pull_request,
      repo_owner: owner,
      repo_name: repo,
      fetched_at: new Date().toISOString()
    });
    
    // Save to disk
    await ensureDataDir(owner, repo);
    await fs.writeFile(filePath, JSON.stringify(completeIssue, null, 2));
    
    logger.info(`Saved issue ${owner}/${repo}#${number} with ${comments.length} comments and ${events.length} events`);
    
    return completeIssue;
  }

  /**
   * Fetches all issues from a repository
   */
  async function fetchAllIssues(owner: string, repo: string): Promise<void> {
    logger.info(`Starting to fetch all issues from ${owner}/${repo}`);
    
    let page = 1;
    const perPage = 100;
    let totalFetched = 0;
    
    while (true) {
      logger.info(`Fetching page ${page} of issues...`);
      
      const response = await withRetry(() => 
        octokit.rest.issues.listForRepo({
          owner,
          repo,
          state: 'all',
          page,
          per_page: perPage,
          sort: 'updated',
          direction: 'desc'
        })
      );
      
      if (response.data.length === 0) {
        break;
      }
      
      // Process issues in batches to avoid overwhelming the API
      for (const issue of response.data) {
        try {
          await fetchIssue({ owner, repo, number: issue.number }, false);
          totalFetched++;
          
          if (totalFetched % 10 === 0) {
            logger.info(`Fetched ${totalFetched} issues so far...`);
          }
        } catch (error) {
          logger.error(`Failed to fetch issue ${issue.number}: ${error}`);
        }
      }
      
      if (response.data.length < perPage) {
        break;
      }
      page++;
    }
    
    logger.info(`Completed fetching ${totalFetched} issues from ${owner}/${repo}`);
  }

  /**
   * Loads an issue from disk
   */
  async function loadIssue(issueRef: IssueRef): Promise<Issue | null> {
    const { owner, repo, number } = issueRef;
    const filePath = getIssueFilePath(owner, repo, number);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return IssueSchema.parse(JSON.parse(data));
    } catch {
      return null;
    }
  }

  /**
   * Lists all cached issues for a repository
   */
  async function listCachedIssues(owner: string, repo: string): Promise<IssueRef[]> {
    const dir = join(dataPath, owner.toLowerCase(), repo.toLowerCase());
    
    try {
      const files = await fs.readdir(dir);
      return files
        .filter(file => file.endsWith('.json') && /^\d+\.json$/.test(file))
        .map(file => ({
          owner,
          repo,
          number: parseInt(file.replace('.json', ''), 10)
        }));
    } catch {
      return [];
    }
  }

  return {
    fetchIssue,
    fetchAllIssues,
    loadIssue,
    listCachedIssues,
    parseIssueRef
  };
}

export type IssueFetcher = ReturnType<typeof createIssueFetcher>;