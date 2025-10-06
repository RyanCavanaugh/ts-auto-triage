import { writeFile, appendFile } from 'fs/promises';
import { ensureDirectoryExists } from './utils.js';
import type { IssueRef } from './schemas.js';

/**
 * Get the log file path for a given issue and task
 */
export function getLogPath(issueRef: IssueRef, task: string): string {
  return `.logs/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${task}-${issueRef.number}.md`;
}

export interface FileLogger {
  /**
   * Log a section header in the markdown file
   */
  logSection(title: string): Promise<void>;

  /**
   * Log informational message
   */
  logInfo(message: string): Promise<void>;

  /**
   * Log a decision point
   */
  logDecision(decision: string, reasoning?: string): Promise<void>;

  /**
   * Log LLM input (prompt/messages)
   */
  logLLMInput(context: string, messages: Array<{ role: string; content: string }>): Promise<void>;

  /**
   * Log LLM output (response)
   */
  logLLMOutput(context: string, output: unknown, usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): Promise<void>;

  /**
   * Log raw data in a collapsible section
   */
  logData(label: string, data: unknown): Promise<void>;

  /**
   * Finalize the log file
   */
  finalize(): Promise<void>;
}

/**
 * Create a file logger that writes markdown logs to .logs/<owner>/<repo>/<task>-<number>.md
 */
export function createFileLogger(
  issueRef: IssueRef,
  task: string
): FileLogger {
  const logPath = getLogPath(issueRef, task);
  ensureDirectoryExists(logPath);

  let isInitialized = false;

  const initialize = async () => {
    if (isInitialized) return;
    
    const header = `# ${task} Log for ${issueRef.owner}/${issueRef.repo}#${issueRef.number}

Generated: ${new Date().toISOString()}

---

`;
    await writeFile(logPath, header);
    isInitialized = true;
  };

  const append = async (content: string) => {
    await initialize();
    await appendFile(logPath, content);
  };

  return {
    async logSection(title: string): Promise<void> {
      await append(`\n## ${title}\n\n`);
    },

    async logInfo(message: string): Promise<void> {
      await append(`${message}\n\n`);
    },

    async logDecision(decision: string, reasoning?: string): Promise<void> {
      await append(`**Decision:** ${decision}\n\n`);
      if (reasoning) {
        await append(`**Reasoning:** ${reasoning}\n\n`);
      }
    },

    async logLLMInput(context: string, messages: Array<{ role: string; content: string }>): Promise<void> {
      await append(`### LLM Input: ${context}\n\n`);
      for (const message of messages) {
        await append(`**${message.role}:**\n\n`);
        await append('```\n');
        await append(message.content);
        await append('\n```\n\n');
      }
    },

    async logLLMOutput(context: string, output: unknown, usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): Promise<void> {
      await append(`### LLM Output: ${context}\n\n`);
      await append('```json\n');
      await append(JSON.stringify(output, null, 2));
      await append('\n```\n\n');
      
      if (usage) {
        await append(`**Token Usage:** Prompt: ${usage.prompt_tokens ?? 'N/A'}, Completion: ${usage.completion_tokens ?? 'N/A'}, Total: ${usage.total_tokens ?? 'N/A'}\n\n`);
      }
    },

    async logData(label: string, data: unknown): Promise<void> {
      await append(`<details>\n<summary>${label}</summary>\n\n`);
      await append('```json\n');
      await append(JSON.stringify(data, null, 2));
      await append('\n```\n\n');
      await append('</details>\n\n');
    },

    async finalize(): Promise<void> {
      await append(`\n---\n\nLog completed at ${new Date().toISOString()}\n`);
    },
  };
}
