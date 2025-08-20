#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger, ensureDirectoryExists } from '../lib/utils.js';
import { createAIWrapper, type AIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, EmbeddingsDataSchema, SummariesDataSchema, type GitHubIssue, type Config } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: summarize-issues <owner/repo>');
      console.error('Example: summarize-issues Microsoft/TypeScript');
      process.exit(1);
    }

    const repoInput = args[0]!;
    const [owner, repo] = repoInput.split('/');
    
    if (!owner || !repo) {
      console.error('Invalid repository format. Use: owner/repo');
      process.exit(1);
    }
    
    logger.info(`Summarizing issues for: ${owner}/${repo}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Read existing summaries and embeddings
    const summariesPath = '.data/summaries.json';
    const embeddingsPath = '.data/embeddings.json';
    
    let existingSummaries: Record<string, string[]> = {};
    let existingEmbeddings: Record<string, string[]> = {};
     
    try {
      const summariesContent = await readFile(summariesPath, 'utf-8');
      existingSummaries = SummariesDataSchema.parse(JSON.parse(summariesContent));
    } catch {
      // File doesn't exist yet, start fresh
    }
    
    try {
      const embeddingsContent = await readFile(embeddingsPath, 'utf-8');
      existingEmbeddings = EmbeddingsDataSchema.parse(JSON.parse(embeddingsContent));
    } catch {
      // File doesn't exist yet, start fresh
    }

    // Find all issue files for this repository
    const dataDir = `.data/${owner.toLowerCase()}/${repo.toLowerCase()}`;
    let issueFiles: string[] = [];
    
    try {
      const files = await readdir(dataDir);
      issueFiles = files.filter(f => f.endsWith('.json')).map(f => join(dataDir, f));
    } catch {
      logger.error(`No issue data found in ${dataDir}. Run fetch-issues first.`);
      process.exit(1);
    }

    logger.info(`Found ${issueFiles.length} issue files to process`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const filePath of issueFiles) {
      const issueNumber = basename(filePath, '.json');
      const issueKey = `${owner.toLowerCase()}/${repo.toLowerCase()}#${issueNumber}`;

      // Skip if already processed (both summaries and embeddings must be present)
      if (
        existingSummaries[issueKey] && Array.isArray(existingSummaries[issueKey]) && existingSummaries[issueKey].length > 0 &&
        existingEmbeddings[issueKey] && Array.isArray(existingEmbeddings[issueKey]) && existingEmbeddings[issueKey].length > 0
      ) {
        skippedCount++;
        continue;
      }

      logger.info(`Processing ${issueKey}...`);

      try {
        // Load issue data
        const issueContent = await readFile(filePath, 'utf-8');
        const issue = GitHubIssueSchema.parse(JSON.parse(issueContent));

        // Create summaries (array) if not exists
        if (!existingSummaries[issueKey] || existingSummaries[issueKey].length === 0) {
          const summaries = await createIssueSummaries(ai, issue, config, 3);
          existingSummaries[issueKey] = summaries;
          logger.debug(`Created summaries for ${issueKey}`);
        }

        // Create embeddings array (one per summary) if not exists
        if (!existingEmbeddings[issueKey] || existingEmbeddings[issueKey].length === 0) {
          const summariesForIssue = existingSummaries[issueKey]!;
          const embeddingBase64Array: string[] = [];
          for (const s of summariesForIssue) {
            const embeddingResponse = await ai.getEmbedding(s);
            const embeddingBase64 = Buffer.from(new Float32Array(embeddingResponse.embedding).buffer).toString('base64');
            embeddingBase64Array.push(embeddingBase64);
          }
          existingEmbeddings[issueKey] = embeddingBase64Array;
          logger.debug(`Created embeddings for ${issueKey}`);
        }

        processedCount++;

        // Save progress every 10 issues
        if (processedCount % 10 === 0) {
          await saveData(summariesPath, existingSummaries);
          await saveData(embeddingsPath, existingEmbeddings);
          logger.info(`Processed ${processedCount} issues, saved progress`);
        }

      } catch (error) {
        logger.error(`Failed to process ${issueKey}: ${error}`);
        continue;
      }
    }

    // Save final results
    await saveData(summariesPath, existingSummaries);
    await saveData(embeddingsPath, existingEmbeddings);

    logger.info(`Summarization complete! Processed: ${processedCount}, Skipped: ${skippedCount}, Total: ${issueFiles.length}`);

  } catch (error) {
    logger.error(`Failed to summarize issues: ${error}`);
    process.exit(1);
  }
}

async function createIssueSummaries(ai: AIWrapper, issue: GitHubIssue, config: Config, count = 3): Promise<string[]> {
  // Truncate body and comments to stay within context limits
  const body = issue.body ? truncateText(issue.body, config.github.maxIssueBodyLength) : '';
  const recentComments = issue.comments
    .slice(-5) // Only use last 5 comments
    .map((c) => truncateText(c.body, config.github.maxCommentLength))
    .join('\n---\n');

  const systemPrompt = await loadPrompt('summarize-issue-system');
  const userPrompt = await loadPrompt('summarize-issue-user', {
    issueNumber: String(issue.number),
    issueTitle: issue.title,
    issueState: issue.state,
    labels: issue.labels.map((l) => l.name).join(', '),
    body,
    recentComments,
  });

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
    // Request structured output: a JSON array of summaries
    { role: 'user' as const, content: `Please provide exactly ${count} concise summaries as a JSON array of strings. Example: ["summary one", "summary two", "summary three"]. Each summary should be no longer than 200 words. Return only the JSON array.` },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 800 });
  const content = response.content.trim();

  // First, try to parse as JSON
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((x: unknown) => typeof x === 'string')) {
      const trimmed = parsed.map((s: string) => s.trim());
      // Ensure exactly `count` items
      if (trimmed.length >= count) return trimmed.slice(0, count);
      while (trimmed.length < count) trimmed.push(trimmed[trimmed.length - 1] || '');
      return trimmed;
    }
  } catch {
    // Not JSON, fall through to heuristic parsing
  }

  // Heuristic parsing: split on paragraphs, bullets, or lines
  function parseSummariesFromText(text: string, desired: number): string[] {
    const paragraphs = text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length >= 1) {
      const cleaned = paragraphs.map(p => p.replace(/^[-*•\u2022]\s+/, '').replace(/^\d+[\.)]\s+/, '').trim());
      if (cleaned.length >= desired) return cleaned.slice(0, desired);
      while (cleaned.length < desired) cleaned.push(cleaned[cleaned.length - 1] || '');
      return cleaned;
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bullets = lines.filter(l => /^[-*•\u2022]\s+/.test(l) || /^\d+[\.)]\s+/.test(l));
    if (bullets.length > 0) {
      const items = bullets.map(l => l.replace(/^[-*•\u2022]\s+/, '').replace(/^\d+[\.)]\s+/, '').trim());
      if (items.length >= desired) return items.slice(0, desired);
      while (items.length < desired) items.push(items[items.length - 1] || '');
      return items;
    }

    if (lines.length > 0) {
      const chunkSize = Math.max(1, Math.ceil(lines.length / desired));
      const chunks: string[] = [];
      for (let i = 0; i < desired; i++) {
        const start = i * chunkSize;
        const seg = lines.slice(start, start + chunkSize).join(' ');
        if (seg.trim()) chunks.push(seg.trim());
      }
      if (chunks.length > 0) {
        while (chunks.length < desired) chunks.push(chunks[chunks.length - 1] || '');
        return chunks;
      }
    }

    // Fallback: repeat the entire text
    const fallback = text.replace(/\s+/g, ' ').trim();
    const out = [] as string[];
    for (let i = 0; i < desired; i++) out.push(fallback);
    return out;
  }

  const heuristics = parseSummariesFromText(content, count);
  return heuristics;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

async function saveData(filePath: string, data: Record<string, unknown>): Promise<void> {
  ensureDirectoryExists(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

main().catch(console.error);