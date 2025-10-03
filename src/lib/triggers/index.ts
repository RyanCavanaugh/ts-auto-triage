import type { GitHubIssue, IssueRef, IssueAction, Config } from '../schemas.js';
import type { AIWrapper } from '../ai-wrapper.js';
import type { Logger } from '../utils.js';
import { DomainLabelTrigger } from './domain-label.js';
import { MaintainerResponseTrigger } from './maintainer-response.js';

export interface CurationTrigger {
  readonly name: string;
  readonly description: string;
  
  /**
   * Check if this trigger should activate for the given issue
   */
  shouldActivate(
    issue: GitHubIssue,
    issueRef: IssueRef,
    metadata: RepositoryMetadata
  ): boolean;
  
  /**
   * Execute the trigger and return recommended actions
   */
  execute(
    issue: GitHubIssue,
    issueRef: IssueRef,
    metadata: RepositoryMetadata,
    ai: AIWrapper,
    config: Config,
    logger: Logger
  ): Promise<IssueAction[]>;
}

export interface RepositoryMetadata {
  labels: string[];
  milestones: string[];
  maintainers?: string[];
}

/**
 * Main function to get all available triggers
 */
export function getAllTriggers(): CurationTrigger[] {
  return [
    new DomainLabelTrigger(),
    new MaintainerResponseTrigger(),
  ];
}

// Re-export trigger classes
export { DomainLabelTrigger } from './domain-label.js';
export { MaintainerResponseTrigger } from './maintainer-response.js';
