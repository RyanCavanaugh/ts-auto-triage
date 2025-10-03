# Repro Extraction Process

This document describes the new 4-step repro extraction process implemented in this repository.

## Overview

The repro extraction process analyzes GitHub issue reports and generates automated reproduction steps for TypeScript bugs. It replaces the old iterative approach with a more structured, AI-guided process.

## The 4 Steps

### Step 1: Classification

**Purpose**: Determine the type of bug from the issue description.

**Input**: 
- Issue title
- Issue body (truncated to max length)
- Recent comments (last 3)

**Output**: `BugClassification`
```typescript
{
  bugType: "compiler" | "language-service" | "unknown",
  reasoning: string
}
```

**AI Prompts**: 
- `repro-classify-system.md`
- `repro-classify-user.md`

**Logic**:
- **compiler**: Issues affecting tsc command-line behavior, emitted JS, type checking, compilation errors
- **language-service**: Issues affecting editor/IDE features (completions, hover, diagnostics, refactoring)
- **unknown**: Insufficient information to determine bug type

### Step 2: Generate Repro Steps

**Purpose**: Create self-contained reproduction steps based on the bug classification.

**Input**: 
- Issue data
- Bug classification from Step 1

**Output**: `ReproSteps` (either `CompilerReproSteps` or `LSReproSteps`)

#### For Compiler Bugs

Output: `CompilerReproSteps`
```typescript
{
  type: "compiler-repro",
  fileMap: {
    "tsconfig.json": "{ /* config */ }",
    "index.ts": "// TypeScript code"
  },
  cmdLineArgs: ["--noEmit", "--strict"],
  instructions: "The bug still exists if..."
}
```

**AI Prompts**:
- `repro-compiler-system.md`
- `repro-compiler-user.md`

**Key Requirements**:
- `fileMap`: Contains all files needed (including tsconfig.json if needed)
- `cmdLineArgs`: Command-line arguments for tsc
- `instructions`: Must start with "The bug is fixed if" or "The bug still exists if"

#### For Language Service Bugs

Output: `LSReproSteps`
```typescript
{
  type: "ls-repro",
  twoslash: "// @fileName: test.ts\nconst x = /**/",
  instructions: "The bug still exists if..."
}
```

**AI Prompts**:
- `repro-ls-system.md`
- `repro-ls-user.md`

**Key Requirements**:
- `twoslash`: Twoslash format with query markers (`/**/`, `^?`, etc.)
- `instructions`: Must start with "The bug is fixed if" or "The bug still exists if"

### Step 3: Bug Revalidation (Optional)

**Purpose**: Run the reproduction and determine if the bug is still present.

**Input**: 
- Repro steps from Step 2
- Workspace directory for running tests

**Process**:

For **Compiler Bugs**:
1. Write files to workspace
2. Run `tsc` with specified command-line args
3. Collect output (stdout, stderr, generated files)
4. Ask AI to interpret results based on instructions

For **Language Service Bugs**:
1. Parse twoslash content
2. Write files to workspace
3. Start LSP server
4. Query LSP at marked positions
5. Ask AI to interpret results based on instructions

**Output**: `BugRevalidation`
```typescript
{
  bug_status: "present" | "not present",
  relevant_output: string,
  reasoning: string
}
```

**AI Prompts**:
- `repro-validate-system.md`
- `repro-validate-user.md`

### Step 4: Human-Readable Format

**Purpose**: Generate markdown reports for human review.

**Output Files**:
- `classification.json` - The bug classification
- `repro-steps.json` - The generated reproduction steps
- `validation.json` - Validation results (if --validate was used)
- `report.md` - Human-readable markdown combining all above

**Format**: The markdown includes:
- Bug classification with reasoning
- Reproduction steps (formatted with syntax highlighting)
- Validation results (if applicable)

## Usage

### Basic Usage (Classification + Repro Generation)

```bash
npm run static-repro test/test-repo#1001
```

This will:
1. Classify the bug
2. Generate repro steps
3. Save JSON files and markdown report

### With Validation

```bash
npm run static-repro test/test-repo#1001 --validate
```

This will:
1. Classify the bug
2. Generate repro steps
3. **Run the reproduction**
4. **Validate if bug is present**
5. Save JSON files and markdown report

## Test Data

See `.data/test/README.md` for information about the synthetic test issues.

## Schema Definitions

All schemas are defined in `src/lib/schemas.ts`:
- `BugClassificationSchema`
- `CompilerReproStepsSchema`
- `LSReproStepsSchema`
- `ReproStepsSchema` (discriminated union)
- `BugRevalidationSchema`

## Library Structure

- **`lib/repro-extractor.ts`**: Implements Steps 1 and 2 (classification and generation)
- **`lib/repro-validator.ts`**: Implements Step 3 (validation)
- **`lib/repro-formatter.ts`**: Implements Step 4 (formatting)
- **`cli/static-repro.ts`**: CLI orchestrator that ties everything together

## Design Principles

1. **Separation of Concerns**: Each step is independent and testable
2. **Type Safety**: All data uses Zod schemas for validation
3. **AI Guidance**: AI makes decisions at each step with clear reasoning
4. **Human Review**: All outputs are saved for human inspection
5. **Clear Instructions**: Validation instructions must be unambiguous

## Comparison to Old Process

The old `repro-issue.ts` used an iterative approach:
- Try to generate code
- Run it
- If it fails, try again (up to 3 times)
- No clear classification step
- Mixed compiler and LS logic

The new process:
- ✅ Classifies first (clearer AI guidance)
- ✅ Generates once (better prompts = better results)
- ✅ Optional validation (faster when not needed)
- ✅ Separated concerns (easier to test and maintain)
- ✅ Clear output format (JSON + Markdown)
