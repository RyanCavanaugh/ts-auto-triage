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
  
  /** Check if there are unsaved changes */
  hasChanges(): boolean;
  
  /** Force flush changes to disk */
  flush(): Promise<void>;
  
  /** Get count of pending writes since last flush */
  getPendingWrites(): number;
  
  /** Dispose and flush any remaining changes */
  dispose(): Promise<void>;
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
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const fileData = JSON.parse(content) as Record<string, T>;
      originalData = fileData;
      // Only reset currentData if we don't have any changes yet
      if (changeCount === 0) {
        currentData = { ...fileData };
      }
      logger?.debug(`Loaded existing data from ${filePath} (${Object.keys(originalData).length} entries)`);
    } catch {
      // File doesn't exist or is invalid, start with empty data
      originalData = {};
      // Only reset currentData if we don't have any changes yet
      if (changeCount === 0) {
        currentData = {};
      }
      logger?.debug(`Starting with empty data for ${filePath}`);
    }
    
    isLoaded = true;
  }

  async function ensureLoaded(): Promise<void> {
    if (!isLoaded) {
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
          // Use setImmediate to avoid blocking the current operation
          setImmediate(() => {
            this.flush().catch((error) => {
              logger?.error(`Auto-flush failed: ${error}`);
            });
          });
        }
      }
    },

    get(key: string): T | undefined {
      return currentData[key];
    },

    getAll(): Record<string, T> {
      return { ...currentData };
    },

    hasChanges(): boolean {
      if (!isLoaded && changeCount > 0) {
        return true;
      }
      
      return !isEqual(originalData, currentData);
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
  };
}