import type { IssueRef, GitHubIssue, TimelineEvent, CommentSummary } from './schemas.js';
import { CommentSummarySchema } from './schemas.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import { loadPrompt } from './prompts.js';

export interface NewspaperGenerator {
  generateDailyReport(
    date: Date,
    issues: Array<{ ref: IssueRef; issue: GitHubIssue; timeline: TimelineEvent[] }>,
    startTime: Date,
    endTime: Date
  ): Promise<string>;
}

interface EventWithContext {
  event: TimelineEvent;
  issueRef: IssueRef;
  issueTitle: string;
  isPullRequest: boolean;
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
      issues: Array<{ ref: IssueRef; issue: GitHubIssue; timeline: TimelineEvent[] }>,
      startTime: Date,
      endTime: Date
    ): Promise<string> {
      logger.info(`Generating newspaper report for ${date.toISOString().split('T')[0]}`);
      
      // Filter and collect events that happened in the time window
      const eventsInWindow: EventWithContext[] = [];
      const uniqueUsers = new Set<string>();
      const uniqueIssues = new Set<string>();
      
      for (const { ref, issue, timeline } of issues) {
        const issueKey = `${ref.owner}/${ref.repo}#${ref.number}`;
        
        for (const event of timeline) {
          const eventDate = new Date(event.created_at);
          
          if (eventDate >= startTime && eventDate < endTime) {
            eventsInWindow.push({
              event,
              issueRef: ref,
              issueTitle: issue.title,
              isPullRequest: issue.is_pull_request,
            });
            
            uniqueIssues.add(issueKey);
            
            // Track users
            if (event.actor?.login) {
              uniqueUsers.add(event.actor.login);
            }
            if (event.user?.login) {
              uniqueUsers.add(event.user.login);
            }
          }
        }
      }
      
      logger.info(`Found ${eventsInWindow.length} events in time window`);
      logger.info(`${uniqueUsers.size} unique users, ${uniqueIssues.size} unique issues`);
      
      // Generate action items and summaries
      const actionItems: ActionItem[] = [];
      const issueSummaries: string[] = [];
      
      // Group events by issue
      const eventsByIssue = new Map<string, EventWithContext[]>();
      for (const eventCtx of eventsInWindow) {
        const key = `${eventCtx.issueRef.owner}/${eventCtx.issueRef.repo}#${eventCtx.issueRef.number}`;
        if (!eventsByIssue.has(key)) {
          eventsByIssue.set(key, []);
        }
        eventsByIssue.get(key)!.push(eventCtx);
      }
      
      // Process each issue
      for (const [issueKey, events] of eventsByIssue) {
        const firstEvent = events[0]!;
        const { issueRef, issueTitle, isPullRequest } = firstEvent;
        const issue = issues.find(i => 
          i.ref.owner === issueRef.owner && 
          i.ref.repo === issueRef.repo && 
          i.ref.number === issueRef.number
        )?.issue;
        
        if (!issue) continue;
        
        // Get prior events (last 3 before time window)
        const allEventsForIssue = issues.find(i => 
          i.ref.owner === issueRef.owner && 
          i.ref.repo === issueRef.repo && 
          i.ref.number === issueRef.number
        )?.timeline ?? [];
        
        const priorEvents = allEventsForIssue
          .filter(e => new Date(e.created_at) < startTime)
          .slice(-3);
        
        // Build issue summary
        const summary = await buildIssueSummary(
          issueRef,
          issueTitle,
          isPullRequest,
          priorEvents,
          events,
          issue,
          date,
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
  issueTitle: string,
  isPullRequest: boolean,
  priorEvents: TimelineEvent[],
  currentEvents: EventWithContext[],
  issue: GitHubIssue,
  reportDate: Date,
  ai: AIWrapper,
  logger: Logger
): Promise<{ text: string; actions: ActionItem[] }> {
  const issueUrl = `https://github.com/${issueRef.owner}/${issueRef.repo}/${isPullRequest ? 'pull' : 'issues'}/${issueRef.number}`;
  const issueType = isPullRequest ? 'Pull Request' : 'Issue';
  
  let markdown = `### [${issueType} ${issueRef.owner}/${issueRef.repo}#${issueRef.number}](${issueUrl})\n\n`;
  
  const allEvents = [...priorEvents, ...currentEvents.map(e => e.event)];
  const actions: ActionItem[] = [];
  
  // Coalesce label events
  const labelChanges = new Map<string, { added: string[]; removed: string[] }>();
  const nonLabelEvents: TimelineEvent[] = [];
  
  for (const event of allEvents) {
    if (event.event === 'labeled' && event.label) {
      const date = new Date(event.created_at).toISOString().split('T')[0]!;
      if (!labelChanges.has(date)) {
        labelChanges.set(date, { added: [], removed: [] });
      }
      labelChanges.get(date)!.added.push(event.label.name);
    } else if (event.event === 'unlabeled' && event.label) {
      const date = new Date(event.created_at).toISOString().split('T')[0]!;
      if (!labelChanges.has(date)) {
        labelChanges.set(date, { added: [], removed: [] });
      }
      labelChanges.get(date)!.removed.push(event.label.name);
    } else {
      nonLabelEvents.push(event);
    }
  }
  
  // Format events
  for (const event of nonLabelEvents) {
    const eventDate = new Date(event.created_at);
    const timeDesc = getTimeDescription(eventDate, reportDate);
    const actor = event.actor?.login ?? event.user?.login ?? 'unknown';
    
    // Check if this is a comment that needs summarization
    if (event.event === 'commented' && event.body) {
      const authorAssociation = event.author_association ?? 'NONE';
      const isContributorOrOwner = authorAssociation === 'CONTRIBUTOR' || authorAssociation === 'OWNER' || authorAssociation === 'MEMBER';
      
      if (event.body.length > 200 || event.body.includes('\n')) {
        // Use AI to summarize long comments
        try {
          const summary = await summarizeComment(event.body, actor, ai, logger);
          markdown += ` * (${timeDesc}) [@${actor}](https://github.com/${actor}) ${summary.summary}\n`;
          
          if (summary.action_needed && !isContributorOrOwner) {
            actions.push({
              category: summary.action_needed.category,
              description: summary.action_needed.reason,
              issueRef,
              issueNumber: issueRef.number,
              issueUrl: event.html_url ?? issueUrl,
            });
          }
        } catch (error) {
          logger.warn(`Failed to summarize comment: ${error}`);
          markdown += ` * (${timeDesc}) [@${actor}](https://github.com/${actor}) commented\n`;
        }
      } else {
        // Short comment - include verbatim
        markdown += ` * (${timeDesc}) [@${actor}](https://github.com/${actor}) said "${event.body}"\n`;
        
        if (!isContributorOrOwner) {
          try {
            const summary = await summarizeComment(event.body, actor, ai, logger);
            if (summary.action_needed) {
              actions.push({
                category: summary.action_needed.category,
                description: summary.action_needed.reason,
                issueRef,
                issueNumber: issueRef.number,
                issueUrl: event.html_url ?? issueUrl,
              });
            }
          } catch (error) {
            logger.warn(`Failed to check comment for action: ${error}`);
          }
        }
      }
    } else {
      // Format other event types
      const eventDesc = formatEvent(event, actor, issueUrl);
      if (eventDesc) {
        markdown += ` * (${timeDesc}) ${eventDesc}\n`;
      }
    }
  }
  
  // Add coalesced label events
  for (const [date, changes] of labelChanges) {
    const parts: string[] = [];
    if (changes.added.length > 0) {
      parts.push(`added ${changes.added.map(l => `\`${l}\``).join(', ')}`);
    }
    if (changes.removed.length > 0) {
      parts.push(`removed ${changes.removed.map(l => `\`${l}\``).join(', ')}`);
    }
    if (parts.length > 0) {
      const labelDate = new Date(date);
      const timeDesc = getTimeDescription(labelDate, reportDate);
      markdown += ` * (${timeDesc}) labels ${parts.join(' and ')}\n`;
    }
  }
  
  return { text: markdown, actions };
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

function formatEvent(event: TimelineEvent, actor: string, issueUrl: string): string | null {
  const actorLink = `[@${actor}](https://github.com/${actor})`;
  
  switch (event.event) {
    case 'created':
      return `created by ${actorLink}`;
    case 'closed':
      return `${actorLink} closed the issue`;
    case 'reopened':
      return `${actorLink} reopened the issue`;
    case 'assigned':
      return `${actorLink} assigned to [@${event.assignee?.login ?? 'unknown'}](https://github.com/${event.assignee?.login ?? 'unknown'})`;
    case 'unassigned':
      return `${actorLink} unassigned [@${event.assignee?.login ?? 'unknown'}](https://github.com/${event.assignee?.login ?? 'unknown'})`;
    case 'milestoned':
      return `${actorLink} added to milestone "${event.milestone?.title ?? 'unknown'}"`;
    case 'demilestoned':
      return `${actorLink} removed from milestone "${event.milestone?.title ?? 'unknown'}"`;
    case 'renamed':
      return `${actorLink} renamed from "${event.rename?.from ?? ''}" to "${event.rename?.to ?? ''}"`;
    case 'review_requested':
      return `${actorLink} requested reviews`;
    case 'reviewed':
      return `${actorLink} reviewed the PR`;
    case 'review_dismissed':
      return `${actorLink} dismissed a review`;
    case 'approved':
      return `${actorLink} approved the PR`;
    case 'merged':
      return `${actorLink} merged the PR`;
    case 'referenced':
      return `${actorLink} referenced this issue`;
    case 'mentioned':
      return `${actorLink} was mentioned`;
    case 'subscribed':
      return `${actorLink} subscribed`;
    case 'unsubscribed':
      return `${actorLink} unsubscribed`;
    case 'locked':
      return `${actorLink} locked the conversation`;
    case 'unlocked':
      return `${actorLink} unlocked the conversation`;
    default:
      return null;
  }
}

function getTimeDescription(eventDate: Date, reportDate: Date): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const reportDateOnly = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());
  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const daysDiff = Math.floor((reportDateOnly.getTime() - eventDateOnly.getTime()) / msPerDay);
  
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
