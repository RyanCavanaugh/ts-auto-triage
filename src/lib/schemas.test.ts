import { describe, expect, test } from '@jest/globals';
import { FAQResponseSchema, ConfigSchema } from './schemas.js';
import { zodResponseFormat } from 'openai/helpers/zod.js';

describe('Config Schema', () => {
  test('should accept config without repositories and defaultRepo', () => {
    const data = {
      typescript: {
        tscPath: 'tsc',
        lspEntryPoint: 'typescript-language-server',
      },
      azure: {
        openai: {
          endpoints: {
            low: 'https://test.openai.azure.com/',
            medium: 'https://test.openai.azure.com/',
            high: 'https://test.openai.azure.com/',
          },
          deployments: {
            low: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
            medium: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
            high: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
          },
        },
      },
      github: {
        maxIssueBodyLength: 8000,
        maxCommentLength: 2000,
        rateLimitRetryDelay: 5000,
        maxRetries: 3,
        faqUrl: 'https://github.com/microsoft/TypeScript/wiki/FAQ',
        bots: ['typescript-bot'],
      },
      ai: {
        maxReproAttempts: 3,
        cacheEnabled: true,
        maxEmbeddingInputLength: 8000,
      },
    };

    const result = ConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept config with repositories and defaultRepo', () => {
    const data = {
      typescript: {
        tscPath: 'tsc',
        lspEntryPoint: 'typescript-language-server',
      },
      azure: {
        openai: {
          endpoints: {
            low: 'https://test.openai.azure.com/',
            medium: 'https://test.openai.azure.com/',
            high: 'https://test.openai.azure.com/',
          },
          deployments: {
            low: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
            medium: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
            high: { chat: 'gpt-4', embeddings: 'text-embedding-3-large' },
          },
        },
      },
      github: {
        maxIssueBodyLength: 8000,
        maxCommentLength: 2000,
        rateLimitRetryDelay: 5000,
        maxRetries: 3,
        faqUrl: 'https://github.com/microsoft/TypeScript/wiki/FAQ',
        bots: ['typescript-bot'],
      },
      ai: {
        maxReproAttempts: 3,
        cacheEnabled: true,
        maxEmbeddingInputLength: 8000,
      },
      repositories: ['microsoft/TypeScript', 'microsoft/TypeScript-Website'],
      defaultRepo: 'microsoft/TypeScript',
    };

    const result = ConfigSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repositories).toEqual(['microsoft/TypeScript', 'microsoft/TypeScript-Website']);
      expect(result.data.defaultRepo).toBe('microsoft/TypeScript');
    }
  });
});

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
