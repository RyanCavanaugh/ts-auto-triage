# Issue Fetcher and Newspaper Enhancements - Summary

This document summarizes the enhancements made to the issue fetcher and newspaper reporting system.

## Changes Made

### 1. Timeline Events Support

**What was added:**
- Extended `GitHubIssue` schema to include optional `timeline_events` array
- Modified issue fetcher to capture timeline events from GitHub API

**Timeline events captured:**
- `labeled` - When a label is added
- `unlabeled` - When a label is removed
- `milestoned` - When a milestone is set
- `demilestoned` - When a milestone is removed
- `closed` - When an issue/PR is closed
- `reopened` - When an issue/PR is reopened
- `assigned` - When someone is assigned
- `unassigned` - When someone is unassigned
- `renamed` - When the title is changed
- Other events as available from GitHub's timeline API

**Files modified:**
- `src/lib/schemas.ts` - Added `TimelineEventSchema` and `TimelineEventActorSchema`
- `src/lib/issue-fetcher.ts` - Added timeline event fetching logic

### 2. Force Option for Fetching

**What was added:**
- `--force` flag for `fetch-issues` CLI command
- Updates all issues regardless of whether they appear up-to-date

**Usage:**
```bash
hereby fetch-issues -- Microsoft/TypeScript --force
```

**Files modified:**
- `src/cli/fetch-issues.ts` - Added command-line flag parsing
- `src/lib/issue-fetcher.ts` - Added force parameter to methods

### 3. Pull Request Fetching

**Status:**
Pull requests are already supported! The GitHub API treats pull requests as a special type of issue.

**How it works:**
- Issues with a `pull_request` field are marked as PRs
- The `is_pull_request` boolean field identifies them
- Timeline events work the same for PRs and issues

### 4. One-Sentence AI Summaries in Newspapers

**What was added:**
- AI-generated one-sentence summaries for each issue in newspaper reports
- New prompts for generating concise summaries

**Example output:**
```markdown
### [Issue Microsoft/TypeScript#12345](https://github.com/...)

**Original Title Goes Here**

*This issue reports a type inference problem when using generic constraints with conditional types.*

[Rest of the activity report...]
```

**Files created:**
- `prompts/one-sentence-summary-system.md` - System prompt
- `prompts/one-sentence-summary-user.md` - User prompt template

**Files modified:**
- `src/lib/newspaper-generator.ts` - Added summary generation
- `src/lib/schemas.ts` - Added `OneSentenceSummarySchema`

### 5. Gist Publishing

**What was added:**
- New `publish-news` CLI command
- Hereby task: `hereby publish-news -- <owner/repo>`
- Intelligent gist recycling by filename

**How it works:**
1. Reads markdown reports from `.reports/<owner>/<repo>/`
2. For each report, checks if a gist already exists with that filename
3. If exists, updates the existing gist
4. If not, creates a new private gist
5. Uses the first line of the report as the gist description

**Files created:**
- `src/cli/publish-news.ts` - New CLI tool

**Files modified:**
- `package.json` - Added bin entry
- `Herebyfile.mjs` - Added task

## Usage Examples

### Fetching Issues with Timeline Events

```bash
# Normal fetch (uses caching)
hereby fetch-issues -- Microsoft/TypeScript

# Force re-fetch all issues
hereby fetch-issues -- Microsoft/TypeScript --force
```

### Generating Newspaper Reports

```bash
# Generate reports for last 7 days
hereby make-news -- Microsoft/TypeScript
```

Reports will include:
- Executive summary
- Recommended actions
- **NEW**: One-sentence AI summary for each issue
- Chronological activity timeline

### Publishing to Gists

```bash
# Publish reports to GitHub gists
hereby publish-news -- Microsoft/TypeScript
```

This will:
- Create or update gists for each daily report
- Match existing gists by filename to avoid duplicates
- Use private gists by default

## Data Structure Changes

### GitHubIssue Type

Before:
```typescript
{
  id: number;
  number: number;
  title: string;
  // ... other fields
  comments: GitHubComment[];
  is_pull_request: boolean;
}
```

After:
```typescript
{
  id: number;
  number: number;
  title: string;
  // ... other fields
  comments: GitHubComment[];
  is_pull_request: boolean;
  timeline_events?: TimelineEvent[];  // NEW!
}
```

### TimelineEvent Type

```typescript
{
  id?: number;
  event: string;  // e.g., "labeled", "closed", "reopened"
  actor?: {
    login: string;
    id: number;
    type: string;
  };
  created_at: string;
  label?: {
    name: string;
    color: string;
  };
  milestone?: {
    title: string;
  };
  // ... other event-specific fields
}
```

## Testing

All existing tests pass:
- 17 test suites
- 137 tests
- 100% pass rate

## Documentation

Updated `DEV_TASKS.md` with:
- New `--force` flag documentation
- Timeline events information
- `publish-news` task documentation
- Updated examples

## Backward Compatibility

✅ All changes are backward compatible:
- `timeline_events` is optional
- Existing cached issues without timeline events still work
- Old code paths continue to function
- No breaking changes to existing APIs

## Next Steps

To start using these features:

1. Re-fetch issues to get timeline events:
   ```bash
   hereby fetch-issues -- <owner/repo> --force
   ```

2. Generate newspaper reports:
   ```bash
   hereby make-news -- <owner/repo>
   ```

3. Publish to gists:
   ```bash
   hereby publish-news -- <owner/repo>
   ```
