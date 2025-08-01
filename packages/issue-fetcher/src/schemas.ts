import { z } from 'zod';

export const ReactionSchema = z.object({
  '+1': z.number(),
  '-1': z.number(),
  laugh: z.number(),
  hooray: z.number(),
  confused: z.number(),
  heart: z.number(),
  rocket: z.number(),
  eyes: z.number()
});

export const UserSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.string(),
  site_admin: z.boolean()
});

export const LabelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable()
});

export const MilestoneSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  created_at: z.string(),
  updated_at: z.string(),
  due_on: z.string().nullable(),
  closed_at: z.string().nullable()
});

export const CommentSchema = z.object({
  id: z.number(),
  user: UserSchema,
  created_at: z.string(),
  updated_at: z.string(),
  body: z.string(),
  reactions: ReactionSchema,
  author_association: z.string()
});

export const EventSchema = z.object({
  id: z.number(),
  event: z.string(),
  created_at: z.string(),
  actor: UserSchema.nullable(),
  label: LabelSchema.nullable(),
  assignee: UserSchema.nullable(),
  milestone: MilestoneSchema.nullable()
});

export const IssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  user: UserSchema,
  labels: z.array(LabelSchema),
  state: z.enum(['open', 'closed']),
  locked: z.boolean(),
  assignee: UserSchema.nullable(),
  assignees: z.array(UserSchema),
  milestone: MilestoneSchema.nullable(),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  author_association: z.string(),
  reactions: ReactionSchema,
  pull_request: z.object({
    url: z.string(),
    html_url: z.string(),
    diff_url: z.string(),
    patch_url: z.string(),
    merged_at: z.string().nullable()
  }).nullable(),
  // Extended fields we add
  comments_data: z.array(CommentSchema),
  events_data: z.array(EventSchema),
  is_pull_request: z.boolean(),
  repo_owner: z.string(),
  repo_name: z.string(),
  fetched_at: z.string()
});

export const IssueRefSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number()
});

export const ActionSchema = z.object({
  kind: z.enum(['add_label', 'remove_label', 'close', 'comment', 'assign', 'unassign']),
  label: z.string().optional(),
  comment: z.string().optional(),
  assignee: z.string().optional()
});

export const ActionFileSchema = z.object({
  issue_ref: IssueRefSchema,
  actions: z.array(ActionSchema)
});

export type Reaction = z.infer<typeof ReactionSchema>;
export type User = z.infer<typeof UserSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type IssueRef = z.infer<typeof IssueRefSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionFile = z.infer<typeof ActionFileSchema>;