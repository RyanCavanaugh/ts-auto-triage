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

// Default task - build
export default build;
