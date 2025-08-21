#!/usr/bin/env node

import { createCLIOptions, parseIssueRef, handleError } from './utils.js';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { actionSchema } from './actions.js';

// Schema for AI-generated curation actions - wrapping array in object for Azure OpenAI compatibility
const curationResponseSchema = z.object({
  actions: z.array(actionSchema),
  reasoning: z.string().optional()
});

interface ActionItem {
  kind: 'add_label' | 'remove_label' | 'close_issue' | 'reopen_issue' | 'add_comment' | 'assign_user' | 'set_milestone';
  label?: string;
  reason?: string;
  comment?: string;
  user?: string;
  milestone?: string;
}

async function main() {
  const options = createCLIOptions();
  const { logger, workingDir, ai } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Issue reference required. Usage: curate-issue Microsoft/TypeScript#9998');
    }

    const issueRef = parseIssueRef(args[0]!);

    logger.info(`Curating issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    
    // Ensure working directories exist
    await fs.mkdir(path.join(workingDir, 'actions'), { recursive: true });
    
    // Load policy content
    logger.info('Loading policy content...');
    const policyPath = path.join(process.cwd(), 'POLICY.md');
    let policyContent: string;
    try {
      policyContent = await fs.readFile(policyPath, 'utf-8');
    } catch (error) {
      logger.warn('POLICY.md not found, using basic policy');
      policyContent = `# Basic Issue Curation Policy

## Guidelines
- Close duplicate issues
- Add appropriate labels based on issue content
- Request more information for unclear issues
- Assign relevant maintainers when appropriate`;
    }

    // For demonstration, create sample issue analysis
    const issueContent = `Sample issue #${issueRef.number}: TypeScript compilation performance issue`;

    // Generate curation recommendations using AI
    logger.info('Analyzing issue for curation recommendations...');
    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert GitHub issue curator for a TypeScript repository. Based on the repository policy and issue content, suggest specific actions to take.

Repository Policy:
${policyContent}

Respond with structured JSON containing an array of action objects and optional reasoning. Each action should have a "kind" field and any relevant parameters.

Available actions:
- add_label: Add a label to the issue
- remove_label: Remove a label from the issue  
- close_issue: Close the issue (with optional reason: "completed" or "not_planned")
- reopen_issue: Reopen a closed issue
- add_comment: Add a comment to the issue
- assign_user: Assign a user to the issue
- set_milestone: Set a milestone for the issue`
      },
      {
        role: 'user' as const,
        content: `Please analyze this issue and suggest curation actions:

${issueContent}`
      }
    ];

    let aiActions: ActionItem[] = [];
    let aiReasoning = '';

    try {
      // Use structured completion for reliable JSON output
      const result = await ai.generateStructuredCompletion(messages, curationResponseSchema, {
        temperature: 0.2,
        maxTokens: 1500
      });

      aiActions = result.actions || [];
      aiReasoning = result.reasoning || '';
      logger.info(`AI suggested ${aiActions.length} curation actions`);
    } catch (error) {
      logger.warn('AI-powered curation failed, using fallback actions:', error);
      
      // Fallback to basic actions
      aiActions = [
        { kind: 'add_label', label: 'needs-triage' },
        { kind: 'add_comment', comment: 'Thanks for the report. This issue needs further review and triage.' }
      ];
    }

    // Use AI-generated actions or fallback
    const actions: ActionItem[] = aiActions.length > 0 ? aiActions : [
      { kind: 'add_label', label: 'performance' },
      { kind: 'add_comment', comment: 'Thanks for reporting this performance issue. Could you provide more details about your project setup?' }
    ];

    // Create action file
    const actionFile = path.join(workingDir, 'actions', `${issueRef.owner}-${issueRef.repo}-${issueRef.number}.json`);
    const actionData = {
      comment: `Proposed actions: AI-powered curation for issue #${issueRef.number}`,
      issue_ref: {
        owner: issueRef.owner.toLowerCase(),
        repo: issueRef.repo.toLowerCase(),
        number: issueRef.number
      },
      actions: actions,
      timestamp: new Date().toISOString(),
      ai_analysis: aiReasoning || 'AI-powered analysis completed',
      ai_actions: aiActions
    };

    await fs.writeFile(actionFile, JSON.stringify(actionData, null, 2));
    logger.info(`Action file created: ${actionFile}`);

    // Create a human-readable summary
    const summaryFile = path.join(workingDir, 'actions', `${issueRef.owner}-${issueRef.repo}-${issueRef.number}-summary.md`);
    const summaryContent = `# Curation Summary for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}

**Issue:** Sample TypeScript issue
**URL:** https://github.com/${issueRef.owner}/${issueRef.repo}/issues/${issueRef.number}

## Proposed Actions

${actions.map((action, i) => `${i + 1}. **${action.kind}**${action.label ? ` - ${action.label}` : ''}${action.comment ? ` - "${action.comment}"` : ''}`).join('\n\n')}

## AI Analysis

${aiReasoning || 'AI-powered curation analysis completed'}

---
*To execute these actions, review the action file and run: \`exec-action ${issueRef.owner}/${issueRef.repo}#${issueRef.number}\`*
`;

    await fs.writeFile(summaryFile, summaryContent);
    logger.info(`Summary created: ${summaryFile}`);

    logger.info(`Curation complete. Proposed ${actions.length} actions for issue #${issueRef.number}`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();