import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { GitHubIssue, BugClassification, CompilerReproSteps, LSReproSteps, ReproSteps } from './schemas.js';
import { BugClassificationSchema, CompilerReproStepsSchema, LSReproStepsSchema } from './schemas.js';
import { loadPrompt } from './prompts.js';

export interface ReproExtractor {
  classifyBug(issue: GitHubIssue, issueKey: string): Promise<BugClassification>;
  generateReproSteps(issue: GitHubIssue, classification: BugClassification, issueKey: string): Promise<ReproSteps | null>;
}

interface ReproExtractorConfig {
  maxIssueBodyLength: number;
  maxCommentLength: number;
}

export function createReproExtractor(
  ai: AIWrapper,
  config: ReproExtractorConfig,
  logger: Logger
): ReproExtractor {
  return {
    async classifyBug(issue: GitHubIssue, issueKey: string): Promise<BugClassification> {
      logger.debug(`Classifying bug type for ${issueKey}`);
      
      const body = issue.body ? issue.body.slice(0, config.maxIssueBodyLength) : '';
      const recentComments = issue.comments
        .slice(-3)
        .map((c) => c.body.slice(0, config.maxCommentLength))
        .join('\n---\n');

      const messages = [
        { role: 'system' as const, content: await loadPrompt('repro-classify-system') },
        { 
          role: 'user' as const, 
          content: await loadPrompt('repro-classify-user', { 
            issueNumber: String(issue.number), 
            issueTitle: issue.title, 
            body, 
            recentComments 
          }) 
        },
      ];

      const classification = await ai.structuredCompletion(messages, BugClassificationSchema, { 
        maxTokens: 500,
        context: `Classify bug type for ${issueKey}`,
        effort: 'Medium',
      });

      logger.info(`Bug classified as: ${classification.bugType}`);
      return classification;
    },

    async generateReproSteps(
      issue: GitHubIssue, 
      classification: BugClassification, 
      issueKey: string
    ): Promise<ReproSteps | null> {
      if (classification.bugType === 'unknown') {
        logger.info('Skipping repro generation for unknown bug type');
        return null;
      }

      const body = issue.body ? issue.body.slice(0, config.maxIssueBodyLength) : '';
      const recentComments = issue.comments
        .slice(-3)
        .map((c) => c.body.slice(0, config.maxCommentLength))
        .join('\n---\n');

      if (classification.bugType === 'compiler') {
        logger.debug(`Generating compiler repro steps for ${issueKey}`);
        
        const messages = [
          { role: 'system' as const, content: await loadPrompt('repro-compiler-system') },
          { 
            role: 'user' as const, 
            content: await loadPrompt('repro-compiler-user', { 
              issueNumber: String(issue.number), 
              issueTitle: issue.title, 
              body, 
              recentComments 
            }) 
          },
        ];

        const reproSteps = await ai.structuredCompletion(messages, CompilerReproStepsSchema, { 
          maxTokens: 2000,
          context: `Generate compiler repro steps for ${issueKey}`,
          effort: 'High',
        });

        return reproSteps;
      } else {
        // language-service
        logger.debug(`Generating language service repro steps for ${issueKey}`);
        
        const messages = [
          { role: 'system' as const, content: await loadPrompt('repro-ls-system') },
          { 
            role: 'user' as const, 
            content: await loadPrompt('repro-ls-user', { 
              issueNumber: String(issue.number), 
              issueTitle: issue.title, 
              body, 
              recentComments 
            }) 
          },
        ];

        const reproSteps = await ai.structuredCompletion(messages, LSReproStepsSchema, { 
          maxTokens: 2000,
          context: `Generate language service repro steps for ${issueKey}`,
          effort: 'High',
        });

        return reproSteps;
      }
    },
  };
}
