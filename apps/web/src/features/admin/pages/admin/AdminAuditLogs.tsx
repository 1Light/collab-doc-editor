import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Badge } from "../../../../components/ui/Badge";
import { connectSocket } from "../../../../features/realtime/socket";
import {
  deleteAuditLog,
  listAuditLogsV2,
  type AuditLogV2,
  type AuditTab,
} from "../../../../features/admin/api";

const PAGE_SIZE = 50;

type TimePreset = "today" | "24h" | "7d" | "30d" | "all" | "custom";

function formatAuditTime(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

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
    const md = d.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
    return `${md} · ${time}`;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} · ${time}`;
}

function formatExactAuditTime(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getOrgId(): string | null {
  const raw = localStorage.getItem("orgId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatActionTypeLabel(actionType: string) {
  return actionType
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeLogV2(l: any): AuditLogV2 {
  return {
    id: String(l.id),
    orgId: l.orgId ?? undefined,
    userId: String(l.userId),
    actionType: String(l.actionType),
    documentId: l.documentId ?? undefined,
    metadata: l.metadata ?? undefined,
    createdAt:
      typeof l.createdAt === "string"
        ? l.createdAt
        : new Date(l.createdAt).toISOString(),
    actor: l.actor
      ? {
          id: String(l.actor.id),
          name: l.actor.name ?? undefined,
          email: l.actor.email ?? undefined,
        }
      : undefined,
    document: l.document
      ? {
          id: String(l.document.id),
          title: l.document.title ?? undefined,
        }
      : undefined,
    summary: String(l.summary ?? l.actionType),
    riskLevel: (l.riskLevel ?? "low") as any,
  };
}

function matchesFilters(
  log: AuditLogV2,
  filters: { q: string; actionTypes: string[]; from?: string; to?: string; riskOnly?: boolean }
) {
  const q = filters.q.trim().toLowerCase();
  if (q) {
    const hay = [
      log.summary,
      log.actionType,
      log.actor?.name ?? "",
      log.actor?.email ?? "",
      log.document?.title ?? "",
      log.documentId ?? "",
      log.userId,
    ]
      .join(" ")
      .toLowerCase();

    if (!hay.includes(q)) return false;
  }

  if (filters.actionTypes.length > 0 && !filters.actionTypes.includes(log.actionType)) {
    return false;
  }

  const t = new Date(log.createdAt).getTime();

  if (filters.from) {
    const fromT = new Date(filters.from).getTime();
    if (!Number.isNaN(fromT) && t < fromT) return false;
  }

  if (filters.to) {
    const toT = new Date(filters.to).getTime();
    if (!Number.isNaN(toT) && t > toT) return false;
  }

  if (filters.riskOnly && log.riskLevel === "low") return false;

  return true;
}

function startOfDayISO(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return d.toISOString();
}

function endOfDayISO(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T23:59:59.999`);
  return d.toISOString();
}

function computePresetRange(preset: TimePreset, customFrom: string, customTo: string) {
  const now = new Date();

  if (preset === "all") {
    return { from: undefined as string | undefined, to: undefined as string | undefined };
  }

  if (preset === "custom") {
    const from = customFrom.trim() ? startOfDayISO(customFrom.trim()) : undefined;
    const to = customTo.trim() ? endOfDayISO(customTo.trim()) : undefined;
    return { from, to };
  }

  if (preset === "today") {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const s = `${y}-${m}-${d}`;
    return { from: startOfDayISO(s), to: endOfDayISO(s) };
  }

  const ms =
    preset === "24h"
      ? 24 * 60 * 60 * 1000
      : preset === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  const fromDate = new Date(now.getTime() - ms);
  return { from: fromDate.toISOString(), to: now.toISOString() };
}

function truncateMiddle(value: string, head = 6, tail = 4) {
  const v = (value ?? "").trim();
  if (!v) return "—";
  if (v.length <= head + tail + 3) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

function getActorPrimary(log: AuditLogV2) {
  return log.actor?.email ?? log.actor?.name ?? "Unknown actor";
}

function getActorSecondary(log: AuditLogV2) {
  if (log.actor?.name && log.actor?.email) return log.actor.name;
  return null;
}

function getTargetPrimary(log: AuditLogV2) {
  return log.document?.title ?? (log.documentId ? truncateMiddle(log.documentId, 8, 6) : "—");
}

function getTargetSecondary(log: AuditLogV2) {
  return log.documentId ? truncateMiddle(log.documentId, 8, 6) : null;
}

function getRiskBadgeVariant(risk: AuditLogV2["riskLevel"]) {
  if (risk === "high") return "warning" as const;
  if (risk === "medium") return "neutral" as const;
  return "neutral" as const;
}

function humanizeLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function humanizeMetadata(
  actionType: string,
  metadata: unknown
): Array<{ label: string; value: string }> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  const meta = metadata as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];

  if (actionType === "PERMISSION_GRANTED" || actionType === "PERMISSION_REVOKED") {
    if (typeof meta.role === "string") rows.push({ label: "Role", value: meta.role });
    if (typeof meta.principalType === "string") {
      rows.push({ label: "Access type", value: meta.principalType });
    }
    if (typeof meta.principalId === "string") {
      rows.push({ label: "Recipient", value: truncateMiddle(meta.principalId, 10, 8) });
    }
    if (typeof meta.previousRole === "string") {
      rows.push({ label: "Previous role", value: meta.previousRole });
    }
    return rows;
  }

  if (actionType === "COMMENT_CREATED" || actionType === "COMMENT_RESOLVED") {
    if (typeof meta.commentId === "string") {
      rows.push({ label: "Comment ID", value: truncateMiddle(meta.commentId, 10, 8) });
    }
    if (typeof meta.parentCommentId === "string") {
      rows.push({
        label: "Parent comment",
        value: truncateMiddle(meta.parentCommentId, 10, 8),
      });
    }
    return rows;
  }

  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      rows.push({ label: humanizeLabel(k), value: String(v) });
    }
  }

  return rows;
}

function getFriendlySummary(log: AuditLogV2) {
  const actor = getActorPrimary(log);
  const target = getTargetPrimary(log);

  switch (log.actionType) {
    case "DOCUMENT_CREATED":
      return `${actor} created ${target}.`;
    case "DOCUMENT_DELETED":
      return `${actor} deleted ${target}.`;
    case "PERMISSION_GRANTED":
      return `${actor} granted access to ${target}.`;
    case "PERMISSION_REVOKED":
      return `${actor} revoked access to ${target}.`;
    case "VERSION_REVERTED":
      return `${actor} reverted ${target} to an earlier version.`;
    case "COMMENT_CREATED":
      return `${actor} added a comment on ${target}.`;
    case "COMMENT_RESOLVED":
      return `${actor} resolved a comment on ${target}.`;
    case "USER_ORG_ROLE_UPDATED":
      return `${actor} changed an organization role.`;
    case "ORG_INVITE_SENT":
      return `${actor} sent an organization invite.`;
    case "LOGIN_SUCCESS":
      return `${actor} signed in successfully.`;
    case "LOGIN_FAILED":
      return `A sign-in attempt failed for ${actor}.`;
    case "AI_POLICY_UPDATED":
      return `${actor} updated an AI policy.`;
    case "AI_JOB_APPLIED":
      return `${actor} applied an AI job action.`;
    default:
      return log.summary || formatActionTypeLabel(log.actionType);
  }
}

function TimeChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLogV2[]>([]);
  const [logQ, setLogQ] = useState("");
  const [activeTab] = useState<AuditTab>("documentCreated");
  const [timePreset, setTimePreset] = useState<TimePreset>("24h");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [logRiskOnly, setLogRiskOnly] = useState(false);
  const [logActionTypes, setLogActionTypes] = useState<string[]>([]);
  const [logHasMore, setLogHasMore] = useState(false);
  const [logNextCursor, setLogNextCursor] = useState<{ id: string; createdAt: string } | null>(null);
  const [logSelected, setLogSelected] = useState<AuditLogV2 | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [removingLogId, setRemovingLogId] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    return computePresetRange(timePreset, customFrom, customTo);
  }, [timePreset, customFrom, customTo]);

  async function loadLogs(initial: boolean) {
    const res = await listAuditLogsV2({
      limit: PAGE_SIZE,
      q: logQ.trim() || undefined,
      tab: logActionTypes.length ? undefined : activeTab,
      actionTypes: logActionTypes.length ? logActionTypes : undefined,
      from,
      to,
      cursor: initial ? undefined : logNextCursor ?? undefined,
    });

    const incoming = res.items.map(normalizeLogV2);
    const clientActionTypes = logActionTypes;

    const filteredIncoming = incoming.filter((l) =>
      matchesFilters(l, {
        q: logQ,
        actionTypes: clientActionTypes,
        from,
        to,
        riskOnly: logRiskOnly,
      })
    );

    if (initial) {
      setLogs(filteredIncoming);
    } else {
      setLogs((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const it of filteredIncoming) {
          if (!seen.has(it.id)) merged.push(it);
        }
        return merged;
      });
    }

    setLogHasMore(Boolean(res.hasMore));
    setLogNextCursor(res.nextCursor ?? null);
  }

  async function handleRemoveLog(logId: string) {
    const ok = window.confirm("Remove this audit log?");
    if (!ok) return;

    try {
      setRemovingLogId(logId);
      await deleteAuditLog(logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      setLogSelected((cur) => (cur?.id === logId ? null : cur));
    } catch (e: any) {
      window.alert(e?.message ?? "Failed to remove audit log");
    } finally {
      setRemovingLogId(null);
    }
  }

  useEffect(() => {
    setLogNextCursor(null);
    setLogHasMore(false);
    void loadLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, logQ, from ?? "", to ?? "", logRiskOnly, logActionTypes.join(",")]);

  const subscribedRef = useRef(false);
  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const s = connectSocket();

    const onConnect = () => {
      setSocketConnected(true);
      const orgId = getOrgId();
      if (orgId) {
        s.emit("org:join", { orgId });
        s.emit("admin:joinOrg", { orgId });
      }
    };

    const onDisconnect = () => setSocketConnected(false);

    const onAuditLogCreated = (payload: any) => {
      const raw = payload?.log;
      if (!raw) return;

      const incoming = normalizeLogV2(raw);

      if (logActionTypes.length && !logActionTypes.includes(incoming.actionType)) return;

      if (!logActionTypes.length) {
        const tabToTypes: Record<string, string[]> = {
          documentCreated: ["DOCUMENT_CREATED"],
          permissionGranted: ["PERMISSION_GRANTED"],
          permissionRevoked: ["PERMISSION_REVOKED"],
          commentCreated: ["COMMENT_CREATED", "COMMENT_RESOLVED"],
          versionReverted: ["VERSION_REVERTED"],
          aiPolicyUpdated: ["AI_POLICY_UPDATED"],
          loginSuccess: ["LOGIN_SUCCESS"],
          loginFailed: ["LOGIN_FAILED"],
        };

        const allowed = tabToTypes[activeTab] ?? [];
        if (allowed.length && !allowed.includes(incoming.actionType)) return;
      }

      const ok = matchesFilters(incoming, {
        q: logQ,
        actionTypes: logActionTypes,
        from,
        to,
        riskOnly: logRiskOnly,
      });

      if (!ok) return;

      setLogs((prev) => {
        const merged = [incoming, ...prev.filter((x) => x.id !== incoming.id)];
        return merged.slice(0, PAGE_SIZE);
      });
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("admin:auditLogCreated", onAuditLogCreated);

    if (s.connected) onConnect();

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("admin:auditLogCreated", onAuditLogCreated);
    };
  }, [activeTab, logQ, from ?? "", to ?? "", logRiskOnly, logActionTypes.join(",")]);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Audit logs</div>
            <div className="mt-1 text-sm text-gray-600">
              Search refines the results. Click a row to view full details.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 text-xs text-gray-600"
              title={socketConnected ? "Live updates on" : "Live updates off"}
              aria-label={socketConnected ? "Live updates on" : "Live updates off"}
            >
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  socketConnected ? "bg-green-600" : "bg-gray-300"
                )}
              />
              <span>{socketConnected ? "Live" : "Updates off"}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full max-w-lg">
              <Input
                value={logQ}
                onChange={(e) => setLogQ(e.target.value)}
                placeholder="Search logs..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TimeChip
                active={timePreset === "today"}
                label="Today"
                onClick={() => setTimePreset("today")}
              />
              <TimeChip
                active={timePreset === "24h"}
                label="24h"
                onClick={() => setTimePreset("24h")}
              />
              <TimeChip
                active={timePreset === "7d"}
                label="7d"
                onClick={() => setTimePreset("7d")}
              />
              <TimeChip
                active={timePreset === "30d"}
                label="30d"
                onClick={() => setTimePreset("30d")}
              />
              <TimeChip
                active={timePreset === "all"}
                label="All"
                onClick={() => setTimePreset("all")}
              />
              <TimeChip
                active={timePreset === "custom"}
                label="Custom"
                onClick={() => setTimePreset("custom")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={logRiskOnly}
                onChange={(e) => setLogRiskOnly(e.target.checked)}
              />
              High / medium only
            </label>

            {timePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  type="date"
                />
                <span className="text-slate-400">→</span>
                <Input
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  type="date"
                />
              </div>
            )}
          </div>

          <div>
            <ActionTypePicker value={logActionTypes} onChange={setLogActionTypes} />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {logs.length === 0 ? (
          <div className="text-sm text-gray-600">No matching logs</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <div className="grid grid-cols-12 gap-2 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-700">
              <div className="col-span-2">Time</div>
              <div className="col-span-3">Actor</div>
              <div className="col-span-2">Action</div>
              <div className="col-span-3">Target</div>
              <div className="col-span-1">Risk</div>
              <div className="col-span-1 text-right">Remove</div>
            </div>

            <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto bg-white">
              {logs.map((l: AuditLogV2) => {
                const isRemoving = removingLogId === l.id;
                const isSelected = logSelected?.id === l.id;
                const actorPrimary = getActorPrimary(l);
                const actorSecondary = getActorSecondary(l);
                const targetPrimary = getTargetPrimary(l);
                const targetSecondary = getTargetSecondary(l);

                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLogSelected(l)}
                    className={cx(
                      "grid w-full grid-cols-12 gap-2 px-4 py-3 text-left transition-colors",
                      isSelected ? "bg-slate-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div
                      className="col-span-2 text-xs text-gray-700"
                      title={formatExactAuditTime(l.createdAt)}
                    >
                      {formatAuditTime(l.createdAt)}
                    </div>

                    <div className="col-span-3 min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {actorPrimary}
                      </div>
                      {actorSecondary && (
                        <div className="mt-0.5 truncate text-xs text-gray-500">
                          {actorSecondary}
                        </div>
                      )}
                    </div>

                    <div className="col-span-2 min-w-0">
                      <div className="truncate text-sm text-gray-800">
                        {formatActionTypeLabel(l.actionType)}
                      </div>
                    </div>

                    <div className="col-span-3 min-w-0">
                      <div className="truncate text-sm text-gray-900">{targetPrimary}</div>
                      {targetSecondary && (
                        <div className="mt-0.5 truncate text-xs text-gray-500">
                          {targetSecondary}
                        </div>
                      )}
                    </div>

                    <div className="col-span-1">
                      <Badge variant={getRiskBadgeVariant(l.riskLevel)}>{l.riskLevel}</Badge>
                    </div>

                    <div className="col-span-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isRemoving}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleRemoveLog(l.id);
                        }}
                      >
                        {isRemoving ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {logHasMore && logNextCursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void loadLogs(false)}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {logSelected && (
        <AuditDrawer
          log={logSelected}
          removing={removingLogId === logSelected.id}
          onRemove={() => void handleRemoveLog(logSelected.id)}
          onClose={() => setLogSelected(null)}
        />
      )}
    </Card>
  );
}

function ActionTypePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const ALL = [
    "DOCUMENT_CREATED",
    "DOCUMENT_DELETED",
    "PERMISSION_GRANTED",
    "PERMISSION_REVOKED",
    "VERSION_REVERTED",
    "COMMENT_CREATED",
    "COMMENT_RESOLVED",
    "USER_ORG_ROLE_UPDATED",
    "ORG_INVITE_SENT",
    "LOGIN_FAILED",
    "LOGIN_SUCCESS",
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {ALL.map((t) => {
        const active = value.includes(t);

        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              if (active) onChange(value.filter((x) => x !== t));
              else onChange([...value, t]);
            }}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {formatActionTypeLabel(t)}
          </button>
        );
      })}

      {value.length > 0 && (
        <Button variant="secondary" size="sm" onClick={() => onChange([])}>
          Clear
        </Button>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="min-w-0 break-words text-right text-sm font-medium text-gray-900">
        {value}
      </div>
    </div>
  );
}

function AuditDrawer({
  log,
  removing,
  onRemove,
  onClose,
}: {
  log: AuditLogV2;
  removing: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const actorPrimary = getActorPrimary(log);
  const actorIdValue = log.actor?.id
    ? truncateMiddle(log.actor.id, 10, 8)
    : truncateMiddle(log.userId, 10, 8);

  const targetPrimary = getTargetPrimary(log);
  const documentIdValue = log.document?.id
    ? truncateMiddle(log.document.id, 10, 8)
    : log.documentId
      ? truncateMiddle(log.documentId, 10, 8)
      : null;

  const metadataItems = humanizeMetadata(log.actionType, log.metadata);
  const friendlySummary = getFriendlySummary(log);

  const detailRows: Array<{ label: string; value: string }> = [
    { label: "Action", value: formatActionTypeLabel(log.actionType) },
    { label: "When", value: formatExactAuditTime(log.createdAt) },
    { label: "Risk", value: log.riskLevel },
    { label: "Actor", value: actorPrimary },
    { label: "Actor ID", value: actorIdValue },
    { label: "Target", value: targetPrimary },
  ];

  if (documentIdValue) {
    detailRows.push({ label: "Document ID", value: documentIdValue });
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="Close audit log details"
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xl font-semibold text-gray-900">
                {formatActionTypeLabel(log.actionType)}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                Review the event summary and key details.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={removing} onClick={onRemove}>
                {removing ? "Removing..." : "Remove"}
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getRiskBadgeVariant(log.riskLevel)}>{log.riskLevel}</Badge>
            <Badge variant="neutral">{formatActionTypeLabel(log.actionType)}</Badge>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-gray-900">Summary</div>
            <div className="mt-2 text-sm leading-6 text-gray-700">{friendlySummary}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">Details</div>
            <div className="mt-3 space-y-3">
              {detailRows.map((item) => (
                <DetailRow key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
              ))}
            </div>
          </div>

          {metadataItems.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">Additional details</div>
              <div className="mt-3 space-y-3">
                {metadataItems.map((item) => (
                  <DetailRow key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}