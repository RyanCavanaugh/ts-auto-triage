# ts-auto-triage

A backlog grooming and issue management tool for TypeScript repositories.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build all packages:
   ```bash
   npm run build
   ```

3. Ensure you're logged in to GitHub CLI:
   ```bash
   gh auth login
   ```

## CLI Commands

### fetch-issue
Fetch a single issue from GitHub and save it to `.data/`:
```bash
node packages/cli/dist/fetch-issue.js Microsoft/TypeScript#9998
```

### fetch-issues
Fetch all issues from a repository:
```bash
node packages/cli/dist/fetch-issues.js Microsoft/TypeScript
```

### exec-action
Execute actions on an issue from action files in `.working/actions/`:
```bash
node packages/cli/dist/exec-action.js Microsoft/TypeScript#9998
```

### twoslash
Process twoslash files and query TypeScript language services:
```bash
node packages/cli/dist/twoslash.js example.md signature-help
```

## Configuration

Edit `config.jsonc` to configure:
- TypeScript paths
- Azure OpenAI endpoints
- GitHub API settings

## Directory Structure

- `.data/` - Cached GitHub issue data
- `.kvcache/` - AI response cache
- `.working/` - Working files and outputs
  - `actions/` - Action files for GitHub mutations
  - `outputs/` - Generated reports and responses
  - `repros/` - Reproduction test environments

## Development

The project is organized as a monorepo with these packages:
- `@ryancavanaugh/utils` - Shared utilities
- `@ryancavanaugh/kvcache` - Disk-based caching
- `@ryancavanaugh/issue-fetcher` - GitHub API integration
- `@ryancavanaugh/lsp-harness` - TypeScript LSP communication
- `@ryancavanaugh/twoslash` - Twoslash format parsing
- `@ryancavanaugh/cli` - Command-line interface