import { spawn, ChildProcess } from 'child_process';
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
}

export function createLSPHarness(options: LSPHarnessOptions) {
  const { logger, tsServerPath, workspaceRoot } = options;
  
  let tsServer: ChildProcess | null = null;
  let requestId = 0;
  let pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Starting TypeScript server at ${tsServerPath}`);
      
      tsServer = spawn('node', [tsServerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workspaceRoot
      });

      if (!tsServer.stdout || !tsServer.stdin || !tsServer.stderr) {
        reject(new Error('Failed to create TypeScript server stdio'));
        return;
      }

      tsServer.stdout.on('data', (data: Buffer) => {
        const output = data.toString('utf-8');
        const lines = output.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            handleResponse(response);
          } catch (error) {
            logger.debug(`Failed to parse LSP response: ${line}`);
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

      tsServer.on('exit', (code) => {
        logger.info(`TypeScript server exited with code ${code}`);
        tsServer = null;
      });

      // Send initialization
      setTimeout(() => resolve(), 1000);
    });
  }

  function handleResponse(response: any): void {
    if (response.request_seq !== undefined) {
      const request = pendingRequests.get(response.request_seq);
      if (request) {
        pendingRequests.delete(response.request_seq);
        if (response.success) {
          request.resolve(response.body);
        } else {
          request.reject(new Error(response.message || 'LSP request failed'));
        }
      }
    }
  }

  function sendRequest(command: string, arguments_: unknown): Promise<unknown> {
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
          reject(new Error(`LSP request timeout for command: ${command}`));
        }
      }, 30000);
    });
  }

  async function openFile(filename: string, content: string): Promise<void> {
    await sendRequest('open', {
      file: filename,
      fileContent: content
    });
  }

  async function getCompletions(filename: string, position: Position): Promise<CompletionItem[]> {
    const response = await sendRequest('completions', {
      file: filename,
      line: position.line + 1, // TSServer uses 1-based line numbers
      offset: position.character + 1 // TSServer uses 1-based character positions
    });

    if (!response || typeof response !== 'object') {
      return [];
    }

    const entries = (response as any).entries || [];
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

  async function getHover(filename: string, position: Position): Promise<Hover | null> {
    try {
      const response = await sendRequest('quickinfo', {
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
    } catch (error) {
      logger.warn(`Failed to get hover info: ${(error as Error).message}`);
      return null;
    }
  }

  async function getSignatureHelp(filename: string, position: Position): Promise<SignatureHelp | null> {
    try {
      const response = await sendRequest('signatureHelp', {
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
    } catch (error) {
      logger.warn(`Failed to get signature help: ${(error as Error).message}`);
      return null;
    }
  }

  async function getDefinition(filename: string, position: Position): Promise<Location[]> {
    try {
      const response = await sendRequest('definition', {
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