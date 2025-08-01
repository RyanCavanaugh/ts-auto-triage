# Frequently Asked Questions

### Why is my TypeScript compilation slow?

> Q: TypeScript takes forever to compile my project. How can I speed it up?

The most common causes of slow TypeScript compilation are large union types, excessive type instantiation, and missing type annotations. Try enabling `--extendedDiagnostics` to see where TypeScript is spending time. Consider using project references for large codebases and ensure your `tsconfig.json` has appropriate `include` and `exclude` patterns.

### How do I fix circular dependency errors?

> Q: I'm getting errors about circular dependencies between my modules. What should I do?

Circular dependencies often indicate architectural issues. Restructure your code to extract shared types into separate files, use dependency injection patterns, or consider if one of the modules should be split into smaller pieces. The `--showConfig` flag can help you understand how TypeScript is resolving your modules.