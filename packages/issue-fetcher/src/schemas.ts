import { z } from 'zod';

// User schema
export const userSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.string()
});

// Reaction schema
export const reactionSchema = z.object({
  total_count: z.number(),
  '+1': z.number(),
  '-1': z.number(),
  laugh: z.number(),
  hooray: z.number(),
  confused: z.number(),
  heart: z.number(),
  rocket: z.number(),
  eyes: z.number()
});

// Label schema
export const labelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable()
});

// Milestone schema
export const milestoneSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  created_at: z.string(),
  updated_at: z.string(),
  due_on: z.string().nullable(),
  closed_at: z.string().nullable()
}).nullable();

// Comment schema
export const commentSchema = z.object({
  id: z.number(),
  user: userSchema,
  created_at: z.string(),
  updated_at: z.string(),
  body: z.string(),
  reactions: reactionSchema
});

// Issue/PR event schema
export const eventSchema = z.object({
  id: z.number(),
  event: z.string(),
  created_at: z.string(),
  actor: userSchema.nullable()
});

// Complete issue schema
export const issueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  user: userSchema,
  labels: z.array(labelSchema),
  state: z.enum(['open', 'closed']),
  locked: z.boolean(),
  assignee: userSchema.nullable(),
  assignees: z.array(userSchema),
  milestone: milestoneSchema,
  comments: z.array(commentSchema),
  events: z.array(eventSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  reactions: reactionSchema,
  is_pull_request: z.boolean(),
  author_association: z.string()
});

export type User = z.infer<typeof userSchema>;
export type Reaction = z.infer<typeof reactionSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Issue = z.infer<typeof issueSchema>;