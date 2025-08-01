#!/usr/bin/env node

import { createCLIOptions, handleError } from './utils.js';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const options = createCLIOptions();
  const { logger, dataDir, ai } = options;

  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      throw new Error('Repository required. Usage: summarize-issues Microsoft/TypeScript');
    }

    // For summarize-issues, we accept just owner/repo format
    const repoString = args[0]!;
    const repoMatch = repoString.match(/^([^\/]+)\/([^\/]+)$/);
    if (!repoMatch) {
      throw new Error('Invalid repository format. Usage: summarize-issues Microsoft/TypeScript');
    }

    const issueRef = {
      owner: repoMatch[1]!,
      repo: repoMatch[2]!,
      number: 0 // Not used for this command
    };

    logger.info(`Creating summaries and embeddings for ${issueRef.owner}/${issueRef.repo}`);
    
    // For demonstration, create sample summaries
    logger.info('Generating AI-powered summaries and embeddings...');

    const sampleIssues = [
      { number: 1001, title: 'TypeScript compilation is slow with large projects' },
      { number: 1002, title: 'Circular dependency error in modules' },
      { number: 1003, title: 'Type inference not working correctly' }
    ];

    const summaries = [];
    
    for (const issue of sampleIssues) {
      const messages = [
        {
          role: 'system' as const,
          content: 'Create a concise summary (2-3 sentences) of this TypeScript issue.'
        },
        {
          role: 'user' as const,
          content: `Issue #${issue.number}: ${issue.title}`
        }
      ];

      const response = await ai.generateChatCompletion(messages, {
        temperature: 0.1,
        maxTokens: 200
      });

      const embedding = await ai.generateEmbedding(response.content);

      summaries.push({
        number: issue.number,
        title: issue.title,
        summary: response.content,
        embedding
      });

      logger.debug(`Processed issue #${issue.number}`);
    }

    // Save summaries to disk
    const repoDataDir = path.join(dataDir, issueRef.owner.toLowerCase(), issueRef.repo.toLowerCase());
    await fs.mkdir(repoDataDir, { recursive: true });

    const summariesFile = path.join(repoDataDir, 'summaries.json');
    await fs.writeFile(summariesFile, JSON.stringify(summaries, null, 2));
    logger.info(`Saved ${summaries.length} summaries to ${summariesFile}`);

    // Save embeddings in a separate file
    const embeddingsFile = path.join(repoDataDir, 'embeddings.json');
    const embeddingsData = summaries.map(s => ({
      number: s.number,
      embedding: s.embedding
    }));
    await fs.writeFile(embeddingsFile, JSON.stringify(embeddingsData, null, 2));
    logger.info(`Saved embeddings to ${embeddingsFile}`);

    logger.info(`Successfully processed ${summaries.length} sample issues for ${issueRef.owner}/${issueRef.repo}`);

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();