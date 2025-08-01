#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join } from 'path';
import { createIssueFetcher, parseIssueRef } from '../../packages/issue-fetcher/src/index.js';
import { createAIWrapper } from '../../packages/ai-wrapper/src/index.js';
import { loadConfig, getGitHubToken, createLogger, truncateText } from '../../packages/utils/src/index.js';

const logger = createLogger('first-response');

interface EmbeddingData {
  [issueRef: string]: string; // base64 encoded embedding
}

interface SummaryData {
  [issueRef: string]: string;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: first-response.js <issue-ref>');
    console.error('Example: first-response.js Microsoft/TypeScript#9998');
    console.error('         first-response.js https://github.com/Microsoft/TypeScript/issues/9998');
    process.exit(1);
  }
  
  try {
    const issueRefStr = args[0];
    const issueRef = parseIssueRef(issueRefStr);
    const token = await getGitHubToken();
    const config = await loadConfig();
    
    // Initialize services
    const fetcher = createIssueFetcher({ token, logger, dataPath: '.data' });
    const ai = createAIWrapper({ config: config.azure, logger });
    
    // Load the issue
    logger.info(`Loading issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    const issue = await fetcher.fetchIssue(issueRef, false);
    
    if (!issue) {
      throw new Error(`Could not load issue ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    }
    
    logger.info(`Analyzing issue: "${issue.title}"`);
    
    // Create issue text for analysis (body only, no comments for first response)
    const issueText = `Title: ${issue.title}\\n\\nBody: ${issue.body ? truncateText(issue.body, 6000) : 'No description provided'}`;
    
    // Load FAQ content
    const faqContent = await fs.readFile('FAQ.md', 'utf-8');
    
    // Check for FAQ matches
    logger.info('Checking for FAQ matches...');
    const faqCheckPrompt = `Analyze this GitHub issue and determine if any FAQ entries address the user's question or problem.

FAQ Content:
${faqContent}

Issue to analyze:
${issueText}

For each FAQ entry that might address this issue, respond with:
1. The FAQ question
2. How relevant it is (High/Medium/Low)
3. A personalized response that adapts the FAQ answer to this specific issue

If no FAQ entries are relevant, respond with "NO_FAQ_MATCHES".

Format your response as JSON:
{
  "matches": [
    {
      "question": "FAQ question",
      "relevance": "High|Medium|Low", 
      "personalized_response": "Adapted response for this issue"
    }
  ]
}

Or simply: { "matches": [] } if no matches.`;
    
    const faqResponse = await ai.analyze(issueText, faqCheckPrompt, { model: 'gpt4' });
    
    let faqMatches: any[] = [];
    try {
      const faqResult = JSON.parse(faqResponse);
      faqMatches = faqResult.matches || [];
    } catch (error) {
      logger.warn(`Failed to parse FAQ response: ${error}`);
    }
    
    // Load embeddings and summaries for duplicate detection
    logger.info('Checking for similar issues...');
    
    const summaryPath = join('.data', 'summaries.json');
    const embeddingPath = join('.data', 'embeddings.json');
    
    let duplicateCandidates: string[] = [];
    
    try {
      const summariesContent = await fs.readFile(summaryPath, 'utf-8');
      const embeddingsContent = await fs.readFile(embeddingPath, 'utf-8');
      
      const summaries: SummaryData = JSON.parse(summariesContent);
      const embeddings: EmbeddingData = JSON.parse(embeddingsContent);
      
      // Get embedding for current issue
      const currentIssueSummary = await ai.summarize(issueText, { maxLength: 150 });
      const currentEmbeddingResponse = await ai.getEmbeddings(currentIssueSummary);
      const currentEmbedding = currentEmbeddingResponse.data[0].embedding;
      
      // Calculate similarity with existing issues
      const similarities: Array<{ issueRef: string; similarity: number; summary: string }> = [];
      
      for (const [issueKey, embeddingBase64] of Object.entries(embeddings)) {
        // Skip the current issue itself
        if (issueKey === `${issueRef.owner}/${issueRef.repo}#${issueRef.number}`) {
          continue;
        }
        
        try {
          // Decode embedding
          const buffer = Buffer.from(embeddingBase64, 'base64');
          const embedding = Array.from(new Float32Array(buffer.buffer));
          
          // Calculate cosine similarity
          const similarity = cosineSimilarity(currentEmbedding, embedding);
          
          if (similarity > 0.8 && summaries[issueKey]) { // High similarity threshold
            similarities.push({
              issueRef: issueKey,
              similarity,
              summary: summaries[issueKey]
            });
          }
        } catch (error) {
          logger.warn(`Failed to process embedding for ${issueKey}: ${error}`);
        }
      }
      
      // Sort by similarity and take top 3
      similarities.sort((a, b) => b.similarity - a.similarity);
      duplicateCandidates = similarities.slice(0, 3).map(s => `${s.issueRef} (similarity: ${s.similarity.toFixed(3)}): ${s.summary}`);
      
    } catch (error) {
      logger.warn(`Could not load embeddings for duplicate detection: ${error}`);
    }
    
    // Generate output
    const outputPath = join('.working', 'outputs', `first-response-${issueRef.owner}-${issueRef.repo}-${issueRef.number}.md`);
    await fs.mkdir(join('.working', 'outputs'), { recursive: true });
    
    let output = `# First Response Analysis: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}\\n\\n`;
    output += `**Issue Title:** ${issue.title}\\n\\n`;
    output += `**Analysis Date:** ${new Date().toISOString()}\\n\\n`;
    
    // FAQ section
    output += `## FAQ Matches\\n\\n`;
    if (faqMatches.length > 0) {
      output += `Found ${faqMatches.length} potentially relevant FAQ entries:\\n\\n`;
      for (const match of faqMatches) {
        output += `### ${match.relevance} Relevance: ${match.question}\\n\\n`;
        output += `${match.personalized_response}\\n\\n`;
      }
    } else {
      output += `No FAQ entries found that directly address this issue.\\n\\n`;
    }
    
    // Duplicates section
    output += `## Potential Duplicates\\n\\n`;
    if (duplicateCandidates.length > 0) {
      output += `Found ${duplicateCandidates.length} similar issues:\\n\\n`;
      for (const candidate of duplicateCandidates) {
        output += `- ${candidate}\\n`;
      }
      output += `\\n`;
    } else {
      output += `No similar issues found in the existing database.\\n\\n`;
    }
    
    // Recommendations
    output += `## Recommendations\\n\\n`;
    if (faqMatches.length > 0) {
      const highRelevanceMatches = faqMatches.filter(m => m.relevance === 'High');
      if (highRelevanceMatches.length > 0) {
        output += `**Immediate Action:** Post FAQ response - there are ${highRelevanceMatches.length} high-relevance FAQ matches.\\n\\n`;
      } else {
        output += `**Consider:** FAQ response may be helpful but requires adaptation.\\n\\n`;
      }
    }
    
    if (duplicateCandidates.length > 0) {
      output += `**Review:** Check potential duplicates before proceeding with new issue processing.\\n\\n`;
    }
    
    if (faqMatches.length === 0 && duplicateCandidates.length === 0) {
      output += `**Action:** This appears to be a novel issue that requires standard triage process.\\n\\n`;
    }
    
    await fs.writeFile(outputPath, output);
    
    logger.info(`First response analysis completed`);
    logger.info(`FAQ matches: ${faqMatches.length}`);
    logger.info(`Potential duplicates: ${duplicateCandidates.length}`);
    logger.info(`Output written to: ${outputPath}`);
    
    // Also output summary to console
    console.log('\\n=== FIRST RESPONSE ANALYSIS ===');
    console.log(`Issue: ${issueRef.owner}/${issueRef.repo}#${issueRef.number}`);
    console.log(`Title: ${issue.title}`);
    console.log(`FAQ Matches: ${faqMatches.length}`);
    console.log(`Potential Duplicates: ${duplicateCandidates.length}`);
    console.log(`Full analysis: ${outputPath}`);
    
  } catch (error) {
    logger.error(`Failed to analyze issue: ${error}`);
    process.exit(1);
  }
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must be of equal length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});