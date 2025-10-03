import type { GitHubIssue, IssueRef, IssueAction, Config } from './schemas.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import { getAllTriggers, type RepositoryMetadata } from './triggers/index.js';

// Re-export types and functions from triggers
export type { CurationTrigger, RepositoryMetadata } from './triggers/index.js';
export { DomainLabelTrigger, MaintainerResponseTrigger, getAllTriggers } from './triggers/index.js';

/**
 * Execute all applicable triggers for an issue
 */
export async function executeTriggers(
  issue: GitHubIssue,
  issueRef: IssueRef,
  metadata: RepositoryMetadata,
  ai: AIWrapper,
  config: Config,
  logger: Logger
): Promise<IssueAction[]> {
  const triggers = getAllTriggers();
  const allActions: IssueAction[] = [];

  for (const trigger of triggers) {
    if (trigger.shouldActivate(issue, issueRef, metadata)) {
      logger.info(`Activating trigger: ${trigger.name}`);
      try {
        const actions = await trigger.execute(issue, issueRef, metadata, ai, config, logger);
        allActions.push(...actions);
        logger.info(`Trigger ${trigger.name} generated ${actions.length} actions`);
      } catch (error) {
        logger.error(`Trigger ${trigger.name} failed: ${error}`);
      }
    } else {
      logger.debug(`Trigger ${trigger.name} not activated`);
    }
  }

  return allActions;
}