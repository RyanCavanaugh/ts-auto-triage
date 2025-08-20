import { readFile } from 'fs/promises';

export async function loadPrompt(name: string, vars?: Record<string, unknown>): Promise<string> {
  const path = `prompts/${name}.md`;
  let content: string;

  try {
    content = await readFile(path, 'utf-8');
  } catch (err) {
    throw new Error(`Prompt file not found: ${path}`);
  }

  if (!vars) return content;

  return content.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, p1) => {
    const val = vars[p1];
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  });
}
