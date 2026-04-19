// apps/api/src/modules/comments/commentRepo.ts

import { CommentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const withAuthor = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.CommentInclude;

type CommentWithAuthor = Prisma.CommentGetPayload<{
  include: typeof withAuthor;
}>;

type CommentUpdateInput = {
  body?: string;
  status?: CommentStatus;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
};

export const commentRepo = {
  async create(data: {
    documentId: string;
    authorId: string;
    body: string;
    parentCommentId?: string | null;
    anchorStart?: number | null;
    anchorEnd?: number | null;
    quote?: string | null;
  }) {
    return prisma.comment.create({
      data: {
        documentId: data.documentId,
        authorId: data.authorId,
        parentCommentId: data.parentCommentId ?? null,
        body: data.body,
        anchorStart: data.anchorStart ?? null,
        anchorEnd: data.anchorEnd ?? null,
        quote: data.quote ?? null,
        status: CommentStatus.open,
      },
      include: withAuthor,
    });
  },

  async findById(id: string) {
    return prisma.comment.findUnique({
      where: { id },
      include: withAuthor,
    });
  },

  async findByIdForDocument(params: { id: string; documentId: string }) {
    return prisma.comment.findFirst({
      where: {
        id: params.id,
        documentId: params.documentId,
      },
      include: withAuthor,
    });
  },

  async listByDocument(documentId: string, status?: "open" | "resolved") {
    return prisma.comment.findMany({
      where: {
        documentId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: "asc" }],
      include: withAuthor,
    });
  },

  async listReplies(parentCommentId: string) {
    return prisma.comment.findMany({
      where: { parentCommentId },
      orderBy: [{ createdAt: "asc" }],
      include: withAuthor,
    });
  },

  async findThreadRoot(params: { id: string; documentId: string }) {
    let current: CommentWithAuthor | null = await prisma.comment.findFirst({
      where: {
        id: params.id,
        documentId: params.documentId,
      },
      include: withAuthor,
    });

    if (!current) return null;

    while (current.parentCommentId) {
      const parent: CommentWithAuthor | null = await prisma.comment.findFirst({
        where: {
          id: current.parentCommentId,
          documentId: params.documentId,
        },
        include: withAuthor,
      });

      if (!parent) break;

      current = parent;
    }

    return current;
  },

  async listThreadComments(params: { rootCommentId: string; documentId: string }) {
    const all: CommentWithAuthor[] = await prisma.comment.findMany({
      where: {
        documentId: params.documentId,
      },
      orderBy: [{ createdAt: "asc" }],
      include: withAuthor,
    });

    const byParent = new Map<string, CommentWithAuthor[]>();

    for (const comment of all) {
      if (!comment.parentCommentId) continue;

      const existing = byParent.get(comment.parentCommentId) ?? [];
      existing.push(comment);
      byParent.set(comment.parentCommentId, existing);
    }

    const result: CommentWithAuthor[] = [];
    const queue: string[] = [params.rootCommentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = all.find((c) => c.id === currentId);

      if (current) {
        result.push(current);
      }

      const children = byParent.get(currentId) ?? [];
      for (const child of children) {
        queue.push(child.id);
      }
    }

    return result;
  },

  async update(id: string, data: CommentUpdateInput) {
    return prisma.comment.update({
      where: { id },
      data,
      include: withAuthor,
    });
  },

  async updateMany(ids: string[], data: CommentUpdateInput) {
    if (ids.length === 0) return { count: 0 };

    return prisma.comment.updateMany({
      where: {
        id: { in: ids },
      },
      data,
    });
  },

  async delete(id: string) {
    return prisma.comment.delete({
      where: { id },
    });
  },

  async deleteByDocument(documentId: string) {
    return prisma.comment.deleteMany({
      where: { documentId },
    });
  },
};