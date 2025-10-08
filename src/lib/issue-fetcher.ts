import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import * as fs from 'fs/promises';
import type { IssueRef, GitHubIssue, Config } from './schemas.js';
import { GitHubIssueSchema } from './schemas.js';
import type { Logger } from './utils.js';
import { ensureDirectoryExists, createIssueDataPath } from './utils.js';

export interface IssueFetcher {
  fetchIssue(ref: IssueRef, force?: boolean): Promise<GitHubIssue>;
  fetchAllIssues(owner: string, repo: string, options?: { force?: boolean; includePullRequests?: boolean }): Promise<void>;
  getLocalIssue(ref: IssueRef): Promise<GitHubIssue | null>;
  hasLocalIssue(ref: IssueRef): Promise<boolean>;
}

// GraphQL types for cursor-based pagination
interface GraphQLIssueNode {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
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

interface GraphQLIssuesResponse {
  repository: {
    issues: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: GraphQLIssueNode[];
    };
  };
}

export function createIssueFetcher(
  octokit: Octokit,
  config: Config,
  logger: Logger,
  authToken: string
): IssueFetcher {
  // Create GraphQL client with auth token
  const graphqlClient = graphql.defaults({
    headers: {
      authorization: `token ${authToken}`,
    },
  });

  return {
    async fetchIssue(ref: IssueRef, force: boolean = false): Promise<GitHubIssue> {
      logger.info(`Fetching issue ${ref.owner}/${ref.repo}#${ref.number}${force ? ' (forced)' : ''}`);
      
      try {
        // Check if already up to date (unless forced)
        if (!force) {
          const localIssue = await this.getLocalIssue(ref);
          if (localIssue) {
            // Quick check with minimal API call
            const issueBasic = await octokit.rest.issues.get({
              owner: ref.owner,
              repo: ref.repo,
              issue_number: ref.number,
            });
            
            if (new Date(localIssue.updated_at) >= new Date(issueBasic.data.updated_at)) {
              logger.debug(`Skipping ${ref.owner}/${ref.repo}#${ref.number} - already up to date`);
              return localIssue;
            }
          }
        }
        
        // Fetch the issue
        const issueResponse = await octokit.rest.issues.get({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
        });

        // Fetch all comments
        const commentsResponse = await octokit.rest.issues.listComments({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
          per_page: 100,
        });

        let allComments = commentsResponse.data;
        
        // Handle pagination for comments
        while (commentsResponse.data.length === 100) {
          const nextPage = await octokit.rest.issues.listComments({
            owner: ref.owner,
            repo: ref.repo,
            issue_number: ref.number,
            per_page: 100,
            page: Math.floor(allComments.length / 100) + 2,
          });
          
          if (nextPage.data.length === 0) break;
          allComments = allComments.concat(nextPage.data);
        }

        // Fetch timeline events (labels, milestones, state changes, etc.)
        const timelineResponse = await octokit.rest.issues.listEventsForTimeline({
          owner: ref.owner,
          repo: ref.repo,
          issue_number: ref.number,
          per_page: 100,
        });

        let allTimelineEvents = timelineResponse.data;
        
        // Handle pagination for timeline events
        let page = 2;
        while (timelineResponse.data.length === 100) {
          const nextPage = await octokit.rest.issues.listEventsForTimeline({
            owner: ref.owner,
            repo: ref.repo,
            issue_number: ref.number,
            per_page: 100,
            page,
          });
          
          if (nextPage.data.length === 0) break;
          allTimelineEvents = allTimelineEvents.concat(nextPage.data);
          page++;
        }

        // Transform to our schema format
        const issue = {
          ...issueResponse.data,
          is_pull_request: 'pull_request' in issueResponse.data,
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
          user: {
            login: issueResponse.data.user?.login ?? 'unknown',
            id: issueResponse.data.user?.id ?? 0,
            type: issueResponse.data.user?.type as 'User' | 'Bot' | 'Organization' ?? 'User',
          },
          labels: issueResponse.data.labels.map(label => {
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
          milestone: issueResponse.data.milestone ? {
            id: issueResponse.data.milestone.id,
            number: issueResponse.data.milestone.number,
            title: issueResponse.data.milestone.title,
            description: issueResponse.data.milestone.description,
            state: issueResponse.data.milestone.state as 'open' | 'closed',
          } : null,
          assignees: issueResponse.data.assignees?.map(assignee => ({
            login: assignee?.login ?? 'unknown',
            id: assignee?.id ?? 0,
            type: assignee?.type as 'User' | 'Bot' | 'Organization' ?? 'User',
          })) ?? [],
          timeline_events: allTimelineEvents.map(event => {
            // Safely extract properties based on what's available
            const timelineEvent: Record<string, unknown> = {
              event: 'event' in event ? event.event : 'unknown',
              created_at: 'created_at' in event ? event.created_at : new Date().toISOString(),
            };
            
            // Add optional id if present
            if ('id' in event && typeof event.id === 'number') {
              timelineEvent.id = event.id;
            }
            
            // Add actor if present
            if ('actor' in event && event.actor && typeof event.actor === 'object') {
              const actor = event.actor as { login: string; id: number; type?: string };
              timelineEvent.actor = {
                login: actor.login,
                id: actor.id,
                type: actor.type ?? 'User',
              };
            }
            
            // Add optional fields
            if ('author_association' in event) {
              timelineEvent.author_association = event.author_association as string;
            }
            
            if ('body' in event) {
              timelineEvent.body = event.body as string;
            }
            
            if ('label' in event && event.label && typeof event.label === 'object') {
              const label = event.label as { name: string; color: string };
              timelineEvent.label = {
                name: label.name,
                color: label.color,
              };
            }
            
            if ('assignee' in event && event.assignee && typeof event.assignee === 'object') {
              const assignee = event.assignee as { login: string; id: number; type?: string };
              timelineEvent.assignee = {
                login: assignee.login,
                id: assignee.id,
                type: assignee.type ?? 'User',
              };
            }
            
            if ('assigner' in event && event.assigner && typeof event.assigner === 'object') {
              const assigner = event.assigner as { login: string; id: number; type?: string };
              timelineEvent.assigner = {
                login: assigner.login,
                id: assigner.id,
                type: assigner.type ?? 'User',
              };
            }
            
            if ('milestone' in event && event.milestone && typeof event.milestone === 'object') {
              const milestone = event.milestone as { title: string };
              timelineEvent.milestone = {
                title: milestone.title,
              };
            }
            
            if ('rename' in event && event.rename && typeof event.rename === 'object') {
              const rename = event.rename as { from: string; to: string };
              timelineEvent.rename = {
                from: rename.from,
                to: rename.to,
              };
            }
            
            if ('html_url' in event) {
              timelineEvent.html_url = event.html_url as string;
            }
            
            if ('user' in event && event.user && typeof event.user === 'object') {
              const user = event.user as { login: string; id: number; type?: string };
              timelineEvent.user = {
                login: user.login,
                id: user.id,
                type: user.type ?? 'User',
              };
            }
            
            return timelineEvent;
          }),
        };

        const validatedIssue = GitHubIssueSchema.parse(issue);
        
        // Save to local cache
        const dataPath = createIssueDataPath(ref);
        ensureDirectoryExists(dataPath);
        await fs.writeFile(dataPath, JSON.stringify(validatedIssue, null, 2));
        
        logger.info(`Successfully fetched and cached issue ${ref.owner}/${ref.repo}#${ref.number}`);
        return validatedIssue;
        
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 403) {
          logger.warn(`Rate limited while fetching ${ref.owner}/${ref.repo}#${ref.number}, waiting...`);
          await sleep(config.github.rateLimitRetryDelay);
          return await this.fetchIssue(ref, force);
        }
        throw new Error(`Failed to fetch issue ${ref.owner}/${ref.repo}#${ref.number}: ${error}`);
      }
    },

    async fetchAllIssues(owner: string, repo: string, options: { force?: boolean; includePullRequests?: boolean } = {}): Promise<void> {
      const { force = false, includePullRequests = true } = options;
      logger.info(`Starting bulk fetch for ${owner}/${repo} using cursor-based pagination${force ? ' (forced)' : ''}${includePullRequests ? ' (including PRs)' : ' (issues only)'}`);
      
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
                issues(
                  first: 100,
                  after: $cursor,
                  orderBy: { field: UPDATED_AT, direction: DESC },
                  states: [OPEN, CLOSED]
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
          
          const response: GraphQLIssuesResponse = await graphqlClient<GraphQLIssuesResponse>(query, {
            owner,
            repo,
            cursor,
          });
          
          const issues = response.repository.issues;
          
          if (issues.nodes.length === 0) {
            hasNextPage = false;
            break;
          }
          
          let cachedIssuesInPage = 0;
          const pageSize = issues.nodes.length;
          
          for (const issue of issues.nodes) {
            const ref: IssueRef = { owner, repo, number: issue.number };
            
            // Skip pull requests if not included
            if (!includePullRequests) {
              // Check if it's a pull request by looking at the URL or fetching minimal data
              const issueCheck = await octokit.rest.issues.get({
                owner: ref.owner,
                repo: ref.repo,
                issue_number: ref.number,
              });
              if ('pull_request' in issueCheck.data) {
                logger.debug(`Skipping PR ${ref.owner}/${ref.repo}#${ref.number}`);
                continue;
              }
            }
            
            // Check if we already have this issue and it's up to date (unless forced)
            if (!force) {
              const localIssue = await this.getLocalIssue(ref);
              if (localIssue && new Date(localIssue.updated_at) >= new Date(issue.updatedAt)) {
                logger.debug(`Skipping ${ref.owner}/${ref.repo}#${ref.number} - already up to date`);
                cachedIssuesInPage++;
                continue;
              }
            }
            
            // Fetch the full issue data using REST API (which includes comments and timeline)
            await this.fetchIssue(ref, force);
            totalFetched++;
            
            // Small delay to avoid overwhelming the API
            await sleep(100);
          }
          
          // If entire page was already cached and not forced, stop processing
          if (!force && cachedIssuesInPage === pageSize && pageSize > 0) {
            logger.info(`Entire page ${pageCount} (${pageSize} issues) was already up-to-date. Stopping early to avoid unnecessary API calls.`);
            hasNextPage = false;
            break;
          }
          
          hasNextPage = issues.pageInfo.hasNextPage;
          cursor = issues.pageInfo.endCursor;
          
        } catch (error) {
          if (error instanceof Error && 'status' in error && error.status === 403) {
            logger.warn(`Rate limited on page ${pageCount}, waiting...`);
            await sleep(config.github.rateLimitRetryDelay);
            continue;
          }
          throw error;
        }
      }
      
      logger.info(`Completed bulk fetch for ${owner}/${repo}, fetched ${totalFetched} issues across ${pageCount} pages`);
    },

    async getLocalIssue(ref: IssueRef): Promise<GitHubIssue | null> {
      const dataPath = createIssueDataPath(ref);
      
      try {
        const data = await fs.readFile(dataPath, 'utf-8');
        return GitHubIssueSchema.parse(JSON.parse(data));
      } catch (error) {
        return null;
      }
    },

    async hasLocalIssue(ref: IssueRef): Promise<boolean> {
      const dataPath = createIssueDataPath(ref);
      
      try {
        await fs.access(dataPath);
        return true;
      } catch (error) {
        return false;
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}