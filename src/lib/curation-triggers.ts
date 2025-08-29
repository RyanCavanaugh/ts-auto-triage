import type { GitHubIssue, IssueRef, IssueAction, Config } from './schemas.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import { loadPrompt } from './prompts.js';

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

/**
 * Trigger that provides FAQ responses and duplicate detection for issues without maintainer response
 */
export class MaintainerResponseTrigger implements CurationTrigger {
  readonly name = 'maintainer-response';
  readonly description = 'Provide FAQ and duplicate detection for issues lacking maintainer response';

  shouldActivate(issue: GitHubIssue, _issueRef: IssueRef, metadata: RepositoryMetadata): boolean {
    // Only activate for open issues
    if (issue.state !== 'open') {
      return false;
    }

    // Check if any comments are from maintainers
    const maintainers = metadata.maintainers ?? this.getDefaultMaintainerPatterns();
    const hasMaintainerComment = issue.comments.some(comment => 
      this.isMaintainer(comment.user.login, comment.author_association, maintainers)
    );

    return !hasMaintainerComment;
  }

  async execute(
    issue: GitHubIssue,
    issueRef: IssueRef,
    _metadata: RepositoryMetadata,
    ai: AIWrapper,
    config: Config,
    logger: Logger
  ): Promise<IssueAction[]> {
    logger.info(`${this.name}: Generating first response for issue without maintainer comment`);

    const actions: IssueAction[] = [];

    // Check for FAQ matches
    try {
      const faqResponse = await this.checkFAQMatches(issue, ai, logger);
      if (faqResponse) {
        actions.push({
          kind: 'add_comment',
          body: faqResponse,
        });
      }
    } catch (error) {
      logger.debug(`${this.name}: FAQ check failed: ${error}`);
    }

    // Check for similar issues (simplified duplicate detection)
    try {
      const duplicateResponse = await this.checkForDuplicates(issue, issueRef, ai, config, logger);
      if (duplicateResponse) {
        actions.push({
          kind: 'add_comment',
          body: duplicateResponse,
        });
      }
    } catch (error) {
      logger.debug(`${this.name}: Duplicate check failed: ${error}`);
    }

    return actions;
  }

  private isMaintainer(login: string, authorAssociation: string, maintainers: string[]): boolean {
    // Check explicit maintainer list first
    if (maintainers.includes(login.toLowerCase())) {
      return true;
    }

    // Check GitHub association levels that typically indicate maintainer status
    const maintainerAssociations = ['OWNER', 'MEMBER', 'COLLABORATOR'];
    return maintainerAssociations.includes(authorAssociation.toUpperCase());
  }

  private getDefaultMaintainerPatterns(): string[] {
    // Default patterns for common maintainer usernames - could be made configurable
    return ['maintainer', 'admin', 'owner'];
  }

  private async checkFAQMatches(issue: GitHubIssue, ai: AIWrapper, logger: Logger): Promise<string | null> {
    try {
      // Try to load FAQ content
      const { readFile } = await import('fs/promises');
      const faqContent = await readFile('FAQ.md', 'utf-8');

      const messages = [
        { 
          role: 'system' as const, 
          content: await loadPrompt('faq-match-system') 
        },
        { 
          role: 'user' as const, 
          content: await loadPrompt('faq-match-user', { 
            issueTitle: issue.title,
            issueBody: issue.body ?? '',
            faqContent 
          }) 
        },
      ];

      const response = await ai.chatCompletion(messages, {
        maxTokens: 500,
        context: `FAQ check for issue #${issue.number}`,
      });

      // Simple check if response indicates a match
      if (response.content.toLowerCase().includes('relevant') || 
          response.content.toLowerCase().includes('faq')) {
        return response.content;
      }
    } catch (error) {
      logger.debug(`FAQ file not found or error reading: ${error}`);
    }

    return null;
  }

  private async checkForDuplicates(
    issue: GitHubIssue, 
    issueRef: IssueRef, 
    ai: AIWrapper, 
    config: Config, 
    logger: Logger
  ): Promise<string | null> {
    // Simplified duplicate detection - in a real implementation this would use embeddings
    const messages = [
      { 
        role: 'system' as const, 
        content: await loadPrompt('duplicate-check-system') 
      },
      { 
        role: 'user' as const, 
        content: await loadPrompt('duplicate-check-user', { 
          issueTitle: issue.title,
          issueBody: issue.body ?? ''
        }) 
      },
    ];

    const response = await ai.chatCompletion(messages, {
      maxTokens: 300,
      context: `Duplicate check for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
    });

    // Simple heuristic - if AI mentions specific issue numbers or suggests duplicates
    if (response.content.toLowerCase().includes('duplicate') || 
        response.content.toLowerCase().includes('similar')) {
      return `## Potential Duplicates Found\n\n${response.content}`;
    }

    return null;
  }
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