// apps/api/src/modules/comments/commentController.ts

import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@repo/contracts";
import { commentService } from "./commentService";
import { realtimeNotifyService } from "../../integrations/realtimeNotifyService";

function requireAuthUser(req: Request) {
  if (!req.authUser) {
    throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
  }
  return req.authUser;
}

export function getDocumentId(req: Request): string {
  const raw = (req.params as any)?.id ?? (req.params as any)?.documentId;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Missing document id in route params",
      details: { params: req.params },
    };
  }

  return raw.trim();
}

function getCommentId(req: Request): string {
  const raw = req.params.commentId;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Missing comment id in route params",
      details: { params: req.params },
    };
  }

  return raw.trim();
}

function normalizeStatus(raw: unknown): "open" | "resolved" | "all" {
  if (raw === undefined || raw === null || raw === "") return "all";
  if (raw === "open" || raw === "resolved" || raw === "all") return raw;

  throw {
    code: ERROR_CODES.INVALID_REQUEST,
    message: "Invalid status filter",
    details: { status: raw, allowed: ["open", "resolved", "all"] },
  };
}

function toDto(c: any): any {
  return {
    commentId: c.id,
    documentId: c.documentId,
    authorId: c.authorId,
    authorName: c.author?.name ?? undefined,
    authorEmail: c.author?.email ?? undefined,
    body: c.body,
    anchor:
      c.anchorStart !== null && c.anchorEnd !== null
        ? { start: c.anchorStart, end: c.anchorEnd }
        : undefined,
    quote: c.quote ?? undefined,
    parentCommentId: c.parentCommentId ?? undefined,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    resolvedBy: c.resolvedBy ?? undefined,
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : undefined,
    replies: Array.isArray(c.replies) ? c.replies.map(toDto) : undefined,
  };
}

export const commentController = {
  /**
   * POST /documents/:id/comments
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const me = requireAuthUser(req);
      const documentId = getDocumentId(req);

      const { body, anchor, quote, parentCommentId } = req.body as {
        body: string;
        anchor?: { start: number; end: number };
        quote?: string;
        parentCommentId?: string;
      };

      const created = await commentService.createComment({
        documentId,
        authorId: me.id,
        body,
        anchor,
        quote,
        parentCommentId,
      });

      await realtimeNotifyService.documentCommentChanged({
        documentId,
        action: "created",
        commentId: created.id,
        actorUserId: me.id,
        parentCommentId: created.parentCommentId ?? null,
        status: created.status ?? "open",
      });

      return res.status(201).json(toDto(created));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /documents/:id/comments?status=open|resolved|all
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const me = requireAuthUser(req);
      const documentId = getDocumentId(req);
      const status = normalizeStatus(req.query.status);

      const comments = await commentService.listComments({
        documentId,
        requesterId: me.id,
        status,
      });

      return res.json(comments.map(toDto));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * PUT /documents/:id/comments/:commentId
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const me = requireAuthUser(req);
      const documentId = getDocumentId(req);
      const commentId = getCommentId(req);

      const { body } = req.body as { body: string };

      const updated = await commentService.editComment({
        documentId,
        commentId,
        requesterId: me.id,
        body,
      });

      await realtimeNotifyService.documentCommentChanged({
        documentId,
        action: "updated",
        commentId: updated.id,
        actorUserId: me.id,
        parentCommentId: updated.parentCommentId ?? null,
        status: updated.status ?? "open",
      });

      return res.json(toDto(updated));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /documents/:id/comments/:commentId/resolve
   */
  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const me = requireAuthUser(req);
      const documentId = getDocumentId(req);
      const commentId = getCommentId(req);

      const resolved = await commentService.resolveComment({
        documentId,
        commentId,
        requesterId: me.id,
      });

      await realtimeNotifyService.documentCommentChanged({
        documentId,
        action: "resolved",
        commentId: resolved.id,
        actorUserId: me.id,
        parentCommentId: resolved.parentCommentId ?? null,
        status: resolved.status ?? "resolved",
      });

      return res.json(toDto(resolved));
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /documents/:id/comments/:commentId
   */
  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const me = requireAuthUser(req);
      const documentId = getDocumentId(req);
      const commentId = getCommentId(req);

      const result = await commentService.deleteComment({
        documentId,
        commentId,
        requesterId: me.id,
      });

      await realtimeNotifyService.documentCommentChanged({
        documentId,
        action: "deleted",
        commentId,
        actorUserId: me.id,
        parentCommentId: null,
        status: null,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },
};