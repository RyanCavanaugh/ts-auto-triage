import { createFileUpdater } from './file-updater.js';
import { createMockLogger } from './utils.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('FileUpdater Integration', () => {
  let tempDir: string;
  let testFilePath: string;
  const logger = createMockLogger();

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(tmpdir(), `file-updater-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    testFilePath = path.join(tempDir, 'test-data.json');
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle basic file operations', async () => {
    const updater = createFileUpdater<string>(testFilePath, { logger });
    
    // Set some data
    updater.set('key1', 'value1');
    updater.set('key2', 'value2');
    
    expect(updater.get('key1')).toBe('value1');
    expect(updater.get('key2')).toBe('value2');
    expect(updater.hasChanges()).toBe(true);
    expect(updater.getPendingWrites()).toBe(2);
    
    // Flush changes
    await updater.flush();
    
    expect(updater.hasChanges()).toBe(false);
    expect(updater.getPendingWrites()).toBe(0);
    
    // Verify file was created
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    expect(parsedData).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('should not write when no changes exist', async () => {
    // Create initial file
    const initialData = { existing: 'data' };
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(initialData));
    
    const updater = createFileUpdater<string>(testFilePath, { logger });
    
    // Force load existing data
    await updater.flush();
    
    expect(updater.hasChanges()).toBe(false);
    
    // Get file modification time
    const statsBefore = await fs.stat(testFilePath);
    
    // Flush again (should not write)
    await updater.flush();
    
    const statsAfter = await fs.stat(testFilePath);
    expect(statsAfter.mtime).toEqual(statsBefore.mtime);
  });

  it('should handle auto-flush correctly', async () => {
    const updater = createFileUpdater<string>(testFilePath, { 
      autoFlushInterval: 2,
      logger 
    });
    
    updater.set('key1', 'value1');
    expect(updater.getPendingWrites()).toBe(1);
    
    // Add second change to trigger auto-flush
    updater.set('key2', 'value2');
    
    // Wait for setImmediate to process the auto-flush
    await new Promise(resolve => setImmediate(resolve));
    // Wait a bit more for the async flush to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should have auto-flushed
    expect(updater.getPendingWrites()).toBe(0);
    
    // Verify file was written
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    expect(parsedData).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('should only count actual changes as pending writes', async () => {
    const updater = createFileUpdater<string>(testFilePath, { logger });
    
    updater.set('key1', 'value1');
    expect(updater.getPendingWrites()).toBe(1);
    
    // Setting same value should not increment
    updater.set('key1', 'value1');
    expect(updater.getPendingWrites()).toBe(1);
    
    // Setting different value should increment
    updater.set('key1', 'value2');
    expect(updater.getPendingWrites()).toBe(2);
  });

  it('should work with custom serializer', async () => {
    const customSerializer = (data: Record<string, unknown>) => 
      `CUSTOM:${JSON.stringify(data)}`;
    
    const updater = createFileUpdater<string>(testFilePath, {
      serialize: customSerializer,
      logger
    });
    
    updater.set('key1', 'value1');
    await updater.flush();
    
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe('CUSTOM:{"key1":"value1"}');
  });

  it('should handle dispose properly', async () => {
    const updater = createFileUpdater<string>(testFilePath, { logger });
    
    updater.set('key1', 'value1');
    expect(updater.hasChanges()).toBe(true);
    
    await updater.dispose();
    
    expect(updater.getPendingWrites()).toBe(0);
    
    // Verify file was written
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    expect(parsedData).toEqual({ key1: 'value1' });
  });
});