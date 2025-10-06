# First-Response Logging

This document describes the extensive logging added to the `first-response` CLI task.

## Overview

When running `first-response <issue-ref>`, the tool now creates a detailed markdown log file at:
```
.logs/<owner>/<repo>/first-response-<number>.md
```

For example, running `first-response Microsoft/TypeScript#9998` would create:
```
.logs/microsoft/typescript/first-response-9998.md
```

The `.logs/` directory is gitignored and will not be committed to the repository.

## Log Structure

The log file is structured as a markdown document with the following sections:

### 1. Header
- Task name and issue reference
- Timestamp of log creation

### 2. Initialization
- Issue being processed
- Configuration loading status
- AI wrapper initialization

### 3. Issue Data
- Source of issue data (local cache or GitHub API)
- Issue metadata (title, state, user, body length, comment count)
- Full issue metadata in collapsible section

### 4. Issue Analysis
- Issue title and body length

### 5. FAQ Matching
- Status of FAQ matching process
- Number of FAQ matches found
- Details of matched FAQ entries (title, confidence, writeup length)
- **LLM inputs and outputs for each FAQ check** including:
  - System and user prompts
  - Structured completion responses
  - Token usage statistics

### 6. Duplicate Detection
- Search for similar issues
- Number of similar issues found
- List of similar issues with similarity scores
- **LLM inputs for embedding generation** including:
  - Text being embedded
  - Embedding dimension
  - Token usage statistics

### 7. Action Generation
- Decision about whether to create actions
- Reasoning for the decision
- Generated comment text (if applicable)
- Action file details

### 8. Footer
- Completion timestamp

## LLM Logging Details

All LLM interactions are logged with:

1. **Input logging** (for structured completions and chat completions):
   - Context/purpose of the call
   - All messages with their roles (system, user, assistant)
   - Full prompt text in code blocks

2. **Output logging**:
   - Context/purpose of the call
   - Response content in JSON format
   - Token usage (prompt tokens, completion tokens, total tokens)

3. **Embedding logging**:
   - Input text (truncated if very long)
   - Embedding dimension
   - Token usage

## Decision Point Logging

The tool logs all major decision points with:
- **Decision:** A clear statement of what was decided
- **Reasoning:** The rationale behind the decision (when applicable)

Examples:
- "Found 2 FAQ match(es)"
- "No FAQ matches found"
- "Creating combined response action" with reasoning about FAQ matches and similar issues
- "No action needed" with reasoning about no matches found

## Data Logging

Complex data structures are logged in collapsible `<details>` sections for easy reading:
- Issue metadata
- FAQ match details
- Similar issue lists
- Generated comment content
- Action file content

## Example Log Excerpt

```markdown
# first-response Log for Microsoft/TypeScript#9998

Generated: 2024-01-15T10:30:00.000Z

---

## Initialization

Processing issue: Microsoft/TypeScript#9998

Configuration loaded successfully

AI wrapper initialized

## Issue Data

Loaded issue data from local cache: .data/microsoft/typescript/9998.json

<details>
<summary>Issue Metadata</summary>

\`\`\`json
{
  "title": "Why doesn't typeof T work?",
  "number": 9998,
  "state": "open",
  "created_at": "2024-01-01T00:00:00Z",
  "user": "someuser",
  "body_length": 250,
  "comments_count": 0
}
\`\`\`

</details>

## Issue Analysis

Issue title: Why doesn't typeof T work?

Issue body length: 250 characters

## FAQ Matching

Checking for FAQ matches...

### LLM Input: Check FAQ matches for Microsoft/TypeScript#9998

**system:**

\`\`\`
You are an expert TypeScript maintainer...
\`\`\`

**user:**

\`\`\`
Issue Title: Why doesn't typeof T work?
Issue Body: ...
\`\`\`

### LLM Output: Check FAQ matches for Microsoft/TypeScript#9998

\`\`\`json
{
  "match": "yes",
  "confidence": 9,
  "writeup": "Your issue is about using typeof with generic type parameters..."
}
\`\`\`

**Token Usage:** Prompt: 150, Completion: 80, Total: 230

**Decision:** Found 1 FAQ match(es)

<details>
<summary>FAQ Matches</summary>

\`\`\`json
[
  {
    "title": "Why can't I use typeof T?",
    "confidence": 9,
    "writeup_length": 300
  }
]
\`\`\`

</details>

...

---

Log completed at 2024-01-15T10:30:15.000Z
```

## Benefits

This extensive logging provides:

1. **Transparency**: Full visibility into all LLM interactions and decisions
2. **Debugging**: Easy to understand why the tool made certain decisions
3. **Auditing**: Complete record of AI model inputs and outputs
4. **Improvement**: Helps identify areas where prompts or logic can be improved
5. **Reproducibility**: All information needed to reproduce the analysis

## Usage

The logging is automatic and requires no configuration. Simply run the first-response command:

```bash
first-response Microsoft/TypeScript#9998
```

The log file will be created in `.logs/microsoft/typescript/first-response-9998.md`.
