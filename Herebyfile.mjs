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

// Dev inspection tasks
export const firstResponse = task({
    name: "first-response",
    description: "Run first-response check on an issue",
    run: async () => {
        const issueRef = process.argv[3];
        if (!issueRef) {
            console.error('Usage: hereby first-response <issue-ref>');
            console.error('Example: hereby first-response Microsoft/TypeScript#9998');
            process.exit(1);
        }
        await execa("node", ["dist/cli/first-response.js", issueRef], { stdio: "inherit" });
    },
});

export const listTriggers = task({
    name: "list-triggers",
    description: "List triggers that would activate for an issue",
    run: async () => {
        const issueRef = process.argv[3];
        if (!issueRef) {
            console.error('Usage: hereby list-triggers <issue-ref>');
            console.error('Example: hereby list-triggers Microsoft/TypeScript#9998');
            process.exit(1);
        }
        await execa("node", ["dist/cli/list-triggers.js", issueRef], { stdio: "inherit" });
    },
});

export const getReproSteps = task({
    name: "get-repro-steps",
    description: "Generate reproduction steps for an issue",
    run: async () => {
        const issueRef = process.argv[3];
        if (!issueRef) {
            console.error('Usage: hereby get-repro-steps <issue-ref>');
            console.error('Example: hereby get-repro-steps Microsoft/TypeScript#9998');
            process.exit(1);
        }
        await execa("node", ["dist/cli/get-repro-steps.js", issueRef], { stdio: "inherit" });
    },
});

// Default task - build
export default build;
