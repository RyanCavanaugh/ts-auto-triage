# ts-auto-triage - Complete Implementation

This repository implements a comprehensive TypeScript issue management and backlog grooming tool according to the provided specification.

## Implementation Status ✅ COMPLETE

### ✅ All Requirements Implemented
- **Project Structure**: Complete TypeScript 5.9 ESM setup with proper tsconfig
- **GitHub Integration**: Full issue fetching with pagination, caching, and data validation  
- **AI Integration**: Azure OpenAI wrapper with caching and embedding support
- **Action System**: Complete issue mutation system with idempotency checks
- **LSP Integration**: TypeScript Language Server communication harness
- **Twoslash Parser**: Parsing and file generation for TypeScript testing
- **Schemas & Validation**: Comprehensive Zod schemas for all data structures
- **CLI Framework**: All 8 CLI entry points fully implemented
- **Configuration**: JSONC configuration system with Azure OpenAI endpoints

### ✅ Core Libraries (All Complete)
- `ai-wrapper`: Azure OpenAI integration with caching
- `kvcache`: Key-value caching system for AI calls
- `issue-fetcher`: GitHub API integration with full issue data
- `lsp-harness`: TypeScript LSP communication
- `twoslash`: Twoslash format parsing and testing
- `utils`: Comprehensive utilities and helper functions

### ✅ CLI Entry Points (All Complete)
1. `fetch-issue`: Single issue fetching ✅ **Production Ready**
2. `fetch-issues`: Bulk issue fetching ✅ **Production Ready**
3. `exec-action`: Execute GitHub actions ✅ **Production Ready**
4. `twoslash`: LSP testing harness ✅ **Production Ready**
5. `static-repro`: New repro extraction process ✅ **Production Ready**
6. `summarize-issues`: AI summaries and embeddings ✅ **Complete**
7. `curate-issue`: AI-powered issue curation ✅ **Complete**  
8. `first-response`: FAQ matching and duplicate detection ✅ **Complete**
9. `resummarize-suggestion`: Extract contributions from suggestion discussions ✅ **Complete**
10. ~~`repro-issue`~~: Old repro logic (deprecated, use `static-repro` instead)

## Architecture

### Type Safety & Validation
- All JSON data uses Zod schemas for validation
- Proper TypeScript types throughout with strict settings
- ESM modules with verbatim module syntax

**Important: For Azure OpenAI structured outputs**, nullable fields must use `z.union([type, z.null()])` instead of `.nullable()`. Azure OpenAI doesn't support the `"nullable": true` JSON Schema property and requires union types like `["string", "null"]` instead.

Example:
```typescript
// ✅ Correct: Use union type for Azure OpenAI
const schema = z.object({
  response: z.union([z.string(), z.null()])
});

// ❌ Wrong: Don't use .nullable() with structuredCompletion
const schema = z.object({
  response: z.string().nullable()  // This will fail!
});
```

### AI Integration  
- Azure OpenAI wrapper with Entra ID authentication
- Content-based caching for all AI calls
- Support for chat completions and embeddings
- Configurable models and endpoints

### GitHub Integration
- Handles rate limiting with exponential backoff
- Supports both issue and PR data with full metadata
- Caches data locally for offline processing
- Idempotent action execution with duplicate prevention

### Action System
- Actions written to `.working/actions/` for human review
- Supports: labels, comments, closing, milestones, assignments
- JSONC format with inline documentation
- Validation against repository metadata

### Reproduction System

The new repro extraction process follows a 4-step approach:

#### Step 1: Classification
Analyzes the issue to determine if it's a **Compiler Bug**, **Language Service Bug**, or **Unknown**.

#### Step 2: Repro Steps Generation
Creates self-contained reproduction steps based on the bug type:
- **Compiler Bug**: Generates a `compiler-repro` with file map and command-line args
- **Language Service Bug**: Generates an `ls-repro` with twoslash format

#### Step 3: Bug Revalidation
Optionally runs the reproduction and asks AI to determine if the bug is still present.

#### Step 4: Human-Readable Format
Generates markdown reports for human review.

**Usage:**
```bash
# Generate classification and repro steps
npx static-repro Microsoft/TypeScript#50139

# With validation (runs the repro and checks bug status)
npx static-repro Microsoft/TypeScript#50139 --validate
```

**Output Files:**
- `classification.json` - Bug classification
- `repro-steps.json` - Reproduction steps
- `validation.json` - Validation results (if --validate used)
- `report.md` - Human-readable report

**Test Data:**
See `.data/test/` for synthetic bug reports you can test with:
```bash
npx static-repro test/test-repo#1001  # Compiler bug
npx static-repro test/test-repo#1002  # Language service bug
npx static-repro test/test-repo#1003  # Unknown bug
```

**Note:** The old `repro-issue` command is deprecated. Use `static-repro` instead.

### Suggestion Resummarization

The `resummarize-suggestion` command processes suggestion issues to extract meaningful contributions from comment threads.

**How it works:**
1. Starts with the initial suggestion body
2. Iterates through each comment one-by-one
3. AI identifies contributions (technical insights, use cases, examples)
4. Merges similar contributions
5. Identifies follow-ups to existing contributions
6. Captures maintainer concerns
7. Outputs a structured markdown summary

**Usage:**
```bash
npx resummarize-suggestion Microsoft/TypeScript#202
```

**Output:** 
- Markdown file in `.working/actions/` with:
  - The suggestion description
  - All meaningful contributions with attributions
  - Follow-up discussions
  - Maintainer concerns

**What counts as a contribution:**
- References to libraries that would benefit
- Demonstrative code samples
- Concrete use cases with details
- Technical observations

**What is ignored:**
- "+1", "me too", "need this" comments
- Off-topic or personal content
- Duplicate observations

## Usage Examples

```bash
# Fetch and cache issue data
npx fetch-issue Microsoft/TypeScript#50139
npx fetch-issues Microsoft/TypeScript

# AI-powered analysis
npx summarize-issues Microsoft/TypeScript
npx curate-issue Microsoft/TypeScript#50139
npx first-response Microsoft/TypeScript#50139
npx repro-issue Microsoft/TypeScript#50139
npx resummarize-suggestion Microsoft/TypeScript#202

# Execute proposed actions
npx exec-action Microsoft/TypeScript#50139

# Test TypeScript behavior
npx twoslash example.md hover --cwd /path/to/project
```

## Configuration

Update `config.jsonc` with your Azure OpenAI endpoints:

```jsonc
{
  "azure": {
    "openai": {
      "endpoint": "https://your-resource.openai.azure.com/",
      "deployments": {
        "chat": "gpt-4o",
        "embeddings": "text-embedding-3-large"
      }
    }
  }
}
```

## Key Features

- **Comprehensive Issue Processing**: Handles repositories with 60k+ issues
- **AI-Powered Insights**: Automated summarization, curation, and reproduction
- **Human-in-the-Loop**: Action review system prevents automated mistakes
- **Real TypeScript Testing**: LSP integration for accurate behavior analysis
- **Robust Error Handling**: Rate limiting, retries, and graceful failures
- **Production Ready**: Full implementation with proper logging and monitoring

All requirements from the specification have been implemented and are ready for production use.