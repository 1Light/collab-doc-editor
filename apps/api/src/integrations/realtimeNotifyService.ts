// apps/api/src/integrations/realtimeNotifyService.ts

import { config } from "../config/env";

async function postInternal(path: string, body: unknown) {
  const baseUrl = config.REALTIME_INTERNAL_URL;
  const secret = config.REALTIME_INTERNAL_SECRET;

  if (!baseUrl || !secret) {
    console.warn("[realtimeNotify] missing config:", {
      baseUrl,
      hasSecret: Boolean(secret),
    });
    return;
  }

  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  try {
    console.log("[realtimeNotify] POST →", url, body);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text().catch(() => "");

    console.log("[realtimeNotify] response:", {
      status: resp.status,
      ok: resp.ok,
      body: text,
    });

    if (!resp.ok) {
      console.warn("[realtimeNotify] non-200 response from realtime");
    }
  } catch (err) {
    console.error("[realtimeNotify] request failed:", err);
  }
}

export const realtimeNotifyService = {
  async orgAdminDataChanged(input: {
    orgId: string;
    reason:
      | "member_joined"
      | "member_removed"
      | "member_role_updated"
      | "invite_created"
      | "invite_accepted"
      | "invite_re_sent"
      | "invite_revoked";
    actorUserId?: string | null;
    targetUserId?: string | null;
    inviteId?: string | null;
  }) {
    await postInternal("/internal/events/org-admin-data-changed", {
      orgId: input.orgId,
      reason: input.reason,
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      inviteId: input.inviteId ?? null,
      emittedAt: new Date().toISOString(),
    });
  },

  async documentRoleUpdated(input: {
    documentId: string;
    userId: string;
    role?: string | null;
  }) {
    await postInternal("/internal/events/document-role-updated", {
      documentId: input.documentId,
      userId: input.userId,
      role: input.role ?? "Viewer",
    });
  },

  async documentCommentChanged(input: {
    documentId: string;
    action: "created" | "updated" | "resolved" | "deleted";
    commentId: string;
    actorUserId: string;
    parentCommentId?: string | null;
    status?: "open" | "resolved" | null;
  }) {
    await postInternal("/internal/events/document-comment-changed", {
      documentId: input.documentId,
      action: input.action,
      commentId: input.commentId,
      actorUserId: input.actorUserId,
      parentCommentId: input.parentCommentId ?? null,
      status: input.status ?? null,
    });
  },
};
