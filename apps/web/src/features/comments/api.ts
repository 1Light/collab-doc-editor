import { http } from "../../lib/http";

export type CommentStatus = "open" | "resolved";

export type Comment = {
  commentId: string;
  documentId: string;
  authorId: string;
  authorName?: string;
  authorEmail?: string;
  body: string;
  anchor?: { start: number; end: number };
  quote?: string;
  parentCommentId?: string;
  replies?: Comment[];
  status: CommentStatus;
  createdAt: string;
  updatedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
};

/**
 * POST /documents/:id/comments
 */
export async function createComment(
  documentId: string,
  body: string,
  opts?: {
    anchor?: { start: number; end: number };
    quote?: string;
    parentCommentId?: string;
  }
) {
  return http<Comment>(`/documents/${documentId}/comments`, {
    method: "POST",
    body: {
      body,
      ...(opts?.anchor ? { anchor: opts.anchor } : {}),
      ...(opts?.quote ? { quote: opts.quote } : {}),
      ...(opts?.parentCommentId ? { parentCommentId: opts.parentCommentId } : {}),
    },
  });
}

/**
 * GET /documents/:id/comments?status=open|resolved|all
 */
export async function listComments(
  documentId: string,
  status: CommentStatus | "all" = "all"
) {
  const query = status !== "all" ? `?status=${status}` : "";
  return http<Comment[]>(`/documents/${documentId}/comments${query}`);
}

/**
 * PUT /documents/:id/comments/:commentId
 */
export async function updateComment(
  documentId: string,
  commentId: string,
  body: string
) {
  return http<Comment>(`/documents/${documentId}/comments/${commentId}`, {
    method: "PUT",
    body: { body },
  });
}

/**
 * POST /documents/:id/comments/:commentId/resolve
 */
export async function resolveComment(documentId: string, commentId: string) {
  return http<Comment>(`/documents/${documentId}/comments/${commentId}/resolve`, {
    method: "POST",
  });
}

/**
 * DELETE /documents/:id/comments/:commentId
 */
export async function deleteComment(documentId: string, commentId: string) {
  return http<{ deleted: boolean }>(`/documents/${documentId}/comments/${commentId}`, {
    method: "DELETE",
  });
}