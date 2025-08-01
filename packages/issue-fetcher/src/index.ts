import { Octokit } from '@octokit/rest';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger, IssueRef, sleep, retry } from '@ryancavanaugh/utils';
import { Issue, issueSchema, Comment, Event } from './schemas.js';

export interface FetcherOptions {
  logger: Logger;
  dataDir: string;
  githubToken: string;
  rateLimitDelay?: number;
  maxRetries?: number;
}

export function createIssueFetcher(options: FetcherOptions) {
  const { logger, dataDir, githubToken, rateLimitDelay = 1000, maxRetries = 3 } = options;
  
  const octokit = new Octokit({
    auth: githubToken,
    request: {
      retries: 0 // We handle retries ourselves
    }
  });

  async function ensureDataDir(owner: string, repo: string): Promise<string> {
    const dir = path.join(dataDir, owner.toLowerCase(), repo.toLowerCase());
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async function getIssueFilePath(owner: string, repo: string, number: number): Promise<string> {
    const dir = await ensureDataDir(owner, repo);
    return path.join(dir, `${number}.json`);
  }

  async function fetchIssueComments(owner: string, repo: string, issueNumber: number): Promise<Comment[]> {
    const comments: Comment[] = [];
    let page = 1;
    
    while (true) {
      await sleep(rateLimitDelay);
      
      const response = await retry(async () => {
        logger.debug(`Fetching comments page ${page} for ${owner}/${repo}#${issueNumber}`);
        return await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: issueNumber,
          page,
          per_page: 100
        });
      }, maxRetries);

      if (response.data.length === 0) break;
      
      for (const comment of response.data) {
        comments.push({
          id: comment.id,
          user: {
            login: comment.user?.login || 'unknown',
            id: comment.user?.id || 0,
            type: comment.user?.type || 'User'
          },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          body: comment.body || '',
          reactions: {
            total_count: comment.reactions?.total_count || 0,
            '+1': comment.reactions?.['+1'] || 0,
            '-1': comment.reactions?.['-1'] || 0,
            laugh: comment.reactions?.laugh || 0,
            hooray: comment.reactions?.hooray || 0,
            confused: comment.reactions?.confused || 0,
            heart: comment.reactions?.heart || 0,
            rocket: comment.reactions?.rocket || 0,
            eyes: comment.reactions?.eyes || 0
          }
        });
      }
      
      page++;
    }
    
    return comments;
  }

  async function fetchIssueEvents(owner: string, repo: string, issueNumber: number): Promise<Event[]> {
    const events: Event[] = [];
    let page = 1;
    
    while (true) {
      await sleep(rateLimitDelay);
      
      const response = await retry(async () => {
        logger.debug(`Fetching events page ${page} for ${owner}/${repo}#${issueNumber}`);
        return await octokit.rest.issues.listEvents({
          owner,
          repo,
          issue_number: issueNumber,
          page,
          per_page: 100
        });
      }, maxRetries);

      if (response.data.length === 0) break;
      
      for (const event of response.data) {
        events.push({
          id: event.id,
          event: event.event,
          created_at: event.created_at,
          actor: event.actor ? {
            login: event.actor.login,
            id: event.actor.id,
            type: event.actor.type
          } : null
        });
      }
      
      page++;
    }
    
    return events;
  }

  async function fetchSingleIssue(issueRef: IssueRef): Promise<Issue> {
    const { owner, repo, number } = issueRef;
    
    logger.info(`Fetching issue ${owner}/${repo}#${number}`);
    
    await sleep(rateLimitDelay);
    
    const issueResponse = await retry(async () => {
      return await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: number
      });
    }, maxRetries);

    const issue = issueResponse.data;
    const comments = await fetchIssueComments(owner, repo, number);
    const events = await fetchIssueEvents(owner, repo, number);

    const result: Issue = {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || null,
      user: {
        login: issue.user?.login || 'unknown',
        id: issue.user?.id || 0,
        type: issue.user?.type || 'User'
      },
      labels: issue.labels.map(label => ({
        id: typeof label === 'object' && label.id ? label.id : 0,
        name: typeof label === 'string' ? label : label.name || '',
        color: typeof label === 'object' && label.color ? label.color : '',
        description: typeof label === 'object' && label.description ? label.description : null
      })),
      state: issue.state as 'open' | 'closed',
      locked: issue.locked,
      assignee: issue.assignee ? {
        login: issue.assignee.login,
        id: issue.assignee.id,
        type: issue.assignee.type
      } : null,
      assignees: issue.assignees?.map(assignee => ({
        login: assignee.login,
        id: assignee.id,
        type: assignee.type
      })) || [],
      milestone: issue.milestone ? {
        id: issue.milestone.id,
        number: issue.milestone.number,
        title: issue.milestone.title,
        description: issue.milestone.description,
        state: issue.milestone.state as 'open' | 'closed',
        created_at: issue.milestone.created_at,
        updated_at: issue.milestone.updated_at,
        due_on: issue.milestone.due_on,
        closed_at: issue.milestone.closed_at
      } : null,
      comments,
      events,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      reactions: {
        total_count: issue.reactions?.total_count || 0,
        '+1': issue.reactions?.['+1'] || 0,
        '-1': issue.reactions?.['-1'] || 0,
        laugh: issue.reactions?.laugh || 0,
        hooray: issue.reactions?.hooray || 0,
        confused: issue.reactions?.confused || 0,
        heart: issue.reactions?.heart || 0,
        rocket: issue.reactions?.rocket || 0,
        eyes: issue.reactions?.eyes || 0
      },
      is_pull_request: Boolean(issue.pull_request),
      author_association: issue.author_association
    };

    // Validate with schema
    return issueSchema.parse(result);
  }

  async function saveIssue(issueRef: IssueRef, issue: Issue): Promise<void> {
    const { owner, repo, number } = issueRef;
    const filePath = await getIssueFilePath(owner, repo, number);
    await fs.writeFile(filePath, JSON.stringify(issue, null, 2));
    logger.debug(`Saved issue ${owner}/${repo}#${number} to ${filePath}`);
  }

  async function loadIssue(issueRef: IssueRef): Promise<Issue | null> {
    const { owner, repo, number } = issueRef;
    const filePath = await getIssueFilePath(owner, repo, number);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const issue = JSON.parse(data);
      return issueSchema.parse(issue);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function getIssueNumbers(owner: string, repo: string): Promise<number[]> {
    const numbers: number[] = [];
    let page = 1;
    
    while (true) {
      await sleep(rateLimitDelay);
      
      const [issuesResponse, pullsResponse] = await Promise.all([
        retry(async () => {
          logger.debug(`Fetching issues page ${page} for ${owner}/${repo}`);
          return await octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: 'all',
            page,
            per_page: 100,
            sort: 'created',
            direction: 'asc'
          });
        }, maxRetries),
        retry(async () => {
          logger.debug(`Fetching pulls page ${page} for ${owner}/${repo}`);
          return await octokit.rest.pulls.list({
            owner,
            repo,
            state: 'all',
            page,
            per_page: 100,
            sort: 'created',
            direction: 'asc'
          });
        }, maxRetries)
      ]);

      const hasIssues = issuesResponse.data.length > 0;
      const hasPulls = pullsResponse.data.length > 0;
      
      if (!hasIssues && !hasPulls) break;
      
      // Add issue numbers (filter out PRs from issues endpoint)
      for (const issue of issuesResponse.data) {
        if (!issue.pull_request) {
          numbers.push(issue.number);
        }
      }
      
      // Add PR numbers
      for (const pull of pullsResponse.data) {
        numbers.push(pull.number);
      }
      
      page++;
    }
    
    return Array.from(new Set(numbers)).sort((a, b) => a - b);
  }

  return {
    fetchSingleIssue,
    saveIssue,
    loadIssue,
    getIssueNumbers
  };
}