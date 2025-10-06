import { describe, expect, test } from '@jest/globals';
import { 
  SuggestionSummarySchema,
  ContributionSchema,
  FollowUpSchema
} from '../lib/schemas.js';

describe('Suggestion Resummarization schemas', () => {
  test('should validate FollowUpSchema', () => {
    const followUp = {
      body: 'This is a clarification on the previous contribution',
      contributedBy: ['user1']
    };

    const result = FollowUpSchema.safeParse(followUp);
    expect(result.success).toBe(true);
    expect(result.data?.body).toBe('This is a clarification on the previous contribution');
  });

  test('should validate ContributionSchema', () => {
    const contribution = {
      body: 'This feature would be useful in redux-carousel',
      contributedBy: ['jcalz', 'MartinJohns'],
      followUps: [{
        body: 'There is actually a library that does this',
        contributedBy: ['bobbb']
      }]
    };

    const result = ContributionSchema.safeParse(contribution);
    expect(result.success).toBe(true);
    expect(result.data?.contributedBy).toEqual(['jcalz', 'MartinJohns']);
    expect(result.data?.followUps).toHaveLength(1);
  });

  test('should validate ContributionSchema without follow-ups', () => {
    const contribution = {
      body: 'This would be useful',
      contributedBy: ['user1']
    };

    const result = ContributionSchema.safeParse(contribution);
    expect(result.success).toBe(true);
    expect(result.data?.followUps).toBeUndefined();
  });

  test('should validate SuggestionSummarySchema', () => {
    const summary = {
      suggestion: 'Add support for tagged template types',
      contributions: [
        {
          body: 'This would be useful in redux-carousel',
          contributedBy: ['jcalz']
        }
      ],
      concerns: 'This might break existing code'
    };

    const result = SuggestionSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
    expect(result.data?.suggestion).toBe('Add support for tagged template types');
    expect(result.data?.contributions).toHaveLength(1);
    expect(result.data?.concerns).toBe('This might break existing code');
  });

  test('should validate SuggestionSummarySchema without concerns', () => {
    const summary = {
      suggestion: 'Add support for tagged template types',
      contributions: []
    };

    const result = SuggestionSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
    expect(result.data?.concerns).toBeUndefined();
  });

  test('should require suggestion field', () => {
    const summary = {
      contributions: []
    };

    const result = SuggestionSummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
  });

  test('should require contributions array', () => {
    const summary = {
      suggestion: 'Add support for tagged template types'
    };

    const result = SuggestionSummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
  });
});
