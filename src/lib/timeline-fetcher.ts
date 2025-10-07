import { Octokit } from '@octokit/rest';
import type { IssueRef, TimelineEvent } from './schemas.js';
import { TimelineEventSchema } from './schemas.js';
import type { Logger } from './utils.js';

export interface TimelineFetcher {
  fetchTimeline(ref: IssueRef): Promise<TimelineEvent[]>;
}

export function createTimelineFetcher(
  octokit: Octokit,
  logger: Logger
): TimelineFetcher {
  return {
    async fetchTimeline(ref: IssueRef): Promise<TimelineEvent[]> {
      logger.debug(`Fetching timeline for ${ref.owner}/${ref.repo}#${ref.number}`);
      
      const allEvents: TimelineEvent[] = [];
      let page = 1;
      const perPage = 100;
      
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const response = await octokit.request(
            'GET /repos/{owner}/{repo}/issues/{issue_number}/timeline',
            {
              owner: ref.owner,
              repo: ref.repo,
              issue_number: ref.number,
              per_page: perPage,
              page,
              headers: {
                accept: 'application/vnd.github.mockingbird-preview+json',
              },
            }
          );
          
          if (response.data.length === 0) break;
          
          // Validate and parse each event
          for (const event of response.data) {
            try {
              const parsed = TimelineEventSchema.parse(event);
              allEvents.push(parsed);
            } catch (error) {
              logger.warn(`Failed to parse timeline event: ${error}`);
            }
          }
          
          if (response.data.length < perPage) break;
          page++;
        }
        
        logger.debug(`Fetched ${allEvents.length} timeline events`);
        return allEvents;
      } catch (error) {
        logger.error(`Failed to fetch timeline: ${error}`);
        throw error;
      }
    },
  };
}
