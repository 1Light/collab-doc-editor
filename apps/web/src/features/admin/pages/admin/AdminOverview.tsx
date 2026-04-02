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

export function AdminOverview({
  policy,
  users,
  onNavigate,
}: {
  policy: AIPolicy | null;
  users: AdminUser[];
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
        // Fetch a little more than we show so we can safely cap without looking empty
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

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Overview</div>
              <div className="mt-1 text-sm text-gray-600">Quick health check and recent activity.</div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold text-gray-900">AI enabled roles</div>
              <div className="mt-2 text-sm text-gray-900">
                {policy?.enabledRoles?.length ? policy.enabledRoles.join(", ") : "None"}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Updated:{" "}
                <span className="font-medium text-gray-900">
                  {policy?.updatedAt ? formatAuditTime(policy.updatedAt) : "-"}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold text-gray-900">Org admins</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">{orgAdminCount}</div>
              <div className="mt-2 text-xs text-gray-600">Total users: {users.length}</div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-semibold text-gray-900">Shortcuts</div>
              <div className="mt-3 flex flex-col gap-2">
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
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Recent audit activity</div>
              <div className="mt-1 text-sm text-gray-600">Latest events (preview).</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => onNavigate("logs")}>
                Open search
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loadingLogs ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : recentLogs.length === 0 ? (
            <div className="text-sm text-gray-600">No recent logs</div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((l: AuditLogV2) => (
                <div key={l.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-gray-900">{clampSummary(l.summary)}</div>

                    <Badge variant="neutral" title={new Date(l.createdAt).toISOString()}>
                      {formatAuditTime(l.createdAt)}
                    </Badge>

                    <Badge variant={l.riskLevel === "high" ? "warning" : "neutral"}>{l.riskLevel}</Badge>
                  </div>

                  <div className="mt-2 text-xs text-gray-600">
                    {l.actor?.email ?? l.actor?.name ?? l.userId}
                    {l.document?.title ? ` : ${l.document.title}` : ""}
                  </div>
                </div>
              ))}

              <div className="pt-1 text-xs text-gray-500">
                Showing {Math.min(PREVIEW_COUNT, recentLogs.length)} recent events. Use “Open search” for full history.
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}