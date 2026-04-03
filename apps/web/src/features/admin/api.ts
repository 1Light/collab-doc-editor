// apps/web/src/features/admin.ts
import { http } from "../../lib/http";

/* =========================
   Types
========================= */

export type AIPolicy = {
  enabledRoles: Array<"Editor" | "Owner">;
  quotaPolicy: {
    perUserPerDay?: number;
    perOrgPerDay?: number;
  };
  updatedAt: string;
};

/**
 * Legacy simple audit log shape (still supported)
 */
export type AuditLog = {
  id: string;
  userId: string;
  actionType: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

/**
 * New enriched audit log shape (search-first UI)
 */
export type AuditLogV2 = {
  id: string;
  orgId?: string;
  userId: string;
  actionType: string;
  documentId?: string;
  metadata?: unknown;
  createdAt: string;

  actor?: { id: string; name?: string; email?: string };
  document?: { id: string; title?: string };

  summary: string;
  riskLevel: "low" | "medium" | "high";
};

export type AuditLogListResponseV2 = {
  items: AuditLogV2[];
  nextCursor: { id: string; createdAt: string } | null;
  hasMore: boolean;
};

export type OrgRole = "OrgOwner" | "OrgAdmin" | null;

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  createdAt: string;
  joinedAt: string;
};

export type AdminInviteRole = "Member" | "OrgAdmin";
export type AdminInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type AdminInvite = {
  id: string;
  email: string;
  orgRole: AdminInviteRole;
  status: AdminInviteStatus;
  invitedByName?: string;
  invitedByEmail?: string;
  expiresAt: string;
  createdAt: string;
  inviteLink?: string;
};

/**
 * Server-supported audit tabs (mapped to actionTypes on the backend).
 * Keep this in sync with TAB_TO_ACTION_TYPES in adminController.ts.
 */
export type AuditTab =
  | "documentCreated"
  | "documentDeleted"
  | "documentRestored"
  | "permissionGranted"
  | "permissionRevoked"
  | "commentCreated"
  | "commentResolved"
  | "versionReverted"
  | "aiPolicyUpdated"
  | "aiJobCreated"
  | "aiJobApplied"
  | "orgInviteSent"
  | "userOrgRoleUpdated"
  | "orgMemberRemoved"
  | "loginSuccess"
  | "loginFailed";

/* =========================
   AI Policy
========================= */

/**
 * GET /admin/policies/ai
 */
export async function getAIPolicy() {
  return http<AIPolicy>("/admin/policies/ai");
}

/**
 * PUT /admin/policies/ai
 */
export async function updateAIPolicy(params: {
  enabledRoles: Array<"Editor" | "Owner">;
  quotaPolicy: {
    perUserPerDay?: number;
    perOrgPerDay?: number;
  };
}) {
  return http<AIPolicy>("/admin/policies/ai", {
    method: "PUT",
    body: params,
  });
}

/* =========================
   Audit Logs (Legacy)
========================= */

/**
 * GET /admin/audit-logs (legacy simple list)
 */
export async function listAuditLogs(params?: {
  documentId?: string;
  userId?: string;
  actionType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query.append(key, String(value));
    });
  }

  const qs = query.toString();
  const path = qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs";

  return http<AuditLog[]>(path);
}

/* =========================
   Audit Logs (V2 - tab + search + cursor)
========================= */

export async function listAuditLogsV2(params?: {
  tab?: AuditTab;

  documentId?: string;
  userId?: string;

  /**
   * Optional override. If provided, backend prefers this over tab.
   * Example: actionTypes: ["PERMISSION_GRANTED","PERMISSION_REVOKED"]
   */
  actionTypes?: string[];

  q?: string;
  from?: string;
  to?: string;
  limit?: number;

  cursor?: { id: string; createdAt: string };
}): Promise<AuditLogListResponseV2> {
  const query = new URLSearchParams();

  if (params?.tab) query.append("tab", params.tab);

  if (params?.documentId) query.append("documentId", params.documentId);
  if (params?.userId) query.append("userId", params.userId);

  if (params?.actionTypes?.length) query.append("actionTypes", params.actionTypes.join(","));

  if (params?.q) query.append("q", params.q);
  if (params?.from) query.append("from", params.from);
  if (params?.to) query.append("to", params.to);
  if (params?.limit) query.append("limit", String(params.limit));

  if (params?.cursor?.id && params.cursor.createdAt) {
    query.append("cursorId", params.cursor.id);
    query.append("cursorCreatedAt", params.cursor.createdAt);
  }

  const qs = query.toString();
  const path = qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs";

  return http<AuditLogListResponseV2>(path);
}

/**
 * DELETE /admin/audit-logs/:logId
 * Remove one audit log row.
 */
export async function deleteAuditLog(logId: string) {
  return http<{ removed: true; logId: string }>(`/admin/audit-logs/${logId}`, {
    method: "DELETE",
  });
}

/**
 * Build export URL for CSV download
 */
export function exportAuditLogsUrl(params?: {
  tab?: AuditTab;

  documentId?: string;
  userId?: string;

  actionTypes?: string[];
  q?: string;
  from?: string;
  to?: string;
  maxRows?: number;
}): string {
  const query = new URLSearchParams();

  if (params?.tab) query.append("tab", params.tab);

  if (params?.documentId) query.append("documentId", params.documentId);
  if (params?.userId) query.append("userId", params.userId);
  if (params?.actionTypes?.length) query.append("actionTypes", params.actionTypes.join(","));

  if (params?.q) query.append("q", params.q);
  if (params?.from) query.append("from", params.from);
  if (params?.to) query.append("to", params.to);
  if (params?.maxRows) query.append("maxRows", String(params.maxRows));

  const qs = query.toString();
  return qs ? `/admin/audit-logs/export?${qs}` : `/admin/audit-logs/export`;
}

/* =========================
   Users
========================= */

/**
 * GET /admin/users
 */
export async function listUsers() {
  return http<AdminUser[]>("/admin/users");
}

/**
 * PUT /admin/users/:userId/org-role
 *
 * IMPORTANT:
 * - client only supports toggling OrgAdmin on/off
 * - OrgOwner is enforced server-side (unique) and should not be assignable here
 */
export async function setUserOrgRole(userId: string, orgRole: "OrgAdmin" | null) {
  return http<{
    userId: string;
    orgId: string;
    orgRole: OrgRole;
    updatedAt: string;
  }>(`/admin/users/${userId}/org-role`, {
    method: "PUT",
    body: { orgRole },
  });
}

/**
 * DELETE /admin/users/:userId
 * Remove a member from the current org.
 */
export async function removeUserFromOrg(userId: string) {
  return http<{ removed: true; userId: string }>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

/* =========================
   Org Invites
========================= */

/**
 * GET /admin/org-invites
 */
export async function listOrgInvites() {
  return http<AdminInvite[]>("/admin/org-invites");
}

/**
 * POST /admin/org-invites
 */
export async function createOrgInvite(params: {
  email: string;
  orgRole: AdminInviteRole;
}) {
  return http<AdminInvite>("/admin/org-invites", {
    method: "POST",
    body: params,
  });
}

/**
 * POST /admin/org-invites/:inviteId/resend
 */
export async function resendOrgInvite(inviteId: string) {
  return http<AdminInvite>(`/admin/org-invites/${inviteId}/resend`, {
    method: "POST",
  });
}

/**
 * DELETE /admin/org-invites/:inviteId
 */
export async function revokeOrgInvite(inviteId: string) {
  return http<{ revoked: true; inviteId: string }>(`/admin/org-invites/${inviteId}`, {
    method: "DELETE",
  });
}