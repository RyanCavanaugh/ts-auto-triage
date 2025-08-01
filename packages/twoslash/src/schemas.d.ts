import { z } from 'zod';
export declare const TwoslashOptionsSchema: z.ZodObject<{
    strict: z.ZodOptional<z.ZodBoolean>;
    target: z.ZodOptional<z.ZodString>;
    module: z.ZodOptional<z.ZodString>;
    moduleResolution: z.ZodOptional<z.ZodString>;
    lib: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    declaration: z.ZodOptional<z.ZodBoolean>;
    outDir: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    strict?: boolean | undefined;
    target?: string | undefined;
    module?: string | undefined;
    moduleResolution?: string | undefined;
    lib?: string[] | undefined;
    declaration?: boolean | undefined;
    outDir?: string | undefined;
}, {
    strict?: boolean | undefined;
    target?: string | undefined;
    module?: string | undefined;
    moduleResolution?: string | undefined;
    lib?: string[] | undefined;
    declaration?: boolean | undefined;
    outDir?: string | undefined;
}>;
export declare const TwoslashFileSchema: z.ZodObject<{
    filename: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    filename: string;
}, {
    content: string;
    filename: string;
}>;
export declare const TwoslashMarkerSchema: z.ZodObject<{
    line: z.ZodNumber;
    character: z.ZodNumber;
    kind: z.ZodEnum<["query", "completion", "hover", "signature-help"]>;
}, "strip", z.ZodTypeAny, {
    line: number;
    character: number;
    kind: "query" | "completion" | "hover" | "signature-help";
}, {
    line: number;
    character: number;
    kind: "query" | "completion" | "hover" | "signature-help";
}>;
export declare const TwoslashDocumentSchema: z.ZodObject<{
    options: z.ZodObject<{
        strict: z.ZodOptional<z.ZodBoolean>;
        target: z.ZodOptional<z.ZodString>;
        module: z.ZodOptional<z.ZodString>;
        moduleResolution: z.ZodOptional<z.ZodString>;
        lib: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        declaration: z.ZodOptional<z.ZodBoolean>;
        outDir: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        strict?: boolean | undefined;
        target?: string | undefined;
        module?: string | undefined;
        moduleResolution?: string | undefined;
        lib?: string[] | undefined;
        declaration?: boolean | undefined;
        outDir?: string | undefined;
    }, {
        strict?: boolean | undefined;
        target?: string | undefined;
        module?: string | undefined;
        moduleResolution?: string | undefined;
        lib?: string[] | undefined;
        declaration?: boolean | undefined;
        outDir?: string | undefined;
    }>;
    files: z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        filename: string;
    }, {
        content: string;
        filename: string;
    }>, "many">;
    markers: z.ZodArray<z.ZodObject<{
        line: z.ZodNumber;
        character: z.ZodNumber;
        kind: z.ZodEnum<["query", "completion", "hover", "signature-help"]>;
    }, "strip", z.ZodTypeAny, {
        line: number;
        character: number;
        kind: "query" | "completion" | "hover" | "signature-help";
    }, {
        line: number;
        character: number;
        kind: "query" | "completion" | "hover" | "signature-help";
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    options: {
        strict?: boolean | undefined;
        target?: string | undefined;
        module?: string | undefined;
        moduleResolution?: string | undefined;
        lib?: string[] | undefined;
        declaration?: boolean | undefined;
        outDir?: string | undefined;
    };
    files: {
        content: string;
        filename: string;
    }[];
    markers: {
        line: number;
        character: number;
        kind: "query" | "completion" | "hover" | "signature-help";
    }[];
}, {
    options: {
        strict?: boolean | undefined;
        target?: string | undefined;
        module?: string | undefined;
        moduleResolution?: string | undefined;
        lib?: string[] | undefined;
        declaration?: boolean | undefined;
        outDir?: string | undefined;
    };
    files: {
        content: string;
        filename: string;
    }[];
    markers: {
        line: number;
        character: number;
        kind: "query" | "completion" | "hover" | "signature-help";
    }[];
}>;
export type TwoslashOptions = z.infer<typeof TwoslashOptionsSchema>;
export type TwoslashFile = z.infer<typeof TwoslashFileSchema>;
export type TwoslashMarker = z.infer<typeof TwoslashMarkerSchema>;
export type TwoslashDocument = z.infer<typeof TwoslashDocumentSchema>;
//# sourceMappingURL=schemas.d.ts.map