import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import type { Logger } from './utils.js';

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface LSPDiagnostic {
  range: Range;
  severity: number;
  message: string;
  code?: string | number;
}

export interface LSPSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
  }>;
  activeSignature?: number;
  activeParameter?: number;
}

export interface LSPHover {
  contents: string;
  range?: Range;
}

export interface LSPCompletion {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
}

export interface LSPHarness {
  start(workspaceRoot: string): Promise<void>;
  stop(): Promise<void>;
  openDocument(filePath: string, content: string): Promise<void>;
  closeDocument(filePath: string): Promise<void>;
  getDiagnostics(filePath: string): Promise<LSPDiagnostic[]>;
  getSignatureHelp(filePath: string, position: Position): Promise<LSPSignatureHelp | null>;
  getHover(filePath: string, position: Position): Promise<LSPHover | null>;
  getCompletions(filePath: string, position: Position): Promise<LSPCompletion[]>;
}

export function createLSPHarness(
  lspCommand: string,
  logger: Logger
): LSPHarness {
  let lspProcess: ChildProcess | null = null;
  let requestId = 1;
  let pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  let openDocuments = new Set<string>();

  return {
    async start(workspaceRoot: string): Promise<void> {
      logger.info(`Starting LSP server: ${lspCommand}`);
      
      lspProcess = spawn(lspCommand, ['--stdio'], {
        cwd: workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!lspProcess.stdout || !lspProcess.stdin || !lspProcess.stderr) {
        throw new Error('Failed to create LSP process streams');
      }

      // Handle LSP output
      let buffer = '';
      lspProcess.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        
        while (true) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) break;
          
          const headers = buffer.slice(0, headerEnd);
          const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
          
          if (!contentLengthMatch) {
            logger.error('Invalid LSP message format');
            break;
          }
          
          const contentLength = parseInt(contentLengthMatch[1]!, 10);
          const messageStart = headerEnd + 4;
          
          if (buffer.length < messageStart + contentLength) {
            break; // Wait for more data
          }
          
          const messageContent = buffer.slice(messageStart, messageStart + contentLength);
          buffer = buffer.slice(messageStart + contentLength);
          
          try {
            const message = JSON.parse(messageContent);
            handleLSPMessage(message);
          } catch (error) {
            logger.error(`Failed to parse LSP message: ${error}`);
          }
        }
      });

      lspProcess.stderr?.on('data', (data: Buffer) => {
        logger.debug(`LSP stderr: ${data.toString()}`);
      });

      lspProcess.on('exit', (code) => {
        logger.info(`LSP server exited with code ${code}`);
        lspProcess = null;
      });

      // Initialize LSP
      await sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${workspaceRoot}`,
        capabilities: {
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
            },
            signatureHelp: {
              dynamicRegistration: false,
            },
            hover: {
              dynamicRegistration: false,
            },
            completion: {
              dynamicRegistration: false,
            },
          },
        },
      });

      await sendNotification('initialized', {});
      logger.info('LSP server initialized');
    },

    async stop(): Promise<void> {
      if (lspProcess) {
        await sendNotification('shutdown', {});
        await sendNotification('exit', {});
        lspProcess.kill();
        lspProcess = null;
      }
      pendingRequests.clear();
      openDocuments.clear();
      logger.info('LSP server stopped');
    },

    async openDocument(filePath: string, content: string): Promise<void> {
      const uri = `file://${path.resolve(filePath)}`;
      
      await sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'typescript',
          version: 1,
          text: content,
        },
      });
      
      openDocuments.add(filePath);
      logger.debug(`Opened document: ${filePath}`);
    },

    async closeDocument(filePath: string): Promise<void> {
      const uri = `file://${path.resolve(filePath)}`;
      
      await sendNotification('textDocument/didClose', {
        textDocument: { uri },
      });
      
      openDocuments.delete(filePath);
      logger.debug(`Closed document: ${filePath}`);
    },

    async getDiagnostics(filePath: string): Promise<LSPDiagnostic[]> {
      // Diagnostics are typically sent as notifications, not responses
      // For this implementation, we'll return empty array
      // In a real implementation, you'd listen for diagnostic notifications
      return [];
    },

    async getSignatureHelp(filePath: string, position: Position): Promise<LSPSignatureHelp | null> {
      const uri = `file://${path.resolve(filePath)}`;
      
      const response = await sendRequest('textDocument/signatureHelp', {
        textDocument: { uri },
        position,
      }) as LSPSignatureHelp | null;
      
      return response;
    },

    async getHover(filePath: string, position: Position): Promise<LSPHover | null> {
      const uri = `file://${path.resolve(filePath)}`;
      
      const response = await sendRequest('textDocument/hover', {
        textDocument: { uri },
        position,
      }) as { contents?: string | { value: string } | unknown; range?: Range } | null;
      
      if (response?.contents) {
        const result: LSPHover = {
          contents: typeof response.contents === 'string' 
            ? response.contents 
            : (response.contents as { value?: string }).value || JSON.stringify(response.contents),
        };
        
        if (response.range) {
          result.range = response.range;
        }
        
        return result;
      }
      
      return null;
    },

    async getCompletions(filePath: string, position: Position): Promise<LSPCompletion[]> {
      const uri = `file://${path.resolve(filePath)}`;
      
      const response = await sendRequest('textDocument/completion', {
        textDocument: { uri },
        position,
      }) as LSPCompletion[] | { items: LSPCompletion[] } | null;
      
      if (Array.isArray(response)) {
        return response;
      } else if (response && 'items' in response) {
        return response.items;
      }
      
      return [];
    },
  };

  function handleLSPMessage(message: unknown): void {
    const msg = message as { id?: number; error?: unknown; result?: unknown };
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id)!;
      pendingRequests.delete(msg.id);
      
      if (msg.error) {
        const error = msg.error as { message?: string };
        reject(new Error(error.message || 'LSP error'));
      } else {
        resolve(msg.result);
      }
    }
  }

  function sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      pendingRequests.set(id, { resolve, reject });
      
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };
      
      sendMessage(message);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('LSP request timeout'));
        }
      }, 10000);
    });
  }

  function sendNotification(method: string, params: unknown): Promise<void> {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };
    
    sendMessage(message);
    return Promise.resolve();
  }

  function sendMessage(message: unknown): void {
    if (!lspProcess?.stdin) {
      throw new Error('LSP process not available');
    }
    
    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    
    lspProcess.stdin.write(header + content);
  }
}