import { DomainLabelTrigger, MaintainerResponseTrigger, getAllTriggers } from './curation-triggers.js';
import type { GitHubIssue, IssueRef } from './schemas.js';
import type { RepositoryMetadata } from './curation-triggers.js';

// Mock data for testing
const mockIssueRef: IssueRef = {
  owner: 'test',
  repo: 'repo',
  number: 123,
};

const createMockIssue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
  id: 1,
  number: 123,
  title: 'Test issue',
  body: 'Test issue body',
  user: { login: 'testuser', id: 1, type: 'User' },
  state: 'open',
  state_reason: null,
  labels: [],
  milestone: null,
  assignees: [],
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  closed_at: null,
  author_association: 'NONE',
  reactions: {},
  comments: [],
  is_pull_request: false,
  ...overrides,
});

const mockMetadata: RepositoryMetadata = {
  labels: ['domain: compiler', 'domain: language', 'bug', 'enhancement'],
  milestones: ['v1.0', 'v2.0'],
};

describe('DomainLabelTrigger', () => {
  const trigger = new DomainLabelTrigger();

  describe('shouldActivate', () => {
    it('should activate for open issue without domain label', () => {
      const issue = createMockIssue({
        state: 'open',
        labels: [{ id: 1, name: 'bug', color: 'red', description: 'Bug report' }],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(true);
    });

    it('should not activate for issue with domain label', () => {
      const issue = createMockIssue({
        state: 'open',
        labels: [{ id: 1, name: 'domain: compiler', color: 'blue', description: 'Compiler issue' }],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(false);
    });

    it('should not activate for closed issue', () => {
      const issue = createMockIssue({
        state: 'closed',
        labels: [],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(false);
    });

    it('should not activate when no domain labels exist', () => {
      const issue = createMockIssue({ state: 'open', labels: [] });
      const metadataWithoutDomain = { ...mockMetadata, labels: ['bug', 'enhancement'] };

      expect(trigger.shouldActivate(issue, mockIssueRef, metadataWithoutDomain)).toBe(false);
    });
  });

  describe('getDomainLabels', () => {
    it('should identify domain labels with various prefixes', () => {
      const labels = [
        'domain: compiler',
        'area: language',
        'component: parser',
        'module: types',
        'feature: decorators',
        'bug',
        'enhancement',
      ];

      const domainLabels = (trigger as any).getDomainLabels(labels);
      expect(domainLabels).toEqual([
        'domain: compiler',
        'area: language',
        'component: parser',
        'module: types',
        'feature: decorators',
      ]);
    });
  });
});

describe('MaintainerResponseTrigger', () => {
  const trigger = new MaintainerResponseTrigger();

  describe('shouldActivate', () => {
    it('should activate for open issue without maintainer comment', () => {
      const issue = createMockIssue({
        state: 'open',
        comments: [
          {
            id: 1,
            body: 'Regular user comment',
            user: { login: 'user1', id: 2, type: 'User' },
            created_at: '2023-01-01T01:00:00Z',
            updated_at: '2023-01-01T01:00:00Z',
            author_association: 'NONE',
            reactions: {},
          },
        ],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(true);
    });

    it('should not activate when maintainer has commented', () => {
      const issue = createMockIssue({
        state: 'open',
        comments: [
          {
            id: 1,
            body: 'Maintainer response',
            user: { login: 'maintainer', id: 3, type: 'User' },
            created_at: '2023-01-01T01:00:00Z',
            updated_at: '2023-01-01T01:00:00Z',
            author_association: 'OWNER',
            reactions: {},
          },
        ],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(false);
    });

    it('should not activate for closed issue', () => {
      const issue = createMockIssue({
        state: 'closed',
        comments: [],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(false);
    });

    it('should detect maintainer by association', () => {
      const issue = createMockIssue({
        state: 'open',
        comments: [
          {
            id: 1,
            body: 'Comment from collaborator',
            user: { login: 'collaborator', id: 4, type: 'User' },
            created_at: '2023-01-01T01:00:00Z',
            updated_at: '2023-01-01T01:00:00Z',
            author_association: 'COLLABORATOR',
            reactions: {},
          },
        ],
      });

      expect(trigger.shouldActivate(issue, mockIssueRef, mockMetadata)).toBe(false);
    });
  });

  describe('isMaintainer', () => {
    it('should identify maintainer by association', () => {
      const isMaintainer = (trigger as any).isMaintainer;
      
      expect(isMaintainer('user', 'OWNER', [])).toBe(true);
      expect(isMaintainer('user', 'MEMBER', [])).toBe(true);
      expect(isMaintainer('user', 'COLLABORATOR', [])).toBe(true);
      expect(isMaintainer('user', 'CONTRIBUTOR', [])).toBe(false);
      expect(isMaintainer('user', 'NONE', [])).toBe(false);
    });

    it('should identify maintainer by explicit list', () => {
      const isMaintainer = (trigger as any).isMaintainer;
      const maintainers = ['alice', 'bob'];
      
      expect(isMaintainer('alice', 'NONE', maintainers)).toBe(true);
      expect(isMaintainer('bob', 'CONTRIBUTOR', maintainers)).toBe(true);
      expect(isMaintainer('charlie', 'NONE', maintainers)).toBe(false);
    });
  });
});

describe('getAllTriggers', () => {
  it('should return all available triggers', () => {
    const triggers = getAllTriggers();
    
    expect(triggers).toHaveLength(2);
    expect(triggers[0]).toBeInstanceOf(DomainLabelTrigger);
    expect(triggers[1]).toBeInstanceOf(MaintainerResponseTrigger);
  });
});