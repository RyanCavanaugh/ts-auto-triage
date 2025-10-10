import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import * as fs from 'fs/promises';
import type { IssueRef, GitHubIssue, Config } from './schemas.js';
import { GitHubIssueSchema } from './schemas.js';
import type { Logger } from './utils.js';
import { ensureDirectoryExists, createIssueDataPath } from './utils.js';

export interface PRFetcher {
  fetchPR(ref: IssueRef): Promise<GitHubIssue>;
  fetchAllPRs(owner: string, repo: string, force?: boolean): Promise<void>;
  fetchRecentPRs(owner: string, repo: string, force?: boolean): Promise<void>;
  getLocalPR(ref: IssueRef): Promise<GitHubIssue | null>;
  hasLocalPR(ref: IssueRef): Promise<boolean>;
}

// GraphQL types for cursor-based pagination
interface GraphQLPRNode {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
  author: {
    login: string;
  } | null;
  labels: {
    nodes: Array<{
      id: string;
      name: string;
      color: string;
      description: string | null;
    }>;
  };
  milestone: {
    id: string;
    number: number;
    title: string;
    description: string | null;
    state: 'OPEN' | 'CLOSED';
  } | null;
  assignees: {
    nodes: Array<{
      login: string;
      id: string;
    }>;
  };
  reactions: {
    totalCount: number;
  };
}

interface GraphQLPRsResponse {
  repository: {
    pullRequests: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: GraphQLPRNode[];
    };
  };
}

export function createPRFetcher(
  octokit: Octokit,
  config: Config,
  logger: Logger,
  authToken: string
): PRFetcher {
  // Create GraphQL client with auth token
  const graphqlClient = graphql.defaults({
    headers: {
      authorization: `token ${authToken}`,
    },
  });

  async function fetchPR(ref: IssueRef): Promise<GitHubIssue> {
    logger.info(`Fetching PR ${ref.owner}/${ref.repo}#${ref.number}`);
    
    try {
      // Fetch the PR using the pulls API
      const prResponse = await octokit.rest.pulls.get({
        owner: ref.owner,
        repo: ref.repo,
        pull_number: ref.number,
      });

      // Also fetch as an issue to get reactions and other metadata
      const issueResponse = await octokit.rest.issues.get({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.number,
      });

      // Fetch all comments (using issues API since PRs are issues too)
      const commentsResponse = await octokit.rest.issues.listComments({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.number,
        per_page: 100,
      });

      let allComments = commentsResponse.data;
      
      // Handle pagination for comments
      let nextCommentsPage = 2;
      let lastResponseLength = commentsResponse.data.length;
      while (lastResponseLength === 100) {
        const nextPage = await octokit.rest.issues.listComments({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
          per_page: 100,
          page: nextCommentsPage++,
        });
        
        lastResponseLength = nextPage.data.length;
        if (lastResponseLength === 0) break;
        allComments = allComments.concat(nextPage.data);
      }

      // Fetch timeline events (using issues API)
      const timelineResponse = await octokit.rest.issues.listEventsForTimeline({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.number,
        per_page: 100,
      });

      let allTimelineEvents = timelineResponse.data;
      
      // Handle pagination for timeline events
      let timelinePage = 2;
      let lastTimelineLength = timelineResponse.data.length;
      while (lastTimelineLength === 100) {
        const nextPage = await octokit.rest.issues.listEventsForTimeline({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
          per_page: 100,
          page: timelinePage++,
        });
        
        lastTimelineLength = nextPage.data.length;
        if (lastTimelineLength === 0) break;
        allTimelineEvents = allTimelineEvents.concat(nextPage.data);
      }

      // Transform to our schema format (compatible with GitHubIssue)
      const pr = {
        id: prResponse.data.id,
        number: prResponse.data.number,
        title: prResponse.data.title,
        body: prResponse.data.body,
        user: {
          login: prResponse.data.user?.login ?? 'unknown',
          id: prResponse.data.user?.id ?? 0,
          type: prResponse.data.user?.type as 'User' | 'Bot' | 'Organization' ?? 'User',
        },
        state: prResponse.data.state as 'open' | 'closed',
        state_reason: issueResponse.data.state_reason ?? null,
        labels: prResponse.data.labels.map(label => {
          if (typeof label === 'string') {
            return { id: 0, name: label, color: '', description: null };
          }
          return {
            id: label.id ?? 0,
            name: label.name ?? '',
            color: label.color ?? '',
            description: label.description ?? null,
          };
        }),
        milestone: prResponse.data.milestone ? {
          id: prResponse.data.milestone.id,
          number: prResponse.data.milestone.number,
          title: prResponse.data.milestone.title,
          description: prResponse.data.milestone.description,
          state: prResponse.data.milestone.state as 'open' | 'closed',
        } : null,
        assignees: prResponse.data.assignees?.map(assignee => ({
          login: assignee?.login ?? 'unknown',
          id: assignee?.id ?? 0,
          type: assignee?.type as 'User' | 'Bot' | 'Organization' ?? 'User',
        })) ?? [],
        created_at: prResponse.data.created_at,
        updated_at: prResponse.data.updated_at,
        closed_at: prResponse.data.closed_at,
        author_association: prResponse.data.author_association ?? 'NONE',
        reactions: {
          '+1': issueResponse.data.reactions?.['+1'] ?? 0,
          '-1': issueResponse.data.reactions?.['-1'] ?? 0,
          laugh: issueResponse.data.reactions?.laugh ?? 0,
          hooray: issueResponse.data.reactions?.hooray ?? 0,
          confused: issueResponse.data.reactions?.confused ?? 0,
          heart: issueResponse.data.reactions?.heart ?? 0,
          rocket: issueResponse.data.reactions?.rocket ?? 0,
          eyes: issueResponse.data.reactions?.eyes ?? 0,
        },
        comments: allComments.map(comment => ({
          id: comment.id,
          body: comment.body ?? '',
          user: {
            login: comment.user?.login ?? 'unknown',
            id: comment.user?.id ?? 0,
            type: comment.user?.type as 'User' | 'Bot' | 'Organization' ?? 'User',
          },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          author_association: comment.author_association,
          reactions: {
            '+1': comment.reactions?.['+1'] ?? 0,
            '-1': comment.reactions?.['-1'] ?? 0,
            laugh: comment.reactions?.laugh ?? 0,
            hooray: comment.reactions?.hooray ?? 0,
            confused: comment.reactions?.confused ?? 0,
            heart: comment.reactions?.heart ?? 0,
            rocket: comment.reactions?.rocket ?? 0,
            eyes: comment.reactions?.eyes ?? 0,
          },
        })),
        is_pull_request: true,
        timeline_events: allTimelineEvents.map((event: any) => ({
          id: event.id,
          event: event.event,
          actor: event.actor ? {
            login: event.actor.login ?? 'unknown',
            id: event.actor.id ?? 0,
            type: event.actor.type ?? 'User',
          } : null,
          created_at: event.created_at,
          author_association: event.author_association,
          body: event.body,
          label: event.label,
          assignee: event.assignee ? {
            login: event.assignee.login,
            id: event.assignee.id,
            type: event.assignee.type ?? 'User',
          } : undefined,
          assigner: event.assigner ? {
            login: event.assigner.login,
            id: event.assigner.id,
            type: event.assigner.type ?? 'User',
          } : undefined,
          milestone: event.milestone ? {
            title: event.milestone.title,
          } : undefined,
          rename: event.rename,
          html_url: event.html_url,
          user: event.user ? {
            login: event.user.login,
            id: event.user.id,
            type: event.user.type ?? 'User',
          } : undefined,
        })),
      };

      const validatedPR = GitHubIssueSchema.parse(pr);
      
      // Save to local cache (same location as issues)
      const dataPath = createIssueDataPath(ref);
      ensureDirectoryExists(dataPath);
      await fs.writeFile(dataPath, JSON.stringify(validatedPR, null, 2));
      
      logger.info(`Successfully fetched and cached PR ${ref.owner}/${ref.repo}#${ref.number}`);
      return validatedPR;
      
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 403) {
        logger.warn(`Rate limited while fetching ${ref.owner}/${ref.repo}#${ref.number}, waiting...`);
        await sleep(config.github.rateLimitRetryDelay);
        return await fetchPR(ref);
      }
      throw new Error(`Failed to fetch PR ${ref.owner}/${ref.repo}#${ref.number}: ${error}`);
    }
  }

  async function fetchAllPRs(owner: string, repo: string, force: boolean = false): Promise<void> {
    logger.info(`Starting bulk fetch of PRs for ${owner}/${repo} using cursor-based pagination${force ? ' (force mode)' : ''}`);
    
    let cursor: string | null = null;
    let hasNextPage = true;
    let totalFetched = 0;
    let pageCount = 0;
    
    while (hasNextPage) {
      try {
        pageCount++;
        logger.info(`Fetching page ${pageCount} for ${owner}/${repo} (cursor: ${cursor?.substring(0, 10) || 'none'}...)`);
        
        const query = `
          query($owner: String!, $repo: String!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              pullRequests(
                first: 100,
                after: $cursor,
                orderBy: { field: UPDATED_AT, direction: DESC },
                states: [OPEN, CLOSED, MERGED]
              ) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  number
                  title
                  body
                  state
                  createdAt
                  updatedAt
                  closedAt
                  url
                  author {
                    login
                  }
                  labels(first: 50) {
                    nodes {
                      id
                      name
                      color
                      description
                    }
                  }
                  milestone {
                    id
                    number
                    title
                    description
                    state
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                      id
                    }
                  }
                  reactions {
                    totalCount
                  }
                }
              }
            }
          }
        `;
        
        const response: GraphQLPRsResponse = await graphqlClient<GraphQLPRsResponse>(query, {
          owner,
          repo,
          cursor,
        });
        
        const prs = response.repository.pullRequests;
        
        if (prs.nodes.length === 0) {
          hasNextPage = false;
          break;
        }
        
        let cachedPRsInPage = 0;
        const pageSize = prs.nodes.length;
        
        for (const pr of prs.nodes) {
          const ref: IssueRef = { owner, repo, number: pr.number };
          
          // Check if we already have this PR and it's up to date
          if (!force) {
            const localPR = await getLocalPR(ref);
            if (localPR && new Date(localPR.updated_at) >= new Date(pr.updatedAt)) {
              logger.debug(`Skipping ${ref.owner}/${ref.repo}#${ref.number} - already up to date`);
              cachedPRsInPage++;
              continue;
            }
          }
          
          // Fetch the full PR data using REST API (which includes comments)
          await fetchPR(ref);
          totalFetched++;
          
          // Small delay to avoid overwhelming the API
          await sleep(100);
        }
        
        // If entire page was already cached and not in force mode, stop processing
        if (!force && cachedPRsInPage === pageSize && pageSize > 0) {
          logger.info(`Entire page ${pageCount} (${pageSize} PRs) was already up-to-date. Stopping early to avoid unnecessary API calls.`);
          hasNextPage = false;
          break;
        }
        
        hasNextPage = prs.pageInfo.hasNextPage;
        cursor = prs.pageInfo.endCursor;
        
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 403) {
          logger.warn(`Rate limited on page ${pageCount}, waiting...`);
          await sleep(config.github.rateLimitRetryDelay);
          continue;
        }
        throw error;
      }
    }
    
    logger.info(`Completed bulk fetch for ${owner}/${repo}, fetched ${totalFetched} PRs across ${pageCount} pages`);
  }

  async function fetchRecentPRs(owner: string, repo: string, force: boolean = false): Promise<void> {
    logger.info(`Starting fetch of recent PRs (last 2 weeks) for ${owner}/${repo}${force ? ' (force mode)' : ''}`);
    
    // Calculate the date 2 weeks ago (14 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    
    let cursor: string | null = null;
    let hasNextPage = true;
    let totalFetched = 0;
    let pageCount = 0;
    let stopEarly = false;
    
    while (hasNextPage && !stopEarly) {
      try {
        pageCount++;
        logger.info(`Fetching page ${pageCount} for ${owner}/${repo} (cursor: ${cursor?.substring(0, 10) || 'none'}...)`);
        
        const query = `
          query($owner: String!, $repo: String!, $cursor: String) {
            repository(owner: $owner, name: $repo) {
              pullRequests(
                first: 100,
                after: $cursor,
                orderBy: { field: UPDATED_AT, direction: DESC },
                states: [OPEN, CLOSED, MERGED]
              ) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  number
                  title
                  body
                  state
                  createdAt
                  updatedAt
                  closedAt
                  url
                  author {
                    login
                  }
                  labels(first: 50) {
                    nodes {
                      id
                      name
                      color
                      description
                    }
                  }
                  milestone {
                    id
                    number
                    title
                    description
                    state
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                      id
                    }
                  }
                  reactions {
                    totalCount
                  }
                }
              }
            }
          }
        `;
        
        const response: GraphQLPRsResponse = await graphqlClient<GraphQLPRsResponse>(query, {
          owner,
          repo,
          cursor,
        });
        
        const prs = response.repository.pullRequests;
        
        if (prs.nodes.length === 0) {
          hasNextPage = false;
          break;
        }
        
        let recentPRsInPage = 0;
        
        for (const pr of prs.nodes) {
          const prUpdatedAt = new Date(pr.updatedAt);
          const prCreatedAt = new Date(pr.createdAt);
          
          // Check if PR was created or updated in the last 2 weeks
          if (prUpdatedAt < twoWeeksAgo && prCreatedAt < twoWeeksAgo) {
            // Since results are ordered by updatedAt DESC, we can stop when we encounter an old PR
            logger.debug(`PR ${pr.number} is older than 2 weeks, stopping pagination`);
            stopEarly = true;
            break;
          }
          
          recentPRsInPage++;
          const ref: IssueRef = { owner, repo, number: pr.number };
          
          // Check if we already have this PR and it's up to date
          if (!force) {
            const localPR = await getLocalPR(ref);
            if (localPR && new Date(localPR.updated_at) >= new Date(pr.updatedAt)) {
              logger.debug(`Skipping ${ref.owner}/${ref.repo}#${ref.number} - already up to date`);
              continue;
            }
          }
          
          // Fetch the full PR data using REST API (which includes comments)
          await fetchPR(ref);
          totalFetched++;
          
          // Small delay to avoid overwhelming the API
          await sleep(100);
        }
        
        // If we didn't find any recent PRs in this page, stop
        if (recentPRsInPage === 0) {
          logger.info(`No recent PRs found in page ${pageCount}, stopping pagination`);
          stopEarly = true;
          break;
        }
        
        hasNextPage = prs.pageInfo.hasNextPage;
        cursor = prs.pageInfo.endCursor;
        
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 403) {
          logger.warn(`Rate limited on page ${pageCount}, waiting...`);
          await sleep(config.github.rateLimitRetryDelay);
          continue;
        }
        throw error;
      }
    }
    
    logger.info(`Completed recent fetch for ${owner}/${repo}, fetched ${totalFetched} PRs across ${pageCount} pages`);
  }

  async function getLocalPR(ref: IssueRef): Promise<GitHubIssue | null> {
    const dataPath = createIssueDataPath(ref);
    
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const parsed = GitHubIssueSchema.parse(JSON.parse(data));
      // Only return if it's actually a PR
      if (parsed.is_pull_request) {
        return parsed;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async function hasLocalPR(ref: IssueRef): Promise<boolean> {
    const pr = await getLocalPR(ref);
    return pr !== null;
  }

  return {
    fetchPR,
    fetchAllPRs,
    fetchRecentPRs,
    getLocalPR,
    hasLocalPR,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
