import type { GitHubIssue, IssueRef, IssueAction, Config } from '../schemas.js';
import { TextResponseSchema } from '../schemas.js';
import type { AIWrapper } from '../ai-wrapper.js';
import type { Logger } from '../utils.js';
import { loadPrompt } from '../prompts.js';
import { findSimilarIssuesUsingEmbeddings } from '../utils.js';
import { createFAQMatcher } from '../faq-matcher.js';
import type { CurationTrigger, RepositoryMetadata } from './types.js';

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

    // TODO what even is this
    /*
    // Check for FAQ matches
    try {
      const faqMatcher = createFAQMatcher(ai, logger);
      const faqResponse = await faqMatcher.checkFAQMatch(issue.title, issue.body ?? '', issueRef);
      if (faqResponse) {
        actions.push({
          kind: 'add_comment',
          body: faqResponse,
        });
      }
    } catch (error) {
      logger.debug(`${this.name}: FAQ check failed: ${error}`);
    }*/

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

  private async checkForDuplicates(
    issue: GitHubIssue, 
    issueRef: IssueRef, 
    ai: AIWrapper, 
    config: Config, 
    logger: Logger
  ): Promise<string | null> {
    try {
      // Use embeddings-based similarity search to find similar issues
      const similarIssues = await findSimilarIssuesUsingEmbeddings(
        issue.title,
        issue.body ?? '',
        issueRef,
        ai,
        config,
        5 // Get top 5 similar issues
      );

      if (similarIssues.length === 0) {
        logger.debug(`${this.name}: No similar issues found using embeddings`);
        return null;
      }

      logger.debug(`${this.name}: Found ${similarIssues.length} similar issues using embeddings`);

      // Format similar issues for AI analysis
      const similarIssuesList = similarIssues.map(s => {
        const percentage = Math.round(s.similarity * 100);
        const emoji = s.similarity >= 0.7 ? '🔥 ' : '';
        return `${emoji}${s.issueKey} (${percentage}% similar): ${s.summary.slice(0, 200)}...`;
      }).join('\n');

      // Use AI to determine if these are actual duplicates and format response
      const messages = [
        { 
          role: 'system' as const, 
          content: await loadPrompt('duplicate-check-system') 
        },
        { 
          role: 'user' as const, 
          content: await loadPrompt('duplicate-check-user', { 
            issueTitle: issue.title,
            issueBody: issue.body ?? '',
            similarIssues: similarIssuesList
          }) 
        },
      ];

      const response = await ai.completion(messages, {
        jsonSchema: TextResponseSchema,
        maxTokens: 300,
        context: `Duplicate check for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
        effort: 'Medium',
      });

      // Check if AI confirms these are likely duplicates
      const content = response.text.toLowerCase();
      if (content.includes('duplicate') || content.includes('similar') || content.includes('related')) {
        return `## Potential Duplicates Found\n\n${response.text}\n\n### Similar Issues:\n${similarIssuesList}`;
      }

      return null;
    } catch (error) {
      logger.debug(`${this.name}: Embeddings-based duplicate check failed: ${error}`);
      return null;
    }
  }
}
