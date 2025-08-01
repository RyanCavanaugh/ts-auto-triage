#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { Octokit } from '@octokit/rest';
import { createIssueFetcher, parseIssueRef } from '../../packages/issue-fetcher/src/index.js';
import { createAIWrapper } from '../../packages/ai-wrapper/src/index.js';
import { ActionFileSchema, type ActionFile } from '../../packages/issue-fetcher/src/schemas.js';
import { loadConfig, getGitHubToken, createLogger, truncateText } from '../../packages/utils/src/index.js';
import { z } from 'zod';

const logger = createLogger('curate-issue');

const CurationResponseSchema = z.object({
  actions: z.array(z.object({
    kind: z.enum(['add_label', 'remove_label', 'close', 'comment']),
    label: z.string().optional(),
    comment: z.string().optional(),
    reasoning: z.string()
  }))
});

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: curate-issue.js <issue-ref>');
    console.error('Example: curate-issue.js Microsoft/TypeScript#9998');
    console.error('         curate-issue.js https://github.com/Microsoft/TypeScript/issues/9998');
    process.exit(1);
  }
  
  try {
    const issueRefStr = args[0];
    const issueRef = parseIssueRef(issueRefStr);
    const token = await getGitHubToken();
    const config = await loadConfig();
    
    // Initialize services
    const fetcher = createIssueFetcher({ token, logger, dataPath: '.data' });
    const ai = createAIWrapper({ config: config.azure, logger });
    const octokit = new Octokit({ auth: token });
    
    // Load the issue
    logger.info(`Loading issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    const issue = await fetcher.fetchIssue(issueRef, false);
    
    if (!issue) {
      throw new Error(`Could not load issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    }
    
    logger.info(`Curating issue: "${issue.title}"`);
    
    // Get repository labels and milestones
    const [labelsResponse, milestonesResponse] = await Promise.all([
      octokit.rest.issues.listLabelsForRepo({
        owner: issueRef.owner,
        repo: issueRef.repo
      }),
      octokit.rest.issues.listMilestones({
        owner: issueRef.owner,
        repo: issueRef.repo,
        state: 'all'
      })
    ]);
    
    const availableLabels = labelsResponse.data.map(label => label.name);
    const availableMilestones = milestonesResponse.data.map(milestone => milestone.title);
    
    // Load policy
    const policyContent = await fs.readFile('POLICY.md', 'utf-8');
    
    // Create issue text for analysis
    let issueText = `Title: ${issue.title}\\n\\n`;
    if (issue.body) {
      issueText += `Body: ${truncateText(issue.body, 4000)}\\n\\n`;
    }
    
    // Add relevant comments
    const relevantComments = issue.comments_data
      .slice(0, 5) // First 5 comments
      .map(comment => `Comment by ${comment.user.login}: ${truncateText(comment.body, 500)}`)
      .join('\\n\\n');
    
    if (relevantComments) {
      issueText += `Recent comments: ${relevantComments}\\n\\n`;
    }
    
    // Add current labels and assignees
    const currentLabels = issue.labels.map(label => label.name).join(', ');
    const currentAssignees = issue.assignees.map(assignee => assignee.login).join(', ');
    
    issueText += `Current labels: ${currentLabels || 'none'}\\n`;
    issueText += `Current assignees: ${currentAssignees || 'none'}\\n`;
    issueText += `State: ${issue.state}\\n`;
    issueText += `Created: ${issue.created_at}\\n`;
    issueText += `Updated: ${issue.updated_at}\\n`;
    
    // Construct AI prompt
    const curationPrompt = `You are an expert GitHub issue curator. Based on the repository policy and issue content, suggest actions to properly categorize and manage this issue.

REPOSITORY POLICY:
${policyContent}

AVAILABLE LABELS:
${availableLabels.join(', ')}

AVAILABLE MILESTONES:
${availableMilestones.join(', ')}

ISSUE TO CURATE:
${issueText}

Analyze this issue and suggest appropriate curation actions. Consider:
1. Proper labeling based on the issue content and policy
2. Whether the issue should be closed (duplicate, invalid, etc.)
3. Any comments that should be added to help the user

Respond with JSON in this format:
{
  "actions": [
    {
      "kind": "add_label",
      "label": "Bug",
      "reasoning": "This describes a clear bug in the compiler"
    },
    {
      "kind": "comment", 
      "comment": "Thank you for reporting this issue...",
      "reasoning": "Provide feedback to the user"
    }
  ]
}

Valid action kinds: add_label, remove_label, close, comment
Only suggest labels that exist in the available labels list.
Provide clear reasoning for each action.`;
    
    logger.info('Requesting AI curation analysis...');
    
    const response = await ai.generateStructured(
      [{ role: 'user', content: curationPrompt }],
      CurationResponseSchema,
      { 
        model: 'gpt4',
        maxTokens: 2000,
        temperature: 0.1 
      }
    );
    
    logger.info(`AI suggested ${response.actions.length} actions`);
    
    // Create action file
    const actionFile: ActionFile = {
      issue_ref: {
        owner: issueRef.owner,
        repo: issueRef.repo,
        number: issueRef.number
      },
      actions: response.actions.map(action => ({
        kind: action.kind,
        label: action.label,
        comment: action.comment
      }))
    };
    
    // Validate action file
    const validatedActionFile = ActionFileSchema.parse(actionFile);
    
    // Save action file
    const actionFileName = `${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`;
    const actionFilePath = join('.working', 'actions', actionFileName);
    
    await fs.mkdir(join('.working', 'actions'), { recursive: true });
    
    const actionFileContent = `/* Proposed actions for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}
   Issue: "${issue.title}"
   URL: https://github.com/${issueRef.owner}/${issueRef.repo}/issues/${issueRef.number}
   
   AI Reasoning:
${response.actions.map(action => `   - ${action.kind}: ${action.reasoning}`).join('\\n')}
   */
${JSON.stringify(validatedActionFile, null, 2)}`;
    
    await fs.writeFile(actionFilePath, actionFileContent);
    
    // Create output summary
    const outputPath = join('.working', 'outputs', `curation-${issueRef.owner}-${issueRef.repo}-${issueRef.number}.md`);
    await fs.mkdir(join('.working', 'outputs'), { recursive: true });
    
    let output = `# Issue Curation: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}\\n\\n`;
    output += `**Issue Title:** ${issue.title}\\n\\n`;
    output += `**Analysis Date:** ${new Date().toISOString()}\\n\\n`;
    output += `**Current State:**\\n`;
    output += `- Labels: ${currentLabels || 'none'}\\n`;
    output += `- Assignees: ${currentAssignees || 'none'}\\n`;
    output += `- State: ${issue.state}\\n\\n`;
    
    output += `## Recommended Actions\\n\\n`;
    for (const action of response.actions) {
      output += `### ${action.kind}\\n`;
      if (action.label) output += `**Label:** ${action.label}\\n`;
      if (action.comment) output += `**Comment:** ${action.comment}\\n`;
      output += `**Reasoning:** ${action.reasoning}\\n\\n`;
    }
    
    output += `## Next Steps\\n\\n`;
    output += `1. Review the action file: \`${actionFilePath}\`\\n`;
    output += `2. If approved, execute with: \`exec-action.js ${issueRefStr}\`\\n\\n`;
    
    await fs.writeFile(outputPath, output);
    
    logger.info(`Issue curation completed`);
    logger.info(`Actions suggested: ${response.actions.length}`);
    logger.info(`Action file: ${actionFilePath}`);
    logger.info(`Analysis: ${outputPath}`);
    
    // Output summary to console
    console.log('\\n=== ISSUE CURATION ANALYSIS ===');
    console.log(`Issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    console.log(`Title: ${issue.title}`);
    console.log(`Actions suggested: ${response.actions.length}`);
    for (const action of response.actions) {
      console.log(`- ${action.kind}${action.label ? ` (${action.label})` : ''}: ${action.reasoning}`);
    }
    console.log(`\\nAction file: ${actionFilePath}`);
    console.log(`Execute with: exec-action.js ${issueRefStr}`);
    
  } catch (error) {
    logger.error(`Failed to curate issue: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});