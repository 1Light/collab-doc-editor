// apps/api/src/modules/documents/documentInviteRepo.ts

import { prisma } from "../../lib/prisma";
import type { DocumentRole } from "@prisma/client";

export const documentInviteRepo = {
  /**
   * Create an invite if none exists for (documentId,email),
   * otherwise update the existing one (typically resetting token/status/expiry/role).
   *
   * Use this when the owner invites the same email again.
   */
  async createOrUpdatePendingInvite(data: {
    documentId: string;
    orgId: string;
    email: string;
    role: Exclude<DocumentRole, "Owner">; // don't allow Owner via invite
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
  }) {
    const email = data.email.trim().toLowerCase();

    return prisma.documentInvite.upsert({
      where: {
        documentId_email: {
          documentId: data.documentId,
          email,
        },
      },
      update: {
        role: data.role,
        tokenHash: data.tokenHash,
        invitedById: data.invitedById,
        status: "pending",
        expiresAt: data.expiresAt,
        acceptedAt: null,
      },
      create: {
        documentId: data.documentId,
        orgId: data.orgId,
        email,
        role: data.role,
        tokenHash: data.tokenHash,
        invitedById: data.invitedById,
        status: "pending",
        expiresAt: data.expiresAt,
      },
    });
  },

  /**
   * Lookup by token hash (server hashes the raw token).
   */
  async findByTokenHash(tokenHash: string) {
    return prisma.documentInvite.findUnique({
      where: { tokenHash },
    });
  },

  async markAccepted(inviteId: string, acceptedAt: Date = new Date()) {
    return prisma.documentInvite.update({
      where: { id: inviteId },
      data: {
        status: "accepted",
        acceptedAt,
      },
    });
  },

  async markRevoked(inviteId: string) {
    return prisma.documentInvite.update({
      where: { id: inviteId },
      data: { status: "revoked" },
    });
  },

  async markExpired(inviteId: string) {
    return prisma.documentInvite.update({
      where: { id: inviteId },
      data: { status: "expired" },
    });
  },

  /**
   * For Manage Access UI: show pending/accepted invites + who invited them.
   */
  async listByDocument(documentId: string) {
    return prisma.documentInvite.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentId: true,
        orgId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async findByDocumentAndEmail(documentId: string, email: string) {
    return prisma.documentInvite.findUnique({
      where: {
        documentId_email: {
          documentId,
          email: email.trim().toLowerCase(),
        },
      },
    });
  },
};