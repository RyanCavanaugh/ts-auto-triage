import { task } from "hereby";
import { execa } from "execa";
import { rm } from "fs/promises";

// Clean task - remove build artifacts
export const clean = task({
    name: "clean",
    description: "Remove build artifacts",
    run: async () => {
        await rm("dist", { recursive: true, force: true });
    },
});

// Build task - compile TypeScript
export const build = task({
    name: "build",
    description: "Compile TypeScript to JavaScript",
    dependencies: [clean],
    run: async () => {
        await execa("tsc", { stdio: "inherit" });
    },
});

// Dev task - watch mode compilation
export const dev = task({
    name: "dev",
    description: "Compile TypeScript in watch mode",
    run: async () => {
        await execa("tsc", ["--watch"], { stdio: "inherit" });
    },
});

// Test task - run Jest tests
export const test = task({
    name: "test",
    description: "Run Jest tests",
    run: async () => {
        await execa("npx", ["jest"], { 
            stdio: "inherit",
            env: { ...process.env, NODE_OPTIONS: "--experimental-vm-modules" }
        });
    },
});

// Lint task - run ESLint
export const lint = task({
    name: "lint",
    description: "Run ESLint on TypeScript files",
    run: async () => {
        await execa("eslint", ["src/**/*.ts"], { stdio: "inherit" });
    },
});

// Helper function to extract issue reference from command line arguments
function getIssueRefFromArgs(taskName) {
    // Look for argument after -- separator
    const separatorIndex = process.argv.indexOf('--');
    if (separatorIndex >= 0 && separatorIndex < process.argv.length - 1) {
        return process.argv[separatorIndex + 1];
    }
    
    // Fallback: show usage
    console.error(`Usage: hereby ${taskName} -- <issue-ref>`);
    console.error(`Example: hereby ${taskName} -- Microsoft/TypeScript#9998`);
    process.exit(1);
}

// Helper function to extract repository reference from command line arguments
function getRepoRefFromArgs(taskName, optional = false) {
    // Look for argument after -- separator
    const separatorIndex = process.argv.indexOf('--');
    if (separatorIndex >= 0 && separatorIndex < process.argv.length - 1) {
        // Get all arguments after --
        return process.argv.slice(separatorIndex + 1);
    }
    
    // No arguments provided
    if (optional) {
        return []; // Return empty array when optional
    }
    
    // Fallback: show usage
    console.error(`Usage: hereby ${taskName} -- [<owner/repo>...]`);
    console.error(`Example: hereby ${taskName} -- Microsoft/TypeScript`);
    console.error(`Example: hereby ${taskName} -- Microsoft/TypeScript facebook/react`);
    console.error('');
    console.error('Or configure default repositories in config.jsonc under github.repos');
    process.exit(1);
}

// Dev inspection tasks
export const firstResponse = task({
    name: "first-response",
    description: "Run first-response check on an issue",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('first-response');
        await execa("node", ["dist/cli/first-response.js", issueRef], { stdio: "inherit" });
    },
});

export const listTriggers = task({
    name: "list-triggers",
    description: "List triggers that would activate for an issue",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('list-triggers');
        await execa("node", ["dist/cli/list-triggers.js", issueRef], { stdio: "inherit" });
    },
});

export const getReproSteps = task({
    name: "get-repro-steps",
    description: "Generate reproduction steps for an issue",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('get-repro-steps');
        await execa("node", ["dist/cli/get-repro-steps.js", issueRef], { stdio: "inherit" });
    },
});

export const fetchIssue = task({
    name: "fetch-issue",
    description: "Fetch a single issue from GitHub",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('fetch-issue');
        await execa("node", ["dist/cli/fetch-issue.js", issueRef], { stdio: "inherit" });
    },
});

export const fetchPR = task({
    name: "fetch-pr",
    description: "Fetch a single pull request from GitHub",
    dependencies: [build],
    run: async () => {
        const prRef = getIssueRefFromArgs('fetch-pr');
        await execa("node", ["dist/cli/fetch-pr.js", prRef], { stdio: "inherit" });
    },
});

export const curateIssue = task({
    name: "curate-issue",
    description: "Run AI-powered curation on an issue",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('curate-issue');
        await execa("node", ["dist/cli/curate-issue.js", issueRef], { stdio: "inherit" });
    },
});

export const execAction = task({
    name: "exec-action",
    description: "Execute proposed actions for an issue",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('exec-action');
        await execa("node", ["dist/cli/exec-action.js", issueRef], { stdio: "inherit" });
    },
});

export const resummarizeSuggestion = task({
    name: "resummarize-suggestion",
    description: "Extract contributions from suggestion discussions",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('resummarize-suggestion');
        await execa("node", ["dist/cli/resummarize-suggestion.js", issueRef], { stdio: "inherit" });
    },
});

export const reproIssue = task({
    name: "repro-issue",
    description: "Run old repro extraction logic (deprecated, use static-repro instead)",
    dependencies: [build],
    run: async () => {
        const issueRef = getIssueRefFromArgs('repro-issue');
        await execa("node", ["dist/cli/repro-issue.js", issueRef], { stdio: "inherit" });
    },
});

export const fetchIssues = task({
    name: "fetch-issues",
    description: "Fetch all issues for repositories from GitHub",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('fetch-issues', true);
        
        // Check for --force flag
        const separatorIndex = process.argv.indexOf('--');
        let args = repoRefs;
        if (separatorIndex >= 0) {
            const allArgs = process.argv.slice(separatorIndex + 1);
            const forceIndex = allArgs.indexOf('--force');
            if (forceIndex >= 0) {
                args = ['--force', ...repoRefs];
            }
        }
        
        await execa("node", ["dist/cli/fetch-issues.js", ...args], { stdio: "inherit" });
    },
});

export const fetchPRs = task({
    name: "fetch-prs",
    description: "Fetch all pull requests for repositories from GitHub",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('fetch-prs', true);
        
        // Check for --force flag
        const separatorIndex = process.argv.indexOf('--');
        let args = repoRefs;
        if (separatorIndex >= 0) {
            const allArgs = process.argv.slice(separatorIndex + 1);
            const forceIndex = allArgs.indexOf('--force');
            if (forceIndex >= 0) {
                args = ['--force', ...repoRefs];
            }
        }
        
        await execa("node", ["dist/cli/fetch-prs.js", ...args], { stdio: "inherit" });
    },
});

export const summarizeIssues = task({
    name: "summarize-issues",
    description: "Generate AI summaries for all issues in repositories",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('summarize-issues', true);
        await execa("node", ["dist/cli/summarize-issues.js", ...repoRefs], { stdio: "inherit" });
    },
});

export const computeEmbeddings = task({
    name: "compute-embeddings",
    description: "Compute embeddings for issues in repositories",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('compute-embeddings', true);
        await execa("node", ["dist/cli/compute-embeddings.js", ...repoRefs], { stdio: "inherit" });
    },
});

export const checkAi = task({
    name: "check-ai",
    description: "Validate Azure OpenAI configuration",
    dependencies: [build],
    run: async () => {
        await execa("node", ["dist/cli/check-ai.js"], { stdio: "inherit" });
    },
});

export const staticRepro = task({
    name: "static-repro",
    description: "Run new repro extraction process (with optional --validate flag)",
    dependencies: [build],
    run: async () => {
        const separatorIndex = process.argv.indexOf('--');
        if (separatorIndex < 0 || separatorIndex >= process.argv.length - 1) {
            console.error('Usage: hereby static-repro -- <issue-ref> [--validate]');
            console.error('Example: hereby static-repro -- Microsoft/TypeScript#9998');
            console.error('Example: hereby static-repro -- Microsoft/TypeScript#9998 --validate');
            process.exit(1);
        }
        
        // Get all arguments after --
        const args = process.argv.slice(separatorIndex + 1);
        await execa("node", ["dist/cli/static-repro.js", ...args], { stdio: "inherit" });
    },
});

export const twoslash = task({
    name: "twoslash",
    description: "Run TypeScript LSP testing harness",
    dependencies: [build],
    run: async () => {
        const separatorIndex = process.argv.indexOf('--');
        if (separatorIndex < 0 || separatorIndex >= process.argv.length - 2) {
            console.error('Usage: hereby twoslash -- <filename.md> <command> [--cwd <directory>]');
            console.error('Commands: signature-help, hover, completions');
            console.error('Example: hereby twoslash -- example.md hover --cwd /path/to/project');
            process.exit(1);
        }
        
        // Get all arguments after --
        const args = process.argv.slice(separatorIndex + 1);
        await execa("node", ["dist/cli/twoslash.js", ...args], { stdio: "inherit" });
    },
});

export const makeNews = task({
    name: "make-news",
    description: "Generate newspaper reports for the last 7 days",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('make-news', true);
        await execa("node", ["dist/cli/make-news.js", ...repoRefs], { stdio: "inherit" });
    },
});

export const publishNews = task({
    name: "publish-news",
    description: "Publish newspaper reports to GitHub gists",
    dependencies: [build],
    run: async () => {
        const repoRefs = getRepoRefFromArgs('publish-news', true);
        await execa("node", ["dist/cli/publish-news.js", ...repoRefs], { stdio: "inherit" });
    },
});

// Default task - build
export default build;
