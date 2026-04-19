import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { InviteStatus, OrgRole } from "@prisma/client";
import { ERROR_CODES } from "@repo/contracts";
import { aiPolicyService } from "../ai/aiPolicyService";
import { auditLogService } from "../audit/auditLogService";
import { emailService } from "../../integrations/emailService";
import { realtimeNotifyService } from "../../integrations/realtimeNotifyService";
import { prisma } from "../../lib/prisma";

const WEB_APP_URL =
  process.env.WEB_APP_URL && process.env.WEB_APP_URL.trim().length > 0
    ? process.env.WEB_APP_URL.replace(/\/+$/, "")
    : "http://localhost:5173";

function parseCommaList(value: unknown): string[] | undefined {
  if (!value) return undefined;
  const raw = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length ? raw : undefined;
}

function parseIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const s = String(value);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function parseLimit(value: unknown, def = 50, max = 200) {
  if (value === undefined || value === null || value === "") return def;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function normalizeInviteRole(role: unknown): "Member" | "OrgAdmin" {
  if (role === "OrgAdmin") return "OrgAdmin";
  return "Member";
}

function toOrgRole(role: "Member" | "OrgAdmin"): OrgRole | null {
  return role === "OrgAdmin" ? OrgRole.OrgAdmin : null;
}

function fromOrgRole(role: OrgRole | null | undefined): "Member" | "OrgAdmin" {
  return role === OrgRole.OrgAdmin ? "OrgAdmin" : "Member";
}

function makeRawInviteToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashInviteToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function transferOwnedDocumentsInOrg(params: {
  tx: Pick<typeof prisma, "document" | "documentPermission">;
  orgId: string;
  fromUserId: string;
  toUserId: string;
  grantedById?: string | null;
}) {
  const ownedDocs = await params.tx.document.findMany({
    where: {
      orgId: params.orgId,
      ownerId: params.fromUserId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (ownedDocs.length === 0) {
    return 0;
  }

  await params.tx.document.updateMany({
    where: {
      orgId: params.orgId,
      ownerId: params.fromUserId,
      isDeleted: false,
    },
    data: {
      ownerId: params.toUserId,
    },
  });

  for (const doc of ownedDocs) {
    await params.tx.documentPermission.deleteMany({
      where: {
        documentId: doc.id,
        principalType: "user",
        principalId: params.fromUserId,
      },
    });

    await params.tx.documentPermission.upsert({
      where: {
        documentId_principalType_principalId: {
          documentId: doc.id,
          principalType: "user",
          principalId: params.toUserId,
        },
      },
      create: {
        documentId: doc.id,
        principalType: "user",
        principalId: params.toUserId,
        role: "Owner",
        ...(params.grantedById !== undefined ? { grantedById: params.grantedById } : {}),
      },
      update: {
        role: "Owner",
        ...(params.grantedById !== undefined ? { grantedById: params.grantedById } : {}),
      },
    });
  }

  return ownedDocs.length;
}

function buildOrgInviteDto(invite: {
  id: string;
  email: string;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
  orgRole?: OrgRole | null;
  invitedBy?: { name: string | null; email: string } | null;
  rawToken?: string;
}) {
  return {
    id: invite.id,
    email: invite.email,
    orgRole: fromOrgRole(invite.orgRole ?? null),
    status: invite.status,
    invitedByName: invite.invitedBy?.name ?? undefined,
    invitedByEmail: invite.invitedBy?.email ?? undefined,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    inviteLink: invite.rawToken
      ? `${WEB_APP_URL}/invite/org/${encodeURIComponent(invite.rawToken)}`
      : undefined,
  };
}

// Server-side tab mapping so UI doesn't need to know exact actionTypes.
const TAB_TO_ACTION_TYPES: Record<string, string[]> = {
  documentCreated: ["DOCUMENT_CREATED"],
  documentDeleted: ["DOCUMENT_DELETED"],
  documentRestored: ["DOCUMENT_RESTORED"],

  permissionGranted: ["PERMISSION_GRANTED"],
  permissionRevoked: ["PERMISSION_REVOKED"],

  commentCreated: ["COMMENT_CREATED", "COMMENT_RESOLVED"],
  commentResolved: ["COMMENT_RESOLVED"],

  versionReverted: ["VERSION_REVERTED"],

  aiPolicyUpdated: ["AI_POLICY_UPDATED"],
  aiJobCreated: ["AI_JOB_CREATED"],
  aiJobApplied: ["AI_JOB_APPLIED"],

  orgInviteSent: ["ORG_INVITE_SENT"],
  userOrgRoleUpdated: ["USER_ORG_ROLE_UPDATED", "ORG_MEMBER_ROLE_CHANGED"],
  orgMemberRemoved: ["ORG_MEMBER_REMOVED"],

  loginSuccess: ["LOGIN_SUCCESS"],
  loginFailed: ["LOGIN_FAILED"],
};

export const adminController = {
  async getAIPolicy(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(aiPolicyService.getPolicy());
    } catch (err) {
      return next(err);
    }
  },

  async updateAIPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const { enabledRoles, quotaPolicy } = req.body as {
        enabledRoles: Array<"Editor" | "Owner">;
        quotaPolicy: { perUserPerDay?: number; perOrgPerDay?: number };
      };

      const { policy, diff } = aiPolicyService.updatePolicy({ enabledRoles, quotaPolicy });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "AI_POLICY_UPDATED",
        metadata: { diff, after: policy },
      });

      return res.json(policy);
    } catch (err) {
      return next(err);
    }
  },

  async listAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const {
        tab,
        documentId,
        userId,
        actionTypes,
        q,
        from,
        to,
        limit,
        cursorId,
        cursorCreatedAt,
      } = req.query as any;

      const explicitActionTypes = parseCommaList(actionTypes);
      const tabActionTypes =
        tab && TAB_TO_ACTION_TYPES[String(tab)] ? TAB_TO_ACTION_TYPES[String(tab)] : undefined;

      const finalActionTypes = explicitActionTypes ?? tabActionTypes;
      const limitNum = parseLimit(limit, 50, 200);

      const cursor =
        cursorId && cursorCreatedAt
          ? (() => {
              const createdAtIso = parseIsoDate(cursorCreatedAt);
              if (!createdAtIso) return null;
              return { id: String(cursorId), createdAt: createdAtIso };
            })()
          : null;

      const fromIso = parseIsoDate(from);
      const toIso = parseIsoDate(to);

      const result = await auditLogService.listLogs({
        orgId,
        documentId: documentId ? String(documentId) : undefined,
        userId: userId ? String(userId) : undefined,
        actionTypes: finalActionTypes,
        q: q ? String(q) : undefined,
        from: fromIso,
        to: toIso,
        limit: limitNum,
        cursor,
      });

      return res.json({
        items: result.items.map((l: any) => ({
          id: l.id,
          orgId: l.orgId ?? undefined,
          userId: l.userId,
          actionType: l.actionType,
          documentId: l.documentId ?? undefined,
          metadata: l.metadata ?? undefined,
          createdAt: new Date(l.createdAt).toISOString(),
          actor: l.actor ? { id: l.actor.id, name: l.actor.name, email: l.actor.email } : undefined,
          document: l.document ? { id: l.document.id, title: l.document.title } : undefined,
          summary: l.summary,
          riskLevel: l.riskLevel,
        })),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      });
    } catch (err) {
      return next(err);
    }
  },

  async deleteAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const logId = String(req.params.logId || "").trim();
      if (!logId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "logId is required" };
      }

      const existing = await prisma.auditLog.findFirst({
        where: {
          id: logId,
          orgId,
        },
        select: { id: true },
      });

      if (!existing) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Audit log not found" };
      }

      await prisma.auditLog.delete({
        where: { id: logId },
      });

      return res.json({ removed: true, logId });
    } catch (err) {
      return next(err);
    }
  },

  async exportAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const { tab, documentId, userId, actionTypes, q, from, to, maxRows } = req.query as any;

      const explicitActionTypes = parseCommaList(actionTypes);
      const tabActionTypes =
        tab && TAB_TO_ACTION_TYPES[String(tab)] ? TAB_TO_ACTION_TYPES[String(tab)] : undefined;

      const finalActionTypes = explicitActionTypes ?? tabActionTypes;

      const maxRowsNum = (() => {
        const n = Number(maxRows);
        if (!Number.isFinite(n) || n <= 0) return 5000;
        return Math.min(Math.floor(n), 50000);
      })();

      const fromIso = parseIsoDate(from);
      const toIso = parseIsoDate(to);

      const csv = await auditLogService.exportLogs({
        orgId,
        documentId: documentId ? String(documentId) : undefined,
        userId: userId ? String(userId) : undefined,
        actionTypes: finalActionTypes,
        q: q ? String(q) : undefined,
        from: fromIso,
        to: toIso,
        maxRows: maxRowsNum,
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-logs-${orgId}-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(csv);
    } catch (err) {
      return next(err);
    }
  },

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const members = await prisma.organizationMember.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, createdAt: true } },
        },
      });

      return res.json(
        members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          orgRole: m.orgRole ?? null,
          createdAt: m.user.createdAt.toISOString(),
          joinedAt: m.createdAt.toISOString(),
        }))
      );
    } catch (err) {
      return next(err);
    }
  },

  async setUserOrgRole(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const userId = req.params.userId;
      const { orgRole } = req.body as { orgRole: "OrgAdmin" | null | "OrgOwner" | undefined };

      if (orgRole === "OrgOwner") {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Cannot assign OrgOwner via this endpoint" };
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId } },
      });

      if (!membership) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "User is not a member of this organization" };
      }

      const updated = await prisma.organizationMember.update({
        where: { orgId_userId: { orgId, userId } },
        data: { orgRole: orgRole ?? null },
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "USER_ORG_ROLE_UPDATED",
        metadata: { targetUserId: userId, orgRole: orgRole ?? null },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "member_role_updated",
        actorUserId: req.authUser.id,
        targetUserId: userId,
      });

      return res.json({
        userId,
        orgId,
        orgRole: updated.orgRole ?? null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },

  async removeUserFromOrg(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const targetUserId = req.params.userId;

      if (targetUserId === req.authUser.id) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "You cannot remove yourself" };
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: targetUserId } },
        select: { orgRole: true, user: { select: { email: true, id: true } } },
      });

      if (!membership) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "User is not a member of this organization" };
      }

      const targetRole = membership.orgRole ?? null;
      const targetEmail = membership.user?.email ?? null;

      if (targetRole === "OrgOwner") {
        throw { code: ERROR_CODES.FORBIDDEN, message: "Cannot remove the OrgOwner" };
      }

      if (targetRole === "OrgAdmin") {
        const adminCount = await prisma.organizationMember.count({
          where: { orgId, orgRole: "OrgAdmin" },
        });
        if (adminCount <= 1) {
          throw { code: ERROR_CODES.FORBIDDEN, message: "Cannot remove the last OrgAdmin" };
        }
      }

      const orgOwnerMembership = await prisma.organizationMember.findFirst({
        where: {
          orgId,
          orgRole: "OrgOwner",
        },
        select: { userId: true },
      });

      if (!orgOwnerMembership?.userId) {
        throw {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Organization owner is required before removing members",
        };
      }

      const successorOwnerId = orgOwnerMembership.userId;

      const transferredDocumentCount = await prisma.$transaction(async (tx) => {
        const transferred = await transferOwnedDocumentsInOrg({
          tx,
          orgId,
          fromUserId: targetUserId,
          toUserId: successorOwnerId,
          grantedById: req.authUser?.id ?? null,
        });

        await tx.organizationMember.delete({
          where: { orgId_userId: { orgId, userId: targetUserId } },
        });

        await tx.documentPermission.deleteMany({
          where: {
            principalType: "user",
            principalId: targetUserId,
            document: { orgId },
          },
        });

        return transferred;
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "ORG_MEMBER_REMOVED",
        metadata: {
          targetUserId,
          targetEmail,
          targetRole,
          successorOwnerId,
          transferredDocumentCount,
        },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "member_removed",
        actorUserId: req.authUser.id,
        targetUserId,
      });

      return res.json({ removed: true, userId: targetUserId });
    } catch (err) {
      return next(err);
    }
  },

  async listOrgInvites(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const invites = await prisma.organizationInvite.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return res.json(invites.map((invite) => buildOrgInviteDto(invite)));
    } catch (err) {
      return next(err);
    }
  },

  async createOrgInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const inviteRole = normalizeInviteRole(req.body?.orgRole);
      const orgRole = toOrgRole(inviteRole);

      if (!email || !isValidEmail(email)) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Valid email is required" };
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      });

      if (!org) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" };
      }

      const inviter = await prisma.user.findUnique({
        where: { id: req.authUser.id },
        select: { id: true, name: true, email: true },
      });

      const existingMembershipUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingMembershipUser) {
        const membership = await prisma.organizationMember.findUnique({
          where: {
            orgId_userId: {
              orgId,
              userId: existingMembershipUser.id,
            },
          },
          select: { id: true },
        });

        if (membership) {
          throw {
            code: ERROR_CODES.INVALID_REQUEST,
            message: "User is already a member of this organization",
          };
        }
      }

      const existingPending = await prisma.organizationInvite.findFirst({
        where: {
          orgId,
          email,
          status: InviteStatus.pending,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (existingPending) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "A pending invite already exists for this email",
        };
      }

      const rawToken = makeRawInviteToken();
      const tokenHash = hashInviteToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const created = await prisma.organizationInvite.create({
        data: {
          orgId,
          email,
          tokenHash,
          invitedById: req.authUser.id,
          orgRole,
          status: InviteStatus.pending,
          expiresAt,
        },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      const inviteLink = `${WEB_APP_URL}/invite/org/${encodeURIComponent(rawToken)}`;

      await emailService.sendOrgInvite({
        to: email,
        inviteLink,
        orgName: org.name,
        invitedByName: inviter?.name ?? undefined,
        orgRole: inviteRole,
        expiresAt,
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "ORG_INVITE_SENT",
        metadata: {
          inviteId: created.id,
          email,
          orgRole,
          normalizedRole: inviteRole,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "invite_created",
        actorUserId: req.authUser.id,
        inviteId: created.id,
      });

      return res.status(201).json(
        buildOrgInviteDto({
          ...created,
          rawToken,
        })
      );
    } catch (err) {
      return next(err);
    }
  },

  async resendOrgInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const inviteId = String(req.params.inviteId || "").trim();
      if (!inviteId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "inviteId is required" };
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      });

      if (!org) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Organization not found" };
      }

      const inviter = await prisma.user.findUnique({
        where: { id: req.authUser.id },
        select: { id: true, name: true, email: true },
      });

      const existing = await prisma.organizationInvite.findFirst({
        where: {
          id: inviteId,
          orgId,
        },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      if (!existing) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
      }

      if (existing.status === InviteStatus.accepted) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Accepted invites cannot be resent" };
      }

      const rawToken = makeRawInviteToken();
      const tokenHash = hashInviteToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const updated = await prisma.organizationInvite.update({
        where: { id: inviteId },
        data: {
          tokenHash,
          status: InviteStatus.pending,
          expiresAt,
        },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      const inviteLink = `${WEB_APP_URL}/invite/org/${encodeURIComponent(rawToken)}`;

      await emailService.sendOrgInvite({
        to: updated.email,
        inviteLink,
        orgName: org.name,
        invitedByName: inviter?.name ?? undefined,
        orgRole: fromOrgRole(updated.orgRole ?? null),
        expiresAt,
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "ORG_INVITE_SENT",
        metadata: {
          inviteId: updated.id,
          email: updated.email,
          resend: true,
          orgRole: updated.orgRole ?? null,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "invite_re_sent",
        actorUserId: req.authUser.id,
        inviteId: updated.id,
      });

      return res.json(
        buildOrgInviteDto({
          ...updated,
          rawToken,
        })
      );
    } catch (err) {
      return next(err);
    }
  },

  async revokeOrgInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = req.authUser.orgId;
      if (!orgId) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
      }

      const inviteId = String(req.params.inviteId || "").trim();
      if (!inviteId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "inviteId is required" };
      }

      const existing = await prisma.organizationInvite.findFirst({
        where: {
          id: inviteId,
          orgId,
        },
        select: {
          id: true,
          email: true,
          status: true,
          orgRole: true,
        },
      });

      if (!existing) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
      }

      if (existing.status === InviteStatus.accepted) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Accepted invites cannot be revoked" };
      }

      await prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.revoked },
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "ORG_INVITE_REVOKED",
        metadata: {
          inviteId,
          email: existing.email,
          orgRole: existing.orgRole ?? null,
        },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "invite_revoked",
        actorUserId: req.authUser.id,
        inviteId,
      });

      return res.json({ revoked: true, inviteId });
    } catch (err) {
      return next(err);
    }
  },
};
