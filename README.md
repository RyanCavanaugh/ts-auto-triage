# TypeScript Auto-Triage Tool

A comprehensive backlog grooming and issue management tool for TypeScript repositories, powered by AI and automation.

## Overview

This tool provides automated issue management capabilities including:

- **Issue Fetching**: Bulk download of GitHub issues and metadata
- **AI-Powered Summarization**: Generate concise summaries and embeddings for all issues
- **Smart Triage**: AI-assisted categorization and labeling
- **Duplicate Detection**: Embedding-based similarity search to find duplicates
- **FAQ Matching**: Automatic detection of issues that match common questions
- **Reproduction Testing**: Agentic AI that attempts to reproduce reported bugs
- **Action Management**: Human-reviewable action files for safe automation

## Architecture

The system is built as a TypeScript monorepo with the following packages:

- `@ryancavanaugh/kvcache` - AI response caching with hash-based file storage
- `@ryancavanaugh/issue-fetcher` - GitHub API integration with rate limiting
- `@ryancavanaugh/ai-wrapper` - Multi-model Azure OpenAI integration
- `@ryancavanaugh/lsp-harness` - TypeScript LSP communication
- `@ryancavanaugh/twoslash` - Parser for twoslash code examples
- `@ryancavanaugh/utils` - Common utilities and configuration

## Setup

### Prerequisites

1. Node.js 18+ 
2. GitHub CLI (`gh`) installed and authenticated
3. Access to Azure OpenAI services

### Installation

```bash
npm install
npm run build
```

### Configuration

1. Update `config.jsonc` with your Azure OpenAI endpoints and deployment names
2. Set environment variable: `AZURE_OPENAI_API_KEY=your_api_key`
3. Ensure GitHub CLI is authenticated: `gh auth login`

## Usage

### Basic Workflow

1. **Fetch Issues**
   ```bash
   ./src/cli/fetch-issues.js Microsoft/TypeScript
   ```

2. **Generate Summaries and Embeddings**
   ```bash
   ./src/cli/summarize-issues.js Microsoft/TypeScript
   ```

3. **Analyze New Issues**
   ```bash
   ./src/cli/first-response.js Microsoft/TypeScript#12345
   ./src/cli/curate-issue.js Microsoft/TypeScript#12345
   ```

4. **Review and Execute Actions**
   ```bash
   # Review the generated action file in .working/actions/
   ./src/cli/exec-action.js Microsoft/TypeScript#12345
   ```

5. **Test Bug Reports**
   ```bash
   ./src/cli/repro-issue.js Microsoft/TypeScript#12345
   ```

### CLI Commands

#### `fetch-issues.js <owner/repo>`
Downloads all issues and pull requests from a repository.
- Handles pagination and rate limiting
- Stores data in `.data/owner/repo/number.json`
- Includes comments, events, reactions, and metadata
- Supports resuming interrupted downloads

#### `fetch-issue.js <issue-ref>`
Fetches a single issue with fresh data.
- Accepts `owner/repo#123` or GitHub URL format
- Always fetches latest data (ignores cache)

#### `summarize-issues.js <owner/repo>`
Generates AI summaries and embeddings for cached issues.
- Creates concise technical summaries
- Generates embeddings for similarity search
- Stores results in `.data/summaries.json` and `.data/embeddings.json`
- Uses caching to avoid redundant API calls

#### `first-response.js <issue-ref>`
Analyzes new issues for FAQ matches and duplicates.
- Checks against `FAQ.md` content
- Performs embedding-based similarity search
- Generates personalized responses
- Outputs analysis to `.working/outputs/`

#### `curate-issue.js <issue-ref>`
AI-powered issue curation and labeling.
- Uses repository policy from `POLICY.md`
- Suggests appropriate labels and actions
- Creates action files for human review
- Considers issue content, comments, and context

#### `exec-action.js <issue-ref>`
Executes approved actions from action files.
- Idempotent operations (won't duplicate actions)
- Supports: add/remove labels, comments, assignments, close
- Moves completed action files to archive
- Full audit trail of changes

#### `repro-issue.js <issue-ref>`
Attempts to reproduce reported bugs using agentic AI.
- Analyzes issue description and code examples
- Creates minimal reproduction test cases
- Runs TypeScript compiler and tools
- Reports whether bug was successfully reproduced

#### `twoslash.js <file.md> <command>`
LSP integration for TypeScript code analysis.
- Parses twoslash-format code examples
- Supports: signature-help, hover, completions, diagnostics
- Used by reproduction testing system

## File Structure

```
.data/                    # Issue and summary data (gitignored)
├── owner/repo/
│   └── 123.json         # Individual issue files
├── summaries.json       # AI-generated summaries
└── embeddings.json      # Vector embeddings

.kvcache/                # AI response cache (gitignored)
└── aa/bb/cccccccc.json  # Hashed cache files

.working/                # Working outputs (gitignored)
├── repros/             # Bug reproduction attempts
├── outputs/            # Analysis reports  
└── actions/            # Action files for human review

packages/               # Library packages
├── kvcache/
├── issue-fetcher/
├── ai-wrapper/
├── lsp-harness/
├── twoslash/
└── utils/

src/cli/               # CLI entry points
```

## Action Files

When the system wants to modify an issue, it creates an action file for human review:

```jsonc
/* Proposed actions for Microsoft/TypeScript#9998
   Issue: "Compiler crashes on complex type"
   URL: https://github.com/Microsoft/TypeScript/issues/9998
   */
{
  "issue_ref": {
    "owner": "Microsoft",
    "repo": "TypeScript", 
    "number": 9998
  },
  "actions": [
    {
      "kind": "add_label",
      "label": "Bug"
    },
    {
      "kind": "comment",
      "comment": "Thank you for the report. This appears to be related to..."
    }
  ]
}
```

## AI Integration

The system uses Azure OpenAI with multiple models:
- **GPT-4**: Complex analysis, curation, reproduction planning
- **GPT-3.5**: Summaries, simple analysis tasks  
- **Embeddings**: Similarity search and duplicate detection

All AI calls are cached using content-based hashing to reduce costs and improve performance.

## Testing

```bash
npm test
```

The test suite includes unit tests for core libraries and integration-style tests for components that don't require external services.

## Development

```bash
npm run dev    # Watch mode compilation
npm run build  # Full build
npm run clean  # Clean build artifacts
```

## Contributing

This tool follows TypeScript coding guidelines:
- ESM modules with explicit `.js` imports
- Zod schemas for all external data
- Functional programming patterns over classes
- Comprehensive error handling and logging
- No direct console.log in libraries (use logger injection)

## Security

- Never commits secrets or API keys
- All GitHub modifications go through human-reviewed action files
- Sandbox isolated reproduction testing
- Rate limiting and retry logic for external APIs