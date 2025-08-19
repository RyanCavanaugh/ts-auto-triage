#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { parseIssueRef, createConsoleLogger, ensureDirectoryExists, formatIssueRef } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema, GitHubIssueSchema, ActionFileSchema, EmbeddingsDataSchema, SummariesDataSchema } from '../lib/schemas.js';

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length !== 1) {
      console.error('Usage: first-response <issue-ref>');
      console.error('Example: first-response Microsoft/TypeScript#9998');
      process.exit(1);
    }

    const issueRefInput = args[0]!;
    const issueRef = parseIssueRef(issueRefInput);
    
    logger.info(`Checking first response for: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);

    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper
    const ai = createAIWrapper(config.azure.openai, logger, config.ai.cacheEnabled);

    // Load the issue data
    const issueFilePath = `.data/${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}/${issueRef.number}.json`;
    let issue;
    try {
      const issueContent = await readFile(issueFilePath, 'utf-8');
      issue = GitHubIssueSchema.parse(JSON.parse(issueContent));
    } catch {
      logger.error(`Issue data not found at ${issueFilePath}. Run fetch-issue first.`);
      process.exit(1);
    }

    // Only process issue body, not comments (as per spec)
    const issueBody = issue.body ?? '';
    if (!issueBody.trim()) {
      logger.info('Issue has no body content to analyze');
      return;
    }

    logger.info(`Analyzing issue: ${issue.title}`);

    // Check FAQ entries
    let faqResponse: string | null = null;
    try {
      const faqContent = await readFile('FAQ.md', 'utf-8');
      faqResponse = await checkFAQMatches(ai, issueBody, issue.title, faqContent);
    } catch {
      logger.debug('No FAQ.md file found, skipping FAQ check');
    }

    // Check for duplicates
    let duplicateMatches: string[] = [];
    try {
      duplicateMatches = await findDuplicates(ai, issueBody, issue.title, issueRef);
    } catch (error) {
      logger.debug(`Duplicate search failed: ${error}`);
    }

    // Generate action if needed
    const actions = [];
    
    if (faqResponse) {
      logger.info('Found relevant FAQ entry, creating response action');
      actions.push({
        kind: 'add_comment' as const,
        body: faqResponse,
      });
    }

    if (duplicateMatches.length > 0) {
      logger.info(`Found ${duplicateMatches.length} potential duplicates`);
      const duplicateComment = `This issue appears to be similar to:\n\n${duplicateMatches.map(m => `- ${m}`).join('\n')}\n\nPlease check if any of these resolve your issue before proceeding.`;
      actions.push({
        kind: 'add_comment' as const,
        body: duplicateComment,
      });
    }

    if (actions.length > 0) {
      // Write action file
      const actionFile = {
        issue_ref: issueRef,
        actions,
      };

      const actionFilePath = `.working/actions/${issueRef.owner.toLowerCase()}.${issueRef.repo.toLowerCase()}.${issueRef.number}.jsonc`;
      ensureDirectoryExists(actionFilePath);
      
      const actionFileContent = `/* Proposed actions for ${formatIssueRef(issueRef)}
   AI-generated first response based on FAQ matching and duplicate detection */
${JSON.stringify(actionFile, null, 2)}`;

      await writeFile(actionFilePath, actionFileContent);
      logger.info(`Action file written to ${actionFilePath}`);
    } else {
      logger.info('No automatic response needed');
    }

  } catch (error) {
    logger.error(`Failed to check first response: ${error}`);
    process.exit(1);
  }
}

async function checkFAQMatches(ai: any, issueBody: string, issueTitle: string, faqContent: string): Promise<string | null> {
  const messages = [
    {
      role: 'system' as const,
      content: `You are analyzing a GitHub issue to see if it matches any FAQ entries. 
If there's a strong match (>80% confidence), respond with a personalized message that:
1. Addresses the user's specific question
2. References the relevant FAQ section
3. Is helpful and not dismissive
4. Maintains a professional, technical tone

If no strong match exists, respond with "NO_MATCH".`,
    },
    {
      role: 'user' as const,
      content: `Issue Title: ${issueTitle}

Issue Body:
${issueBody.slice(0, 4000)}

FAQ Content:
${faqContent}

Does this issue match any FAQ entry strongly enough to warrant an automatic response?`,
    },
  ];

  const response = await ai.chatCompletion(messages, { maxTokens: 500 });
  const content = response.content.trim();
  
  return content === 'NO_MATCH' ? null : content;
}

async function findDuplicates(ai: any, issueBody: string, issueTitle: string, issueRef: any): Promise<string[]> {
  // Load embeddings and summaries
  let summaries: Record<string, string> = {};
  let embeddings: Record<string, string> = {};
  
  try {
    const summariesContent = await readFile('.data/summaries.json', 'utf-8');
    summaries = SummariesDataSchema.parse(JSON.parse(summariesContent));
  } catch {
    return []; // No summaries available
  }
  
  try {
    const embeddingsContent = await readFile('.data/embeddings.json', 'utf-8');
    embeddings = EmbeddingsDataSchema.parse(JSON.parse(embeddingsContent));
  } catch {
    return []; // No embeddings available
  }

  // Create embedding for current issue
  const currentIssueText = `${issueTitle}\n\n${issueBody.slice(0, 2000)}`;
  const currentEmbedding = await ai.getEmbedding(currentIssueText);
  
  // Calculate similarities
  const similarities: Array<{ issueKey: string; similarity: number; summary: string }> = [];
  
  for (const [issueKey, embeddingBase64] of Object.entries(embeddings)) {
    // Skip self
    const issueKeyStr = `${issueRef.owner.toLowerCase()}/${issueRef.repo.toLowerCase()}#${issueRef.number}`;
    if (issueKey === issueKeyStr) continue;
    
    // Skip if no summary
    if (!summaries[issueKey]) continue;
    
    // Decode embedding
    const embeddingBuffer = Buffer.from(embeddingBase64, 'base64');
    const embeddingArray = new Float32Array(embeddingBuffer.buffer);
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(currentEmbedding.embedding, Array.from(embeddingArray));
    
    if (similarity > 0.8) { // High similarity threshold
      similarities.push({
        issueKey,
        similarity,
        summary: summaries[issueKey]!,
      });
    }
  }
  
  // Sort by similarity and return top 3
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, 3).map(s => `#${s.issueKey.split('#')[1]} (${Math.round(s.similarity * 100)}% similar): ${s.summary.slice(0, 200)}...`);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i]!, 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

main().catch(console.error);