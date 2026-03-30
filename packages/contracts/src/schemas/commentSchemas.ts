// packages/contracts/src/schemas/commentSchemas.ts

import { z } from "zod";

/* =========================
   Shared
========================= */

export const commentAnchorSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((val) => val.end > val.start, {
    message: "anchor.end must be greater than anchor.start",
  });

export type CommentAnchor = z.infer<typeof commentAnchorSchema>;

export const commentStatusSchema = z.enum(["open", "resolved"]);

export type CommentStatus = z.infer<typeof commentStatusSchema>;

/* =========================
   Create Comment
========================= */

export const createCommentRequestSchema = z.object({
  body: z.string().min(1),
  anchor: commentAnchorSchema.optional(),
  quote: z.string().min(1).optional(),
  parentCommentId: z.string().uuid().optional(),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

/* =========================
   Comment Response
========================= */

export const baseCommentResponseSchema = z.object({
  commentId: z.string(),
  documentId: z.string(),
  authorId: z.string(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  body: z.string(),
  anchor: commentAnchorSchema.optional(),
  quote: z.string().optional(),
  parentCommentId: z.string().optional(),
  status: commentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
});

export const commentResponseSchema: z.ZodType<any> = baseCommentResponseSchema.extend({
  replies: z.lazy(() => commentResponseSchema.array()).optional(),
});

export type CommentResponse = z.infer<typeof commentResponseSchema>;

/* =========================
   Update Comment
========================= */

export const updateCommentRequestSchema = z.object({
  body: z.string().min(1),
});

export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

/* =========================
   Delete Response
========================= */

export const deleteCommentResponseSchema = z.object({
  deleted: z.boolean(),
});

export type DeleteCommentResponse = z.infer<typeof deleteCommentResponseSchema>;