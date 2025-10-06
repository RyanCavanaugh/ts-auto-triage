import { z } from 'zod';

export const IssueRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number(),
});

export type IssueRef = z.infer<typeof IssueRefSchema>;

export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.enum(['User', 'Bot', 'Organization']),
});

export const GitHubLabelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
});

export const GitHubMilestoneSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(['open', 'closed']),
});

export const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  user: GitHubUserSchema,
  created_at: z.string(),
  updated_at: z.string(),
  author_association: z.string(),
  reactions: z.record(z.number()),
});

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  user: GitHubUserSchema,
  state: z.enum(['open', 'closed']),
  state_reason: z.string().nullable(),
  labels: z.array(GitHubLabelSchema),
  milestone: GitHubMilestoneSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  author_association: z.string(),
  reactions: z.record(z.number()),
  comments: z.array(GitHubCommentSchema),
  is_pull_request: z.boolean(),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const IssueActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_label'),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('remove_label'),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('close_issue'),
    reason: z.enum(['completed', 'not_planned']),
  }),
  z.object({
    kind: z.literal('add_comment'),
    body: z.string(),
  }),
  z.object({
    kind: z.literal('set_milestone'),
    milestone: z.string(),
  }),
  z.object({
    kind: z.literal('assign_user'),
    user: z.string(),
  }),
]);

export type IssueAction = z.infer<typeof IssueActionSchema>;

export const ActionFileSchema = z.object({
  issue_ref: IssueRefSchema,
  actions: z.array(IssueActionSchema),
});

export type ActionFile = z.infer<typeof ActionFileSchema>;

export const ConfigSchema = z.object({
  typescript: z.object({
    tscPath: z.string(),
    lspEntryPoint: z.string(),
  }),
  azure: z.object({
    openai: z.object({
      endpoint: z.string(),
      deployments: z.object({
        chat: z.string(),
        embeddings: z.string(),
      }),
    }),
  }),
  github: z.object({
    maxIssueBodyLength: z.number(),
    maxCommentLength: z.number(),
    rateLimitRetryDelay: z.number(),
    maxRetries: z.number(),
  }),
  ai: z.object({
    maxReproAttempts: z.number(),
    cacheEnabled: z.boolean(),
    maxEmbeddingInputLength: z.number(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const EmbeddingsDataSchema = z.record(z.array(z.string())); // base64 encoded embeddings per issue (array of embeddings, one per summary)
export const SummariesDataSchema = z.record(z.array(z.string())); // issue summaries (array of alternative summaries per issue)

export type EmbeddingsData = z.infer<typeof EmbeddingsDataSchema>;
export type SummariesData = z.infer<typeof SummariesDataSchema>;

// AI Response Schemas
// Note: For Azure OpenAI structured outputs, use z.union([type, z.null()]) instead of .nullable()
// Azure OpenAI doesn't support the "nullable: true" JSON Schema property
export const FAQResponseSchema = z.object({
  has_match: z.boolean(),
  response: z.union([z.string(), z.null()]), // Can be null when has_match is false
});

export type FAQResponse = z.infer<typeof FAQResponseSchema>;

// Per-FAQ-entry match response schema
export const FAQEntryMatchSchema = z.discriminatedUnion('match', [
  z.object({
    match: z.literal('no'),
  }),
  z.object({
    match: z.literal('yes'),
    confidence: z.number().min(1).max(10),
    writeup: z.string(),
  }),
]);

export type FAQEntryMatch = z.infer<typeof FAQEntryMatchSchema>;

export const ReproCodeSchema = z.object({
  approach: z.string(),
  files: z.array(z.object({
    filename: z.string(),
    content: z.string(),
  })),
});

export type ReproCode = z.infer<typeof ReproCodeSchema>;

export const ReproAnalysisSchema = z.object({
  success: z.boolean(),
  analysis: z.string(),
});

export type ReproAnalysis = z.infer<typeof ReproAnalysisSchema>;

export const FinalAnalysisSchema = z.object({
  summary: z.string(),
  recommendation: z.string(),
});

export type FinalAnalysis = z.infer<typeof FinalAnalysisSchema>;

export const IssueSummariesSchema = z.object({
  summaries: z.array(z.string())
});

export type IssueSummaries = z.infer<typeof IssueSummariesSchema>;

// New Repro Extraction Schemas (Step 1: Classification)
export const BugClassificationSchema = z.object({
  bugType: z.enum(['compiler', 'language-service', 'unknown']),
  reasoning: z.string(),
});

export type BugClassification = z.infer<typeof BugClassificationSchema>;

// Step 2: Repro Steps Schemas
export const CompilerReproStepsSchema = z.object({
  type: z.literal('compiler-repro'),
  fileMap: z.record(z.string()), // filename -> content
  cmdLineArgs: z.array(z.string()),
  instructions: z.string(), // Must start with "The bug is fixed if" or "The bug still exists if"
});

export type CompilerReproSteps = z.infer<typeof CompilerReproStepsSchema>;

export const LSReproStepsSchema = z.object({
  type: z.literal('ls-repro'),
  twoslash: z.string(), // Twoslash file content
  instructions: z.string(), // Must start with "The bug is fixed if" or "The bug still exists if"
});

export type LSReproSteps = z.infer<typeof LSReproStepsSchema>;

export const ReproStepsSchema = z.discriminatedUnion('type', [
  CompilerReproStepsSchema,
  LSReproStepsSchema,
]);

export type ReproSteps = z.infer<typeof ReproStepsSchema>;

// Step 3: Bug Revalidation Schema
export const BugRevalidationSchema = z.object({
  bug_status: z.enum(['present', 'not present']),
  relevant_output: z.string(),
  reasoning: z.string(),
});

export type BugRevalidation = z.infer<typeof BugRevalidationSchema>;

// Legacy Static Repro Schemas (deprecated but kept for backwards compatibility)
export const StaticReproCliSchema = z.object({
  type: z.union([z.literal('cli'), z.literal('ls'), z.literal('unknown')]),
  files: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })),
  args: z.array(z.string()),
  check: z.string(),
  reasoning: z.string()
});

export const StaticReproLsSchema = z.object({
  type: z.literal('ls'),
  files: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })),
  check: z.string(),
});

export const StaticReproUnknownSchema = z.object({
  type: z.literal('unknown'),
  reasoning: z.string(),
});

export const StaticReproSchema = StaticReproCliSchema;
/*z.union([
  StaticReproCliSchema,
  StaticReproLsSchema,
  StaticReproUnknownSchema,
]);*/

export type StaticReproCli = z.infer<typeof StaticReproCliSchema>;
export type StaticReproLs = z.infer<typeof StaticReproLsSchema>;
export type StaticReproUnknown = z.infer<typeof StaticReproUnknownSchema>;
export type StaticRepro = z.infer<typeof StaticReproSchema>;