// apps/api/src/modules/permissions/permissionRepo.ts

import { prisma } from "../../lib/prisma";
import type { DocumentRole } from "@repo/contracts";

export type PrincipalType = "user" | "link";

export const permissionRepo = {
  /**
   * Create or update a permission using the unique constraint:
   * @@unique([documentId, principalType, principalId])
   */
  async upsert(data: {
    documentId: string;
    principalType: PrincipalType;
    principalId: string;
    role: DocumentRole;
    grantedById?: string | null;
  }) {
    return prisma.documentPermission.upsert({
      where: {
        documentId_principalType_principalId: {
          documentId: data.documentId,
          principalType: data.principalType,
          principalId: data.principalId,
        },
      },
      create: {
        documentId: data.documentId,
        principalType: data.principalType,
        principalId: data.principalId,
        role: data.role as any,
        ...(data.grantedById !== undefined ? { grantedById: data.grantedById } : {}),
      } as any,
      update: {
        role: data.role as any,
        ...(data.grantedById !== undefined ? { grantedById: data.grantedById } : {}),
      } as any,
    });
  },

  // Kept for callers that still need direct create semantics.
  async create(data: {
    documentId: string;
    principalType: PrincipalType;
    principalId: string;
    role: DocumentRole;
    grantedById?: string | null;
  }) {
    return prisma.documentPermission.create({
      data: {
        documentId: data.documentId,
        principalType: data.principalType,
        principalId: data.principalId,
        role: data.role as any,
        ...(data.grantedById !== undefined ? { grantedById: data.grantedById } : {}),
      } as any,
    });
  },

  async findByUser(documentId: string, userId: string) {
    return prisma.documentPermission.findFirst({
      where: {
        documentId,
        principalType: "user",
        principalId: userId,
      },
    });
  },

  async findByLink(documentId: string, linkToken: string) {
    return prisma.documentPermission.findFirst({
      where: {
        documentId,
        principalType: "link",
        principalId: linkToken,
      },
    });
  },

  async listByDocument(documentId: string) {
    return prisma.documentPermission.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * UI-friendly listing:
   * returns permissions plus user info for principalType="user"
   */
  async listByDocumentWithUsers(documentId: string) {
    const perms = await prisma.documentPermission.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
    });

    const userIds = perms
      .filter((p) => p.principalType === "user")
      .map((p) => p.principalId);

    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return perms.map((p) => ({
      id: p.id,
      documentId: p.documentId,
      principalType: p.principalType as PrincipalType,
      principalId: p.principalId,
      role: p.role as unknown as DocumentRole,
      createdAt: p.createdAt,
      // These fields are nullable in the current schema and safe to expose in the UI.
      updatedAt: (p as any).updatedAt ?? null,
      grantedById: (p as any).grantedById ?? null,

      // Joined user details for user-scoped permissions.
      user: p.principalType === "user" ? userMap.get(p.principalId) ?? null : null,
    }));
  },

  /**
   * Update a specific permission role (requires principalType for safety).
   * With the unique constraint, updateMany is fine, update is also possible if you use the compound key.
   */
  async updateRole(
    documentId: string,
    principalType: PrincipalType,
    principalId: string,
    role: DocumentRole
  ) {
    return prisma.documentPermission.updateMany({
      where: {
        documentId,
        principalType,
        principalId,
      },
      data: { role: role as any },
    });
  },

  /**
   * Delete a specific permission (requires principalType for precision).
   */
  async delete(documentId: string, principalType: PrincipalType, principalId: string) {
    return prisma.documentPermission.deleteMany({
      where: {
        documentId,
        principalType,
        principalId,
      },
    });
  },

  async deleteByDocument(documentId: string) {
    return prisma.documentPermission.deleteMany({
      where: { documentId },
    });
  },
};
