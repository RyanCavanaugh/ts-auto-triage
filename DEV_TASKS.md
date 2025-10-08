# Dev Inspection Tasks

This document describes the hereby tasks available for inspecting and analyzing GitHub issues during development.

## Tasks

All CLI entry points now have corresponding `hereby` tasks. Use `npx hereby --tasks` to see the full list of available tasks.

### Issue Analysis Tasks

#### `hereby first-response -- <issue-ref>`

Performs an automated first response check on a new issue, checking for:
- FAQ matches
- Similar/duplicate issues

**Example:**
```bash
hereby first-response -- Microsoft/TypeScript#9998
```

#### `hereby list-triggers -- <issue-ref>`

Lists all curation triggers and shows which ones would activate for the given issue.

**Example:**
```bash
hereby list-triggers -- Microsoft/TypeScript#9998
```

**Output:**
- Shows all available triggers
- Indicates which triggers are active (✓) or inactive (✗)
- Displays trigger descriptions
- Shows total count of active/inactive triggers

#### `hereby curate-issue -- <issue-ref>`

Run AI-powered curation on an issue to get action recommendations.

**Example:**
```bash
hereby curate-issue -- Microsoft/TypeScript#9998
```

### Reproduction Tasks

#### `hereby get-repro-steps -- <issue-ref>`

Generates reproduction steps for an issue using AI analysis. This performs:
1. Bug classification (compiler/language-service/unknown)
2. Reproduction steps generation
3. Saves results to `.working/outputs/` directory

**Example:**
```bash
hereby get-repro-steps -- Microsoft/TypeScript#9998
```

**Output Files:**
- `classification.json` - Bug classification results
- `repro-steps.json` - Generated reproduction steps
- `report.md` - Human-readable report

#### `hereby static-repro -- <issue-ref> [--validate]`

Run the new reproduction extraction process with optional validation.

**Example:**
```bash
hereby static-repro -- Microsoft/TypeScript#9998
hereby static-repro -- Microsoft/TypeScript#9998 --validate
```

#### `hereby repro-issue -- <issue-ref>`

Run old repro extraction logic (deprecated, use static-repro instead).

**Example:**
```bash
hereby repro-issue -- Microsoft/TypeScript#9998
```

### Data Fetching Tasks

#### `hereby fetch-issue -- <issue-ref>`

Fetch a single issue from GitHub and cache it locally.

**Example:**
```bash
hereby fetch-issue -- Microsoft/TypeScript#9998
```

#### `hereby fetch-issues -- <owner/repo>`

Fetch all issues and pull requests for a repository from GitHub. Now includes timeline events (labels, milestones, state changes).

**Options:**
- `--force` - Force re-fetch of all issues, even if they appear up-to-date

**Example:**
```bash
hereby fetch-issues -- Microsoft/TypeScript
hereby fetch-issues -- Microsoft/TypeScript --force
```

**What's Fetched:**
- Issue/PR metadata (title, body, state, labels, milestone, assignees)
- All comments
- Timeline events (labeled, unlabeled, milestoned, demilestoned, closed, reopened, assigned, unassigned, renamed)

### AI Processing Tasks

#### `hereby summarize-issues -- <owner/repo>`

Generate AI summaries for all issues in a repository.

**Example:**
```bash
hereby summarize-issues -- Microsoft/TypeScript
```

#### `hereby compute-embeddings -- <owner/repo>`

Compute embeddings for issues in a repository.

**Example:**
```bash
hereby compute-embeddings -- Microsoft/TypeScript
```

#### `hereby resummarize-suggestion -- <issue-ref>`

Extract contributions from suggestion discussions.

**Example:**
```bash
hereby resummarize-suggestion -- Microsoft/TypeScript#202
```

### Action Execution Tasks

#### `hereby exec-action -- <issue-ref>`

Execute proposed actions for an issue (adds labels, comments, etc.).

**Example:**
```bash
hereby exec-action -- Microsoft/TypeScript#9998
```

### Reporting Tasks

#### `hereby make-news -- <owner/repo>`

Generate newspaper reports for the last 7 days of issue activity. Creates daily markdown reports in `.reports/` directory with:
- Executive summary of activity
- Recommended actions (moderation/response needed)
- Chronological activity summaries for each issue
- **NEW**: One-sentence AI-generated summary for each issue

Each day starts and ends at 8 AM Seattle time. Reports include:
- Issues created
- Comments posted (AI-summarized if long)
- Issue state changes
- Action items for moderators and maintainers

**Example:**
```bash
hereby make-news -- Microsoft/TypeScript
```

**Output:**
- Creates files in `.reports/` named by date (e.g., `2025-01-15.md`)
- Each report covers a 24-hour period from 8 AM Seattle time to 8 AM Seattle time the next day
- AI analyzes comments for spam, rudeness, and response needs
- Comments from contributors/owners are excluded from action recommendations

#### `hereby publish-news -- <owner/repo>`

Publish newspaper reports to GitHub gists. Automatically creates new gists or updates existing ones by matching filename.

**Example:**
```bash
hereby publish-news -- Microsoft/TypeScript
```

**Features:**
- Automatically matches existing gists by filename to avoid duplicates
- Updates existing gists when reports are regenerated
- Creates private gists by default
- Uses the first line of the report as the gist description

### Testing and Validation Tasks

#### `hereby twoslash -- <filename.md> <command> [--cwd <directory>]`

Run TypeScript LSP testing harness.

**Commands:** `signature-help`, `hover`, `completions`

**Example:**
```bash
hereby twoslash -- example.md hover --cwd /path/to/project
```

#### `hereby check-ai`

Validate Azure OpenAI configuration (no arguments needed).

**Example:**
```bash
hereby check-ai
```

## Prerequisites

Before using these tasks, you need to:
1. Build the project: `npx hereby build`
2. Fetch the issue data first (if working with specific issues): `npx hereby fetch-issue -- <issue-ref>`
3. Have proper Azure OpenAI configuration in `config.jsonc` (for AI-powered tasks)
4. Have GitHub authentication set up (for tasks that interact with GitHub API)

## Note on Syntax

The tasks require the `--` separator before arguments (e.g., `hereby list-triggers -- owner/repo#123`). This is necessary because hereby's argument parser treats any non-option arguments as additional task names to run. The `--` tells hereby to stop parsing for task names and pass the remaining arguments to the task itself.
