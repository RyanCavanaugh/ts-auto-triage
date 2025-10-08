import type { IssueRef, GitHubIssue, TimelineEvent, CommentSummary } from './schemas.js';
import { CommentSummarySchema } from './schemas.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import { loadPrompt } from './prompts.js';
import removeMd from 'remove-markdown';
import { z } from 'zod';

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
  logger: Logger,
  bots: string[] = []
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
        
        // Check if any timeline events were in window
        if (issue.timeline_events) {
          for (const event of issue.timeline_events) {
            const eventDate = new Date(event.created_at);
            if (eventDate >= startTime && eventDate < endTime) {
              hasActivity = true;
            }
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
          logger,
          bots
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
  logger: Logger,
  bots: string[]
): Promise<{ text: string; actions: ActionItem[] }> {
  const issueUrl = `https://github.com/${issueRef.owner}/${issueRef.repo}/${issue.is_pull_request ? 'pull' : 'issues'}/${issueRef.number}`;
  const issueType = issue.is_pull_request ? 'Pull Request' : 'Issue';
  
  // Generate one-sentence AI summary of the issue
  let oneSentenceSummary = '';
  try {
    const systemPrompt = await loadPrompt('summarize-issue-oneline-system');
    const userPrompt = await loadPrompt('summarize-issue-oneline-user', {
      title: issue.title,
      body: (issue.body ?? '').substring(0, 2000), // Truncate very long bodies
    });
    
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];
    
    const response = await ai.completion<{ text: string }>(
      messages,
      {
        jsonSchema: z.object({ text: z.string() }),
        maxTokens: 100,
        context: `Summarize issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`,
        effort: 'Low',
      }
    );
    
    oneSentenceSummary = response.text;
  } catch (error) {
    logger.warn(`Failed to generate one-sentence summary for issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}: ${error}`);
    // Fallback to just the title
    oneSentenceSummary = issue.title;
  }
  
  let markdown = `### [${issueType} ${issueRef.owner}/${issueRef.repo}#${issueRef.number}](${issueUrl})\n\n`;
  markdown += `**${issue.title}**\n\n`;
  markdown += `*${oneSentenceSummary}*\n\n`;
  
  const actions: ActionItem[] = [];
  
  // Collect all events (issue creation + comments + timeline events)
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
  
  // Add timeline events
  if (issue.timeline_events) {
    for (const event of issue.timeline_events) {
      const eventDate = new Date(event.created_at);
      const actor = event.actor?.login ?? 'unknown';
      
      if (event.event === 'closed') {
        allEvents.push({
          date: eventDate,
          type: 'closed',
          actor,
        });
      } else if (event.event === 'reopened') {
        allEvents.push({
          date: eventDate,
          type: 'reopened',
          actor,
        });
      } else if (event.event === 'labeled' && event.label) {
        allEvents.push({
          date: eventDate,
          type: 'labeled',
          actor,
          label_name: event.label.name,
        });
      } else if (event.event === 'unlabeled' && event.label) {
        allEvents.push({
          date: eventDate,
          type: 'unlabeled',
          actor,
          label_name: event.label.name,
        });
      } else if (event.event === 'milestoned' && event.milestone) {
        allEvents.push({
          date: eventDate,
          type: 'milestoned',
          actor,
          milestone_title: event.milestone.title,
        });
      } else if (event.event === 'demilestoned' && event.milestone) {
        allEvents.push({
          date: eventDate,
          type: 'demilestoned',
          actor,
          milestone_title: event.milestone.title,
        });
      } else if (event.event === 'assigned' && event.assignee) {
        allEvents.push({
          date: eventDate,
          type: 'assigned',
          actor,
          assignee_login: event.assignee.login,
        });
      } else if (event.event === 'unassigned' && event.assignee) {
        allEvents.push({
          date: eventDate,
          type: 'unassigned',
          actor,
          assignee_login: event.assignee.login,
        });
      }
    }
  }
  
  // Sort by date
  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Find events before the window (last 3)
  const eventsBeforeWindow = allEvents.filter(e => e.date < startTime).slice(-3);
  const eventsInWindow = allEvents.filter(e => e.date >= startTime && e.date < endTime);
  
  // Coalesce and format prior events
  const coalescedBeforeWindow = coalesceMetadataEvents(eventsBeforeWindow);
  for (const eventOrGroup of coalescedBeforeWindow) {
    const timeDesc = getTimeDescription(eventOrGroup.date, reportDate);
    const formatted = await formatEventOrGroup(eventOrGroup, issueUrl, timeDesc, issueRef, actions, ai, logger, false, bots);
    if (formatted) {
      markdown += ` * ${formatted}\n`;
    }
  }
  
  // Coalesce and format events in window
  const coalescedInWindow = coalesceMetadataEvents(eventsInWindow);
  for (const eventOrGroup of coalescedInWindow) {
    const timeDesc = getTimeDescription(eventOrGroup.date, reportDate);
    const formatted = await formatEventOrGroup(eventOrGroup, issueUrl, timeDesc, issueRef, actions, ai, logger, true, bots);
    if (formatted) {
      markdown += ` * ${formatted}\n`;
    }
  }
  
  return { text: markdown, actions };
}

// Helper type for coalesced events
interface EventGroup {
  date: Date;
  actor: string;
  events: Array<{
    date: Date;
    type: 'created' | 'commented' | 'closed' | 'reopened' | 'labeled' | 'unlabeled' | 'milestoned' | 'demilestoned' | 'assigned' | 'unassigned';
    actor: string;
    body?: string;
    author_association?: string;
    comment_id?: number;
    label_name?: string;
    milestone_title?: string;
    assignee_login?: string;
  }>;
  isGroup: true;
}

interface Event {
  date: Date;
  type: 'created' | 'commented' | 'closed' | 'reopened' | 'labeled' | 'unlabeled' | 'milestoned' | 'demilestoned' | 'assigned' | 'unassigned';
  actor: string;
  body?: string;
  author_association?: string;
  comment_id?: number;
  label_name?: string;
  milestone_title?: string;
  assignee_login?: string;
}

type EventOrGroup = Event | EventGroup;

function isMetadataEvent(event: Event): boolean {
  return event.type === 'labeled' || 
         event.type === 'unlabeled' || 
         event.type === 'milestoned' || 
         event.type === 'demilestoned' || 
         event.type === 'assigned' || 
         event.type === 'unassigned';
}

function coalesceMetadataEvents(events: Event[]): EventOrGroup[] {
  const result: EventOrGroup[] = [];
  let i = 0;
  
  while (i < events.length) {
    const event = events[i];
    if (!event) {
      i++;
      continue;
    }
    
    if (!isMetadataEvent(event)) {
      // Non-metadata event, add as-is
      result.push(event);
      i++;
      continue;
    }
    
    // Look ahead to find consecutive metadata events by the same actor
    const groupEvents: Event[] = [event];
    let j = i + 1;
    
    while (j < events.length) {
      const nextEvent = events[j];
      if (!nextEvent) {
        break;
      }
      
      // Check if it's a metadata event by the same actor and close in time (within 5 minutes)
      const timeDiff = Math.abs(nextEvent.date.getTime() - event.date.getTime());
      const fiveMinutes = 5 * 60 * 1000;
      
      if (isMetadataEvent(nextEvent) && 
          nextEvent.actor === event.actor && 
          timeDiff <= fiveMinutes) {
        groupEvents.push(nextEvent);
        j++;
      } else {
        break;
      }
    }
    
    // If we found multiple events, create a group
    if (groupEvents.length > 1) {
      result.push({
        date: event.date,
        actor: event.actor,
        events: groupEvents,
        isGroup: true,
      });
    } else {
      // Single event, add as-is
      result.push(event);
    }
    
    i = j;
  }
  
  return result;
}

function formatCoalescedMetadataEvents(group: EventGroup): string {
  const actorName = `**${group.actor}**`;
  const parts: string[] = [];
  
  // Group by event type
  const labeled: string[] = [];
  const unlabeled: string[] = [];
  let milestone: string | null = null;
  let demilestone: string | null = null;
  const assigned: string[] = [];
  const unassigned: string[] = [];
  
  for (const event of group.events) {
    if (event.type === 'labeled' && event.label_name) {
      labeled.push(event.label_name);
    } else if (event.type === 'unlabeled' && event.label_name) {
      unlabeled.push(event.label_name);
    } else if (event.type === 'milestoned' && event.milestone_title) {
      milestone = event.milestone_title;
    } else if (event.type === 'demilestoned' && event.milestone_title) {
      demilestone = event.milestone_title;
    } else if (event.type === 'assigned' && event.assignee_login) {
      assigned.push(event.assignee_login);
    } else if (event.type === 'unassigned' && event.assignee_login) {
      unassigned.push(event.assignee_login);
    }
  }
  
  // Build the description
  if (labeled.length > 0) {
    const labelList = labeled.map(l => `\`${l}\``).join(', ');
    parts.push(`added label${labeled.length > 1 ? 's' : ''} ${labelList}`);
  }
  
  if (unlabeled.length > 0) {
    const labelList = unlabeled.map(l => `\`${l}\``).join(', ');
    parts.push(`removed label${unlabeled.length > 1 ? 's' : ''} ${labelList}`);
  }
  
  if (milestone) {
    parts.push(`set milestone to \`${milestone}\``);
  }
  
  if (demilestone) {
    parts.push(`removed from milestone \`${demilestone}\``);
  }
  
  if (assigned.length > 0) {
    const assigneeList = assigned.map(a => `**${a}**`).join(', ');
    parts.push(`assigned to ${assigneeList}`);
  }
  
  if (unassigned.length > 0) {
    const assigneeList = unassigned.map(a => `**${a}**`).join(', ');
    parts.push(`unassigned ${assigneeList}`);
  }
  
  // Join parts with comma and "and"
  let description = '';
  if (parts.length === 0) {
    return `${actorName} performed metadata actions`;
  } else if (parts.length === 1 && parts[0]) {
    description = parts[0];
  } else if (parts.length === 2 && parts[0] && parts[1]) {
    description = `${parts[0]} and ${parts[1]}`;
  } else if (parts.length > 2) {
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      const otherParts = parts.slice(0, -1).join(', ');
      description = `${otherParts}, and ${lastPart}`;
    }
  }
  
  return `${actorName} ${description}`;
}

async function formatEventOrGroup(
  eventOrGroup: EventOrGroup,
  issueUrl: string,
  timeDesc: string,
  issueRef: IssueRef,
  actions: ActionItem[],
  ai: AIWrapper,
  logger: Logger,
  checkForActions: boolean,
  bots: string[]
): Promise<string | null> {
  // Check if it's a group
  if ('isGroup' in eventOrGroup && eventOrGroup.isGroup) {
    const formatted = formatCoalescedMetadataEvents(eventOrGroup);
    return `(${timeDesc}) ${formatted}`;
  }
  
  // Otherwise, format as a single event (cast is safe due to above check)
  const event = eventOrGroup as Event;
  return await formatEvent(event, issueUrl, timeDesc, issueRef, actions, ai, logger, checkForActions, bots);
}

async function formatEvent(
  event: { 
    date: Date; 
    type: string; 
    actor: string; 
    body?: string; 
    author_association?: string; 
    comment_id?: number;
    label_name?: string;
    milestone_title?: string;
    assignee_login?: string;
  },
  issueUrl: string,
  timeDesc: string,
  issueRef: IssueRef,
  actions: ActionItem[],
  ai: AIWrapper,
  logger: Logger,
  checkForActions: boolean,
  bots: string[]
): Promise<string | null> {
  const actorName = `**${event.actor}**`;
  
  if (event.type === 'created') {
    return `created by ${actorName}`;
  } else if (event.type === 'closed') {
    return `(${timeDesc}) ${actorName} closed the issue`;
  } else if (event.type === 'reopened') {
    return `(${timeDesc}) ${actorName} reopened the issue`;
  } else if (event.type === 'labeled' && event.label_name) {
    return `(${timeDesc}) ${actorName} added label \`${event.label_name}\``;
  } else if (event.type === 'unlabeled' && event.label_name) {
    return `(${timeDesc}) ${actorName} removed label \`${event.label_name}\``;
  } else if (event.type === 'milestoned' && event.milestone_title) {
    return `(${timeDesc}) ${actorName} added to milestone \`${event.milestone_title}\``;
  } else if (event.type === 'demilestoned' && event.milestone_title) {
    return `(${timeDesc}) ${actorName} removed from milestone \`${event.milestone_title}\``;
  } else if (event.type === 'assigned' && event.assignee_login) {
    return `(${timeDesc}) ${actorName} assigned to **${event.assignee_login}**`;
  } else if (event.type === 'unassigned' && event.assignee_login) {
    return `(${timeDesc}) ${actorName} unassigned **${event.assignee_login}**`;
  } else if (event.type === 'commented' && event.body) {
    const authorAssociation = event.author_association ?? 'NONE';
    const isContributorOrOwner = authorAssociation === 'CONTRIBUTOR' || authorAssociation === 'OWNER' || authorAssociation === 'MEMBER';
    const isBot = bots.includes(event.actor);
    const commentUrl = event.comment_id ? `${issueUrl}#issuecomment-${event.comment_id}` : issueUrl;
    
    if (event.body.length > 200 || event.body.includes('\n')) {
      // Use AI to summarize long comments
      try {
        const summary = await summarizeComment(event.body, event.actor, ai, logger);
        
        if (checkForActions && summary.action_needed && !isContributorOrOwner && !isBot) {
          actions.push({
            category: summary.action_needed.category,
            description: summary.action_needed.reason,
            issueRef,
            issueNumber: issueRef.number,
            issueUrl: commentUrl,
          });
        }
        
        return `[${timeDesc}](${commentUrl}) ${actorName} ${summary.summary}`;
      } catch (error) {
        logger.warn(`Failed to summarize comment: ${error}`);
        return `[${actorName} commented](${commentUrl})`;
      }
    } else {
      // Short comment - include verbatim
      if (checkForActions && !isContributorOrOwner && !isBot) {
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

      const strippedBody = removeMd(event.body);
      return `[${timeDesc}](${commentUrl}) ${actorName} said "${strippedBody}"`;
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
  
  const response = await ai.completion<CommentSummary>(
    messages,
    {
      jsonSchema: CommentSummarySchema,
      maxTokens: 300,
      context: `Summarize comment by ${actor}`,
      effort: 'Low',
    }
  );
  
  return response;
}

function getTimeDescription(eventDate: Date, reportDate: Date): string {
  const msPerDay = 24 * 60 * 60 * 1000;
  const reportDateOnly = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());
  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const daysDiff = Math.floor((reportDateOnly.getTime() - eventDateOnly.getTime()) / msPerDay);
  
  // Handle future dates (negative daysDiff)
  if (daysDiff < 0) {
    return 'later';
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
