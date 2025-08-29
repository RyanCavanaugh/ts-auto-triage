// Curation gates for rule-based issue processing
import type { GitHubIssue, IssueRef, IssueAction } from './schemas.js';
import type { Logger } from './utils.js';

/**
 * Input gate results categorize issues for processing
 */
export interface InputGateResult {
  /** Whether the issue should be processed at all */
  shouldProcess: boolean;
  /** Category of the issue for targeted processing */
  category: IssueCategory;
  /** Confidence score (0-1) in the categorization */
  confidence: number;
  /** Reasoning for the decision */
  reasoning: string;
  /** Suggested priority level */
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Issue categories for targeted processing
 */
export type IssueCategory = 
  | 'bug-report'
  | 'feature-request' 
  | 'question'
  | 'duplicate'
  | 'invalid'
  | 'documentation'
  | 'enhancement'
  | 'needs-repro'
  | 'needs-info'
  | 'stale';

/**
 * Output gate results filter and validate recommended actions
 */
export interface OutputGateResult {
  /** Filtered actions that passed validation */
  actions: IssueAction[];
  /** Actions that were rejected with reasons */
  rejected: Array<{ action: IssueAction; reason: string }>;
  /** Additional actions suggested by rules */
  additional: IssueAction[];
}

/**
 * Configuration for gate behavior
 */
export interface GateConfig {
  /** Minimum issue age in days before considering stale */
  staleThresholdDays: number;
  /** Maximum days since last activity before marking inactive */
  inactiveThresholdDays: number;
  /** Repository-specific labels that indicate certain categories */
  categoryLabels: {
    bug: string[];
    feature: string[];
    question: string[];
    documentation: string[];
  };
  /** Words/phrases that indicate different issue types */
  contentIndicators: {
    bugKeywords: string[];
    featureKeywords: string[];
    questionKeywords: string[];
  };
}

/**
 * Default gate configuration
 */
export const DEFAULT_GATE_CONFIG: GateConfig = {
  staleThresholdDays: 60,
  inactiveThresholdDays: 14,
  categoryLabels: {
    bug: ['bug', 'defect', 'issue', 'problem', 'error'],
    feature: ['feature', 'enhancement', 'improvement', 'request'],
    question: ['question', 'help', 'support', 'how-to'],
    documentation: ['docs', 'documentation', 'readme', 'wiki']
  },
  contentIndicators: {
    bugKeywords: ['error', 'crash', 'fail', 'broke', 'doesn\'t work', 'not working', 'issue', 'problem'],
    featureKeywords: ['feature', 'add', 'support', 'implement', 'would like', 'request', 'suggestion'],
    questionKeywords: ['how', 'why', 'what', 'when', 'where', 'question', 'help', 'can i', 'is it possible']
  }
};

/**
 * Apply input gates to categorize and filter an issue for processing
 */
export function applyInputGates(
  issue: GitHubIssue,
  issueRef: IssueRef,
  config: GateConfig = DEFAULT_GATE_CONFIG,
  logger: Logger
): InputGateResult {
  logger.debug(`Applying input gates to issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

  // Quick skip checks
  if (issue.state === 'closed') {
    return {
      shouldProcess: false,
      category: 'invalid',
      confidence: 1.0,
      reasoning: 'Issue is already closed',
      priority: 'low'
    };
  }

  // Check if issue is stale
  const now = new Date();
  const updatedAt = new Date(issue.updated_at);
  const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceUpdate > config.staleThresholdDays) {
    return {
      shouldProcess: true,
      category: 'stale',
      confidence: 0.9,
      reasoning: `Issue hasn't been updated in ${Math.round(daysSinceUpdate)} days`,
      priority: 'low'
    };
  }

  // Categorize based on existing labels
  const existingLabels = issue.labels.map(l => l.name.toLowerCase());
  const category = categorizeByLabels(existingLabels, config);
  if (category) {
    return {
      shouldProcess: true,
      category,
      confidence: 0.8,
      reasoning: `Categorized by existing labels: ${existingLabels.join(', ')}`,
      priority: category === 'bug-report' ? 'high' : 'medium'
    };
  }

  // Categorize based on content analysis
  const title = issue.title.toLowerCase();
  const body = (issue.body || '').toLowerCase();
  const contentCategory = categorizeByContent(title, body, config);

  // Determine priority based on category and content
  let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  if (contentCategory === 'bug-report') {
    priority = body.includes('crash') || body.includes('error') ? 'high' : 'medium';
  } else if (contentCategory === 'question') {
    priority = 'low';
  }

  return {
    shouldProcess: true,
    category: contentCategory,
    confidence: 0.6,
    reasoning: `Categorized by content analysis: found ${contentCategory} indicators`,
    priority
  };
}

/**
 * Apply output gates to filter and validate recommended actions
 */
export function applyOutputGates(
  actions: IssueAction[],
  issue: GitHubIssue,
  issueRef: IssueRef,
  availableLabels: string[],
  availableMilestones: string[],
  logger: Logger
): OutputGateResult {
  logger.debug(`Applying output gates to ${actions.length} proposed actions`);

  const result: OutputGateResult = {
    actions: [],
    rejected: [],
    additional: []
  };

  const existingLabels = new Set(issue.labels.map(l => l.name));

  for (const action of actions) {
    switch (action.kind) {
      case 'add_label':
        if (existingLabels.has(action.label)) {
          result.rejected.push({
            action,
            reason: `Label "${action.label}" already exists on issue`
          });
        } else if (!availableLabels.includes(action.label)) {
          result.rejected.push({
            action,
            reason: `Label "${action.label}" is not available in repository`
          });
        } else {
          result.actions.push(action);
        }
        break;

      case 'remove_label':
        if (!existingLabels.has(action.label)) {
          result.rejected.push({
            action,
            reason: `Label "${action.label}" is not present on issue`
          });
        } else {
          result.actions.push(action);
        }
        break;

      case 'close_issue':
        if (issue.state === 'closed') {
          result.rejected.push({
            action,
            reason: 'Issue is already closed'
          });
        } else {
          result.actions.push(action);
        }
        break;

      case 'set_milestone':
        if (issue.milestone?.title === action.milestone) {
          result.rejected.push({
            action,
            reason: `Milestone "${action.milestone}" already set on issue`
          });
        } else if (!availableMilestones.includes(action.milestone)) {
          result.rejected.push({
            action,
            reason: `Milestone "${action.milestone}" is not available in repository`
          });
        } else {
          result.actions.push(action);
        }
        break;

      case 'assign_user':
        const currentAssignees = issue.assignees.map(a => a.login);
        if (currentAssignees.includes(action.user)) {
          result.rejected.push({
            action,
            reason: `User "${action.user}" is already assigned to issue`
          });
        } else {
          result.actions.push(action);
        }
        break;

      case 'add_comment':
        // Always allow comments (duplicate detection happens in exec-action)
        result.actions.push(action);
        break;

      default:
        result.rejected.push({
          action,
          reason: 'Unknown action type'
        });
    }
  }

  // Add rule-based suggestions
  const additionalActions = generateRuleBasedActions(issue, issueRef, existingLabels, logger);
  result.additional.push(...additionalActions);

  logger.debug(`Output gates: ${result.actions.length} approved, ${result.rejected.length} rejected, ${result.additional.length} additional`);
  
  return result;
}

/**
 * Categorize issue based on existing labels
 */
function categorizeByLabels(labels: string[], config: GateConfig): IssueCategory | null {
  if (labels.some(label => config.categoryLabels.bug.includes(label))) {
    return 'bug-report';
  }
  if (labels.some(label => config.categoryLabels.feature.includes(label))) {
    return 'feature-request';
  }
  if (labels.some(label => config.categoryLabels.question.includes(label))) {
    return 'question';
  }
  if (labels.some(label => config.categoryLabels.documentation.includes(label))) {
    return 'documentation';
  }
  return null;
}

/**
 * Categorize issue based on title and body content
 */
function categorizeByContent(title: string, body: string, config: GateConfig): IssueCategory {
  const text = `${title} ${body}`;

  // Count keyword matches for each category
  const bugMatches = config.contentIndicators.bugKeywords.filter(keyword => 
    text.includes(keyword)
  ).length;

  const featureMatches = config.contentIndicators.featureKeywords.filter(keyword => 
    text.includes(keyword)
  ).length;

  const questionMatches = config.contentIndicators.questionKeywords.filter(keyword => 
    text.includes(keyword)
  ).length;

  // Return category with most matches, defaulting to needs-info
  if (bugMatches > featureMatches && bugMatches > questionMatches) {
    return 'bug-report';
  }
  if (featureMatches > questionMatches) {
    return 'feature-request';
  }
  if (questionMatches > 0) {
    return 'question';
  }

  // Check for specific patterns
  if (text.includes('reproduction') || text.includes('repro') || text.includes('steps to reproduce')) {
    return bugMatches > 0 ? 'bug-report' : 'needs-repro';
  }

  return 'needs-info';
}

/**
 * Generate rule-based action suggestions
 */
function generateRuleBasedActions(
  issue: GitHubIssue,
  issueRef: IssueRef,
  existingLabels: Set<string>,
  logger: Logger
): IssueAction[] {
  const actions: IssueAction[] = [];

  // Add "needs-repro" label if bug report without reproduction steps
  const body = (issue.body || '').toLowerCase();
  const title = issue.title.toLowerCase();
  const text = `${title} ${body}`;

  const hasBugIndicators = ['error', 'crash', 'fail', 'broke', 'bug'].some(keyword => 
    text.includes(keyword)
  );

  const hasReproSteps = ['reproduction', 'repro', 'steps to reproduce', 'to reproduce'].some(phrase => 
    text.includes(phrase)
  );

  if (hasBugIndicators && !hasReproSteps && !existingLabels.has('needs-repro')) {
    actions.push({
      kind: 'add_label',
      label: 'needs-repro'
    });
  }

  // Add "question" label for question-like issues
  const questionIndicators = ['how', 'why', 'what', 'question', 'help'].some(word => 
    title.includes(word)
  );

  if (questionIndicators && !existingLabels.has('question')) {
    actions.push({
      kind: 'add_label',
      label: 'question'
    });
  }

  // Suggest closing issues that are clearly duplicates
  if (text.includes('duplicate') && issue.state === 'open') {
    actions.push({
      kind: 'close_issue',
      reason: 'not_planned'
    });
  }

  logger.debug(`Generated ${actions.length} rule-based actions`);
  return actions;
}