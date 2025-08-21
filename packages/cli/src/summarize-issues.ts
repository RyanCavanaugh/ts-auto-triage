#!/usr/bin/env node

import { createCLIOptions, handleError } from './utils.js';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

// Schema for AI-generated summaries
const issueSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  severity: z.enum(['low', 'medium', 'high', 'critical'])
});

// Schema for batch summarization - wrapping array in object for Azure OpenAI compatibility
const batchSummarySchema = z.object({
  summaries: z.array(issueSummarySchema)
});

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
    
    // Check for existing issue data in the repository
    const repoDataDir = path.join(dataDir, issueRef.owner.toLowerCase(), issueRef.repo.toLowerCase());
    
    let issues: Array<{ number: number; title: string; body?: string }> = [];
    
    // Try to read existing issue files
    try {
      const issueFiles = await fs.readdir(repoDataDir);
      const issueJsonFiles = issueFiles.filter(f => f.match(/^\d+\.json$/));
      
      for (const file of issueJsonFiles.slice(0, 5)) { // Limit to 5 for demo
        const issueData = JSON.parse(await fs.readFile(path.join(repoDataDir, file), 'utf-8'));
        issues.push({
          number: issueData.number,
          title: issueData.title,
          body: issueData.body || ''
        });
      }
    } catch (error) {
      logger.debug('No existing issue data found, using sample issues');
      // Fall back to sample issues
      issues = [
        { number: 10003, title: 'TypeScript compilation is slow with large projects', body: 'When compiling large TypeScript projects...' },
        { number: 10004, title: 'Circular dependency error in modules', body: 'Getting circular dependency errors...' },
        { number: 10005, title: 'Type inference not working correctly', body: 'Type inference fails in certain cases...' }
      ];
    }

    if (issues.length === 0) {
      logger.warn('No issues found to summarize');
      return;
    }

    logger.info(`Generating AI-powered summaries for ${issues.length} issues...`);

    // Create prompt for batch processing
    const issueDescriptions = issues.map(issue => 
      `Issue #${issue.number}: ${issue.title}\n${issue.body?.substring(0, 500) || 'No description'}`
    ).join('\n\n---\n\n');

    const messages = [
      {
        role: 'system' as const,
        content: `You are an expert at analyzing TypeScript issues. Create concise summaries for the provided issues.
        
For each issue, provide:
- A 2-3 sentence summary
- Relevant tags (e.g., "performance", "types", "compiler", "bug", "feature")
- Severity assessment (low, medium, high, critical)

Respond with structured data containing an array of summaries.`
      },
      {
        role: 'user' as const,
        content: `Please analyze and summarize these TypeScript issues:\n\n${issueDescriptions}`
      }
    ];

    try {
      // Use structured completion with object-wrapped schema
      const result = await ai.generateStructuredCompletion(messages, batchSummarySchema, {
        temperature: 0.1,
        maxTokens: 2000
      });

      const summariesWithEmbeddings = [];
      
      // Generate embeddings for each summary
      for (const summary of result.summaries) {
        logger.debug(`Processing issue #${summary.number}`);
        
        const embedding = await ai.generateEmbedding(summary.summary);
        
        summariesWithEmbeddings.push({
          ...summary,
          embedding
        });
      }

      // Save summaries to disk
      await fs.mkdir(repoDataDir, { recursive: true });

      const summariesFile = path.join(repoDataDir, 'summaries.json');
      await fs.writeFile(summariesFile, JSON.stringify(summariesWithEmbeddings, null, 2));
      logger.info(`Saved ${summariesWithEmbeddings.length} summaries to ${summariesFile}`);

      // Save embeddings in a separate file
      const embeddingsFile = path.join(repoDataDir, 'embeddings.json');
      const embeddingsData = summariesWithEmbeddings.map(s => ({
        number: s.number,
        embedding: s.embedding
      }));
      await fs.writeFile(embeddingsFile, JSON.stringify(embeddingsData, null, 2));
      logger.info(`Saved embeddings to ${embeddingsFile}`);

      logger.info(`Successfully processed ${summariesWithEmbeddings.length} issues for ${issueRef.owner}/${issueRef.repo}`);

    } catch (error) {
      // Fallback to individual processing if batch fails
      logger.warn('Batch processing failed, falling back to individual processing');
      
      const summaries = [];
      
      for (const issue of issues) {
        try {
          const messages = [
            {
              role: 'system' as const,
              content: 'Create a concise summary (2-3 sentences) of this TypeScript issue with relevant tags and severity.'
            },
            {
              role: 'user' as const,
              content: `Issue #${issue.number}: ${issue.title}\n${issue.body || 'No description'}`
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
            tags: ['typescript'], // Default tags
            severity: 'medium' as const,
            embedding
          });

          logger.debug(`Processed issue #${issue.number}`);
        } catch (issueError) {
          logger.error(`Failed to process ${issueRef.owner}/${issueRef.repo}#${issue.number}:`, issueError);
        }
      }

      // Save fallback results
      if (summaries.length > 0) {
        await fs.mkdir(repoDataDir, { recursive: true });

        const summariesFile = path.join(repoDataDir, 'summaries.json');
        await fs.writeFile(summariesFile, JSON.stringify(summaries, null, 2));
        logger.info(`Saved ${summaries.length} summaries to ${summariesFile}`);

        const embeddingsFile = path.join(repoDataDir, 'embeddings.json');
        const embeddingsData = summaries.map(s => ({
          number: s.number,
          embedding: s.embedding
        }));
        await fs.writeFile(embeddingsFile, JSON.stringify(embeddingsData, null, 2));
        logger.info(`Saved embeddings to ${embeddingsFile}`);

        logger.info(`Successfully processed ${summaries.length} issues for ${issueRef.owner}/${issueRef.repo}`);
      }
    }

  } catch (error) {
    handleError(error as Error, logger);
  }
}

main();