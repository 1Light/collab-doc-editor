// apps/api/src/modules/invites/inviteController.ts

import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { ERROR_CODES } from "@repo/contracts";
import { emailService } from "../../integrations/emailService";
import { auditLogService } from "../audit/auditLogService";
import type { DocumentRole } from "@repo/contracts";
import { inviteService } from "./inviteService";
import { documentInviteRepo } from "../documents/documentInviteRepo";

type SharableRole = Exclude<DocumentRole, "Owner">;

const WEB_APP_URL =
  process.env.WEB_APP_URL && process.env.WEB_APP_URL.trim().length > 0
    ? process.env.WEB_APP_URL.replace(/\/+$/, "")
    : "http://localhost:5173";

function assertSharableRole(role: DocumentRole): asserts role is SharableRole {
  if (role === "Owner") {
    throw { code: ERROR_CODES.INVALID_REQUEST, message: "Owner role cannot be granted via invite" };
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const DEFAULT_INVITE_ROLE: DocumentRole = "Commenter";

async function notifyRoleUpdated(payload: {
  documentId: string;
  userId: string;
  role: DocumentRole | "None";
}) {
  const base = process.env.REALTIME_INTERNAL_URL;
  const secret = process.env.REALTIME_INTERNAL_SECRET;

  if (!base || !secret) return;

  try {
    await fetch(`${base.replace(/\/$/, "")}/internal/events/document-role-updated`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // do not fail persistence because realtime ping failed
  }
}

export const inviteController = {
  
  /**
   * Legacy org invite create flow.
   * Prefer adminController.createOrgInvite for the new admin members UI.
   */
  async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser?.orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const { email } = req.body as { email?: string };
      if (!email || !email.trim()) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Email required" };
      }

      const orgId = req.authUser.orgId;
      const normalizedEmail = normalizeEmail(email);

      const existingMemberUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingMemberUser) {
        const alreadyMember = await prisma.organizationMember.findUnique({
          where: { orgId_userId: { orgId, userId: existingMemberUser.id } },
          select: { id: true },
        });

        if (alreadyMember) {
          return res.json({ message: "User is already a member of this organization" });
        }
      }

      const existingInvite = await prisma.organizationInvite.findFirst({
        where: { orgId, email: normalizedEmail, status: "pending" },
        select: { id: true },
      });

      if (existingInvite) {
        return res.json({ message: "Invite already pending" });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await prisma.organizationInvite.create({
        data: {
          orgId,
          email: normalizedEmail,
          tokenHash,
          invitedById: req.authUser.id,
          orgRole: null,
          expiresAt,
        },
      });

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      const inviteLink = `${WEB_APP_URL}/invite/org/${encodeURIComponent(rawToken)}`;

      await emailService.sendOrgInvite({
        to: normalizedEmail,
        inviteLink,
        invitedByName: req.authUser.name,
        orgName: org?.name ?? undefined,
        orgRole: "Member",
        expiresAt,
      });

      return res.status(201).json({ inviteId: invite.id });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Legacy org invite revoke flow.
   * Prefer adminController.revokeOrgInvite for the new admin members UI.
   */
  async revokeInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser?.orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const { inviteId } = req.params;

      const invite = await prisma.organizationInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, orgId: true, status: true },
      });

      if (!invite) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
      }

      if (invite.orgId !== req.authUser.orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Invite not in your organization" };
      }

      await prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { status: "revoked" },
      });

      return res.json({ revoked: true });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /org/invites/preview?token=
   * Public
   */
  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const token =
        typeof req.query.token === "string" && req.query.token.trim().length > 0
          ? req.query.token.trim()
          : "";

      if (!token) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Token required" };
      }

      const tokenHash = sha256(token);

      const invite = await prisma.organizationInvite.findUnique({
        where: { tokenHash },
        include: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!invite) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
      }

      if (invite.status !== "pending") {
        return res.json({
          valid: false,
          status: invite.status,
          email: invite.email,
          orgId: invite.orgId,
          orgName: invite.org.name,
          orgRole: invite.orgRole ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
          invitedByEmail: invite.invitedBy?.email ?? null,
          expiresAt: invite.expiresAt.toISOString(),
        });
      }

      if (invite.expiresAt < new Date()) {
        await prisma.organizationInvite.update({
          where: { id: invite.id },
          data: { status: "expired" },
        });

        return res.json({
          valid: false,
          status: "expired",
          email: invite.email,
          orgId: invite.orgId,
          orgName: invite.org.name,
          orgRole: invite.orgRole ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
          invitedByEmail: invite.invitedBy?.email ?? null,
          expiresAt: invite.expiresAt.toISOString(),
        });
      }

      // Check if the user with this email is already an OrgOwner or OrgAdmin in this org
      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true, email: true },
      });

      if (existingUser) {
        const existingMembership = await prisma.organizationMember.findFirst({
          where: {
            userId: existingUser.id,
            orgId: invite.orgId,
          },
          select: { orgRole: true },
        });

        if (existingMembership) {
          if (existingMembership.orgRole === "OrgOwner") {
            return res.json({
              valid: false,
              status: "alreadyOwner",
              email: invite.email,
              orgId: invite.orgId,
              orgName: invite.org.name,
              orgRole: "OrgOwner",
              invitedByName: invite.invitedBy?.name ?? null,
              invitedByEmail: invite.invitedBy?.email ?? null,
              expiresAt: invite.expiresAt.toISOString(),
            });
          }

          if (existingMembership.orgRole === "OrgAdmin") {
            return res.json({
              valid: false,
              status: "alreadyAdmin",
              email: invite.email,
              orgId: invite.orgId,
              orgName: invite.org.name,
              orgRole: "OrgAdmin",
              invitedByName: invite.invitedBy?.name ?? null,
              invitedByEmail: invite.invitedBy?.email ?? null,
              expiresAt: invite.expiresAt.toISOString(),
            });
          }
        }
      }

      return res.json({
        valid: true,
        status: "pending",
        email: invite.email,
        orgId: invite.orgId,
        orgName: invite.org.name,
        orgRole: invite.orgRole ?? null,
        invitedByName: invite.invitedBy?.name ?? null,
        invitedByEmail: invite.invitedBy?.email ?? null,
        expiresAt: invite.expiresAt.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /org/invites/accept-org
   * Auth required
   * Body: { token: string }
   */
  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Login required" };
      }

      const { token } = req.body as { token?: string };
      if (!token || !token.trim()) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Token required" };
      }

      const tokenHash = sha256(token.trim());

      const invite = await prisma.organizationInvite.findUnique({
        where: { tokenHash },
        include: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invite || invite.status !== "pending") {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Invalid invite" };
      }

      if (invite.expiresAt < new Date()) {
        await prisma.organizationInvite.update({
          where: { id: invite.id },
          data: { status: "expired" },
        });
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Invite expired" };
      }

      if (invite.email.toLowerCase() !== req.authUser.email.toLowerCase()) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Invite email mismatch" };
      }

      const membership = await prisma.organizationMember.upsert({
        where: { orgId_userId: { orgId: invite.orgId, userId: req.authUser.id } },
        update: {
          orgRole: invite.orgRole ?? null,
        },
        create: {
          orgId: invite.orgId,
          userId: req.authUser.id,
          orgRole: invite.orgRole ?? null,
        },
      });

      await prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId: invite.orgId,
        actionType: "ORG_INVITE_ACCEPTED",
        metadata: {
          inviteId: invite.id,
          email: invite.email,
          orgRole: invite.orgRole ?? null,
        },
      });

      return res.json({
        joined: true,
        orgId: invite.orgId,
        orgName: invite.org.name,
        orgRole: membership.orgRole ?? null,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /invite/org-users?q=
   */
  async listOrgUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.authUser?.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const q = qRaw.length > 0 ? qRaw : null;

      const members = await prisma.organizationMember.findMany({
        where: {
          orgId,
          ...(q
            ? {
                user: {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                },
              }
            : {}),
        },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      const out = members.map((m) => m.user).filter((u) => u.id !== req.authUser?.id);
      return res.json(out);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /invite/documents/:id
   * Direct permission grant (legacy flow)
   */
  async inviteToDocument(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Login required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const documentId = req.params.id;
      const { userId, message } = req.body as { userId?: string; message?: string };

      if (!documentId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Missing documentId" };
      }
      if (!userId || !userId.trim()) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Missing userId" };
      }
      if (userId === req.authUser.id) {
        return res.json({ invited: false, message: "Cannot invite yourself" });
      }

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, title: true, orgId: true, isDeleted: true, ownerId: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }
      if (doc.orgId !== orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Document not in your organization" };
      }
      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can invite to this document" };
      }

      const targetMember = await prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId } },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      if (!targetMember?.user) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "User is not in your organization" };
      }

      const existing = await prisma.documentPermission.findFirst({
        where: { documentId, principalType: "user", principalId: userId },
        select: { id: true },
      });

      if (existing) {
        await prisma.documentPermission.updateMany({
          where: { documentId, principalType: "user", principalId: userId },
          data: { role: DEFAULT_INVITE_ROLE },
        });
      } else {
        await prisma.documentPermission.create({
          data: {
            documentId,
            principalType: "user",
            principalId: userId,
            role: DEFAULT_INVITE_ROLE,
          },
        });
      }

      await notifyRoleUpdated({ documentId, userId, role: DEFAULT_INVITE_ROLE });

      const documentLink = `${WEB_APP_URL}/documents/${documentId}`;

      await emailService.sendDocumentInvite({
        to: targetMember.user.email,
        inviterName: req.authUser.name,
        documentTitle: doc.title,
        documentLink,
        message,
      });

      return res.json({ invited: true });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /documents/:id/invites
   * Owner-only: create token-based email invite
   */
  async createDocumentInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;

      const { email, role, expiresInDays } = req.body as {
        email?: string;
        role?: DocumentRole;
        expiresInDays?: number;
      };

      const cleanEmail = normalizeEmail(email ?? "");
      if (!cleanEmail || !cleanEmail.includes("@")) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Valid email is required" };
      }

      if (!role) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "role is required" };
      }

      assertSharableRole(role);

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can invite to this document" };
      }

      const out = await inviteService.createDocumentInvite({
        documentId,
        invitedById: req.authUser.id,
        email: cleanEmail,
        role,
        expiresInDays,
      });

      return res.status(201).json(out);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /invites/accept-document
   * Auth required
   * Body: { token: string }
   */
  async acceptInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const { token } = req.body as { token?: string };
      if (!token || token.trim().length === 0) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "token is required" };
      }

      const out = await inviteService.acceptDocumentInvite({
        token,
        userId: req.authUser.id,
      });

      return res.json(out);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /documents/:id/invites
   * Owner-only
   */
  async listDocumentInvites(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can view invites" };
      }

      const invites = await documentInviteRepo.listByDocument(documentId);

      return res.json(
        invites.map((i) => ({
          id: i.id,
          documentId: i.documentId,
          orgId: i.orgId,
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expiresAt?.toISOString?.() ?? null,
          acceptedAt: i.acceptedAt?.toISOString?.() ?? null,
          createdAt: i.createdAt?.toISOString?.() ?? null,
          updatedAt: i.updatedAt?.toISOString?.() ?? null,
          invitedBy: i.invitedBy
            ? { id: i.invitedBy.id, name: i.invitedBy.name, email: i.invitedBy.email }
            : null,
        }))
      );
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /documents/:id/invites/:inviteId
   */
  async revokeDocumentInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = req.params.id;
      const inviteId = req.params.inviteId;

      if (!inviteId || inviteId.trim().length === 0) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "inviteId is required" };
      }

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, ownerId: true, isDeleted: true },
      });

      if (!doc || doc.isDeleted) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      if (doc.ownerId !== req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can revoke invites" };
      }

      const invite = await prisma.documentInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, documentId: true, status: true, email: true },
      });

      if (!invite) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
      }

      if (invite.documentId !== documentId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Invite does not belong to this document" };
      }

      if (invite.status === "revoked" || invite.status === "expired") {
        return res.json({ revoked: false, status: invite.status, removedAccess: false });
      }

      if (invite.status === "pending") {
        await prisma.documentInvite.update({
          where: { id: inviteId },
          data: { status: "revoked" },
        });
        return res.json({ revoked: true, status: "revoked", removedAccess: false });
      }

      if (invite.status === "accepted") {
        const email = normalizeEmail(invite.email);

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (user && user.id !== doc.ownerId) {
          await prisma.documentPermission.deleteMany({
            where: {
              documentId,
              principalType: "user",
              principalId: user.id,
            },
          });

          await notifyRoleUpdated({ documentId, userId: user.id, role: "None" });
        }

        await prisma.documentInvite.update({
          where: { id: inviteId },
          data: { status: "revoked" },
        });

        return res.json({ revoked: true, status: "revoked", removedAccess: true });
      }

      return res.json({ revoked: false, status: invite.status, removedAccess: false });
    } catch (err) {
      return next(err);
    }
  },
};