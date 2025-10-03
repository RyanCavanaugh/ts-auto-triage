# Test Data for Repro Extraction

This directory contains synthetic bug reports for testing the repro extraction process.

## Test Issues

### Issue #1001: Compiler Bug (Type Checking)
- **Type**: Compiler Bug
- **Description**: Bug about readonly arrays spreading into mutable arrays
- **Expected Classification**: `compiler`
- **Expected Repro Type**: `compiler-repro`
- **Key Features**: Clear reproduction case, specific type checking issue

### Issue #1002: Language Service Bug (Completions)
- **Type**: Language Service Bug
- **Description**: IntelliSense not showing imported types in completion list
- **Expected Classification**: `language-service`
- **Expected Repro Type**: `ls-repro`
- **Key Features**: Editor/IDE feature, completion list issue

### Issue #1003: Unknown
- **Type**: Unknown
- **Description**: Vague report with no clear reproduction steps
- **Expected Classification**: `unknown`
- **Expected Repro Type**: None (no repro steps generated)
- **Key Features**: Insufficient information, unclear issue

### Issue #1004: Compiler Bug (Output/Emit)
- **Type**: Compiler Bug
- **Description**: Missing helper function in emitted JavaScript
- **Expected Classification**: `compiler`
- **Expected Repro Type**: `compiler-repro`
- **Key Features**: JavaScript output issue, emit problem

## Usage

These test files can be used with the `static-repro` CLI:

```bash
# Without validation (just classification and repro generation)
npm run static-repro test/test-repo#1001

# With validation (runs the repro and validates bug status)
npm run static-repro test/test-repo#1001 --validate
```

Note: The test issues are intentionally synthetic and may not represent actual TypeScript bugs. They're designed to test the classification and extraction logic, not to be accurate bug reports.
