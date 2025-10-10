import { describe, expect, test } from '@jest/globals';
import { FAQResponseSchema, TimelineEventSchema } from './schemas.js';
import { zodResponseFormat } from 'openai/helpers/zod.js';

describe('FAQ Response Schema', () => {
  test('should accept response with has_match true and response string', () => {
    const data = {
      has_match: true,
      reasoning: 'This matches the FAQ entry',
      response: 'This is a response from the FAQ',
    };

    const result = FAQResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_match).toBe(true);
      expect(result.data.response).toBe('This is a response from the FAQ');
    }
  });

  test('should accept response with has_match false and response null', () => {
    const data = {
      has_match: false,
      reasoning: 'No matching FAQ entry found',
      response: null,
    };

    const result = FAQResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_match).toBe(false);
      expect(result.data.response).toBeNull();
    }
  });

  test('should accept response with has_match true and response null', () => {
    // Edge case: has_match is true but response is null
    const data = {
      has_match: true,
      reasoning: 'Match found but no response available',
      response: null,
    };

    const result = FAQResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.has_match).toBe(true);
      expect(result.data.response).toBeNull();
    }
  });

  test('should require response field to be present', () => {
    // With .nullable(), the response field must always be present (but can be null)
    const data = {
      has_match: false,
    };

    const result = FAQResponseSchema.safeParse(data);
    // Zod requires the field to be present when using .nullable()
    expect(result.success).toBe(false);
  });

  test('should reject response with undefined response', () => {
    const data = {
      has_match: false,
      response: undefined,
    };

    const result = FAQResponseSchema.safeParse(data);
    // undefined is not a valid value for nullable fields
    expect(result.success).toBe(false);
  });

  test('should reject response with invalid response type', () => {
    const data = {
      has_match: true,
      response: 123, // should be string or null
    };

    const result = FAQResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should reject response without has_match', () => {
    const data = {
      response: 'Some response',
    };

    const result = FAQResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should generate Azure OpenAI compatible JSON Schema', () => {
    // This test ensures the schema generates valid JSON Schema for Azure OpenAI structured outputs
    // Azure OpenAI doesn't support "nullable: true", only union types like ["string", "null"]
    const format = zodResponseFormat(FAQResponseSchema, 'response');
    
    expect(format.json_schema.schema.type).toBe('object');
    expect(format.json_schema.schema.properties).toHaveProperty('has_match');
    expect(format.json_schema.schema.properties).toHaveProperty('response');
    
    // The response field should use union type, not nullable property
    const properties = format.json_schema.schema.properties as Record<string, { type?: unknown; nullable?: boolean }>;
    const responseField = properties.response;
    
    expect(responseField).toHaveProperty('type');
    expect(Array.isArray(responseField.type)).toBe(true);
    expect(responseField.type).toContain('string');
    expect(responseField.type).toContain('null');
    
    // Should NOT have "nullable: true" property which Azure OpenAI doesn't support
    expect(responseField).not.toHaveProperty('nullable');
  });
});

describe('Timeline Event Schema', () => {
  test('should accept valid timeline event with created_at', () => {
    const data = {
      id: 123,
      event: 'labeled',
      actor: { login: 'testuser', id: 1, type: 'User' },
      created_at: '2024-01-01T00:00:00Z',
    };

    const result = TimelineEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept timeline event without created_at', () => {
    const data = {
      id: 123,
      event: 'labeled',
      actor: { login: 'testuser', id: 1, type: 'User' },
      // missing created_at
    };

    const result = TimelineEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept timeline event with null body', () => {
    const data = {
      id: 123,
      event: 'labeled',
      actor: { login: 'testuser', id: 1, type: 'User' },
      body: null,
    };

    const result = TimelineEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should reject timeline event with null created_at', () => {
    const data = {
      id: 123,
      event: 'labeled',
      actor: { login: 'testuser', id: 1, type: 'User' },
      created_at: null,
    };

    const result = TimelineEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should accept timeline event with undefined created_at', () => {
    const data = {
      id: 123,
      event: 'labeled',
      actor: { login: 'testuser', id: 1, type: 'User' },
      created_at: undefined,
    };

    const result = TimelineEventSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
