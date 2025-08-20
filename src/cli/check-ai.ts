#!/usr/bin/env node

import { readFile } from 'fs/promises';
import * as jsonc from 'jsonc-parser';
import { createConsoleLogger } from '../lib/utils.js';
import { createAIWrapper } from '../lib/ai-wrapper.js';
import { ConfigSchema } from '../lib/schemas.js';
import { loadPrompt } from '../lib/prompts.js';

async function main() {
  const logger = createConsoleLogger();

  try {
    // Load configuration
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Create AI wrapper with caching disabled to force an uncached call
    const ai = createAIWrapper(config.azure.openai, logger, false);

    logger.info('Performing a single uncached Azure OpenAI call to validate configuration...');

    // Embedding test (lightweight)
    try {
      const embeddingResp = await ai.getEmbedding('validate-connection');
      logger.info(`Embedding validation OK: embedding length ${embeddingResp.embedding.length}. Tokens used: ${embeddingResp.usage?.total_tokens ?? 0}`);
    } catch (err) {
      logger.error(`Embedding test failed: ${err}`);
      process.exit(1);
    }

    // Chat completion test (ensure chat endpoint is reachable)
    try {
      logger.info('Performing a chat completion test...');
      const messages = [
        {
          role: 'system' as const,
          content: await loadPrompt('check-ai-system'),
        },
        {
          role: 'user' as const,
          content: await loadPrompt('check-ai-user'),
        },
      ];

      const chatResp = await ai.chatCompletion(messages, { maxTokens: 20 });
      const contentPreview = (chatResp.content || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      logger.info(`Chat test succeeded. Response preview: ${contentPreview}`);
      logger.info(`Chat tokens used: ${chatResp.usage?.total_tokens ?? 0}`);
    } catch (err) {
      logger.error(`Chat test failed: ${err}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Azure OpenAI validation failed: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
