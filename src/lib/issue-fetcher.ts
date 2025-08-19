import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import type { IssueRef, GitHubIssue, Config } from './schemas.js';
import { GitHubIssueSchema } from './schemas.js';
import type { Logger } from './utils.js';
import { ensureDirectoryExists, createIssueDataPath } from './utils.js';

export interface IssueFetcher {
  fetchIssue(ref: IssueRef): Promise<GitHubIssue>;
  fetchAllIssues(owner: string, repo: string): Promise<void>;
  getLocalIssue(ref: IssueRef): Promise<GitHubIssue | null>;
  hasLocalIssue(ref: IssueRef): Promise<boolean>;
}

export function createIssueFetcher(
  octokit: Octokit,
  config: Config,
  logger: Logger
): IssueFetcher {
  return {
    async fetchIssue(ref: IssueRef): Promise<GitHubIssue> {
      logger.info(`Fetching issue ${ref.owner}/${ref.repo}#${ref.number}`);
      
      try {
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
          return await this.fetchIssue(ref);
        }
        throw new Error(`Failed to fetch issue ${ref.owner}/${ref.repo}#${ref.number}: ${error}`);
      }
    },

    async fetchAllIssues(owner: string, repo: string): Promise<void> {
      logger.info(`Starting bulk fetch for ${owner}/${repo}`);
      
      let page = 1;
      let hasMore = true;
      let totalFetched = 0;
      
      while (hasMore) {
        try {
          logger.info(`Fetching page ${page} for ${owner}/${repo}`);
          
          const response = await octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: 'all',
            per_page: 100,
            page,
            sort: 'updated',
            direction: 'desc',
          });
          
          if (response.data.length === 0) {
            hasMore = false;
            break;
          }
          
          for (const issue of response.data) {
            const ref: IssueRef = { owner, repo, number: issue.number };
            
            // Check if we already have this issue and it's up to date
            const localIssue = await this.getLocalIssue(ref);
            if (localIssue && new Date(localIssue.updated_at) >= new Date(issue.updated_at)) {
              logger.debug(`Skipping ${ref.owner}/${ref.repo}#${ref.number} - already up to date`);
              continue;
            }
            
            // Fetch the full issue data
            await this.fetchIssue(ref);
            totalFetched++;
            
            // Small delay to avoid overwhelming the API
            await sleep(100);
          }
          
          page++;
          
        } catch (error) {
          if (error instanceof Error && 'status' in error && error.status === 403) {
            logger.warn(`Rate limited on page ${page}, waiting...`);
            await sleep(config.github.rateLimitRetryDelay);
            continue;
          }
          throw error;
        }
      }
      
      logger.info(`Completed bulk fetch for ${owner}/${repo}, fetched ${totalFetched} issues`);
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