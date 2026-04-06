// apps/web/src/features/admin/pages/admin/AdminOverview.tsx

import React, { useMemo } from "react";
import type { AdminSection } from "../Admin";
import type { AIPolicy, AdminUser } from "../../../../features/admin/api";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { listAuditLogsV2, type AuditLogV2 } from "../../../../features/admin/api";

const PREVIEW_COUNT = 5;

function formatAuditTime(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  if (diffDay === 1) return `Yesterday · ${time}`;
  if (diffDay < 7) {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return `${weekday} · ${time}`;
  }

  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    const md = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
    return `${md} · ${time}`;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} · ${time}`;
}

function normalizeLogV2(l: any): AuditLogV2 {
  return {
    id: String(l.id),
    orgId: l.orgId ?? undefined,
    userId: String(l.userId),
    actionType: String(l.actionType),
    documentId: l.documentId ?? undefined,
    metadata: l.metadata ?? undefined,
    createdAt: typeof l.createdAt === "string" ? l.createdAt : new Date(l.createdAt).toISOString(),
    actor: l.actor
      ? { id: String(l.actor.id), name: l.actor.name ?? undefined, email: l.actor.email ?? undefined }
      : undefined,
    document: l.document ? { id: String(l.document.id), title: l.document.title ?? undefined } : undefined,
    summary: String(l.summary ?? l.actionType),
    riskLevel: (l.riskLevel ?? "low") as any,
  };
}

function clampSummary(s: string, max = 140) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatActionTypeLabel(actionType: string) {
  return actionType
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateMiddle(value: string, head = 8, tail = 6) {
  const v = (value ?? "").trim();
  if (!v) return "—";
  if (v.length <= head + tail + 3) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

function getActorLabel(log: AuditLogV2) {
  return log.actor?.email ?? log.actor?.name ?? log.userId ?? "Unknown actor";
}

function getTargetLabel(log: AuditLogV2) {
  return log.document?.title ?? (log.documentId ? `Document ${truncateMiddle(log.documentId)}` : null);
}

function getMetadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getAuditPreview(log: AuditLogV2) {
  const actor = getActorLabel(log);
  const target = getTargetLabel(log);

  switch (log.actionType) {
    case "AI_POLICY_UPDATED": {
      const enabledRoles = getMetadataValue(log.metadata, "enabledRoles");
      return {
        title: "AI policy updated",
        detail: enabledRoles
          ? `Enabled roles changed to ${enabledRoles}.`
          : "The workspace AI policy was updated.",
      };
    }

    case "DOCUMENT_CREATED":
      return {
        title: target ? `Document created` : "Document created",
        detail: target ? `${actor} created ${target}.` : `${actor} created a document.`,
      };

    case "DOCUMENT_UPDATED":
      return {
        title: target ? `Document updated` : "Document updated",
        detail: target ? `${actor} updated ${target}.` : `${actor} updated a document.`,
      };

    case "DOCUMENT_DELETED":
      return {
        title: target ? `Document deleted` : "Document deleted",
        detail: target ? `${actor} deleted ${target}.` : `${actor} deleted a document.`,
      };

    case "PERMISSION_GRANTED":
      return {
        title: "Permission granted",
        detail: target ? `${actor} granted access to ${target}.` : `${actor} granted access.`,
      };

    case "PERMISSION_REVOKED":
      return {
        title: "Permission revoked",
        detail: target ? `${actor} revoked access to ${target}.` : `${actor} revoked access.`,
      };

    case "COMMENT_CREATED":
      return {
        title: "Comment added",
        detail: target ? `${actor} added a comment on ${target}.` : `${actor} added a comment.`,
      };

    case "COMMENT_RESOLVED":
      return {
        title: "Comment resolved",
        detail: target ? `${actor} resolved a comment on ${target}.` : `${actor} resolved a comment.`,
      };

    case "VERSION_REVERTED":
      return {
        title: "Version reverted",
        detail: target ? `${actor} reverted ${target} to an earlier version.` : `${actor} reverted a version.`,
      };

    case "LOGIN_SUCCESS":
      return {
        title: "Login succeeded",
        detail: `${actor} signed in successfully.`,
      };

    case "LOGIN_FAILED":
      return {
        title: "Login failed",
        detail: `A sign-in attempt failed for ${actor}.`,
      };

    case "USER_ORG_ROLE_UPDATED":
      return {
        title: "Admin role updated",
        detail: `${actor} changed an organization role.`,
      };

    case "ORG_INVITE_SENT":
      return {
        title: "Invite sent",
        detail: `${actor} sent an organization invite.`,
      };

    default:
      return {
        title: formatActionTypeLabel(log.actionType),
        detail: clampSummary(log.summary, 180),
      };
  }
}

function ActivityMetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

export function AdminOverview({
  policy,
  users,
  onNavigate,
}: {
  policy: AIPolicy | null;
  users: AdminUser[];
  orgAdminCount: number;
  onNavigate: (s: AdminSection) => void;
}) {
  const orgAdminCount = useMemo(() => users.filter((u) => u.orgRole === "OrgAdmin").length, [users]);

  const [recentLogs, setRecentLogs] = React.useState<AuditLogV2[]>([]);
  const [loadingLogs, setLoadingLogs] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingLogs(true);
      try {
        const res = await listAuditLogsV2({ limit: 8 });
        const normalized = res.items.map(normalizeLogV2);

        if (!alive) return;
        setRecentLogs(normalized.slice(0, PREVIEW_COUNT));
      } finally {
        if (alive) setLoadingLogs(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const enabledRolesText = policy?.enabledRoles?.length ? policy.enabledRoles.join(", ") : "None";
  const updatedPolicyText = policy?.updatedAt ? formatAuditTime(policy.updatedAt) : "-";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-white px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Overview</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Organization snapshot</div>
              <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review AI access, membership coverage, and the latest admin activity from one place.
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  AI policy
                </div>
                <div className="mt-4 text-lg font-semibold tracking-tight text-slate-950">AI enabled roles</div>
                <div className="mt-2 text-sm leading-6 text-slate-700">{enabledRolesText}</div>

                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Last updated</div>
                    <div className="mt-1 text-sm font-semibold text-slate-950">{updatedPolicyText}</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Shortcuts</div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Button variant="secondary" size="sm" onClick={() => onNavigate("ai")} className="w-full">
                    Edit AI policy
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onNavigate("members")} className="w-full">
                    Manage members
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onNavigate("logs")} className="w-full">
                    Search audit logs
                  </Button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-medium text-slate-500">Workspace users</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{users.length}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-medium text-slate-500">Admin coverage</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{orgAdminCount}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
        <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Activity</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Recent audit activity</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                A quick preview of the latest events across membership, policy, and document actions.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => onNavigate("logs")}>
                Open search
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-7">
          {loadingLogs ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 animate-pulse"
                >
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-1/3 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <div className="text-sm font-medium text-slate-900">No recent logs</div>
              <div className="mt-2 text-sm text-slate-600">
                New audit events will appear here once activity is recorded.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {recentLogs.map((l: AuditLogV2) => {
                const preview = getAuditPreview(l);
                const actor = getActorLabel(l);
                const target = getTargetLabel(l);

                return (
                  <div
                    key={l.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold tracking-tight text-slate-950">
                            {preview.title}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-600">
                            {preview.detail}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Badge variant="neutral" title={new Date(l.createdAt).toISOString()}>
                            {formatAuditTime(l.createdAt)}
                          </Badge>
                          <Badge variant={l.riskLevel === "high" ? "warning" : "neutral"}>
                            {l.riskLevel}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <ActivityMetaItem label="Actor" value={actor} />
                        <ActivityMetaItem label="Action" value={formatActionTypeLabel(l.actionType)} />
                        <ActivityMetaItem label="Target" value={target ?? "—"} />
                      </div>

                      {preview.detail === clampSummary(l.summary, 180) && l.summary !== preview.detail ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Raw summary
                          </div>
                          <div className="mt-1 text-sm text-slate-700">{clampSummary(l.summary, 220)}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Showing {Math.min(PREVIEW_COUNT, recentLogs.length)} recent events. Use "Open search" for full
                history.
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}