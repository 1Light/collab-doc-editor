// apps/api/src/modules/documents/documentRepo.ts

import { prisma } from "../../lib/prisma";

function requireId(value: string, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

export const documentRepo = {
  async create(data: { title: string; content: string; ownerId: string; orgId: string }) {
    return prisma.document.create({
      data: {
        title: data.title,
        content: data.content,
        ownerId: requireId(data.ownerId, "ownerId"),
        orgId: requireId(data.orgId, "orgId"),
      },
    });
  },

  async findById(id: string) {
    return prisma.document.findFirst({
      where: {
        id: requireId(id, "id"),
        isDeleted: false,
      },
    });
  },

  async findByIdIncludingDeleted(id: string) {
    return prisma.document.findUnique({
      where: { id: requireId(id, "id") },
    });
  },

  async updateContent(id: string, content: string, headVersionId?: string) {
    return prisma.document.update({
      where: { id: requireId(id, "id") },
      data: {
        content,
        ...(headVersionId ? { headVersionId } : {}),
      },
    });
  },

  async setHeadVersion(id: string, headVersionId: string) {
    return prisma.document.update({
      where: { id: requireId(id, "id") },
      data: {
        headVersionId: requireId(headVersionId, "headVersionId"),
      },
    });
  },

  async touchUpdatedAt(id: string) {
    return prisma.document.update({
      where: { id: requireId(id, "id") },
      data: {},
    });
  },

  async softDelete(id: string) {
    return prisma.document.update({
      where: { id: requireId(id, "id") },
      data: { isDeleted: true },
    });
  },

  async listByOwner(ownerId: string, orgId: string) {
    return prisma.document.findMany({
      where: {
        ownerId: requireId(ownerId, "ownerId"),
        orgId: requireId(orgId, "orgId"),
        isDeleted: false,
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  async listAccessibleDocuments(userId: string, orgId: string) {
    return prisma.document.findMany({
      where: {
        orgId: requireId(orgId, "orgId"),
        isDeleted: false,
        OR: [
          { ownerId: requireId(userId, "userId") },
          {
            permissions: {
              some: {
                principalType: "user",
                principalId: requireId(userId, "userId"),
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });
  },
};