import { z } from 'zod';
export declare const LSPPositionSchema: z.ZodObject<{
    line: z.ZodNumber;
    character: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    line: number;
    character: number;
}, {
    line: number;
    character: number;
}>;
export declare const LSPRangeSchema: z.ZodObject<{
    start: z.ZodObject<{
        line: z.ZodNumber;
        character: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        line: number;
        character: number;
    }, {
        line: number;
        character: number;
    }>;
    end: z.ZodObject<{
        line: z.ZodNumber;
        character: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        line: number;
        character: number;
    }, {
        line: number;
        character: number;
    }>;
}, "strip", z.ZodTypeAny, {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
}, {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
}>;
export declare const LSPLocationSchema: z.ZodObject<{
    uri: z.ZodString;
    range: z.ZodObject<{
        start: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
        end: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    uri: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
}, {
    uri: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
}>;
export declare const LSPDiagnosticSchema: z.ZodObject<{
    range: z.ZodObject<{
        start: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
        end: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }>;
    severity: z.ZodNumber;
    code: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    source: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
    relatedInformation: z.ZodOptional<z.ZodArray<z.ZodObject<{
        location: z.ZodObject<{
            uri: z.ZodString;
            range: z.ZodObject<{
                start: z.ZodObject<{
                    line: z.ZodNumber;
                    character: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    line: number;
                    character: number;
                }, {
                    line: number;
                    character: number;
                }>;
                end: z.ZodObject<{
                    line: z.ZodNumber;
                    character: z.ZodNumber;
                }, "strip", z.ZodTypeAny, {
                    line: number;
                    character: number;
                }, {
                    line: number;
                    character: number;
                }>;
            }, "strip", z.ZodTypeAny, {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            }, {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            }>;
        }, "strip", z.ZodTypeAny, {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        }, {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        }>;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        message: string;
        location: {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        };
    }, {
        message: string;
        location: {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        };
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    message: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
    severity: number;
    code?: string | number | undefined;
    source?: string | undefined;
    relatedInformation?: {
        message: string;
        location: {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        };
    }[] | undefined;
}, {
    message: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
    severity: number;
    code?: string | number | undefined;
    source?: string | undefined;
    relatedInformation?: {
        message: string;
        location: {
            uri: string;
            range: {
                start: {
                    line: number;
                    character: number;
                };
                end: {
                    line: number;
                    character: number;
                };
            };
        };
    }[] | undefined;
}>;
export declare const LSPCompletionItemSchema: z.ZodObject<{
    label: z.ZodString;
    kind: z.ZodOptional<z.ZodNumber>;
    detail: z.ZodOptional<z.ZodString>;
    documentation: z.ZodOptional<z.ZodString>;
    insertText: z.ZodOptional<z.ZodString>;
    sortText: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    label: string;
    kind?: number | undefined;
    detail?: string | undefined;
    documentation?: string | undefined;
    insertText?: string | undefined;
    sortText?: string | undefined;
}, {
    label: string;
    kind?: number | undefined;
    detail?: string | undefined;
    documentation?: string | undefined;
    insertText?: string | undefined;
    sortText?: string | undefined;
}>;
export declare const LSPHoverSchema: z.ZodObject<{
    contents: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    range: z.ZodOptional<z.ZodObject<{
        start: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
        end: z.ZodObject<{
            line: z.ZodNumber;
            character: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            line: number;
            character: number;
        }, {
            line: number;
            character: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }, {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    contents: string | string[];
    range?: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    } | undefined;
}, {
    contents: string | string[];
    range?: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    } | undefined;
}>;
export declare const LSPSignatureHelpSchema: z.ZodObject<{
    signatures: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        documentation: z.ZodOptional<z.ZodString>;
        parameters: z.ZodOptional<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            documentation: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            label: string;
            documentation?: string | undefined;
        }, {
            label: string;
            documentation?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        documentation?: string | undefined;
        parameters?: {
            label: string;
            documentation?: string | undefined;
        }[] | undefined;
    }, {
        label: string;
        documentation?: string | undefined;
        parameters?: {
            label: string;
            documentation?: string | undefined;
        }[] | undefined;
    }>, "many">;
    activeSignature: z.ZodOptional<z.ZodNumber>;
    activeParameter: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    signatures: {
        label: string;
        documentation?: string | undefined;
        parameters?: {
            label: string;
            documentation?: string | undefined;
        }[] | undefined;
    }[];
    activeSignature?: number | undefined;
    activeParameter?: number | undefined;
}, {
    signatures: {
        label: string;
        documentation?: string | undefined;
        parameters?: {
            label: string;
            documentation?: string | undefined;
        }[] | undefined;
    }[];
    activeSignature?: number | undefined;
    activeParameter?: number | undefined;
}>;
export type LSPPosition = z.infer<typeof LSPPositionSchema>;
export type LSPRange = z.infer<typeof LSPRangeSchema>;
export type LSPLocation = z.infer<typeof LSPLocationSchema>;
export type LSPDiagnostic = z.infer<typeof LSPDiagnosticSchema>;
export type LSPCompletionItem = z.infer<typeof LSPCompletionItemSchema>;
export type LSPHover = z.infer<typeof LSPHoverSchema>;
export type LSPSignatureHelp = z.infer<typeof LSPSignatureHelpSchema>;
//# sourceMappingURL=schemas.d.ts.map