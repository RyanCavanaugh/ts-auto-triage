# Dev Inspection Tasks

This document describes the hereby tasks available for inspecting and analyzing GitHub issues during development.

## Tasks

### `hereby first-response -- <issue-ref>`

Performs an automated first response check on a new issue, checking for:
- FAQ matches
- Similar/duplicate issues

**Example:**
```bash
hereby first-response -- Microsoft/TypeScript#9998
```

### `hereby list-triggers -- <issue-ref>`

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

### `hereby get-repro-steps -- <issue-ref>`

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

## Prerequisites

Before using these tasks, you need to:
1. Fetch the issue data first: `node dist/cli/fetch-issue.js <issue-ref>`
2. Have proper Azure OpenAI configuration in `config.jsonc`
3. Have GitHub authentication set up (for list-triggers)

## Note on Syntax

The tasks require the `--` separator before the issue reference (e.g., `hereby list-triggers -- owner/repo#123`). This is necessary because hereby's argument parser treats any non-option arguments as additional task names to run. The `--` tells hereby to stop parsing for task names and pass the remaining arguments to the task itself.
