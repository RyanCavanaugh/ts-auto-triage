import { spawn, ChildProcess } from 'child_process';
import { resolve as resolvePath } from 'path';
import { Logger } from '@ryancavanaugh/utils';
import { 
  Position, 
  CompletionItem, 
  Hover, 
  SignatureHelp, 
  Location, 
  completionItemSchema, 
  hoverSchema, 
  signatureHelpSchema, 
  locationSchema 
} from './schemas.js';

export interface LSPHarnessOptions {
  logger: Logger;
  tsServerPath: string;
  workspaceRoot: string;
  useNativePreview?: boolean;
}

export function createLSPHarness(options: LSPHarnessOptions) {
  const { logger, tsServerPath, workspaceRoot, useNativePreview = false } = options;
  
  let tsServer: ChildProcess | null = null;
  let requestId = 0;
  let pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let buffer = '';

  function parseMessage(data: string): any[] {
    buffer += data;
    const messages: any[] = [];
    
    while (true) {
      const contentLengthMatch = buffer.match(/Content-Length: (\d+)\r?\n\r?\n/);
      if (!contentLengthMatch) break;
      
      const contentLength = parseInt(contentLengthMatch[1]!);
      const headerEnd = contentLengthMatch.index! + contentLengthMatch[0].length;
      
      if (buffer.length < headerEnd + contentLength) break;
      
      const messageContent = buffer.substring(headerEnd, headerEnd + contentLength);
      buffer = buffer.substring(headerEnd + contentLength);
      
      try {
        const message = JSON.parse(messageContent);
        messages.push(message);
      } catch (error) {
        logger.warn(`Failed to parse LSP message: ${messageContent}`);
      }
    }
    
    return messages;
  }

  function sendLSPMessage(method: string, params: unknown, id?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!tsServer || !tsServer.stdin) {
        reject(new Error('TypeScript server not started'));
        return;
      }

      const messageId = id ?? ++requestId;
      const message = {
        jsonrpc: '2.0',
        id: messageId,
        method,
        params
      };

      if (id === undefined) {
        pendingRequests.set(messageId, { resolve, reject });
      }

      const messageStr = JSON.stringify(message);
      const content = `Content-Length: ${messageStr.length}\r\n\r\n${messageStr}`;
      
      logger.debug(`Sending LSP message: ${content}`);
      tsServer.stdin.write(content);

      if (id !== undefined) {
        resolve(undefined);
      } else {
        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(messageId)) {
            pendingRequests.delete(messageId);
            reject(new Error(`LSP request timeout for method: ${method}`));
          }
        }, 30000);
      }
    });
  }

  function start(): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      if (useNativePreview) {
        logger.info('Starting TypeScript native preview server with tsgo --lsp --stdio');
        
        // Use the tsgo binary from node_modules, resolving from the project root
        const projectRoot = process.cwd();
        const tsgoPath = resolvePath(projectRoot, 'node_modules/.bin/tsgo');
        logger.info(`Using tsgo path: ${tsgoPath}`);
        tsServer = spawn(tsgoPath, ['--lsp', '--stdio'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: workspaceRoot
        });
        logger.info(`Started tsgo process with PID: ${tsServer.pid}`);
      } else {
        logger.info(`Starting TypeScript server at ${tsServerPath}`);
        
        tsServer = spawn('node', [tsServerPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: workspaceRoot
        });
      }

      if (!tsServer.stdout || !tsServer.stdin || !tsServer.stderr) {
        reject(new Error('Failed to create TypeScript server stdio'));
        return;
      }

      tsServer.stdout.on('data', (data: Buffer) => {
        const output = data.toString('utf-8');
        
        if (useNativePreview) {
          // Handle LSP messages
          const messages = parseMessage(output);
          for (const message of messages) {
            handleLSPResponse(message);
          }
        } else {
          // Handle TypeScript server messages
          const lines = output.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              handleTSServerResponse(response);
            } catch (error) {
              logger.debug(`Failed to parse TS server response: ${line}`);
            }
          }
        }
      });

      tsServer.stderr?.on('data', (data: Buffer) => {
        logger.warn(`TypeScript server stderr: ${data.toString()}`);
      });

      tsServer.on('error', (error) => {
        logger.error(`TypeScript server error: ${error.message}`);
        reject(error);
      });

      tsServer.on('exit', (code, signal) => {
        logger.info(`TypeScript server exited with code ${code}, signal ${signal}`);
        tsServer = null;
      });

      // Send initialization
      if (useNativePreview) {
        // Send LSP initialize message for native preview
        setTimeout(async () => {
          try {
            await sendLSPMessage('initialize', {
              processId: process.pid,
              rootPath: workspaceRoot,
              rootUri: `file://${workspaceRoot}`,
              capabilities: {}
            });
            
            // Send initialized notification
            await sendLSPMessage('initialized', {}, 0);
            resolvePromise();
          } catch (error) {
            reject(error);
          }
        }, 1000);
      } else {
        setTimeout(() => resolvePromise(), 1000);
      }
    });
  }

  function handleLSPResponse(response: any): void {
    if (response.id !== undefined) {
      const request = pendingRequests.get(response.id);
      if (request) {
        pendingRequests.delete(response.id);
        if (response.error) {
          request.reject(new Error(response.error.message || 'LSP request failed'));
        } else {
          request.resolve(response.result);
        }
      }
    }
  }

  function handleTSServerResponse(response: any): void {
    if (response.request_seq !== undefined) {
      const request = pendingRequests.get(response.request_seq);
      if (request) {
        pendingRequests.delete(response.request_seq);
        if (response.success) {
          request.resolve(response.body);
        } else {
          request.reject(new Error(response.message || 'TS Server request failed'));
        }
      }
    }
  }

  function sendTSServerRequest(command: string, arguments_: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!tsServer || !tsServer.stdin) {
        reject(new Error('TypeScript server not started'));
        return;
      }

      const id = ++requestId;
      const request = {
        seq: id,
        type: 'request',
        command,
        arguments: arguments_
      };

      pendingRequests.set(id, { resolve, reject });

      const requestLine = JSON.stringify(request) + '\n';
      tsServer.stdin.write(requestLine);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`TS Server request timeout for command: ${command}`));
        }
      }, 30000);
    });
  }

  async function openFile(filename: string, content: string): Promise<void> {
    if (useNativePreview) {
      // Use LSP textDocument/didOpen
      await sendLSPMessage('textDocument/didOpen', {
        textDocument: {
          uri: `file://${filename}`,
          languageId: 'typescript',
          version: 1,
          text: content
        }
      }, 0); // Notification, no response expected
    } else {
      // Use TypeScript server open command
      await sendTSServerRequest('open', {
        file: filename,
        fileContent: content
      });
    }
  }

  async function getCompletions(filename: string, position: Position): Promise<CompletionItem[]> {
    if (useNativePreview) {
      // Use LSP textDocument/completion
      const response = await sendLSPMessage('textDocument/completion', {
        textDocument: {
          uri: `file://${filename}`
        },
        position: {
          line: position.line,
          character: position.character
        }
      });

      if (!response || typeof response !== 'object') {
        return [];
      }

      const completion = response as any;
      const items = Array.isArray(completion) ? completion : completion.items || [];
      
      return items.map((item: any) => {
        try {
          return completionItemSchema.parse({
            label: item.label,
            kind: item.kind || 1,
            detail: item.detail,
            documentation: item.documentation,
            sortText: item.sortText,
            insertText: item.insertText || item.label
          });
        } catch {
          return {
            label: item.label || 'unknown',
            kind: 1
          };
        }
      });
    } else {
      // Use TypeScript server completions command
      const response = await sendTSServerRequest('completions', {
        file: filename,
        line: position.line + 1, // TSServer uses 1-based line numbers
        offset: position.character + 1 // TSServer uses 1-based character positions
      });

      if (!response || typeof response !== 'object') {
        return [];
      }

      const entries = (response as any).entries;
      if (!Array.isArray(entries)) {
        return [];
      }
      
      return entries.map((entry: any) => {
        try {
          return completionItemSchema.parse({
            label: entry.name,
            kind: entry.kind,
            detail: entry.kindModifiers,
            documentation: entry.documentation,
            sortText: entry.sortText,
            insertText: entry.insertText
          });
        } catch {
          return {
            label: entry.name || 'unknown',
            kind: 1
          };
        }
      });
    }
  }

  async function getHover(filename: string, position: Position): Promise<Hover | null> {
    try {
      if (useNativePreview) {
        // Use LSP textDocument/hover
        const response = await sendLSPMessage('textDocument/hover', {
          textDocument: {
            uri: `file://${filename}`
          },
          position: {
            line: position.line,
            character: position.character
          }
        });

        if (!response || typeof response !== 'object') {
          return null;
        }

        const hover = response as any;
        return hoverSchema.parse({
          contents: hover.contents?.value || hover.contents || '',
          range: hover.range ? {
            start: {
              line: hover.range.start.line,
              character: hover.range.start.character
            },
            end: {
              line: hover.range.end.line,
              character: hover.range.end.character
            }
          } : undefined
        });
      } else {
        // Use TypeScript server quickinfo command
        const response = await sendTSServerRequest('quickinfo', {
          file: filename,
          line: position.line + 1,
          offset: position.character + 1
        });

        if (!response || typeof response !== 'object') {
          return null;
        }

        const info = response as any;
        return hoverSchema.parse({
          contents: info.displayString || info.documentation || '',
          range: info.start && info.end ? {
            start: {
              line: info.start.line - 1,
              character: info.start.offset - 1
            },
            end: {
              line: info.end.line - 1,
              character: info.end.offset - 1
            }
          } : undefined
        });
      }
    } catch (error) {
      logger.warn(`Failed to get hover info: ${(error as Error).message}`);
      return null;
    }
  }

  async function getSignatureHelp(filename: string, position: Position): Promise<SignatureHelp | null> {
    try {
      if (useNativePreview) {
        // Use LSP textDocument/signatureHelp
        const response = await sendLSPMessage('textDocument/signatureHelp', {
          textDocument: {
            uri: `file://${filename}`
          },
          position: {
            line: position.line,
            character: position.character
          }
        });

        if (!response || typeof response !== 'object') {
          return null;
        }

        const help = response as any;
        return signatureHelpSchema.parse({
          signatures: help.signatures?.map((sig: any) => ({
            label: sig.label || '',
            documentation: sig.documentation || '',
            parameters: sig.parameters?.map((param: any) => ({
              label: param.label || '',
              documentation: param.documentation || ''
            })) || []
          })) || [],
          activeSignature: help.activeSignature || 0,
          activeParameter: help.activeParameter || 0
        });
      } else {
        // Use TypeScript server signatureHelp command
        const response = await sendTSServerRequest('signatureHelp', {
          file: filename,
          line: position.line + 1,
          offset: position.character + 1
        });

        if (!response || typeof response !== 'object') {
          return null;
        }

        const help = response as any;
        return signatureHelpSchema.parse({
          signatures: help.items?.map((item: any) => ({
            label: item.prefixDisplayParts?.map((p: any) => p.text).join('') || '',
            documentation: item.documentation?.map((d: any) => d.text).join('') || '',
            parameters: item.parameters?.map((param: any) => ({
              label: param.displayParts?.map((p: any) => p.text).join('') || '',
              documentation: param.documentation?.map((d: any) => d.text).join('') || ''
            })) || []
          })) || [],
          activeSignature: help.selectedItemIndex || 0,
          activeParameter: help.argumentIndex || 0
        });
      }
    } catch (error) {
      logger.warn(`Failed to get signature help: ${(error as Error).message}`);
      return null;
    }
  }

  async function getDefinition(filename: string, position: Position): Promise<Location[]> {
    try {
      if (useNativePreview) {
        // Use LSP textDocument/definition
        const response = await sendLSPMessage('textDocument/definition', {
          textDocument: {
            uri: `file://${filename}`
          },
          position: {
            line: position.line,
            character: position.character
          }
        });

        if (!response) {
          return [];
        }

        const definitions = Array.isArray(response) ? response : [response];
        return definitions.map((def: any) => {
          try {
            return locationSchema.parse({
              uri: def.uri,
              range: {
                start: {
                  line: def.range.start.line,
                  character: def.range.start.character
                },
                end: {
                  line: def.range.end.line,
                  character: def.range.end.character
                }
              }
            });
          } catch {
            return {
              uri: def.uri || '',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
              }
            };
          }
        });
      } else {
        // Use TypeScript server definition command
        const response = await sendTSServerRequest('definition', {
          file: filename,
          line: position.line + 1,
          offset: position.character + 1
        });

        if (!response || !Array.isArray(response)) {
          return [];
        }

        return response.map((def: any) => {
          try {
            return locationSchema.parse({
              uri: `file://${def.file}`,
              range: {
                start: {
                  line: def.start.line - 1,
                  character: def.start.offset - 1
                },
                end: {
                  line: def.end.line - 1,
                  character: def.end.offset - 1
                }
              }
            });
          } catch {
            return {
              uri: `file://${def.file || ''}`,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
              }
            };
          }
        });
      }
    } catch (error) {
      logger.warn(`Failed to get definition: ${(error as Error).message}`);
      return [];
    }
  }

  async function stop(): Promise<void> {
    if (tsServer) {
      logger.info('Stopping TypeScript server');
      tsServer.kill();
      tsServer = null;
      pendingRequests.clear();
      buffer = '';
    }
  }

  return {
    start,
    stop,
    openFile,
    getCompletions,
    getHover,
    getSignatureHelp,
    getDefinition
  };
}