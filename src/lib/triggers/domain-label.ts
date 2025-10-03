import type { GitHubIssue, IssueRef, IssueAction, Config } from '../schemas.js';
import type { AIWrapper } from '../ai-wrapper.js';
import type { Logger } from '../utils.js';
import { loadPrompt } from '../prompts.js';
import type { CurationTrigger, RepositoryMetadata } from './index.js';

/**
 * Trigger that adds a domain label if an open issue lacks one
 */
export class DomainLabelTrigger implements CurationTrigger {
  readonly name = 'domain-label';
  readonly description = 'Add domain label to open issues that lack one';

  shouldActivate(issue: GitHubIssue, _issueRef: IssueRef, metadata: RepositoryMetadata): boolean {
    // Only activate for open issues
    if (issue.state !== 'open') {
      return false;
    }

    // Check if there are any domain labels available
    const domainLabels = this.getDomainLabels(metadata.labels);
    if (domainLabels.length === 0) {
      return false;
    }

    // Check if issue has any domain-like labels
    const currentLabels = issue.labels.map(l => l.name);
    const hasDomainLabel = domainLabels.some(domain => currentLabels.includes(domain));

    return !hasDomainLabel;
  }

  async execute(
    issue: GitHubIssue,
    issueRef: IssueRef,
    metadata: RepositoryMetadata,
    ai: AIWrapper,
    config: Config,
    logger: Logger
  ): Promise<IssueAction[]> {
    logger.info(`${this.name}: Computing domain label for issue`);

    const domainLabels = this.getDomainLabels(metadata.labels);
    
    if (domainLabels.length === 0) {
      logger.debug(`${this.name}: No domain labels found in repository`);
      return [];
    }

    // Truncate issue content to fit in context
    const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
    
    const messages = [
      { 
        role: 'system' as const, 
        content: await loadPrompt('domain-label-system', { 
          availableDomainLabels: domainLabels.join(', ') 
        }) 
      },
      { 
        role: 'user' as const, 
        content: await loadPrompt('domain-label-user', { 
          issueTitle: issue.title, 
          body 
        }) 
      },
    ];

    const response = await ai.chatCompletion(messages, {
      maxTokens: 100,
      context: `Determine domain label for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
    });

    // Extract label from response
    const suggestedLabel = this.extractLabelFromResponse(response.content, domainLabels);
    
    if (suggestedLabel) {
      logger.info(`${this.name}: Suggesting domain label: ${suggestedLabel}`);
      return [{
        kind: 'add_label',
        label: suggestedLabel,
      }];
    }

    logger.debug(`${this.name}: No suitable domain label found`);
    return [];
  }

  private getDomainLabels(allLabels: string[]): string[] {
    // Common domain label patterns - this could be made configurable
    const domainPatterns = [
      /^domain:/i,
      /^area:/i,
      /^component:/i,
      /^module:/i,
      /^feature:/i,
    ];

    return allLabels.filter(label => 
      domainPatterns.some(pattern => pattern.test(label))
    );
  }

  private extractLabelFromResponse(response: string, availableLabels: string[]): string | null {
    const cleanResponse = response.trim().toLowerCase();
    
    // Look for exact matches first
    for (const label of availableLabels) {
      if (cleanResponse.includes(label.toLowerCase())) {
        return label;
      }
    }

    // Look for partial matches
    for (const label of availableLabels) {
      const labelPart = label.toLowerCase().split(':')[1]?.trim();
      if (labelPart && cleanResponse.includes(labelPart)) {
        return label;
      }
    }

    return null;
  }
}
