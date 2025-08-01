#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { createIssueFetcher } from '../../packages/issue-fetcher/src/index.js';
import { createAIWrapper } from '../../packages/ai-wrapper/src/index.js';
import { createKVCache } from '../../packages/kvcache/src/index.js';
import { loadConfig, getGitHubToken, createLogger, validateRepoRef, truncateText } from '../../packages/utils/src/index.js';

const logger = createLogger('summarize-issues');

interface EmbeddingData {
  [issueRef: string]: string; // base64 encoded embedding
}

interface SummaryData {
  [issueRef: string]: string;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: summarize-issues.js <owner/repo>');
    console.error('Example: summarize-issues.js Microsoft/TypeScript');
    process.exit(1);
  }
  
  try {
    const repoRef = args[0];
    
    if (!validateRepoRef(repoRef)) {
      throw new Error(`Invalid repository reference: ${repoRef}. Expected format: owner/repo`);
    }
    
    const [owner, repo] = repoRef.split('/');
    const token = await getGitHubToken();
    const config = await loadConfig();
    
    // Initialize services
    const fetcher = createIssueFetcher({ token, logger, dataPath: '.data' });
    const ai = createAIWrapper({ config: config.azure, logger });
    const cache = createKVCache('.kvcache');
    
    // Get list of cached issues
    const cachedIssues = await fetcher.listCachedIssues(owner, repo);
    logger.info(`Found ${cachedIssues.length} cached issues for ${owner}/${repo}`);
    
    if (cachedIssues.length === 0) {
      logger.error('No cached issues found. Run fetch-issues first.');
      process.exit(1);
    }
    
    // Load existing summaries and embeddings
    const summaryPath = join('.data', 'summaries.json');
    const embeddingPath = join('.data', 'embeddings.json');
    
    let summaries: SummaryData = {};
    let embeddings: EmbeddingData = {};
    
    try {
      const summaryContent = await fs.readFile(summaryPath, 'utf-8');
      summaries = JSON.parse(summaryContent);
      logger.info(`Loaded ${Object.keys(summaries).length} existing summaries`);
    } catch {
      logger.info('No existing summaries found, starting fresh');
    }
    
    try {
      const embeddingContent = await fs.readFile(embeddingPath, 'utf-8');
      embeddings = JSON.parse(embeddingContent);
      logger.info(`Loaded ${Object.keys(embeddings).length} existing embeddings`);
    } catch {
      logger.info('No existing embeddings found, starting fresh');
    }
    
    let summaryCount = 0;
    let embeddingCount = 0;
    
    // Process each issue
    for (const issueRef of cachedIssues) {
      const issueKey = `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`;
      
      // Skip if we already have both summary and embedding
      if (summaries[issueKey] && embeddings[issueKey]) {
        continue;
      }
      
      // Load issue data
      const issue = await fetcher.loadIssue(issueRef);
      if (!issue) {
        logger.warn(`Could not load issue ${issueKey}`);
        continue;
      }
      
      logger.info(`Processing issue ${issueKey}: "${issue.title}"`);
      
      // Create issue text for summarization
      let issueText = `Title: ${issue.title}\\n\\n`;
      if (issue.body) {
        issueText += `Body: ${truncateText(issue.body, 4000)}\\n\\n`;
      }
      
      // Add relevant comments (first few and any by the author)
      const relevantComments = issue.comments_data
        .filter(comment => 
          issue.comments_data.indexOf(comment) < 3 || // First 3 comments
          comment.user.login === issue.user.login      // Comments by issue author
        )
        .slice(0, 10) // Limit to 10 comments max
        .map(comment => truncateText(comment.body, 500))
        .join('\\n\\n');
      
      if (relevantComments) {
        issueText += `Relevant comments: ${relevantComments}`;
      }
      
      // Truncate the full text to ensure it fits in context
      issueText = truncateText(issueText, 8000);
      
      // Generate summary if not exists
      if (!summaries[issueKey]) {
        try {
          const summary = await cache.memoize(
            `summary-${issueKey}`,
            async () => {
              const prompt = `Summarize this GitHub issue in one paragraph. Focus on:
1. The main problem or feature request
2. Key technical details
3. Current status (if mentioned)
4. Any reproduction steps or examples

Keep it technical and concise, around 100-150 words.`;
              
              return await ai.analyze(issueText, prompt, { model: 'gpt35' });
            },
            { ttlHours: 24 * 7 } // Cache for a week
          );
          
          summaries[issueKey] = summary;
          summaryCount++;
          logger.info(`Generated summary for ${issueKey}`);
        } catch (error) {
          logger.error(`Failed to generate summary for ${issueKey}: ${error}`);
          continue;
        }
      }
      
      // Generate embedding if not exists
      if (!embeddings[issueKey] && summaries[issueKey]) {
        try {
          const embeddingResponse = await cache.memoize(
            `embedding-${issueKey}`,
            async () => {
              return await ai.getEmbeddings(summaries[issueKey]);
            },
            { ttlHours: 24 * 30 } // Cache for a month
          );
          
          if (embeddingResponse.data.length > 0) {
            const embedding = embeddingResponse.data[0].embedding;
            
            // Convert to base64 for storage efficiency
            const buffer = Buffer.from(new Float32Array(embedding).buffer);
            embeddings[issueKey] = buffer.toString('base64');
            embeddingCount++;
            logger.info(`Generated embedding for ${issueKey}`);
          }
        } catch (error) {
          logger.error(`Failed to generate embedding for ${issueKey}: ${error}`);
          continue;
        }
      }
      
      // Save progress every 10 issues
      if ((summaryCount + embeddingCount) % 10 === 0) {
        await fs.writeFile(summaryPath, JSON.stringify(summaries, null, 2));
        await fs.writeFile(embeddingPath, JSON.stringify(embeddings, null, 2));
        logger.info(`Saved progress: ${summaryCount} summaries, ${embeddingCount} embeddings`);
      }
    }
    
    // Final save
    await fs.writeFile(summaryPath, JSON.stringify(summaries, null, 2));
    await fs.writeFile(embeddingPath, JSON.stringify(embeddings, null, 2));
    
    logger.info(`Completed processing: ${summaryCount} new summaries, ${embeddingCount} new embeddings`);
    logger.info(`Total: ${Object.keys(summaries).length} summaries, ${Object.keys(embeddings).length} embeddings`);
    
  } catch (error) {
    logger.error(`Failed to summarize issues: ${error}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});