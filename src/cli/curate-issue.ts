#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { Octokit } from '@octokit/rest';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, IssueActionSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: curate-issue <issue-ref>');
      console.error('Example: curate-issue Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Curating issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load the issue data
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.error(`Issue data not found at ${issueFilePath}. Run fetch-issue first.`);
      process.exit(1);
    }

    // Load policy
    let policyContent = '';
    try {
      policyContent = await readFile('POLICY.md', 'utf-8');
    } catch {
      logger.warn('No POLICY.md file found. Using generic curation guidelines.');
      policyContent = `# Default Curation Policy
      
- Add appropriate labels based on issue content
- Close issues that are not actionable or duplicates
- Set appropriate milestones for feature requests
- Assign issues to relevant team members when possible`;
    }

    // Get repository metadata for valid labels and milestones
    const { labels, milestones } = await getRepositoryMetadata(issueRef);

    // Get AI recommendations
    const recommendations = await getCurationRecommendations(ai, issue, policyContent, labels, milestones, config);

    if (recommendations.length === 0) {
      logger.info('No curation actions recommended');
      return;
    }

    // Write action file
    const actionFile = {
      issue_ref: issueRef,
      actions: recommendations,
    };

    const actionFilePath = `.working/actions/${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`;
    ensureDirectoryExists(actionFilePath);
    
    const actionFileContent = `/* Proposed curation actions for ${formatIssueRef(issueRef)}
   AI-generated recommendations based on POLICY.md and issue analysis */
${JSON.stringify(actionFile, null, 2)}`;

    await writeFile(actionFilePath, actionFileContent);
    logger.info(`Action file written to ${actionFilePath}`);
    logger.info(`Recommended ${recommendations.length} curation actions`);

  } catch (error) {
    logger.error(`Failed to curate issue: ${error}`);
    process.exit(1);
  }
}

async function getRepositoryMetadata(issueRef: any): Promise<{ labels: string[]; milestones: string[] }> {
  try {
    // Get GitHub auth token
    const { execSync } = await import('child_process');
    const authToken = execSync('gh auth token', { encoding: 'utf-8' }).trim();
    
    // Create GitHub client
    const octokit = new Octokit({ auth: authToken });

    // Fetch labels and milestones
    const [labelsResponse, milestonesResponse] = await Promise.all([
      octokit.issues.listLabelsForRepo({
        owner: issueRef.owner,
        repo: issueRef.repo,
      }),
      octokit.issues.listMilestones({
        owner: issueRef.owner,
        repo: issueRef.repo,
        state: 'all',
      }),
    ]);

    return {
      labels: labelsResponse.data.map(l => l.name),
      milestones: milestonesResponse.data.map(m => m.title),
    };
  } catch (error) {
    // Fallback to empty arrays if API calls fail
    return { labels: [], milestones: [] };
  }
}

async function getCurationRecommendations(
  ai: any,
  issue: any,
  policyContent: string,
  availableLabels: string[],
  availableMilestones: string[],
  config: any
): Promise<any[]> {
  // Truncate issue content to fit in context
  const body = issue.body ? issue.body.slice(0, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-3)
    .map((c: any) => `${c.user.login}: ${c.body.slice(0, config.github.maxCommentLength)}`)
    .join('\n---\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert GitHub issue curator for a TypeScript repository. Analyze the issue and recommend curation actions based on the policy.

Available actions:
- add_label: Add a label (must be from available labels list)
- remove_label: Remove a label
- close_issue: Close with reason "completed" or "not_planned"
- add_comment: Post a comment
- set_milestone: Set milestone (must be from available milestones list)
- assign_user: Assign to a user

Respond with a JSON array of action objects. Each action must have a "kind" field and appropriate parameters.
If no actions are needed, return an empty array.

Available labels: ${availableLabels.join(', ')}
Available milestones: ${availableMilestones.join(', ')}`,
    },
    {
      role: 'user' as const,
      content: `Policy:
${policyContent}

Issue #${issue.number}: ${issue.title}
State: ${issue.state}
Current Labels: ${issue.labels.map((l: any) => l.name).join(', ')}
Author: ${issue.user.login} (${issue.author_association})

Body:
${body}

Recent Comments:
${recentComments}

What curation actions do you recommend?`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 1000 });
  
  try {
    const actions = JSON.parse(response.content);
    
    // Validate actions against schema
    const validActions = [];
    for (const action of actions) {
      try {
        const validatedAction = IssueActionSchema.parse(action);
        
        // Additional validation for label/milestone existence
        if (validatedAction.kind === 'add_label' && !availableLabels.includes(validatedAction.label)) {
          continue; // Skip invalid label
        }
        if (validatedAction.kind === 'set_milestone' && !availableMilestones.includes(validatedAction.milestone)) {
          continue; // Skip invalid milestone
        }
        
        validActions.push(validatedAction);
      } catch {
        continue; // Skip invalid actions
      }
    }
    
    return validActions;
  } catch {
    // If JSON parsing fails, return empty array
    return [];
  }
}

main().catch(console.error);