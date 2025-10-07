#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { 
  parseIssueRef, 
  createConsoleLogger, 
  getGitHubAuthToken, 
  createAuthenticatedOctokit,
  ensureDirectoryExists,
} from '../lib/utils.js';
import { createIssueFetcher } from '../lib/issue-fetcher.js';
import { createTimelineFetcher } from '../lib/timeline-fetcher.js';
import { createNewspaperGenerator } from '../lib/newspaper-generator.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, type IssueRef, type GitHubIssue } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: make-news <owner/repo>');
      console.error('Example: make-news Microsoft/TypeScript');
      process.exit(1);
    }

    const repoInput = args[0]!;
    const [owner, repo] = repoInput.split('/');
    
    if (!owner || !repo) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }
    
    logger.info(`Generating newspaper reports for: ${owner}/${repo}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create authenticated Octokit client
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    
    // Create necessary utilities
    const issueFetcher = createIssueFetcher(octokit, config, logger, authToken);
    const timelineFetcher = createTimelineFetcher(octokit, logger);
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);
    const newspaperGenerator = createNewspaperGenerator(ai, logger);

    // Calculate date range: last 7 days starting yesterday
    // Each "day" is 8 AM Seattle time to 8 AM Seattle time next day
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Get Seattle timezone offset (PST is UTC-8, PDT is UTC-7)
    // For simplicity, we'll use UTC-8 (PST) consistently
    const seattleOffset = -8 * 60; // minutes
    
    const reports: Array<{ date: Date; report: string }> = [];
    
    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
      const reportDate = new Date(now);
      reportDate.setDate(reportDate.getDate() - daysAgo);
      
      // Calculate start and end times (8 AM Seattle time)
      const startTime = getSeattleTime(reportDate, 8, 0, 0);
      const endTime = new Date(startTime);
      endTime.setDate(endTime.getDate() + 1);
      
      logger.info(`Processing day ${daysAgo}/7: ${reportDate.toISOString().split('T')[0]}`);
      logger.info(`  Time window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
      
      // Find all issues modified during or after this time period
      const dataDir = `.data/${owner.toLowerCase()}/${repo.toLowerCase()}`;
      let issueFiles: string[] = [];
      
      try {
        const files = await readdir(dataDir);
        issueFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.embeddings.json')).map(f => join(dataDir, f));
      } catch {
        logger.warn(`No issue data found in ${dataDir}. Run fetch-issues first.`);
        continue;
      }
      
      // Load and filter issues
      const relevantIssues: Array<{ ref: IssueRef; issue: GitHubIssue; timeline: Array<{ created_at: string; event: string }> }> = [];
      
      for (const issueFile of issueFiles) {
        try {
          const issueContent = await readFile(issueFile, 'utf-8');
          const issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
          
          // Check if issue was updated during or after our time window
          const updatedAt = new Date(issue.updated_at);
          if (updatedAt >= startTime) {
            const issueNumber = parseInt(issueFile.split('/').pop()!.replace('.json', ''), 10);
            const ref: IssueRef = { owner, repo, number: issueNumber };
            
            // Fetch timeline for this issue
            try {
              const timeline = await timelineFetcher.fetchTimeline(ref);
              relevantIssues.push({ ref, issue, timeline });
            } catch (error) {
              logger.warn(`Failed to fetch timeline for ${owner}/${repo}#${issueNumber}: ${error}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to process issue file ${issueFile}: ${error}`);
        }
      }
      
      logger.info(`  Found ${relevantIssues.length} relevant issues`);
      
      if (relevantIssues.length === 0) {
        logger.info(`  No activity to report for this day`);
        continue;
      }
      
      // Generate report for this day
      const report = await newspaperGenerator.generateDailyReport(
        reportDate,
        relevantIssues,
        startTime,
        endTime
      );
      
      reports.push({ date: reportDate, report });
    }
    
    // Write reports to files
    const reportsDir = '.reports';
    ensureDirectoryExists(join(reportsDir, 'dummy'));
    
    for (const { date, report } of reports) {
      const dateStr = date.toISOString().split('T')[0];
      const filename = `${dateStr}.md`;
      const filepath = join(reportsDir, filename);
      
      await writeFile(filepath, report);
      logger.info(`Wrote report to ${filepath}`);
    }
    
    logger.info(`Generated ${reports.length} newspaper reports`);

  } catch (error) {
    logger.error(`Failed to generate newspaper reports: ${error}`);
    process.exit(1);
  }
}

function getSeattleTime(date: Date, hour: number, minute: number, second: number): Date {
  // Create a date in Seattle timezone (UTC-8)
  // This is a simplified implementation that doesn't account for DST
  const utcDate = new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour + 8, // Convert Seattle time to UTC
    minute,
    second
  ));
  
  return utcDate;
}

main().catch(console.error);
