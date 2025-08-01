import { z } from 'zod';
export const LSPPositionSchema = z.object({
    line: z.number(),
    character: z.number()
});
export const LSPRangeSchema = z.object({
    start: LSPPositionSchema,
    end: LSPPositionSchema
});
export const LSPLocationSchema = z.object({
    uri: z.string(),
    range: LSPRangeSchema
});
export const LSPDiagnosticSchema = z.object({
    range: LSPRangeSchema,
    severity: z.number(),
    code: z.union([z.string(), z.number()]).optional(),
    source: z.string().optional(),
    message: z.string(),
    relatedInformation: z.array(z.object({
        location: LSPLocationSchema,
        message: z.string()
    })).optional()
});
export const LSPCompletionItemSchema = z.object({
    label: z.string(),
    kind: z.number().optional(),
    detail: z.string().optional(),
    documentation: z.string().optional(),
    insertText: z.string().optional(),
    sortText: z.string().optional()
});
export const LSPHoverSchema = z.object({
    contents: z.union([z.string(), z.array(z.string())]),
    range: LSPRangeSchema.optional()
});
export const LSPSignatureHelpSchema = z.object({
    signatures: z.array(z.object({
        label: z.string(),
        documentation: z.string().optional(),
        parameters: z.array(z.object({
            label: z.string(),
            documentation: z.string().optional()
        })).optional()
    })),
    activeSignature: z.number().optional(),
    activeParameter: z.number().optional()
});
//# sourceMappingURL=schemas.js.map