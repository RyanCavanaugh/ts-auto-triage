import { spawn, ChildProcess } from 'child_process';
import { 
  LSPPositionSchema,
  LSPHoverSchema,
  LSPSignatureHelpSchema,
  LSPCompletionItemSchema,
  LSPDiagnosticSchema,
  type LSPPosition,
  type LSPHover,
  type LSPSignatureHelp,
  type LSPCompletionItem,
  type LSPDiagnostic
} from './schemas.js';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface LSPHarnessOptions {
  lspPath: string;
  logger?: Logger;
  timeout?: number;
}

/**
 * Converts line/column to LSP position (0-based)
 */
export function createPosition(line: number, character: number): LSPPosition {
  return LSPPositionSchema.parse({ line, character });
}

/**
 * Creates an LSP harness for communicating with TypeScript language server
 */
export function createLSPHarness(options: LSPHarnessOptions) {
  const { lspPath, logger = console, timeout = 10000 } = options;
  
  let lspProcess: ChildProcess | null = null;
  let messageId = 1;
  let pendingRequests = new Map<number, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>();

  /**
   * Starts the LSP process
   */
  async function start(): Promise<void> {
    if (lspProcess) {
      logger.warn('LSP process already started');
      return;
    }

    logger.info(`Starting LSP process: ${lspPath}`);
    
    lspProcess = spawn(lspPath, ['--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!lspProcess.stdout || !lspProcess.stdin || !lspProcess.stderr) {
      throw new Error('Failed to create LSP process streams');
    }

    // Handle LSP responses
    let buffer = '';
    lspProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        
        const header = buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        
        if (!contentLengthMatch) {
          logger.error('Invalid LSP message header');
          break;
        }
        
        const contentLength = parseInt(contentLengthMatch[1], 10);
        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;
        
        if (buffer.length < messageEnd) break;
        
        const messageContent = buffer.substring(messageStart, messageEnd);
        buffer = buffer.substring(messageEnd);
        
        try {
          const message = JSON.parse(messageContent);
          handleMessage(message);
        } catch (error) {
          logger.error(`Failed to parse LSP message: ${error}`);
        }
      }
    });

    lspProcess.stderr?.on('data', (chunk) => {
      logger.warn(`LSP stderr: ${chunk.toString()}`);
    });

    lspProcess.on('exit', (code) => {
      logger.info(`LSP process exited with code: ${code}`);
      lspProcess = null;
      
      // Reject all pending requests
      for (const [id, { reject, timer }] of pendingRequests) {
        clearTimeout(timer);
        reject(new Error('LSP process exited'));
      }
      pendingRequests.clear();
    });

    // Initialize the LSP connection
    await sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${process.cwd()}`,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext'] },
          completion: { completionItem: { snippetSupport: false } },
          signatureHelp: { signatureInformation: { documentationFormat: ['plaintext'] } }
        }
      }
    });

    await sendNotification('initialized', {});
  }

  /**
   * Stops the LSP process
   */
  async function stop(): Promise<void> {
    if (!lspProcess) {
      return;
    }

    logger.info('Stopping LSP process');
    
    try {
      await sendNotification('exit', {});
    } catch {
      // Ignore errors during shutdown
    }

    lspProcess.kill();
    lspProcess = null;
  }

  /**
   * Handles incoming LSP messages
   */
  function handleMessage(message: any): void {
    if (message.id && pendingRequests.has(message.id)) {
      const request = pendingRequests.get(message.id)!;
      pendingRequests.delete(message.id);
      clearTimeout(request.timer);
      
      if (message.error) {
        request.reject(new Error(message.error.message || 'LSP error'));
      } else {
        request.resolve(message.result);
      }
    }
  }

  /**
   * Sends an LSP request and waits for response
   */
  function sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!lspProcess || !lspProcess.stdin) {
        reject(new Error('LSP process not started'));
        return;
      }

      const id = messageId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      
      lspProcess.stdin.write(header + content);

      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, timeout);

      pendingRequests.set(id, { resolve, reject, timer });
    });
  }

  /**
   * Sends an LSP notification (no response expected)
   */
  function sendNotification(method: string, params: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!lspProcess || !lspProcess.stdin) {
        reject(new Error('LSP process not started'));
        return;
      }

      const message = {
        jsonrpc: '2.0',
        method,
        params
      };

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      
      lspProcess.stdin.write(header + content);
      resolve();
    });
  }

  /**
   * Opens a document in the LSP
   */
  async function openDocument(uri: string, content: string, languageId = 'typescript'): Promise<void> {
    await sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content
      }
    });
  }

  /**
   * Gets hover information at a position
   */
  async function getHover(uri: string, position: LSPPosition): Promise<LSPHover | null> {
    try {
      const result = await sendRequest('textDocument/hover', {
        textDocument: { uri },
        position
      });
      
      return result ? LSPHoverSchema.parse(result) : null;
    } catch (error) {
      logger.warn(`Hover request failed: ${error}`);
      return null;
    }
  }

  /**
   * Gets signature help at a position
   */
  async function getSignatureHelp(uri: string, position: LSPPosition): Promise<LSPSignatureHelp | null> {
    try {
      const result = await sendRequest('textDocument/signatureHelp', {
        textDocument: { uri },
        position
      });
      
      return result ? LSPSignatureHelpSchema.parse(result) : null;
    } catch (error) {
      logger.warn(`Signature help request failed: ${error}`);
      return null;
    }
  }

  /**
   * Gets completions at a position
   */
  async function getCompletions(uri: string, position: LSPPosition): Promise<LSPCompletionItem[]> {
    try {
      const result = await sendRequest('textDocument/completion', {
        textDocument: { uri },
        position
      });
      
      const items = result?.items || result || [];
      return items.map((item: any) => {
        try {
          return LSPCompletionItemSchema.parse(item);
        } catch {
          return null;
        }
      }).filter((item: any) => item !== null);
    } catch (error) {
      logger.warn(`Completions request failed: ${error}`);
      return [];
    }
  }

  /**
   * Gets diagnostics for a document
   */
  async function getDiagnostics(uri: string): Promise<LSPDiagnostic[]> {
    // Note: Diagnostics are typically sent as notifications, not responses
    // This is a simplified implementation that might need adjustment
    try {
      const result = await sendRequest('textDocument/diagnostic', {
        textDocument: { uri }
      });
      
      const diagnostics = result?.items || [];
      return diagnostics.map((diag: any) => {
        try {
          return LSPDiagnosticSchema.parse(diag);
        } catch {
          return null;
        }
      }).filter((diag: any) => diag !== null);
    } catch (error) {
      logger.warn(`Diagnostics request failed: ${error}`);
      return [];
    }
  }

  return {
    start,
    stop,
    openDocument,
    getHover,
    getSignatureHelp,
    getCompletions,
    getDiagnostics
  };
}

export type LSPHarness = ReturnType<typeof createLSPHarness>;