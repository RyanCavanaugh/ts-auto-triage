#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { Octokit } from '@octokit/rest';
import { parseIssueRef } from '../../packages/issue-fetcher/src/index.js';
import { ActionFileSchema, type ActionFile } from '../../packages/issue-fetcher/src/schemas.js';
import { getGitHubToken, createLogger } from '../../packages/utils/src/index.js';

const logger = createLogger('exec-action');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: exec-action.js <issue-ref>');
    console.error('Example: exec-action.js Microsoft/TypeScript#9998');
    console.error('         exec-action.js https://github.com/Microsoft/TypeScript/issues/9998');
    process.exit(1);
  }
  
  try {
    const issueRefStr = args[0];
    const issueRef = parseIssueRef(issueRefStr);
    const token = await getGitHubToken();
    
    // Create GitHub client
    const octokit = new Octokit({ auth: token });
    
    // Find the action file
    const actionFileName = `${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`;
    const actionFilePath = join('.working', 'actions', actionFileName);
    
    logger.info(`Looking for action file: ${actionFilePath}`);
    
    // Check if action file exists
    try {
      await fs.access(actionFilePath);
    } catch {
      logger.error(`No action file found for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
      logger.info(`Expected file: ${actionFilePath}`);
      process.exit(1);
    }
    
    // Read and parse action file
    const actionContent = await fs.readFile(actionFilePath, 'utf-8');
    
    // Simple JSONC parsing (remove comments)
    const jsonContent = actionContent
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/\/\/.*$/gm, ''); // Remove line comments
    
    const actionFile: ActionFile = ActionFileSchema.parse(JSON.parse(jsonContent));
    
    logger.info(`Loaded action file with ${actionFile.actions.length} actions`);
    
    // Verify the issue reference matches
    if (
      actionFile.issue_ref.owner.toLowerCase() !== issueRef.owner.toLowerCase() ||
      actionFile.issue_ref.repo.toLowerCase() !== issueRef.repo.toLowerCase() ||
      actionFile.issue_ref.number !== issueRef.number
    ) {
      throw new Error('Action file issue reference does not match the provided issue reference');
    }
    
    // Get current issue state
    const currentIssue = await octokit.rest.issues.get({
      owner: issueRef.owner,
      repo: issueRef.repo,
      issue_number: issueRef.number
    });
    
    // Execute each action
    for (const action of actionFile.actions) {
      logger.info(`Executing action: ${action.kind}`);
      
      try {
        switch (action.kind) {
          case 'add_label':
            if (!action.label) {
              throw new Error('add_label action requires label field');
            }
            
            // Check if label already exists on issue
            const hasLabel = currentIssue.data.labels.some(label => 
              typeof label === 'string' 
                ? label === action.label
                : label.name === action.label
            );
            
            if (hasLabel) {
              logger.info(`Label "${action.label}" already exists on issue, skipping`);
            } else {
              await octokit.rest.issues.addLabels({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                labels: [action.label]
              });
              logger.info(`Added label: ${action.label}`);
            }
            break;
            
          case 'remove_label':
            if (!action.label) {
              throw new Error('remove_label action requires label field');
            }
            
            // Check if label exists on issue
            const labelExists = currentIssue.data.labels.some(label => 
              typeof label === 'string' 
                ? label === action.label
                : label.name === action.label
            );
            
            if (!labelExists) {
              logger.info(`Label "${action.label}" does not exist on issue, skipping`);
            } else {
              await octokit.rest.issues.removeLabel({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                name: action.label
              });
              logger.info(`Removed label: ${action.label}`);
            }
            break;
            
          case 'close':
            if (currentIssue.data.state === 'closed') {
              logger.info('Issue is already closed, skipping');
            } else {
              await octokit.rest.issues.update({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                state: 'closed'
              });
              logger.info('Closed issue');
            }
            break;
            
          case 'comment':
            if (!action.comment) {
              throw new Error('comment action requires comment field');
            }
            
            // Check if identical comment already exists
            const comments = await octokit.rest.issues.listComments({
              owner: issueRef.owner,
              repo: issueRef.repo,
              issue_number: issueRef.number
            });
            
            const commentExists = comments.data.some(comment => 
              comment.body === action.comment
            );
            
            if (commentExists) {
              logger.info('Identical comment already exists, skipping');
            } else {
              await octokit.rest.issues.createComment({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                body: action.comment
              });
              logger.info('Added comment');
            }
            break;
            
          case 'assign':
            if (!action.assignee) {
              throw new Error('assign action requires assignee field');
            }
            
            // Check if user is already assigned
            const isAssigned = currentIssue.data.assignees?.some(assignee => 
              assignee?.login === action.assignee
            );
            
            if (isAssigned) {
              logger.info(`User ${action.assignee} is already assigned, skipping`);
            } else {
              await octokit.rest.issues.addAssignees({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                assignees: [action.assignee]
              });
              logger.info(`Assigned to: ${action.assignee}`);
            }
            break;
            
          case 'unassign':
            if (!action.assignee) {
              throw new Error('unassign action requires assignee field');
            }
            
            // Check if user is assigned
            const isCurrentlyAssigned = currentIssue.data.assignees?.some(assignee => 
              assignee?.login === action.assignee
            );
            
            if (!isCurrentlyAssigned) {
              logger.info(`User ${action.assignee} is not assigned, skipping`);
            } else {
              await octokit.rest.issues.removeAssignees({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                assignees: [action.assignee]
              });
              logger.info(`Unassigned: ${action.assignee}`);
            }
            break;
            
          default:
            logger.warn(`Unknown action kind: ${(action as any).kind}`);
        }
        
        // Small delay between actions to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        logger.error(`Failed to execute action ${action.kind}: ${error}`);
        throw error;
      }
    }
    
    logger.info(`Successfully executed ${actionFile.actions.length} actions for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    
    // Move action file to completed directory
    const completedDir = join('.working', 'actions', 'completed');
    await fs.mkdir(completedDir, { recursive: true });
    
    const completedPath = join(completedDir, actionFileName);
    await fs.rename(actionFilePath, completedPath);
    
    logger.info(`Moved action file to: ${completedPath}`);
    
  } catch (error) {
    logger.error(`Failed to execute actions: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});