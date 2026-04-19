// apps/api/src/modules/invites/inviteService.ts

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import { documentInviteRepo } from "../documents/documentInviteRepo";
import type { DocumentRole, InviteStatus } from "@prisma/client";
import { ERROR_CODES } from "@repo/contracts";
import { emailService } from "../../integrations/emailService";
import { config } from "../../config/env";

type SharableRole = Exclude<DocumentRole, "Owner">;

function assertSharableRole(role: DocumentRole): asserts role is SharableRole {
  if (role === "Owner") {
    throw { code: ERROR_CODES.INVALID_REQUEST, message: "Owner role cannot be granted via invite" };
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// The raw token is returned once so the caller can build the invite link.
// Only the hash is stored in the database.
function makeRawToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function buildAcceptInviteLink(rawToken: string) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:5173";
  return `${baseUrl}/invite/document/${encodeURIComponent(rawToken)}`;
}

/**
 * Best-effort: notify realtime so the affected user's open editor
 * immediately locks/unlocks and refreshes role UI.
 */
async function notifyRealtimeRoleUpdated(params: {
  documentId: string;
  userId: string;
  role: DocumentRole;
}) {
  try {
    const secret = config.REALTIME_INTERNAL_SECRET ?? process.env.REALTIME_INTERNAL_SECRET;
    if (!secret) return;

    const base = (config.REALTIME_INTERNAL_URL ?? "http://localhost:4001").replace(/\/+$/, "");
    const url = `${base}/internal/events/document-role-updated`;

    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({
        documentId: params.documentId,
        userId: params.userId,
        role: params.role,
      }),
    }).catch(() => {
      // ignore
    });
  } catch {
    // ignore
  }
}

export const inviteService = {
  /**
   * Create (or re-create) a pending invite for an email.
   * Returns the raw token so the caller can share or email the invite link.
   */
  async createDocumentInvite(params: {
    documentId: string;
    invitedById: string;
    email: string;
    role: DocumentRole;
    expiresInDays?: number; // defaults to 7
  }): Promise<{
    inviteId: string;
    email: string;
    role: SharableRole;
    status: InviteStatus;
    expiresAt: Date;
    token: string; // raw token returned to the caller once
  }> {
    const { documentId, invitedById } = params;
    const email = normalizeEmail(params.email);

    assertSharableRole(params.role);
    const role = params.role;

    // Load the document to resolve organization ownership and title metadata.
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, orgId: true, ownerId: true, isDeleted: true, title: true },
    });

    if (!doc || doc.isDeleted) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    if (doc.ownerId !== invitedById) {
      throw { code: ERROR_CODES.FORBIDDEN, message: "Only Owner can invite to this document" };
    }

    const token = makeRawToken();
    const tokenHash = hashToken(token);
    const expiresAt = addDays(params.expiresInDays ?? 7);

    const invite = await documentInviteRepo.createOrUpdatePendingInvite({
      documentId,
      orgId: doc.orgId,
      email,
      role,
      tokenHash,
      invitedById,
      expiresAt,
    });

    // ✅ Send email invite (best-effort)
    try {
      const inviter = await prisma.user.findUnique({
        where: { id: invitedById },
        select: { name: true, email: true },
      });

      const inviteLink = buildAcceptInviteLink(token);
      // eslint-disable-next-line no-console
      console.log("📧 Sending document invite email to:", email);

      await emailService.sendDocumentInvite({
        to: email,
        inviterName: inviter?.name ?? inviter?.email ?? "Someone",
        documentTitle: doc.title ?? "a document",
        documentLink: inviteLink,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[inviteService] Failed to send document invite email", e);
    }

    return {
      inviteId: invite.id,
      email: invite.email,
      role: invite.role as SharableRole,
      status: invite.status,
      expiresAt: invite.expiresAt,
      token,
    };
  },

  /**
   * Accept invite using raw token.
   *
   * Idempotent behavior:
   * - pending => validate + accept
   * - accepted => return success (do not error)
   * - revoked/expired => error
   */
  async acceptDocumentInvite(params: {
    token: string; // raw token from link
    userId: string; // authed user accepting
  }): Promise<{
    accepted: boolean;
    documentId: string;
    role: SharableRole;
  }> {
    const rawToken = (params.token ?? "").trim();
    if (!rawToken) {
      throw { code: ERROR_CODES.INVALID_REQUEST, message: "Missing invite token" };
    }

    const tokenHash = hashToken(rawToken);

    const invite = await prisma.documentInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        documentId: true,
        orgId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        invitedById: true,
      },
    });

    if (!invite) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Invite not found" };
    }

    assertSharableRole(invite.role);
    const role = invite.role;

    // the accepting user must match invite.email (recommended)
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "User not found" };
    }

    if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
      throw {
        code: ERROR_CODES.FORBIDDEN,
        message: "This invite was sent to a different email address",
      };
    }

    // If already accepted: ✅ return success (idempotent)
    if (invite.status === "accepted") {
      // best-effort: still ensure realtime is up-to-date for open tabs
      void notifyRealtimeRoleUpdated({
        documentId: invite.documentId,
        userId: user.id,
        role,
      });

      return { accepted: true, documentId: invite.documentId, role };
    }

    // Not pending anymore and not accepted => block
    if (invite.status !== "pending") {
      throw { code: ERROR_CODES.FORBIDDEN, message: `Invite is ${invite.status}` };
    }

    const now = new Date();
    if (invite.expiresAt.getTime() <= now.getTime()) {
      // best-effort mark expired
      await prisma.documentInvite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });
      throw { code: ERROR_CODES.FORBIDDEN, message: "Invite expired" };
    }

    // hard gate: same org membership
    const membership = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: invite.orgId,
          userId: user.id,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw {
        code: ERROR_CODES.FORBIDDEN,
        message: "You must join the organization before accepting this invite",
      };
    }

    // ensure doc exists and isn't deleted
    const doc = await prisma.document.findUnique({
      where: { id: invite.documentId },
      select: { id: true, isDeleted: true, ownerId: true },
    });

    if (!doc || doc.isDeleted) {
      throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
    }

    // cannot downgrade owner via invite
    if (doc.ownerId === user.id) {
      await prisma.documentInvite.update({
        where: { id: invite.id },
        data: { status: "accepted", acceptedAt: now },
      });

      // owner stays owner: notify (harmless)
      void notifyRealtimeRoleUpdated({
        documentId: invite.documentId,
        userId: user.id,
        role: "Owner",
      });

      return { accepted: true, documentId: invite.documentId, role };
    }

    // upsert permission
    await prisma.documentPermission.upsert({
      where: {
        documentId_principalType_principalId: {
          documentId: invite.documentId,
          principalType: "user",
          principalId: user.id,
        },
      },
      update: {
        role,
        grantedById: invite.invitedById,
      },
      create: {
        documentId: invite.documentId,
        principalType: "user",
        principalId: user.id,
        role,
        grantedById: invite.invitedById,
      },
    });

    await prisma.documentInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: now,
      },
    });

    // ✅ realtime push so the invited user instantly gets correct role without refresh
    void notifyRealtimeRoleUpdated({
      documentId: invite.documentId,
      userId: user.id,
      role,
    });

    return { accepted: true, documentId: invite.documentId, role };
  },
};
