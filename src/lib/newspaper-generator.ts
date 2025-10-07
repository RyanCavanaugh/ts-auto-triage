import type { IssueRef, GitHubIssue, TimelineEvent, CommentSummary } from './schemas.js';
import { CommentSummarySchema } from './schemas.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import { loadPrompt } from './prompts.js';
import { stripMarkdown } from './utils.js';

export interface NewspaperGenerator {
  generateDailyReport(
    date: Date,
    issues: Array<{ ref: IssueRef; issue: GitHubIssue }>,
    startTime: Date,
    endTime: Date
  ): Promise<string>;
}

interface ActionItem {
  category: 'moderation' | 'response';
  description: string;
  issueRef: IssueRef;
  issueNumber: number;
  issueUrl: string;
}

export function createNewspaperGenerator(
  ai: AIWrapper,
  logger: Logger
): NewspaperGenerator {
  return {
    async generateDailyReport(
      date: Date,
      issues: Array<{ ref: IssueRef; issue: GitHubIssue }>,
      startTime: Date,
      endTime: Date
    ): Promise<string> {
      logger.info(`Generating newspaper report for ${date.toISOString().split('T')[0]}`);
      
      // Filter issues that have activity in the time window
      const uniqueUsers = new Set<string>();
      const uniqueIssues = new Set<string>();
      const issuesWithActivity: Array<{ ref: IssueRef; issue: GitHubIssue }> = [];
      
      for (const { ref, issue } of issues) {
        const issueKey = `${ref.owner}/${ref.repo}#${ref.number}`;
        
        // Check if issue was created in window
        const createdAt = new Date(issue.created_at);
        let hasActivity = createdAt >= startTime && createdAt < endTime;
        
        // Check if any comments were created in window
        for (const comment of issue.comments) {
          const commentDate = new Date(comment.created_at);
          if (commentDate >= startTime && commentDate < endTime) {
            hasActivity = true;
            uniqueUsers.add(comment.user.login);
          }
        }
        
        // Check if issue was closed in window
        if (issue.closed_at) {
          const closedAt = new Date(issue.closed_at);
          if (closedAt >= startTime && closedAt < endTime) {
            hasActivity = true;
          }
        }
        
        if (hasActivity) {
          issuesWithActivity.push({ ref, issue });
          uniqueIssues.add(issueKey);
          if (createdAt >= startTime && createdAt < endTime) {
            uniqueUsers.add(issue.user.login);
          }
        }
      }
      
      logger.info(`Found ${issuesWithActivity.length} issues with activity in time window`);
      logger.info(`${uniqueUsers.size} unique users, ${uniqueIssues.size} unique issues`);
      
      // Generate action items and summaries
      const actionItems: ActionItem[] = [];
      const issueSummaries: string[] = [];
      
      // Process each issue
      for (const { ref, issue } of issuesWithActivity) {
        const summary = await buildIssueSummary(
          ref,
          issue,
          date,
          startTime,
          endTime,
          ai,
          logger
        );
        
        issueSummaries.push(summary.text);
        actionItems.push(...summary.actions);
      }
      
      // Build the markdown report
      const report = buildMarkdownReport(
        date,
        uniqueUsers.size,
        uniqueIssues.size,
        actionItems,
        issueSummaries
      );
      
      return report;
    },
  };
}

async function buildIssueSummary(
  issueRef: IssueRef,
  issue: GitHubIssue,
  reportDate: Date,
  startTime: Date,
  endTime: Date,
  ai: AIWrapper,
  logger: Logger
): Promise<{ text: string; actions: ActionItem[] }> {
  const issueUrl = `https://github.com/${issueRef.owner}/${issueRef.repo}/${issue.is_pull_request ? 'pull' : 'issues'}/${issueRef.number}`;
  const issueType = issue.is_pull_request ? 'Pull Request' : 'Issue';
  
  let markdown = `### [${issueType} ${issueRef.owner}/${issueRef.repo}#${issueRef.number}](${issueUrl})\n\n`;
  markdown += `**${issue.title}**\n\n`;
  
  const actions: ActionItem[] = [];
  
  // Collect all events (issue creation + comments + state changes)
  interface Event {
    date: Date;
    type: 'created' | 'commented' | 'closed' | 'reopened';
    actor: string;
    body?: string;
    author_association?: string;
    comment_id?: number;
  }
  
  const allEvents: Event[] = [];
  
  // Add issue creation
  allEvents.push({
    date: new Date(issue.created_at),
    type: 'created',
    actor: issue.user.login,
  });
  
  // Add comments
  for (const comment of issue.comments) {
    allEvents.push({
      date: new Date(comment.created_at),
      type: 'commented',
      actor: comment.user.login,
      body: comment.body,
      author_association: comment.author_association,
      comment_id: comment.id,
    });
  }
  
  // Add closed event if applicable
  if (issue.closed_at) {
    allEvents.push({
      date: new Date(issue.closed_at),
      type: issue.state === 'closed' ? 'closed' : 'reopened',
      actor: 'unknown', // We don't have this info in the cached data
    });
  }
  
  // Sort by date
  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Find events before the window (last 3)
  const eventsBeforeWindow = allEvents.filter(e => e.date < startTime).slice(-3);
  const eventsInWindow = allEvents.filter(e => e.date >= startTime && e.date < endTime);
  
  // Format prior events
  for (const event of eventsBeforeWindow) {
    const timeDesc = getTimeDescription(event.date, reportDate);
    const formatted = await formatEvent(event, issueUrl, timeDesc, issueRef, actions, ai, logger, false);
    if (formatted) {
      markdown += ` * (${timeDesc}) ${formatted}\n`;
    }
  }
  
  // Format events in window
  for (const event of eventsInWindow) {
    const timeDesc = getTimeDescription(event.date, reportDate);
    const formatted = await formatEvent(event, issueUrl, timeDesc, issueRef, actions, ai, logger, true);
    if (formatted) {
      markdown += ` * (${timeDesc}) ${formatted}\n`;
    }
  }
  
  return { text: markdown, actions };
}

async function formatEvent(
  event: { date: Date; type: string; actor: string; body?: string; author_association?: string; comment_id?: number },
  issueUrl: string,
  timeDesc: string,
  issueRef: IssueRef,
  actions: ActionItem[],
  ai: AIWrapper,
  logger: Logger,
  checkForActions: boolean
): Promise<string | null> {
  const actorLink = `[@${event.actor}](https://github.com/${event.actor})`;
  
  if (event.type === 'created') {
    return `created by ${actorLink}`;
  } else if (event.type === 'closed') {
    return `${actorLink} closed the issue`;
  } else if (event.type === 'reopened') {
    return `${actorLink} reopened the issue`;
  } else if (event.type === 'commented' && event.body) {
    const authorAssociation = event.author_association ?? 'NONE';
    const isContributorOrOwner = authorAssociation === 'CONTRIBUTOR' || authorAssociation === 'OWNER' || authorAssociation === 'MEMBER';
    const commentUrl = event.comment_id ? `${issueUrl}#issuecomment-${event.comment_id}` : issueUrl;
    
    if (event.body.length > 200 || event.body.includes('\n')) {
      // Use AI to summarize long comments
      try {
        const summary = await summarizeComment(event.body, event.actor, ai, logger);
        
        if (checkForActions && summary.action_needed && !isContributorOrOwner) {
          actions.push({
            category: summary.action_needed.category,
            description: summary.action_needed.reason,
            issueRef,
            issueNumber: issueRef.number,
            issueUrl: commentUrl,
          });
        }
        
        return `[${actorLink} ${summary.summary}](${commentUrl})`;
      } catch (error) {
        logger.warn(`Failed to summarize comment: ${error}`);
        return `[${actorLink} commented](${commentUrl})`;
      }
    } else {
      // Short comment - include verbatim
      if (checkForActions && !isContributorOrOwner) {
        try {
          const summary = await summarizeComment(event.body, event.actor, ai, logger);
          if (summary.action_needed) {
            actions.push({
              category: summary.action_needed.category,
              description: summary.action_needed.reason,
              issueRef,
              issueNumber: issueRef.number,
              issueUrl: commentUrl,
            });
          }
        } catch (error) {
          logger.warn(`Failed to check comment for action: ${error}`);
        }
      }
      
      const strippedBody = stripMarkdown(event.body);
      return `${actorLink} said ["${strippedBody}"](${commentUrl})`;
    }
  }
  
  return null;
}

async function summarizeComment(
  body: string,
  actor: string,
  ai: AIWrapper,
  logger: Logger
): Promise<CommentSummary> {
  const systemPrompt = await loadPrompt('summarize-comment-system');
  const userPrompt = await loadPrompt('summarize-comment-user', {
    actor,
    body: body.substring(0, 2000), // Truncate very long comments
  });
  
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
  
  const response = await ai.structuredCompletion<CommentSummary>(
    messages,
    CommentSummarySchema,
    {
      maxTokens: 300,
      context: `Summarize comment by ${actor}`,
    }
  );
  
  return response;
}

function getTimeDescription(eventDate: Date, reportDate: Date): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const reportDateOnly = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());
  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const daysDiff = Math.floor((reportDateOnly.getTime() - eventDateOnly.getTime()) / msPerDay);
  
  // Handle future dates (negative daysDiff) - treat as today
  if (daysDiff < 0) {
    return 'today';
  }
  
  if (daysDiff === 0) {
    return 'today';
  } else if (daysDiff === 1) {
    return 'yesterday';
  } else if (daysDiff === 7) {
    return '1 week ago';
  } else if (daysDiff === 14) {
    return '2 weeks ago';
  } else if (daysDiff === 21) {
    return '3 weeks ago';
  } else if (daysDiff >= 28 && daysDiff < 35) {
    return '1 month ago';
  } else if (daysDiff < 7) {
    return `${daysDiff} days ago`;
  } else if (daysDiff < 14) {
    return '1 week ago';
  } else if (daysDiff < 21) {
    return '2 weeks ago';
  } else if (daysDiff < 28) {
    return '3 weeks ago';
  } else {
    const weeks = Math.floor(daysDiff / 7);
    return `${weeks} weeks ago`;
  }
}

function buildMarkdownReport(
  date: Date,
  userCount: number,
  issueCount: number,
  actionItems: ActionItem[],
  issueSummaries: string[]
): string {
  const dateStr = date.toISOString().split('T')[0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = dayNames[date.getDay()];
  const monthName = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  // Format date as "Tuesday, October 7th, 2025"
  const daySuffix = getDaySuffix(day);
  const fullDateStr = `${dayName}, ${monthName} ${day}${daySuffix}, ${year}`;
  
  let markdown = `# Report for ${dateStr} (${fullDateStr})\n\n`;
  markdown += `${userCount} different users commented on ${issueCount} different issues.\n\n`;
  
  // Recommended Actions
  if (actionItems.length > 0) {
    markdown += `## Recommended Actions\n\n`;
    
    const moderationItems = actionItems.filter(a => a.category === 'moderation');
    const responseItems = actionItems.filter(a => a.category === 'response');
    
    if (moderationItems.length > 0) {
      markdown += ` * Moderation\n`;
      for (const item of moderationItems) {
        const issueLink = `[${item.issueRef.owner}/${item.issueRef.repo}#${item.issueNumber}](${item.issueUrl})`;
        markdown += `    * ${item.description} in ${issueLink}\n`;
      }
    }
    
    if (responseItems.length > 0) {
      markdown += ` * Response Recommended\n`;
      for (const item of responseItems) {
        const issueLink = `[${item.issueRef.owner}/${item.issueRef.repo}#${item.issueNumber}](${item.issueUrl})`;
        markdown += `    * ${item.description} in ${issueLink}\n`;
      }
    }
    
    markdown += `\n`;
  }
  
  // Activity Summary
  markdown += `## Activity Summary\n\n`;
  
  for (const summary of issueSummaries) {
    markdown += summary + '\n';
  }
  
  return markdown;
}

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return 'th';
  }
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
