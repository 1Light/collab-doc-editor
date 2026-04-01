// apps/api/src/modules/versions/versionRepo.ts

import { prisma } from "../../lib/prisma";

function requireId(value: string, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

export const versionRepo = {
  async create(data: {
    documentId: string;
    parentVersionId?: string | null;
    content: string;
    authorId: string;
    reason?: string;
  }) {
    return prisma.documentVersion.create({
      data: {
        documentId: requireId(data.documentId, "documentId"),
        parentVersionId: data.parentVersionId ?? null,
        content: data.content ?? "",
        authorId: requireId(data.authorId, "authorId"),
        reason: data.reason,
      },
    });
  },

  async findById(id: string) {
    return prisma.documentVersion.findUnique({
      where: { id: requireId(id, "id") },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async findManyByIds(ids: string[]) {
    const cleanIds = (Array.isArray(ids) ? ids : []).map((id) => id.trim()).filter(Boolean);

    if (cleanIds.length === 0) return [];

    return prisma.documentVersion.findMany({
      where: {
        id: { in: cleanIds },
      },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async listByDocument(
    documentId: string,
    opts?: { limit?: number; offset?: number }
  ) {
    const take =
      typeof opts?.limit === "number" && opts.limit > 0 ? Math.floor(opts.limit) : undefined;

    const skip =
      typeof opts?.offset === "number" && opts.offset > 0 ? Math.floor(opts.offset) : undefined;

    return prisma.documentVersion.findMany({
      where: { documentId: requireId(documentId, "documentId") },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      ...(typeof skip === "number" ? { skip } : {}),
      ...(typeof take === "number" ? { take } : {}),
    });
  },

  async findLatestByDocument(documentId: string) {
    return prisma.documentVersion.findFirst({
      where: { documentId: requireId(documentId, "documentId") },
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },

  async countByDocument(documentId: string) {
    return prisma.documentVersion.count({
      where: { documentId: requireId(documentId, "documentId") },
    });
  },

  async deleteById(id: string) {
    return prisma.documentVersion.delete({
      where: { id: requireId(id, "id") },
    });
  },
};