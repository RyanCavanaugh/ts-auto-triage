#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, createActionFilePath, getGitHubAuthToken, createAuthenticatedOctokit } from '../lib/utils.js';
import { ActionFileSchema, ConfigSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: exec-action <issue-ref>');
      console.error('Example: exec-action Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Executing actions for issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Read the action file
    const actionFilePath = createActionFilePath(issueRef);
    let actionFileContent: string;
    
    try {
      actionFileContent = await readFile(actionFilePath, 'utf-8');
    } catch (error) {
      logger.error(`No action file found at: ${actionFilePath}`);
      logger.info('Use curate-issue to generate an action file first');
      process.exit(1);
    }

    // Parse the action file (handle JSONC comments)
    const actionData = ActionFileSchema.parse(jsonc.parse(actionFileContent));
    
    if (actionData.actions.length === 0) {
      logger.info('No actions to execute');
      return;
    }

    // Create authenticated Octokit client
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit(authToken);

    // Get current issue state to check for idempotency
    const currentIssue = await octokit.rest.issues.get({
      owner: issueRef.owner,
      repo: issueRef.repo,
      issue_number: issueRef.number,
    });

    const currentLabels = new Set(currentIssue.data.labels.map(label => 
      typeof label === 'string' ? label : label.name
    ));

    // Execute each action
    for (const action of actionData.actions) {
      logger.info(`Executing action: ${action.kind}`);
      
      try {
        switch (action.kind) {
          case 'add_label':
            if (currentLabels.has(action.label)) {
              logger.info(`Label "${action.label}" already exists, skipping`);
            } else {
              await octokit.rest.issues.addLabels({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                labels: [action.label],
              });
              logger.info(`Added label: ${action.label}`);
              currentLabels.add(action.label);
            }
            break;
            
          case 'remove_label':
            if (!currentLabels.has(action.label)) {
              logger.info(`Label "${action.label}" not present, skipping`);
            } else {
              await octokit.rest.issues.removeLabel({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                name: action.label,
              });
              logger.info(`Removed label: ${action.label}`);
              currentLabels.delete(action.label);
            }
            break;
            
          case 'close_issue':
            if (currentIssue.data.state === 'closed') {
              logger.info('Issue already closed, skipping');
            } else {
              await octokit.rest.issues.update({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                state: 'closed',
                state_reason: action.reason,
              });
              logger.info(`Closed issue with reason: ${action.reason}`);
            }
            break;
            
          case 'add_comment':
            // Check if this exact comment already exists
            const comments = await octokit.rest.issues.listComments({
              owner: issueRef.owner,
              repo: issueRef.repo,
              issue_number: issueRef.number,
            });
            
            const commentExists = comments.data.some(comment => 
              comment.body === action.body
            );
            
            if (commentExists) {
              logger.info('Comment already exists, skipping');
            } else {
              await octokit.rest.issues.createComment({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                body: action.body,
              });
              logger.info('Added comment');
            }
            break;
            
          case 'set_milestone':
            // Get milestones to find the ID
            const milestones = await octokit.rest.issues.listMilestones({
              owner: issueRef.owner,
              repo: issueRef.repo,
            });
            
            const milestone = milestones.data.find(m => m.title === action.milestone);
            if (!milestone) {
              logger.error(`Milestone "${action.milestone}" not found`);
              continue;
            }
            
            if (currentIssue.data.milestone?.title === action.milestone) {
              logger.info(`Milestone "${action.milestone}" already set, skipping`);
            } else {
              await octokit.rest.issues.update({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                milestone: milestone.number,
              });
              logger.info(`Set milestone: ${action.milestone}`);
            }
            break;
            
          case 'assign_user':
            const currentAssignees = currentIssue.data.assignees?.map(a => a?.login) ?? [];
            if (currentAssignees.includes(action.user)) {
              logger.info(`User "${action.user}" already assigned, skipping`);
            } else {
              await octokit.rest.issues.addAssignees({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                assignees: [action.user],
              });
              logger.info(`Assigned user: ${action.user}`);
            }
            break;
        }
        
        // Small delay between actions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        logger.error(`Failed to execute action ${action.kind}: ${error}`);
      }
    }
    
    logger.info(`Completed executing ${actionData.actions.length} actions`);

  } catch (error) {
    logger.error(`Failed to execute actions: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);