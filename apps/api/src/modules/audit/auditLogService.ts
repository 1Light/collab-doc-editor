// apps/api/src/modules/audit/auditLogService.ts
import { Prisma } from "@prisma/client";
import { auditLogRepo } from "./auditLogRepo";

type Cursor = { id: string; createdAt: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeInlineValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  try {
    const s = JSON.stringify(v);
    if (!s) return "";
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return "[unrenderable]";
  }
}

function csvEscapeCell(v: string) {
  const needsQuotes = /[",\n]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function formatRoleList(roles: unknown): string {
  if (!Array.isArray(roles)) return "";
  const r = roles.map((x) => String(x)).filter(Boolean);
  return r.length ? r.join(", ") : "";
}

function formatQuotaLabel(kind: "perUserPerDay" | "perOrgPerDay") {
  return kind === "perUserPerDay" ? "Per-user/day" : "Per-org/day";
}

function formatQuotaValue(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

function summarizeAIPolicyUpdated(metadata: any) {
  /**
   * Supports:
   * 1) New diff-based shape:
   *    { diff: { enabledRoles?: {from,to}, quotaPolicy?: { perUserPerDay?: {from,to}, perOrgPerDay?: {from,to} } }, after?: {...} }
   * 2) Old shape (back-compat):
   *    { enabledRoles, quotaPolicy }
   */

  const diff = isPlainObject(metadata?.diff) ? (metadata.diff as Record<string, unknown>) : null;

  if (diff) {
    const parts: string[] = [];

    const er = (diff as any).enabledRoles;
    if (er && isPlainObject(er)) {
      const from = formatRoleList((er as any).from);
      const to = formatRoleList((er as any).to);
      if (from || to) parts.push(`Enabled roles: ${from || "—"} → ${to || "—"}`);
    }

    const qp = (diff as any).quotaPolicy;
    if (qp && isPlainObject(qp)) {
      const user = (qp as any).perUserPerDay;
      if (user && isPlainObject(user)) {
        parts.push(
          `${formatQuotaLabel("perUserPerDay")}: ${formatQuotaValue((user as any).from)} → ${formatQuotaValue(
            (user as any).to
          )}`
        );
      }

      const org = (qp as any).perOrgPerDay;
      if (org && isPlainObject(org)) {
        parts.push(
          `${formatQuotaLabel("perOrgPerDay")}: ${formatQuotaValue((org as any).from)} → ${formatQuotaValue(
            (org as any).to
          )}`
        );
      }
    }

    if (parts.length === 0) return "AI policy updated";
    return `AI policy updated: ${parts.join(" · ")}`;
  }

  const enabledRoles: string[] = Array.isArray(metadata?.enabledRoles) ? metadata.enabledRoles : [];
  const quotaPolicy = isPlainObject(metadata?.quotaPolicy) ? metadata.quotaPolicy : {};

  const perUser =
    typeof (quotaPolicy as any).perUserPerDay === "number" ? (quotaPolicy as any).perUserPerDay : undefined;
  const perOrg =
    typeof (quotaPolicy as any).perOrgPerDay === "number" ? (quotaPolicy as any).perOrgPerDay : undefined;

  const rolesPart = enabledRoles.length ? `Enabled roles: ${enabledRoles.join(", ")}` : "Enabled roles updated";

  const quotaParts: string[] = [];
  if (perUser !== undefined) quotaParts.push(`${formatQuotaLabel("perUserPerDay")}: ${perUser}`);
  if (perOrg !== undefined) quotaParts.push(`${formatQuotaLabel("perOrgPerDay")}: ${perOrg}`);

  const quotaPart = quotaParts.length ? ` · ${quotaParts.join(" · ")}` : "";
  return `AI policy updated: ${rolesPart}${quotaPart}`;
}

function summarizePermissionTarget(metadata: any) {
  const principalType = metadata?.principalType ? String(metadata.principalType) : "";
  const principalId = metadata?.principalId ? String(metadata.principalId) : "";

  const target =
    principalType === "user" && principalId
      ? principalId
      : principalType === "link"
        ? "link"
        : principalId || undefined;

  return { principalType, principalId, target };
}

function summarizeEvent(actionType: string, metadata: any, actorName?: string, docTitle?: string) {
  switch (actionType) {
    case "AI_POLICY_UPDATED":
      return summarizeAIPolicyUpdated(metadata);

    case "DOCUMENT_CREATED":
      return `Created document${docTitle ? `: "${docTitle}"` : ""}`;
    case "DOCUMENT_DELETED":
      return `Deleted document${docTitle ? `: "${docTitle}"` : ""}`;
    case "DOCUMENT_RESTORED":
      return `Restored document${docTitle ? `: "${docTitle}"` : ""}`;

    case "PERMISSION_GRANTED": {
      const role = metadata?.role ? String(metadata.role) : "a role";
      const prev = metadata?.previousRole ? String(metadata.previousRole) : null;

      const { target } = summarizePermissionTarget(metadata);

      return `Permission granted: ${role}${prev ? ` (was ${prev})` : ""}${target ? ` to ${target}` : ""}${
        docTitle ? `: "${docTitle}"` : ""
      }`;
    }

    case "PERMISSION_REVOKED": {
      const prev =
        metadata?.previousRole ? String(metadata.previousRole) : metadata?.role ? String(metadata.role) : "";

      const { target } = summarizePermissionTarget(metadata);

      return `Permission revoked${prev ? `: ${prev}` : ""}${target ? ` from ${target}` : ""}${
        docTitle ? `: "${docTitle}"` : ""
      }`;
    }

    case "VERSION_REVERTED": {
      const targetVersionId = metadata?.targetVersionId ?? metadata?.toVersionId ?? metadata?.versionId;
      const newHeadVersionId = metadata?.newHeadVersionId;
      const previousHeadVersionId = metadata?.previousHeadVersionId;

      const detailParts: string[] = [];
      if (targetVersionId) detailParts.push(`to ${String(targetVersionId)}`);
      if (newHeadVersionId) detailParts.push(`new head ${String(newHeadVersionId)}`);
      if (previousHeadVersionId) detailParts.push(`from ${String(previousHeadVersionId)}`);

      return `Version reverted${docTitle ? `: "${docTitle}"` : ""}${
        detailParts.length ? ` · ${detailParts.join(" · ")}` : ""
      }`;
    }

    case "COMMENT_CREATED":
      return `Comment created${docTitle ? `: "${docTitle}"` : ""}`;

    case "COMMENT_RESOLVED":
      return `Comment resolved${docTitle ? `: "${docTitle}"` : ""}`;

    case "AI_JOB_CREATED": {
      const op = metadata?.operation ? String(metadata.operation) : "job";
      return `AI request created: ${op}${docTitle ? `: "${docTitle}"` : ""}`;
    }

    case "AI_JOB_APPLIED":
      return `AI suggestion applied${docTitle ? `: "${docTitle}"` : ""}`;

    case "ORG_INVITE_SENT":
      return `Invite sent${metadata?.email ? `: ${String(metadata.email)}` : ""}`;

    case "USER_ORG_ROLE_UPDATED":
    case "ORG_MEMBER_ROLE_CHANGED": {
      const target = metadata?.targetUserId ? String(metadata.targetUserId) : "user";
      const role = (metadata?.orgRole ?? metadata?.newRole) as unknown;
      const roleText = role === null ? "Member" : role ? String(role) : "?";
      return `Org role updated: ${target}: ${roleText}`;
    }

    case "ACCOUNT_SELF_DELETED": {
      const email = metadata?.email ? String(metadata.email) : undefined;
      const name = metadata?.name ? String(metadata.name) : undefined;
      const ownedDocumentCount =
        typeof metadata?.ownedDocumentCount === "number" ? metadata.ownedDocumentCount : undefined;
      const membershipCount =
        typeof metadata?.membershipCount === "number" ? metadata.membershipCount : undefined;

      const identity = email || name || actorName || "account";
      const details: string[] = [];

      if (ownedDocumentCount !== undefined) details.push(`owned docs: ${ownedDocumentCount}`);
      if (membershipCount !== undefined) details.push(`memberships removed: ${membershipCount}`);

      return `Account self-deleted: ${identity}${details.length ? ` · ${details.join(" · ")}` : ""}`;
    }

    case "LOGIN_FAILED":
      return `Login failed${metadata?.email ? `: ${String(metadata.email)}` : ""}`;

    case "LOGIN_SUCCESS":
      return `Login${metadata?.email ? `: ${String(metadata.email)}` : ""}`;

    default: {
      if (metadata && typeof metadata === "object") {
        const small = Object.entries(metadata as Record<string, unknown>)
          .slice(0, 3)
          .map(([k, v]) => `${k}:${safeInlineValue(v)}`)
          .join(", ");
        return `${actionType}${small ? `: ${small}` : ""}`;
      }
      return actionType;
    }
  }
}

function riskFromAction(actionType: string) {
  const high = new Set([
    "PERMISSION_GRANTED",
    "PERMISSION_REVOKED",
    "USER_ORG_ROLE_UPDATED",
    "ORG_MEMBER_ROLE_CHANGED",
    "DOCUMENT_DELETED",
    "DOCUMENT_RESTORED",
    "ACCOUNT_SELF_DELETED",
  ]);

  const medium = new Set([
    "VERSION_REVERTED",
    "AI_JOB_APPLIED",
    "AI_JOB_CREATED",
    "COMMENT_RESOLVED",
  ]);

  if (high.has(actionType)) return "high";
  if (medium.has(actionType)) return "medium";
  return "low";
}

export const auditLogService = {
  async logAction(params: {
    userId: string;
    actionType: string;
    documentId?: string | null;
    orgId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return auditLogRepo.create({
      userId: params.userId,
      actionType: params.actionType,
      documentId: params.documentId ?? null,
      orgId: params.orgId ?? null,
      metadata: params.metadata ?? undefined,
    });
  },

  async listLogs(params?: {
    orgId: string;
    documentId?: string;
    userId?: string;
    actionTypes?: string[];
    from?: string;
    to?: string;
    q?: string;
    limit?: number;
    cursor?: Cursor | null;
  }) {
    const repoRes = await auditLogRepo.query({
      orgId: params?.orgId,
      documentId: params?.documentId,
      userId: params?.userId,
      actionTypes: params?.actionTypes,
      from: params?.from ? new Date(params.from) : undefined,
      to: params?.to ? new Date(params.to) : undefined,
      q: params?.q,
      limit: params?.limit,
      cursor: params?.cursor
        ? { id: params.cursor.id, createdAt: new Date(params.cursor.createdAt) }
        : undefined,
    });

    const items = repoRes.items.map((it) => {
      const actorLabel = it.actor?.name ?? it.actor?.email;
      const summary = summarizeEvent(it.actionType, it.metadata, actorLabel, it.document?.title);
      const riskLevel = riskFromAction(it.actionType);
      return { ...it, summary, riskLevel };
    });

    return {
      items,
      nextCursor: repoRes.nextCursor
        ? { id: repoRes.nextCursor.id, createdAt: repoRes.nextCursor.createdAt.toISOString() }
        : null,
      hasMore: repoRes.hasMore,
    };
  },

  async exportLogs(params: {
    orgId: string;
    documentId?: string;
    userId?: string;
    actionTypes?: string[];
    from?: string;
    to?: string;
    q?: string;
    maxRows?: number;
  }) {
    const pageSize = 500;
    let cursor: { id: string; createdAt: Date } | undefined;
    const rows: Array<any> = [];

    while (rows.length < (params.maxRows ?? 5000)) {
      const res = await auditLogRepo.query({
        orgId: params.orgId,
        documentId: params.documentId,
        userId: params.userId,
        actionTypes: params.actionTypes,
        from: params.from ? new Date(params.from) : undefined,
        to: params.to ? new Date(params.to) : undefined,
        q: params.q,
        limit: pageSize,
        cursor,
      });

      rows.push(...res.items);

      if (!res.hasMore) break;
      cursor = res.nextCursor
        ? { id: res.nextCursor.id, createdAt: new Date(res.nextCursor.createdAt) }
        : undefined;
    }

    const header = [
      "id",
      "createdAt",
      "actorId",
      "actorName",
      "actorEmail",
      "actionType",
      "documentId",
      "documentTitle",
      "summary",
      "riskLevel",
      "metadata",
    ];

    const lines = [header.join(",")];

    for (const r of rows) {
      const actorLabel = r.actor?.name ?? r.actor?.email;
      const summary = summarizeEvent(r.actionType, r.metadata, actorLabel, r.document?.title);
      const risk = riskFromAction(r.actionType);
      const meta = r.metadata ? JSON.stringify(r.metadata) : "";

      const line = [
        csvEscapeCell(String(r.id ?? "")),
        csvEscapeCell(new Date(r.createdAt).toISOString()),
        csvEscapeCell(String(r.actor?.id ?? "")),
        csvEscapeCell(String(r.actor?.name ?? "")),
        csvEscapeCell(String(r.actor?.email ?? "")),
        csvEscapeCell(String(r.actionType ?? "")),
        csvEscapeCell(String(r.document?.id ?? "")),
        csvEscapeCell(String(r.document?.title ?? "")),
        csvEscapeCell(summary),
        csvEscapeCell(risk),
        csvEscapeCell(meta),
      ];

      lines.push(line.join(","));
    }

    return lines.join("\n");
  },
};