import { z } from 'zod';

// Action schemas for GitHub operations
export const addLabelActionSchema = z.object({
  kind: z.literal('add_label'),
  label: z.string()
});

export const removeLabelActionSchema = z.object({
  kind: z.literal('remove_label'),
  label: z.string()
});

export const closeIssueActionSchema = z.object({
  kind: z.literal('close_issue'),
  reason: z.enum(['completed', 'not_planned']).optional()
});

export const reopenIssueActionSchema = z.object({
  kind: z.literal('reopen_issue')
});

export const addCommentActionSchema = z.object({
  kind: z.literal('add_comment'),
  body: z.string()
});

export const assignUserActionSchema = z.object({
  kind: z.literal('assign_user'),
  username: z.string()
});

export const setMilestoneActionSchema = z.object({
  kind: z.literal('set_milestone'),
  milestone: z.string()
});

export const actionSchema = z.discriminatedUnion('kind', [
  addLabelActionSchema,
  removeLabelActionSchema,
  closeIssueActionSchema,
  reopenIssueActionSchema,
  addCommentActionSchema,
  assignUserActionSchema,
  setMilestoneActionSchema
]);

export const issueRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number()
});

export const actionFileSchema = z.object({
  issue_ref: issueRefSchema,
  actions: z.array(actionSchema)
});

export type Action = z.infer<typeof actionSchema>;
export type ActionFile = z.infer<typeof actionFileSchema>;
export type IssueRef = z.infer<typeof issueRefSchema>;