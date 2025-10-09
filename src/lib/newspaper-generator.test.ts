import { describe, it, expect } from '@jest/globals';
import { createNewspaperGenerator } from './newspaper-generator.js';
import type { AIWrapper } from './ai-wrapper.js';
import type { Logger } from './utils.js';
import type { IssueRef, GitHubIssue } from './schemas.js';

describe('NewspaperGenerator', () => {
  const mockLogger: Logger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };

  const mockAI: AIWrapper = {
    completion: async <T>(messages: Array<{ role: string; content: string }>, options: unknown): Promise<T> => {
      // Handle different completion types based on context
      const opts = options as { context?: string };
      if (opts.context?.includes('Summarize issue')) {
        return { text: 'This is a test summary of the issue.' } as T;
      }
      return { summary: 'test summary', action_needed: null } as T;
    },
    getEmbedding: async () => ({ embedding: [], usage: { total_tokens: 0, prompt_tokens: 0 } }),
  } as unknown as AIWrapper;

  describe('generateDailyReport', () => {
    it('should generate a report with basic structure', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z'); // 8 AM Seattle time (UTC-8)
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      expect(report).toContain('# Report for 2024-01-02');
      expect(report).toContain('0 different users commented on 0 different issues');
      expect(report).toContain('## Activity Summary');
    });

    it('should track issues with activity in time window', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-02T20:00:00Z', // Within window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      expect(report).toContain('1 different users commented on 1 different issues');
      expect(report).toContain('test/repo#1');
      expect(report).toContain('**Test Issue**');
      expect(report).toContain('created by **testuser**');
    });

    it('should handle comments within time window', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'Short comment',
            user: {
              login: 'commenter',
              id: 2,
              type: 'User',
            },
            created_at: '2024-01-02T20:00:00Z', // Within window
            updated_at: '2024-01-02T20:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      expect(report).toContain('1 different users commented on 1 different issues');
      expect(report).toContain('**commenter**');
      expect(report).toContain('Short comment');
    });

    it('should handle events with dates in the future (negative day diff)', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      // Report date is 2024-01-02, but event is on 2024-01-03 (future)
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T12:00:00Z', // Before window
        updated_at: '2024-01-03T12:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'Future comment',
            user: {
              login: 'commenter',
              id: 2,
              type: 'User',
            },
            created_at: '2024-01-03T12:00:00Z', // Future relative to reportDate
            updated_at: '2024-01-03T12:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Should not contain negative days like "(-1 days ago)"
      expect(report).not.toContain('(-');
      expect(report).not.toContain('-1 days ago');
      // Should show "[later]" as a link for future events
      expect(report).toContain('[later]');
    });

    it('should filter bot comments from generating action items', async () => {
      // Mock AI that returns action needed for all comments
      const mockAIWithActions: AIWrapper = {
        completion: async () => ({ 
          summary: 'asked a question',
          action_needed: {
            category: 'response' as const,
            reason: '@commenter asked about release timeline'
          }
        }),
        getEmbedding: async () => ({ embedding: [], usage: { total_tokens: 0, prompt_tokens: 0 } }),
      } as unknown as AIWrapper;
      
      const generator = createNewspaperGenerator(mockAIWithActions, mockLogger, ['typescript-bot']);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'Bot comment that would trigger action',
            user: {
              login: 'typescript-bot',
              id: 2,
              type: 'Bot',
            },
            created_at: '2024-01-02T20:00:00Z',
            updated_at: '2024-01-02T20:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
          {
            id: 2,
            body: 'User comment that should trigger action',
            user: {
              login: 'regular-user',
              id: 3,
              type: 'User',
            },
            created_at: '2024-01-02T21:00:00Z',
            updated_at: '2024-01-02T21:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Report should include both comments
      expect(report).toContain('typescript-bot');
      expect(report).toContain('regular-user');
      
      // But only the regular user should trigger an action (check via action items section)
      // The bot comment should NOT appear in the action items section
      expect(report).toContain('## Recommended Actions');
      expect(report).toContain('regular-user');
      // The report should have exactly 1 action item (not 2)
      const actionMatches = report.match(/\* Response Recommended/g);
      expect(actionMatches).toHaveLength(1);
    });

    it('should strip markdown from short-form verbatim comments', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'This has **bold** and *italic* and [a link](http://example.com)',
            user: {
              login: 'commenter',
              id: 2,
              type: 'User',
            },
            created_at: '2024-01-02T20:00:00Z', // Within window
            updated_at: '2024-01-02T20:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Should not contain markdown syntax
      expect(report).not.toContain('**bold**');
      expect(report).not.toContain('*italic*');
      expect(report).not.toContain('[a link](http://example.com)');
      
      // Should contain the plain text version
      expect(report).toContain('said "This has bold and italic and a link"');
    });

    it('should strip markdown from comments with code blocks and lists', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'Try using `console.log` for debugging',
            user: {
              login: 'commenter',
              id: 2,
              type: 'User',
            },
            created_at: '2024-01-02T20:00:00Z', // Within window
            updated_at: '2024-01-02T20:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Should not contain markdown backticks
      expect(report).not.toContain('`console.log`');
      
      // Should contain the plain text version
      expect(report).toContain('said "Try using console.log for debugging"');
    });

    it('should coalesce consecutive metadata events from same actor', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [],
        timeline_events: [
          {
            id: 1,
            event: 'labeled',
            created_at: '2024-01-02T20:00:00Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            label: { name: 'Bug' },
          },
          {
            id: 2,
            event: 'labeled',
            created_at: '2024-01-02T20:00:05Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            label: { name: 'Help Wanted' },
          },
          {
            id: 3,
            event: 'milestoned',
            created_at: '2024-01-02T20:00:10Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            milestone: { title: 'Backlog' },
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Should coalesce into a single bullet point
      expect(report).toContain('**RyanCavanaugh** added labels `Bug`, `Help Wanted`, and set milestone to `Backlog`');
      
      // Should NOT have separate bullet points for each action
      const bulletCount = (report.match(/\* \(today\) \*\*RyanCavanaugh\*\*/g) || []).length;
      expect(bulletCount).toBe(1);
    });

    it('should not coalesce metadata events from different actors', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [],
        timeline_events: [
          {
            id: 1,
            event: 'labeled',
            created_at: '2024-01-02T20:00:00Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            label: { name: 'Bug' },
          },
          {
            id: 2,
            event: 'labeled',
            created_at: '2024-01-02T20:00:05Z',
            actor: { login: 'OtherUser', id: 2 },
            label: { name: 'Help Wanted' },
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Should have separate bullet points for different actors
      expect(report).toContain('**RyanCavanaugh** added label `Bug`');
      expect(report).toContain('**OtherUser** added label `Help Wanted`');
    });

    it('should not coalesce metadata events with non-metadata events', async () => {
      const generator = createNewspaperGenerator(mockAI, mockLogger);
      
      const date = new Date('2024-01-02T00:00:00Z');
      const startTime = new Date('2024-01-02T16:00:00Z');
      const endTime = new Date('2024-01-03T16:00:00Z');
      
      const issueRef: IssueRef = {
        owner: 'test',
        repo: 'repo',
        number: 1,
      };
      
      const issue: GitHubIssue = {
        id: 1,
        number: 1,
        title: 'Test Issue',
        body: 'Test body',
        user: {
          login: 'testuser',
          id: 1,
          type: 'User',
        },
        state: 'open',
        state_reason: null,
        labels: [],
        milestone: null,
        assignees: [],
        created_at: '2024-01-01T00:00:00Z', // Before window
        updated_at: '2024-01-02T20:00:00Z',
        closed_at: null,
        author_association: 'NONE',
        reactions: {},
        comments: [
          {
            id: 1,
            body: 'Test comment',
            user: {
              login: 'RyanCavanaugh',
              id: 1,
              type: 'User',
            },
            created_at: '2024-01-02T20:00:05Z',
            updated_at: '2024-01-02T20:00:05Z',
            author_association: 'OWNER',
            reactions: {},
          },
        ],
        timeline_events: [
          {
            id: 1,
            event: 'labeled',
            created_at: '2024-01-02T20:00:00Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            label: { name: 'Bug' },
          },
          {
            id: 2,
            event: 'labeled',
            created_at: '2024-01-02T20:00:10Z',
            actor: { login: 'RyanCavanaugh', id: 1 },
            label: { name: 'Help Wanted' },
          },
        ],
        is_pull_request: false,
      };
      
      const issues: Array<{ ref: IssueRef; issue: GitHubIssue }> = [{ ref: issueRef, issue }];
      
      const report = await generator.generateDailyReport(date, issues, startTime, endTime);
      
      // Comment interrupts the metadata events, so they should be separate
      expect(report).toContain('**RyanCavanaugh** added label `Bug`');
      expect(report).toContain('**RyanCavanaugh** added label `Help Wanted`');
      expect(report).toContain('Test comment');
    });
  });
});
