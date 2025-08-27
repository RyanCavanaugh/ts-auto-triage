# Repository Information for Copilot

## Overview
This is a TypeScript-based tool for automating GitHub issue triage and backlog grooming. It integrates with Azure OpenAI for AI capabilities and GitHub APIs for issue management.

## Architecture

### Tech Stack
- TypeScript 5.9 with ESM modules
- Node.js runtime
- Azure OpenAI for AI features
- GitHub REST and GraphQL APIs
- Zod for schema validation
- Jest for testing

### Folder Structure
- `src/lib/` - Core libraries and utilities
- `src/cli/` - Command-line entry points
- `dist/` - Compiled TypeScript output
- `.data/` - Cached GitHub issue data (gitignored)
- `.kvcache/` - AI call cache (gitignored)
- `.working/` - Temporary outputs and action files (gitignored)

### Key Libraries
- `kvcache` - Key-value caching for AI calls
- `lsp-harness` - TypeScript LSP communication
- `twoslash` - Twoslash file format parsing
- `issue-fetcher` - GitHub API integration
- `utils` - General utilities

### CLI Commands
All CLI entry points accept GitHub issue references in the format `owner/repo#number` or full URLs.

- `repro-issue` - AI-powered issue reproduction testing
- `fetch-issues` - Bulk GitHub issue data fetching
- `fetch-issue` - Single issue data fetching
- `summarize-issues` - Generate AI summaries and embeddings
- `curate-issue` - AI-based issue curation recommendations
- `exec-action` - Execute proposed issue actions
- `first-response` - FAQ and duplicate checking for new issues
- `twoslash` - TypeScript LSP testing harness

### Configuration
- `config.jsonc` - Azure endpoints, tool paths, and settings
- `style.md` - Writing guidelines for AI-generated text
- `FAQ.md` - User frequently asked questions
- `POLICY.md` - Issue curation policies (filled by maintainers)

### Caching Strategy
- AI calls are cached in `.kvcache/` using content-based keys
- Issue data is cached in `.data/` for offline processing
- Cache keys are hashed and split into directory structure for filesystem efficiency

### Action System
When CLI tools want to modify GitHub issues, they write action files to `.working/actions/` instead of direct API calls. This allows human review before execution via `exec-action`.

### Code Style
- Use revealing function pattern instead of classes
- Prefer `??` over `||` for null handling
- Export objects with TitleCase, functions with camelCase
- All JSON I/O must use Zod schemas
- CLI entry points are minimal orchestrators, business logic lives in libraries
- Libraries accept host objects for logging instead of direct console usage
- **NEVER use `any` type** - use proper types, `unknown`, or specific interface types
- Prefer `unknown` over `any` when the type is truly unknown
- Use proper type assertions with specific types instead of `any`