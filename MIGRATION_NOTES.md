# Migration from Completions API to Responses API

## Overview
This document describes the migration from the OpenAI Chat Completions API to the OpenAI Responses API in the ts-auto-triage codebase.

## API Version Update
- **Previous:** `2024-10-21`
- **Current:** `2025-04-01-preview`

The responses API is only supported in Azure OpenAI starting from API version `2025-03-01-preview` and later.

## Key Changes

### 1. Chat Completion Method

**Before:**
```typescript
const response = await client.chat.completions.create({
  model: model,
  messages: messages,
  max_tokens: options.maxTokens ?? null,
  temperature: options.temperature ?? null,
});

const result = {
  content: response.choices[0].message.content,
  usage: {
    prompt_tokens: response.usage.prompt_tokens,
    completion_tokens: response.usage.completion_tokens,
    total_tokens: response.usage.total_tokens,
  }
};
```

**After:**
```typescript
// Convert messages to responses API format
const inputItems = messages.map(msg => ({
  type: 'message' as const,
  role: msg.role,
  content: msg.content
}));

const response = await client.responses.create({
  model: model,
  input: inputItems,
  max_output_tokens: options.maxTokens ?? null,
  temperature: options.temperature ?? null,
});

const result = {
  content: response.output_text,
  usage: {
    prompt_tokens: response.usage.input_tokens,
    completion_tokens: response.usage.output_tokens,
    total_tokens: response.usage.total_tokens,
  }
};
```

### 2. Structured Completion Method

**Before:**
```typescript
const response = await client.chat.completions.create({
  model: model,
  messages: messages,
  max_tokens: options.maxTokens ?? null,
  temperature: options.temperature ?? null,
  response_format: zodResponseFormat(zodSchema, "response")
});

const result = zodSchema.parse(JSON.parse(response.choices[0].message.content));
```

**After:**
```typescript
// Convert messages to responses API format
const inputItems = messages.map(msg => ({
  type: 'message' as const,
  role: msg.role,
  content: msg.content
}));

const responseFormat = zodResponseFormat(zodSchema, "response");

const response = await client.responses.create({
  model: model,
  input: inputItems,
  max_output_tokens: options.maxTokens ?? null,
  temperature: options.temperature ?? null,
  text: {
    format: {
      type: 'json_schema' as const,
      name: responseFormat.json_schema.name,
      schema: responseFormat.json_schema.schema as { [key: string]: unknown },
      strict: responseFormat.json_schema.strict ?? null,
    }
  }
});

const result = zodSchema.parse(JSON.parse(response.output_text));
```

## Differences Between APIs

### Chat Completions API
- **Purpose:** Conversational AI with manual state management
- **Input:** `messages` array
- **Output:** `choices[0].message.content`
- **Use case:** Simple chat interfaces with straightforward state management

### Responses API
- **Purpose:** Stateful interactions with agentic capabilities
- **Input:** `input` array of items (messages, tool outputs, etc.)
- **Output:** `output_text` and structured `output` array
- **Use case:** Multi-step tasks, tool integration, advanced reasoning

## Breaking Changes
None for external consumers - the `AIWrapper` interface remains unchanged. The migration is transparent to callers of `chatCompletion()` and `structuredCompletion()`.

## Benefits of Responses API
1. **Server-side state management:** No need to send full conversation history
2. **Built-in tool support:** Web search, code execution, file search
3. **Event-driven architecture:** Better integration patterns
4. **Advanced reasoning:** Support for complex multi-step workflows

## Unchanged Components
- Embeddings API (`client.embeddings.create()`) - remains the same
- Cache keys - preserved for backward compatibility
- External interface - no changes to function signatures

## Testing
All existing unit tests pass with no modifications required. Integration tests that use live API calls will need Azure OpenAI API version `2025-04-01-preview` or later to function correctly.
