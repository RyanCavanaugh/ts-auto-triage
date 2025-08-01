#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import { createCLIOptions, getGitHubToken, parseCliArgs, handleError } from './utils.js';
import { actionFileSchema } from './actions.js';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const options = createCLIOptions();
  const { logger, workingDir } = options;

  try {
    const args = process.argv.slice(2);
    const { issueRef } = parseCliArgs(args);

    if (!issueRef) {
      throw new Error('Issue reference required. Usage: exec-action Microsoft/TypeScript#9998');
    }

    const actionFilePath = path.join(
      workingDir, 
      'actions', 
      `${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`
    );

    logger.info(`Looking for action file: ${actionFilePath}`);

    // Check if action file exists
    try {
      await fs.access(actionFilePath);
    } catch {
      logger.info(`No action file found for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
      return;
    }

    // Read and parse action file
    const content = await fs.readFile(actionFilePath, 'utf-8');
    // Simple JSONC parser - remove comments
    const cleanJson = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const actionData = JSON.parse(cleanJson);
    const actionFile = actionFileSchema.parse(actionData);

    logger.info(`Found ${actionFile.actions.length} actions to execute`);

    // Initialize GitHub client
    const githubToken = await getGitHubToken();
    const octokit = new Octokit({ auth: githubToken });

    // Get current issue state
    const { data: issue } = await octokit.rest.issues.get({
      owner: issueRef.owner,
      repo: issueRef.repo,
      issue_number: issueRef.number
    });

    logger.info(`Current issue state - Labels: [${issue.labels.map(l => typeof l === 'string' ? l : l.name).join(', ')}], State: ${issue.state}`);

    // Execute each action
    for (const action of actionFile.actions) {
      try {
        switch (action.kind) {
          case 'add_label':
            // Check if label already exists
            const hasLabel = issue.labels.some(l => 
              (typeof l === 'string' ? l : l.name) === action.label
            );
            
            if (hasLabel) {
              logger.info(`Label "${action.label}" already exists, skipping`);
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
            try {
              await octokit.rest.issues.removeLabel({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                name: action.label
              });
              logger.info(`Removed label: ${action.label}`);
            } catch (error) {
              if ((error as any).status === 404) {
                logger.info(`Label "${action.label}" not found, skipping`);
              } else {
                throw error;
              }
            }
            break;

          case 'close_issue':
            if (issue.state === 'closed') {
              logger.info('Issue already closed, skipping');
            } else {
              const updateData: any = {
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                state: 'closed'
              };
              
              if (action.reason) {
                updateData.state_reason = action.reason;
              }
              
              await octokit.rest.issues.update(updateData);
              logger.info(`Closed issue with reason: ${action.reason || 'completed'}`);
            }
            break;

          case 'reopen_issue':
            if (issue.state === 'open') {
              logger.info('Issue already open, skipping');
            } else {
              await octokit.rest.issues.update({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                state: 'open'
              });
              logger.info('Reopened issue');
            }
            break;

          case 'add_comment':
            // Check if comment already exists (simple deduplication)
            const { data: comments } = await octokit.rest.issues.listComments({
              owner: issueRef.owner,
              repo: issueRef.repo,
              issue_number: issueRef.number
            });

            const hasComment = comments.some(c => c.body?.includes(action.body.substring(0, 100)));
            
            if (hasComment) {
              logger.info('Similar comment already exists, skipping');
            } else {
              await octokit.rest.issues.createComment({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                body: action.body
              });
              logger.info('Added comment');
            }
            break;

          case 'assign_user':
            if (issue.assignees?.some(a => a.login === action.username)) {
              logger.info(`User ${action.username} already assigned, skipping`);
            } else {
              await octokit.rest.issues.addAssignees({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                assignees: [action.username]
              });
              logger.info(`Assigned user: ${action.username}`);
            }
            break;

          case 'set_milestone':
            // Get milestone number by name
            const { data: milestones } = await octokit.rest.issues.listMilestones({
              owner: issueRef.owner,
              repo: issueRef.repo
            });

            const milestone = milestones.find(m => m.title === action.milestone);
            if (!milestone) {
              logger.warn(`Milestone "${action.milestone}" not found, skipping`);
            } else if (issue.milestone?.title === action.milestone) {
              logger.info(`Milestone "${action.milestone}" already set, skipping`);
            } else {
              await octokit.rest.issues.update({
                owner: issueRef.owner,
                repo: issueRef.repo,
                issue_number: issueRef.number,
                milestone: milestone.number
              });
              logger.info(`Set milestone: ${action.milestone}`);
            }
            break;

          default:
            logger.warn(`Unknown action kind: ${(action as any).kind}`);
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        logger.error(`Failed to execute action ${action.kind}: ${(error as Error).message}`);
      }
    }

    logger.info('Action execution completed');

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();