import { z } from 'zod';

export const TwoslashOptionsSchema = z.object({
  strict: z.boolean().optional(),
  target: z.string().optional(),
  module: z.string().optional(),
  moduleResolution: z.string().optional(),
  lib: z.array(z.string()).optional(),
  declaration: z.boolean().optional(),
  outDir: z.string().optional()
});

export const TwoslashFileSchema = z.object({
  filename: z.string(),
  content: z.string()
});

export const TwoslashMarkerSchema = z.object({
  line: z.number(),
  character: z.number(),
  kind: z.enum(['query', 'completion', 'hover', 'signature-help'])
});

export const TwoslashDocumentSchema = z.object({
  options: TwoslashOptionsSchema,
  files: z.array(TwoslashFileSchema),
  markers: z.array(TwoslashMarkerSchema)
});

export type TwoslashOptions = z.infer<typeof TwoslashOptionsSchema>;
export type TwoslashFile = z.infer<typeof TwoslashFileSchema>;
export type TwoslashMarker = z.infer<typeof TwoslashMarkerSchema>;
export type TwoslashDocument = z.infer<typeof TwoslashDocumentSchema>;