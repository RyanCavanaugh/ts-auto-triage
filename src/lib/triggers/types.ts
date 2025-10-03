import type { GitHubIssue, IssueRef, IssueAction, Config } from '../schemas.js';
import type { AIWrapper } from '../ai-wrapper.js';
import type { Logger } from '../utils.js';

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
