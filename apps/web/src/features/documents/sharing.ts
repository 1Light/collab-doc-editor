// apps/web/src/features/documents/sharing.ts

import { http } from "../../lib/http";

export type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner";

export type PrincipalType = "user" | "link";

export type PermissionUser = {
  id: string;
  name?: string;
  email?: string;
};

export type Permission = {
  principalType: PrincipalType;
  principalId: string;
  role: DocumentRole;

  // Provided by backend for UI friendliness (may be null for implicit owner)
  user?: PermissionUser | null;

  // audit-ish fields (optional)
  createdAt?: string | null;
  updatedAt?: string | null;
  grantedBy?: PermissionUser | { id: string } | null;
};

/**
 * POST /documents/:id/share
 */
export async function shareDocument(
  documentId: string,
  payload:
    | { targetType: "user"; targetId: string; role: DocumentRole }
    | { targetType: "link"; role: DocumentRole }
) {
  return http<{
    shareId: string;
    linkToken?: string;
  }>(`/documents/${documentId}/share`, {
    method: "POST",
    body: payload,
  });
}

/**
 * GET /documents/:id/permissions
 */
export async function listPermissions(documentId: string) {
  return http<Permission[]>(`/documents/${documentId}/permissions`);
}

/**
 * PUT /documents/:id/permissions
 * Body: { principalType: "user" | "link", principalId: string, role: DocumentRole }
 */
export async function updatePermission(
  documentId: string,
  payload: {
    principalType: PrincipalType;
    principalId: string;
    role: DocumentRole;
  }
) {
  return http<{ updated: boolean; id?: string }>(`/documents/${documentId}/permissions`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * DELETE /documents/:id/permissions
 * Body: { principalType: "user" | "link", principalId: string }
 */
export async function deletePermission(
  documentId: string,
  payload: {
    principalType: PrincipalType;
    principalId: string;
  }
) {
  return http<{ deleted: boolean }>(`/documents/${documentId}/permissions`, {
    method: "DELETE",
    body: payload,
  });
}

/* -----------------------------
   Invite helpers (org-member)
   ----------------------------- */

export type OrgUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * GET /invite/org-users?q=
 * Returns org members (no roles) for the invite picker.
 */
export async function listOrgUsers(q?: string) {
  const qs = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  return http<OrgUser[]>(`/invite/org-users${qs}`);
}

/**
 * POST /invite/documents/:documentId
 * Body: { userId: string, message?: string }
 */
export async function inviteUserToDocument(
  documentId: string,
  payload: { userId: string; message?: string }
) {
  return http<{ invited: boolean; message?: string }>(`/invite/documents/${documentId}`, {
    method: "POST",
    body: payload,
  });
}

/* -----------------------------
   Invite helpers (email-based document invites)
   ----------------------------- */

export type DocumentInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type DocumentInvite = {
  id: string;
  documentId: string;
  orgId: string;
  email: string;
  role: Exclude<DocumentRole, "Owner">;
  status: DocumentInviteStatus;
  expiresAt: string | null;
  acceptedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  invitedBy: { id: string; name?: string | null; email?: string | null } | null;
};

/**
 * GET /documents/:id/invites
 */
export async function listDocumentInvites(documentId: string) {
  return http<DocumentInvite[]>(`/documents/${documentId}/invites`);
}

/**
 * POST /documents/:id/invites
 * Body: { email: string, role: DocumentRole, expiresInDays?: number }
 */
export async function createDocumentInvite(
  documentId: string,
  payload: { email: string; role: Exclude<DocumentRole, "Owner">; expiresInDays?: number }
) {
  return http<{
    inviteId: string;
    token: string;
    email: string;
    role: Exclude<DocumentRole, "Owner">;
    status: DocumentInviteStatus;
    expiresAt: string | null;
  }>(`/documents/${documentId}/invites`, {
    method: "POST",
    body: payload,
  });
}

/**
 * DELETE /documents/:id/invites/:inviteId
 */
export async function revokeDocumentInvite(documentId: string, inviteId: string) {
  return http<{ revoked: boolean; status?: DocumentInviteStatus }>(
    `/documents/${documentId}/invites/${inviteId}`,
    { method: "DELETE" }
  );
}