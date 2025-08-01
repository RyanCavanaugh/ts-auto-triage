import { z } from 'zod';

// Twoslash compiler options schema
export const compilerOptionsSchema = z.object({
  strict: z.boolean().optional(),
  target: z.string().optional(),
  module: z.string().optional(),
  lib: z.array(z.string()).optional(),
  noImplicitAny: z.boolean().optional(),
  strictNullChecks: z.boolean().optional()
}).catchall(z.unknown());

// Twoslash file entry schema
export const fileEntrySchema = z.object({
  filename: z.string(),
  content: z.string()
});

// Twoslash query position schema
export const queryPositionSchema = z.object({
  filename: z.string(),
  position: z.number(),
  type: z.enum(['signature-help', 'completions', 'hover', 'navigate'])
});

// Parsed twoslash document schema
export const twoslashDocumentSchema = z.object({
  compilerOptions: compilerOptionsSchema,
  files: z.array(fileEntrySchema),
  queries: z.array(queryPositionSchema)
});

export type CompilerOptions = z.infer<typeof compilerOptionsSchema>;
export type FileEntry = z.infer<typeof fileEntrySchema>;
export type QueryPosition = z.infer<typeof queryPositionSchema>;
export type TwoslashDocument = z.infer<typeof twoslashDocumentSchema>;