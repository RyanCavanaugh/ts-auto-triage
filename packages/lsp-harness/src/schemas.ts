import { z } from 'zod';

// LSP Position schema
export const positionSchema = z.object({
  line: z.number(),
  character: z.number()
});

// LSP Range schema
export const rangeSchema = z.object({
  start: positionSchema,
  end: positionSchema
});

// LSP TextEdit schema
export const textEditSchema = z.object({
  range: rangeSchema,
  newText: z.string()
});

// LSP CompletionItem schema
export const completionItemSchema = z.object({
  label: z.string(),
  kind: z.number().optional(),
  detail: z.string().optional(),
  documentation: z.string().optional(),
  sortText: z.string().optional(),
  insertText: z.string().optional(),
  textEdit: textEditSchema.optional()
});

// LSP Hover schema
export const hoverSchema = z.object({
  contents: z.union([z.string(), z.array(z.string())]),
  range: rangeSchema.optional()
});

// LSP SignatureHelp schema
export const signatureHelpSchema = z.object({
  signatures: z.array(z.object({
    label: z.string(),
    documentation: z.string().optional(),
    parameters: z.array(z.object({
      label: z.string(),
      documentation: z.string().optional()
    }))
  })),
  activeSignature: z.number(),
  activeParameter: z.number()
});

// LSP Location schema
export const locationSchema = z.object({
  uri: z.string(),
  range: rangeSchema
});

export type Position = z.infer<typeof positionSchema>;
export type Range = z.infer<typeof rangeSchema>;
export type TextEdit = z.infer<typeof textEditSchema>;
export type CompletionItem = z.infer<typeof completionItemSchema>;
export type Hover = z.infer<typeof hoverSchema>;
export type SignatureHelp = z.infer<typeof signatureHelpSchema>;
export type Location = z.infer<typeof locationSchema>;