import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { rm, readFile } from 'fs/promises';
import { createFileLogger, getLogPath } from './file-logger.js';
import type { IssueRef } from './schemas.js';

describe('File Logger', () => {
  const testIssueRef: IssueRef = {
    owner: 'test-owner',
    repo: 'test-repo',
    number: 12345,
  };

  const logPath = getLogPath(testIssueRef, 'test-task');

  beforeEach(async () => {
    // Clean up any existing test logs
    await rm('.logs', { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up test logs
    await rm('.logs', { recursive: true, force: true });
  });

  test('should create log file with header', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    await logger.logSection('Test Section');
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('# test-task Log for test-owner/test-repo#12345');
    expect(content).toContain('Generated:');
    expect(content).toContain('## Test Section');
    expect(content).toContain('Log completed at');
  });

  test('should log sections and info messages', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    await logger.logSection('Section 1');
    await logger.logInfo('Info message 1');
    await logger.logInfo('Info message 2');
    await logger.logSection('Section 2');
    await logger.logInfo('Info message 3');
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('## Section 1');
    expect(content).toContain('Info message 1');
    expect(content).toContain('Info message 2');
    expect(content).toContain('## Section 2');
    expect(content).toContain('Info message 3');
  });

  test('should log decisions with reasoning', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    await logger.logDecision('Take action A', 'Because of reason X');
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('**Decision:** Take action A');
    expect(content).toContain('**Reasoning:** Because of reason X');
  });

  test('should log LLM input and output', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    
    const messages = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'What is 2+2?' },
    ];
    await logger.logLLMInput('Test completion', messages);
    
    const output = { answer: '4', confidence: 1.0 };
    await logger.logLLMOutput('Test completion', output, { 
      prompt_tokens: 10, 
      completion_tokens: 5, 
      total_tokens: 15 
    });
    
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('### LLM Input: Test completion');
    expect(content).toContain('**system:**');
    expect(content).toContain('You are a helpful assistant');
    expect(content).toContain('**user:**');
    expect(content).toContain('What is 2+2?');
    expect(content).toContain('### LLM Output: Test completion');
    expect(content).toContain('"answer": "4"');
    expect(content).toContain('**Token Usage:** Prompt: 10, Completion: 5, Total: 15');
  });

  test('should log data in collapsible sections', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    
    const data = {
      key1: 'value1',
      key2: 'value2',
      nested: { a: 1, b: 2 },
    };
    await logger.logData('Test Data', data);
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    expect(content).toContain('<details>');
    expect(content).toContain('<summary>Test Data</summary>');
    expect(content).toContain('"key1": "value1"');
    expect(content).toContain('"key2": "value2"');
    expect(content).toContain('</details>');
  });

  test('should handle multiple log calls without reinitializing', async () => {
    const logger = createFileLogger(testIssueRef, 'test-task');
    
    await logger.logSection('Section 1');
    await logger.logInfo('Message 1');
    await logger.logSection('Section 2');
    await logger.logInfo('Message 2');
    await logger.logSection('Section 3');
    await logger.logInfo('Message 3');
    await logger.finalize();

    const content = await readFile(logPath, 'utf-8');
    
    // Should only have one header
    const headerMatches = content.match(/# test-task Log for/g);
    expect(headerMatches).toHaveLength(1);
    
    // Should have all sections
    expect(content).toContain('## Section 1');
    expect(content).toContain('## Section 2');
    expect(content).toContain('## Section 3');
  });
});
