import { describe, expect, test } from '@jest/globals';
import { FAQResponseSchema } from './schemas.js';

describe('FAQ Response Schema', () => {
  test('should accept response with has_match true and response string', () => {
    const data = {
      has_match: true,
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
});
