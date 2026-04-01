// apps/api/src/modules/comments/commentService.ts

import { CommentStatus } from "@prisma/client";
import { ERROR_CODES } from "@repo/contracts";
import type { DocumentRole } from "@repo/contracts";
import { commentRepo } from "./commentRepo";
import { documentRepo } from "../documents/documentRepo";
import { permissionService } from "../permissions/permissionService";
import { auditLogService } from "../audit/auditLogService";

function requireRole(effectiveRole: DocumentRole | null, allowed: DocumentRole[]) {
  if (!effectiveRole || !allowed.includes(effectiveRole)) {
    throw { code: ERROR_CODES.FORBIDDEN, message: "Insufficient document role" };
  }
}

function isOwner(role: DocumentRole | null) {
  return role === "Owner";
}

type CommentWithReplies = Awaited<ReturnType<typeof commentRepo.findByIdForDocument>> & {
  replies?: CommentWithReplies[];
};

function buildCommentTree<T extends { id: string; parentCommentId?: string | null }>(
  items: T[]
): (T & { replies: T[] })[] {
  const map = new Map<string, T & { replies: T[] }>();
  const roots: (T & { replies: T[] })[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, replies: [] });
  }

  for (const item of map.values()) {
    if (item.parentCommentId && map.has(item.parentCommentId)) {
      map.get(item.parentCommentId)!.replies.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

export const commentService = {
  async createComment(params: {
    documentId: string;
    authorId: string;
    body: string;
    anchor?: { start: number; end: number };
    quote?: string;
    parentCommentId?: string;
  }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.authorId,
    });

    requireRole(role, ["Commenter", "Editor", "Owner"]);

    const body = (params.body ?? "").trim();
    if (!body) throw { code: ERROR_CODES.INVALID_REQUEST, message: "body is required" };

    let anchorStart: number | null = null;
    let anchorEnd: number | null = null;
    let quote: string | null = null;
    let parentCommentId: string | null = null;

    if (params.parentCommentId) {
      const parent = await commentRepo.findByIdForDocument({
        id: params.parentCommentId,
        documentId: params.documentId,
      });

      if (!parent) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Parent comment not found" };
      }

      parentCommentId = parent.id;
      anchorStart = parent.anchorStart ?? null;
      anchorEnd = parent.anchorEnd ?? null;
      quote = (parent as any).quote ?? null;
    } else {
      const start = params.anchor?.start;
      const end = params.anchor?.end;

      anchorStart = typeof start === "number" ? Math.max(0, start) : null;
      anchorEnd = typeof end === "number" ? Math.max(0, end) : null;
      quote = typeof params.quote === "string" ? params.quote.trim() : null;

      if ((anchorStart === null) !== (anchorEnd === null)) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "anchor must include start and end" };
      }

      if (anchorStart !== null && anchorEnd !== null && anchorEnd <= anchorStart) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "anchor end must be greater than start" };
      }

      if ((anchorStart !== null || anchorEnd !== null) && !quote) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "quote is required for anchored comments" };
      }
    }

    const created = await commentRepo.create({
      documentId: params.documentId,
      authorId: params.authorId,
      parentCommentId,
      body,
      anchorStart,
      anchorEnd,
      quote,
    });

    await auditLogService.logAction({
      userId: params.authorId,
      orgId: doc.orgId,
      actionType: parentCommentId ? "COMMENT_REPLY_CREATED" : "COMMENT_CREATED",
      documentId: params.documentId,
      metadata: {
        commentId: created.id,
        parentCommentId: parentCommentId ?? null,
      },
    });

    return created;
  },

  async listComments(params: {
    documentId: string;
    requesterId: string;
    status?: "open" | "resolved" | "all";
  }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.requesterId,
    });

    requireRole(role, ["Viewer", "Commenter", "Editor", "Owner"]);

    const status = params.status && params.status !== "all" ? params.status : undefined;
    const comments = await commentRepo.listByDocument(params.documentId, status);

    return buildCommentTree(comments as any) as CommentWithReplies[];
  },

  async resolveComment(params: { documentId: string; commentId: string; requesterId: string }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.requesterId,
    });

    requireRole(role, ["Editor", "Owner"]);

    const comment = await commentRepo.findByIdForDocument({
      id: params.commentId,
      documentId: params.documentId,
    });

    if (!comment) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" };
    }

    const root = await commentRepo.findThreadRoot({
      id: comment.id,
      documentId: params.documentId,
    });

    if (!root) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Comment thread not found" };
    }

    const threadComments = await commentRepo.listThreadComments({
      rootCommentId: root.id,
      documentId: params.documentId,
    });

    const unresolvedIds = threadComments
      .filter((c) => c.status !== CommentStatus.resolved)
      .map((c) => c.id);

    if (unresolvedIds.length === 0) {
      return root;
    }

    const resolvedAt = new Date();

    await commentRepo.updateMany(unresolvedIds, {
      status: CommentStatus.resolved,
      resolvedBy: params.requesterId,
      resolvedAt,
    });

    const updatedRoot = await commentRepo.findByIdForDocument({
      id: root.id,
      documentId: params.documentId,
    });

    await auditLogService.logAction({
      userId: params.requesterId,
      orgId: doc.orgId,
      actionType: "COMMENT_RESOLVED",
      documentId: params.documentId,
      metadata: {
        commentId: comment.id,
        rootCommentId: root.id,
        resolvedCount: unresolvedIds.length,
      },
    });

    return updatedRoot!;
  },

  async editComment(params: {
    documentId: string;
    commentId: string;
    requesterId: string;
    body: string;
  }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.requesterId,
    });

    requireRole(role, ["Commenter", "Editor", "Owner"]);

    const comment = await commentRepo.findByIdForDocument({
      id: params.commentId,
      documentId: params.documentId,
    });

    if (!comment) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" };
    }

    const body = (params.body ?? "").trim();
    if (!body) throw { code: ERROR_CODES.INVALID_REQUEST, message: "body is required" };

    const isAuthor = comment.authorId === params.requesterId;

    if (!isAuthor) {
      throw { code: ERROR_CODES.FORBIDDEN, message: "Only the comment author can edit this comment" };
    }

    if (comment.status !== CommentStatus.open) {
      throw { code: ERROR_CODES.FORBIDDEN, message: "Resolved comments cannot be edited" };
    }

    const updated = await commentRepo.update(comment.id, { body });

    await auditLogService.logAction({
      userId: params.requesterId,
      orgId: doc.orgId,
      actionType: "COMMENT_EDITED",
      documentId: params.documentId,
      metadata: { commentId: comment.id },
    });

    return updated;
  },

  async deleteComment(params: { documentId: string; commentId: string; requesterId: string }) {
    const doc = await documentRepo.findById(params.documentId);
    if (!doc) throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };

    const role = await permissionService.resolveEffectiveRole({
      documentId: params.documentId,
      userId: params.requesterId,
    });

    requireRole(role, ["Commenter", "Editor", "Owner"]);

    const comment = await commentRepo.findByIdForDocument({
      id: params.commentId,
      documentId: params.documentId,
    });

    if (!comment) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Comment not found" };
    }

    const isAuthor = comment.authorId === params.requesterId;
    const requesterIsOwner = isOwner(role);

    if (!isAuthor && !requesterIsOwner) {
      throw {
        code: ERROR_CODES.FORBIDDEN,
        message: "Only the comment author or document owner can delete this comment",
      };
    }

    if (isAuthor && !requesterIsOwner && comment.status !== CommentStatus.open) {
      throw {
        code: ERROR_CODES.FORBIDDEN,
        message: "Resolved comments cannot be deleted by the author",
      };
    }

    await commentRepo.delete(comment.id);

    await auditLogService.logAction({
      userId: params.requesterId,
      orgId: doc.orgId,
      actionType: "COMMENT_DELETED",
      documentId: params.documentId,
      metadata: {
        commentId: comment.id,
        parentCommentId: (comment as any).parentCommentId ?? null,
      },
    });

    return { deleted: true };
  },
};