import { describe, expect, test } from '@jest/globals';
import { applyInputGates, applyOutputGates, DEFAULT_GATE_CONFIG, type GateConfig } from './curation-gates.js';
import type { GitHubIssue, IssueRef, IssueAction } from './schemas.js';
import { createMockLogger } from './utils.js';

// Helper to create a mock issue
function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  const now = new Date().toISOString();
  return {
    id: 1,
    number: 123,
    title: 'Test Issue',
    body: 'Test issue body',
    user: { login: 'testuser', id: 1, type: 'User' },
    state: 'open',
    state_reason: null,
    labels: [],
    milestone: null,
    assignees: [],
    created_at: now,
    updated_at: now, // Use current date by default
    closed_at: null,
    author_association: 'CONTRIBUTOR',
    reactions: {},
    comments: [],
    is_pull_request: false,
    ...overrides
  };
}

const mockIssueRef: IssueRef = {
  owner: 'test',
  repo: 'repo',
  number: 123
};

describe('Input Gates', () => {
  const logger = createMockLogger();

  test('should skip closed issues', () => {
    const issue = createMockIssue({ state: 'closed' });
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(false);
    expect(result.category).toBe('invalid');
    expect(result.confidence).toBe(1.0);
  });

  test('should categorize as stale for old issues', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 70); // 70 days ago
    
    const issue = createMockIssue({ 
      updated_at: oldDate.toISOString() 
    });
    
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(true);
    expect(result.category).toBe('stale');
    expect(result.priority).toBe('low');
  });

  test('should categorize by existing labels', () => {
    const issue = createMockIssue({
      labels: [{ id: 1, name: 'bug', color: 'red', description: null }]
    });
    
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(true);
    expect(result.category).toBe('bug-report');
    expect(result.priority).toBe('high');
  });

  test('should categorize by content keywords', () => {
    const issue = createMockIssue({
      title: 'Error crash TypeScript compilation',
      body: 'I get an error message crash fail when trying to compile'
    });
    
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(true);
    expect(result.category).toBe('bug-report');
    expect(result.confidence).toBe(0.6);
  });

  test('should categorize questions', () => {
    const issue = createMockIssue({
      title: 'How to configure TypeScript?',
      body: 'I need help with configuration'
    });
    
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(true);
    expect(result.category).toBe('question');
    expect(result.priority).toBe('low');
  });

  test('should categorize feature requests', () => {
    const issue = createMockIssue({
      title: 'Add support for new syntax',
      body: 'Would like to request a new feature'
    });
    
    const result = applyInputGates(issue, mockIssueRef, DEFAULT_GATE_CONFIG, logger);
    
    expect(result.shouldProcess).toBe(true);
    expect(result.category).toBe('feature-request');
  });
});

describe('Output Gates', () => {
  const logger = createMockLogger();
  const availableLabels = ['bug', 'feature', 'question', 'needs-repro'];
  const availableMilestones = ['v1.0', 'v2.0'];

  test('should reject adding existing labels', () => {
    const issue = createMockIssue({
      labels: [{ id: 1, name: 'bug', color: 'red', description: null }]
    });
    
    const actions: IssueAction[] = [
      { kind: 'add_label', label: 'bug' }
    ];
    
    const result = applyOutputGates(actions, issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.actions).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain('already exists');
  });

  test('should reject unavailable labels', () => {
    const issue = createMockIssue();
    const actions: IssueAction[] = [
      { kind: 'add_label', label: 'nonexistent' }
    ];
    
    const result = applyOutputGates(actions, issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.actions).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain('not available');
  });

  test('should reject closing already closed issues', () => {
    const issue = createMockIssue({ state: 'closed' });
    const actions: IssueAction[] = [
      { kind: 'close_issue', reason: 'completed' }
    ];
    
    const result = applyOutputGates(actions, issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.actions).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain('already closed');
  });

  test('should allow valid actions', () => {
    const issue = createMockIssue();
    const actions: IssueAction[] = [
      { kind: 'add_label', label: 'bug' },
      { kind: 'add_comment', body: 'Test comment' },
      { kind: 'set_milestone', milestone: 'v1.0' }
    ];
    
    const result = applyOutputGates(actions, issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.actions).toHaveLength(3);
    expect(result.rejected).toHaveLength(0);
  });

  test('should generate rule-based actions for bug reports without repro', () => {
    const issue = createMockIssue({
      title: 'Error in TypeScript compiler',
      body: 'There is a bug that causes crashes'
    });
    
    const result = applyOutputGates([], issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.additional.length).toBeGreaterThan(0);
    expect(result.additional.some(action => 
      action.kind === 'add_label' && action.label === 'needs-repro'
    )).toBe(true);
  });

  test('should generate question label for question-like issues', () => {
    const issue = createMockIssue({
      title: 'How to use TypeScript with React?'
    });
    
    const result = applyOutputGates([], issue, mockIssueRef, availableLabels, availableMilestones, logger);
    
    expect(result.additional.some(action => 
      action.kind === 'add_label' && action.label === 'question'
    )).toBe(true);
  });
});

describe('Gate Configuration', () => {
  test('should use custom configuration', () => {
    const customConfig: GateConfig = {
      ...DEFAULT_GATE_CONFIG,
      staleThresholdDays: 30,
      categoryLabels: {
        ...DEFAULT_GATE_CONFIG.categoryLabels,
        bug: ['custom-bug']
      }
    };
    
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35); // 35 days ago
    
    const issue = createMockIssue({ 
      updated_at: oldDate.toISOString() 
    });
    
    const result = applyInputGates(issue, mockIssueRef, customConfig, createMockLogger());
    
    expect(result.category).toBe('stale');
  });
});