import { promises as fs } from 'fs';
import { TwoslashDocumentSchema } from './schemas.js';
/**
 * Parses a twoslash markdown file
 */
export async function parseTwoslashFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseTwoslashContent(content);
}
/**
 * Parses twoslash content from a string
 */
export function parseTwoslashContent(content) {
    const lines = content.split('\n');
    const options = {};
    const files = [];
    const markers = [];
    let currentFile = null;
    let currentFileLines = [];
    let inCodeBlock = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        // Check for options (must be at the start, before any files)
        if (line.startsWith('// @') && files.length === 0) {
            parseCompilerOption(line, options);
            continue;
        }
        // Check for file declarations
        const fileMatch = line.match(/^\/\/ (.+\.ts)$/);
        if (fileMatch) {
            // Save previous file if exists
            if (currentFile) {
                currentFile.content = currentFileLines.join('\n');
                files.push(currentFile);
            }
            // Start new file
            currentFile = {
                filename: fileMatch[1],
                content: ''
            };
            currentFileLines = [];
            inCodeBlock = true;
            continue;
        }
        // Check for code block boundaries
        if (line.startsWith('```')) {
            if (inCodeBlock && currentFile) {
                currentFile.content = currentFileLines.join('\n');
                files.push(currentFile);
                currentFile = null;
                currentFileLines = [];
            }
            inCodeBlock = !inCodeBlock;
            continue;
        }
        // Add content to current file
        if (inCodeBlock && currentFile) {
            // Check for markers
            const markerMatch = line.match(/\/\*!\*\//);
            if (markerMatch) {
                const character = line.indexOf('/*!*/');
                markers.push({
                    line: currentFileLines.length,
                    character,
                    kind: 'query' // Default kind, can be overridden
                });
            }
            currentFileLines.push(line);
        }
    }
    // Save final file if exists
    if (currentFile) {
        currentFile.content = currentFileLines.join('\n');
        files.push(currentFile);
    }
    const document = {
        options,
        files,
        markers
    };
    return TwoslashDocumentSchema.parse(document);
}
/**
 * Parses a compiler option line
 */
function parseCompilerOption(line, options) {
    const match = line.match(/^\/\/ @(\w+):\s*(.+)$/);
    if (!match)
        return;
    const [, key, value] = match;
    switch (key) {
        case 'strict':
            options.strict = value === 'true';
            break;
        case 'target':
            options.target = value;
            break;
        case 'module':
            options.module = value;
            break;
        case 'moduleResolution':
            options.moduleResolution = value;
            break;
        case 'lib':
            options.lib = value.split(',').map(lib => lib.trim());
            break;
        case 'declaration':
            options.declaration = value === 'true';
            break;
        case 'outDir':
            options.outDir = value;
            break;
    }
}
/**
 * Writes files from a twoslash document to disk
 */
export async function writeTwoslashFiles(document, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    // Write tsconfig.json if options are specified
    if (Object.keys(document.options).length > 0) {
        const tsconfig = {
            compilerOptions: document.options
        };
        await fs.writeFile(`${outputDir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
    }
    // Write all files
    for (const file of document.files) {
        await fs.writeFile(`${outputDir}/${file.filename}`, file.content);
    }
}
/**
 * Finds the position of a marker in a specific file
 */
export function findMarkerInFile(document, filename, markerIndex = 0) {
    const file = document.files.find(f => f.filename === filename);
    if (!file)
        return null;
    const lines = file.content.split('\n');
    let markerCount = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const markerMatch = line.match(/\/\*!\*\//g);
        if (markerMatch) {
            if (markerCount === markerIndex) {
                const character = line.indexOf('/*!*/');
                return { line: lineIndex, character };
            }
            markerCount++;
        }
    }
    return null;
}
/**
 * Gets the content of a specific file without markers
 */
export function getCleanFileContent(document, filename) {
    const file = document.files.find(f => f.filename === filename);
    if (!file)
        return null;
    // Remove marker comments
    return file.content.replace(/\/\*!\*\//g, '');
}
/**
 * Creates a file URI for LSP operations
 */
export function createFileUri(baseDir, filename) {
    const path = `${baseDir}/${filename}`;
    return `file://${path}`;
}
//# sourceMappingURL=index.js.map