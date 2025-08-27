import { readFile, writeFile, mkdir } from 'fs/promises';
import { ensureDirectoryExists, type Logger } from './utils.js';
import { dirname } from 'path';

export interface FileUpdaterOptions {
  /** Auto-flush every N writes (0 = disabled) */
  autoFlushInterval?: number;
  /** Custom serializer for JSON output */
  serialize?: (data: Record<string, unknown>) => string;
  /** Custom equality checker for detecting changes */
  isEqual?: (a: unknown, b: unknown) => boolean;
  /** Logger instance for debug output */
  logger?: Logger;
}

export interface FileUpdater<T> {
  /** Update data for a specific key */
  set(key: string, value: T): void;
  
  /** Get data for a specific key */
  get(key: string): T | undefined;
  
  /** Get all current data */
  getAll(): Record<string, T>;
  
  /** Pre-load data from disk (call once for better performance) */
  preload(): Promise<void>;
  
  /** Check if there are unsaved changes */
  hasChanges(): boolean;
  
  /** Force flush changes to disk */
  flush(): Promise<void>;
  
  /** Get count of pending writes since last flush */
  getPendingWrites(): number;
  
  /** Dispose and flush any remaining changes */
  dispose(): Promise<void>;
  
  /** Clear memory cache (useful for large datasets) */
  clearMemoryCache(): void;
}

/**
 * Creates a file updater that performs idempotent writes with configurable flush policies.
 * Only writes to disk when content actually changes or flush interval is reached.
 */
export function createFileUpdater<T>(
  filePath: string,
  options: FileUpdaterOptions = {}
): FileUpdater<T> {
  const {
    autoFlushInterval = 0,
    serialize = (data) => JSON.stringify(data, null, 2),
    isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    logger,
  } = options;

  let originalData: Record<string, T> = {};
  let currentData: Record<string, T> = {};
  let changeCount = 0;
  let isLoaded = false;

  async function loadExistingData(): Promise<void> {
    if (isLoaded) return;
    
    // Capture the current change count before any async operations
    // to avoid race conditions with concurrent flushes
    const currentChangeCount = changeCount;
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const fileData = JSON.parse(content) as Record<string, T>;
      originalData = fileData;
      // Always merge existing file data with current changes
      if (currentChangeCount === 0) {
        currentData = { ...fileData };
      } else {
        // Merge file data with current changes, prioritizing current changes
        const beforeMerge = Object.keys(currentData).length;
        currentData = { ...fileData, ...currentData };
        const afterMerge = Object.keys(currentData).length;
        logger?.debug(`Merged ${Object.keys(fileData).length} existing + ${beforeMerge} current = ${afterMerge} total entries`);
      }
      logger?.debug(`Loaded existing data from ${filePath} (${Object.keys(originalData).length} entries)`);
    } catch {
      // File doesn't exist or is invalid, start with empty data
      originalData = {};
      // Only reset currentData if we don't have any changes yet
      if (currentChangeCount === 0) {
        currentData = {};
      }
      // If we have changes but no file exists, keep currentData as-is
      logger?.debug(`Starting with empty data for ${filePath}`);
    }
    
    isLoaded = true;
  }

  async function ensureLoaded(): Promise<void> {
    if (!isLoaded) {
      logger?.debug(`ensureLoaded: calling loadExistingData because isLoaded=${isLoaded}`);
      await loadExistingData();
    }
  }

  return {
    set(key: string, value: T): void {
      const oldValue = currentData[key];
      
      if (!isEqual(oldValue, value)) {
        currentData[key] = value;
        changeCount++;
        
        logger?.debug(`Updated ${key}, changes: ${changeCount}`);
        
        // Auto-flush if interval is configured and reached
        if (autoFlushInterval > 0 && changeCount >= autoFlushInterval) {
          // Use Promise.resolve to avoid setImmediate which can hold references
          // Ensure we don't have race conditions by checking state
          Promise.resolve().then(async () => {
            try {
              // Only auto-flush if we still have the expected change count
              // This prevents race conditions with manual flushes
              if (changeCount >= autoFlushInterval) {
                await this.flush();
              }
            } catch (error) {
              logger?.error(`Auto-flush failed: ${error}`);
            }
          });
        }
      }
    },

    get(key: string): T | undefined {
      // Trigger lazy loading if needed (but we can't await in a sync method)
      // The loadExistingData will be called in the next async operation (flush)
      return currentData[key];
    },

    getAll(): Record<string, T> {
      return { ...currentData };
    },

    async preload(): Promise<void> {
      await loadExistingData();
    },

    hasChanges(): boolean {
      if (!isLoaded && changeCount > 0) {
        logger?.debug(`hasChanges: not loaded but ${changeCount} changes, returning true`);
        return true;
      }
      
      const result = !isEqual(originalData, currentData);
      if (result) {
        logger?.debug(`hasChanges: ${Object.keys(originalData).length} original vs ${Object.keys(currentData).length} current, returning ${result}`);
      }
      return result;
    },

    getPendingWrites(): number {
      return changeCount;
    },

    async flush(): Promise<void> {
      await ensureLoaded();
      
      if (!this.hasChanges()) {
        logger?.debug(`No changes to flush for ${filePath}`);
        return;
      }

      try {
        // Ensure directory exists async
        const dir = dirname(filePath);
        await mkdir(dir, { recursive: true });
        
        const content = serialize(currentData);
        await writeFile(filePath, content);
        
        // Update original data to match current state
        originalData = { ...currentData };
        changeCount = 0;
        
        logger?.debug(`Flushed changes to ${filePath} (${Object.keys(currentData).length} entries)`);
      } catch (error) {
        logger?.error(`Failed to flush changes to ${filePath}: ${error}`);
        throw error;
      }
    },

    async dispose(): Promise<void> {
      if (this.hasChanges()) {
        await this.flush();
      }
    },

    clearMemoryCache(): void {
      // For memory optimization in large datasets, only keep minimal state
      if (!this.hasChanges()) {
        // Keep the structure but clear large data
        const keys = Object.keys(originalData);
        if (keys.length > 100) { // Only optimize for large datasets
          originalData = {};
          currentData = {};
          changeCount = 0;
          isLoaded = false;
          logger?.debug(`Cleared memory cache for ${filePath} (was ${keys.length} entries)`);
        } else {
          logger?.debug(`Skipped memory cache clear for ${filePath}: dataset too small (${keys.length} entries)`);
        }
      } else {
        logger?.warn(`Cannot clear memory cache for ${filePath}: unsaved changes exist`);
      }
    },
  };
}