import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Badge } from "../../../../components/ui/Badge";
import { Collapsible } from "../../../../components/ui/Collapsible";
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

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Could not render metadata";
  }
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
    createdAt: typeof l.createdAt === "string" ? l.createdAt : new Date(l.createdAt).toISOString(),
    actor: l.actor
      ? { id: String(l.actor.id), name: l.actor.name ?? undefined, email: l.actor.email ?? undefined }
      : undefined,
    document: l.document
      ? { id: String(l.document.id), title: l.document.title ?? undefined }
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

  if (filters.actionTypes.length > 0 && !filters.actionTypes.includes(log.actionType)) return false;

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

function previewMetadata(meta: unknown) {
  if (!meta) return "No metadata";
  if (typeof meta === "string") return meta.slice(0, 80);
  if (typeof meta === "number" || typeof meta === "boolean") return String(meta);
  if (Array.isArray(meta)) return `Array(${meta.length})`;
  if (typeof meta === "object") {
    const keys = Object.keys(meta as Record<string, unknown>);
    return keys.length
      ? `Keys: ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? "…" : ""}`
      : "Object";
  }
  return "Metadata";
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
  return log.document?.title ?? "Document";
}

function getTargetSecondary(log: AuditLogV2) {
  return log.documentId ? truncateMiddle(log.documentId, 8, 6) : null;
}

function summarizeMetadataLine(log: AuditLogV2) {
  const meta = log.metadata as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== "object") return null;

  if (log.actionType === "PERMISSION_GRANTED" || log.actionType === "PERMISSION_REVOKED") {
    const role = typeof meta.role === "string" ? meta.role : null;
    const principalType = typeof meta.principalType === "string" ? meta.principalType : null;
    const principalId = typeof meta.principalId === "string" ? meta.principalId : null;

    const pieces = [];
    if (role) pieces.push(role);
    if (principalType) pieces.push(principalType);
    if (principalId) pieces.push(truncateMiddle(principalId, 8, 6));

    return pieces.length ? pieces.join(" · ") : null;
  }

  if (log.actionType === "COMMENT_CREATED" || log.actionType === "COMMENT_RESOLVED") {
    const commentId = typeof meta.commentId === "string" ? meta.commentId : null;
    const parentCommentId = typeof meta.parentCommentId === "string" ? meta.parentCommentId : null;

    const pieces = [];
    if (commentId) pieces.push(`Comment ${truncateMiddle(commentId, 8, 6)}`);
    if (parentCommentId) pieces.push(`Reply to ${truncateMiddle(parentCommentId, 8, 6)}`);

    return pieces.length ? pieces.join(" · ") : null;
  }

  return null;
}

function getRiskBadgeVariant(risk: AuditLogV2["riskLevel"]) {
  if (risk === "high") return "warning" as const;
  if (risk === "medium") return "neutral" as const;
  return "neutral" as const;
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
    if (typeof meta.principalType === "string") rows.push({ label: "Access type", value: meta.principalType });
    if (typeof meta.principalId === "string") {
      rows.push({ label: "Recipient", value: truncateMiddle(meta.principalId, 10, 8) });
    }
    if (typeof meta.previousRole === "string") rows.push({ label: "Previous role", value: meta.previousRole });
    return rows;
  }

  if (actionType === "COMMENT_CREATED" || actionType === "COMMENT_RESOLVED") {
    if (typeof meta.commentId === "string") {
      rows.push({ label: "Comment", value: truncateMiddle(meta.commentId, 10, 8) });
    }
    if (typeof meta.parentCommentId === "string") {
      rows.push({ label: "Parent comment", value: truncateMiddle(meta.parentCommentId, 10, 8) });
    }
    return rows;
  }

  if (actionType === "AI_JOB_APPLIED" || actionType === "AI_POLICY_UPDATED") {
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        rows.push({ label: k, value: String(v) });
      }
    }
    return rows;
  }

  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      rows.push({ label: k, value: String(v) });
    }
  }

  return rows;
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
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
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
    loadLogs(true);
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
              Search refines the results. Export downloads what you see.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 text-xs text-gray-600"
              title={socketConnected ? "Live updates on" : "Live updates off"}
              aria-label={socketConnected ? "Live updates on" : "Live updates off"}
            >
              <span className={cx("h-2 w-2 rounded-full", socketConnected ? "bg-green-600" : "bg-gray-300")} />
              <span>{socketConnected ? "Live" : "Updates off"}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 px-0 pb-5 sm:grid-cols-12 sm:gap-3">
          <div className="sm:col-span-6">
            <Input
              value={logQ}
              onChange={(e) => setLogQ(e.target.value)}
              placeholder="Search actor, doc, action, summary..."
            />
          </div>

          <div className="sm:col-span-6 flex flex-wrap items-center justify-start gap-2">
            <TimeChip active={timePreset === "today"} label="Today" onClick={() => setTimePreset("today")} />
            <TimeChip active={timePreset === "24h"} label="24h" onClick={() => setTimePreset("24h")} />
            <TimeChip active={timePreset === "7d"} label="7d" onClick={() => setTimePreset("7d")} />
            <TimeChip active={timePreset === "30d"} label="30d" onClick={() => setTimePreset("30d")} />
            <TimeChip active={timePreset === "all"} label="All" onClick={() => setTimePreset("all")} />
            <TimeChip active={timePreset === "custom"} label="Custom" onClick={() => setTimePreset("custom")} />
          </div>

          {timePreset === "custom" && (
            <>
              <div className="sm:col-span-3">
                <Input
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  placeholder="From date"
                  type="date"
                />
              </div>
              <div className="sm:col-span-3">
                <Input
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  placeholder="To date"
                  type="date"
                />
              </div>
              <div className="sm:col-span-6 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={logRiskOnly} onChange={(e) => setLogRiskOnly(e.target.checked)} />
                  High/medium only
                </label>
              </div>
            </>
          )}

          {timePreset !== "custom" && (
            <div className="sm:col-span-12 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={logRiskOnly} onChange={(e) => setLogRiskOnly(e.target.checked)} />
                High/medium only
              </label>
            </div>
          )}

          <div className="sm:col-span-12">
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

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 bg-white">
              {logs.map((l: AuditLogV2) => {
                const isRemoving = removingLogId === l.id;
                const actorPrimary = getActorPrimary(l);
                const actorSecondary = getActorSecondary(l);
                const targetPrimary = getTargetPrimary(l);
                const targetSecondary = getTargetSecondary(l);
                const metaLine = summarizeMetadataLine(l);

                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLogSelected(l)}
                    className="grid w-full grid-cols-12 gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="col-span-2 text-xs text-gray-700" title={formatExactAuditTime(l.createdAt)}>
                      {formatAuditTime(l.createdAt)}
                    </div>

                    <div className="col-span-3 min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{actorPrimary}</div>
                      {actorSecondary && <div className="mt-0.5 truncate text-xs text-gray-500">{actorSecondary}</div>}
                    </div>

                    <div className="col-span-2 min-w-0">
                      <div className="truncate text-sm text-gray-800">{formatActionTypeLabel(l.actionType)}</div>
                    </div>

                    <div className="col-span-3 min-w-0">
                      <div className="truncate text-sm text-gray-900">{targetPrimary}</div>
                      {targetSecondary && <div className="mt-0.5 truncate text-xs text-gray-500">{targetSecondary}</div>}
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

                    <div className="col-span-12 mt-1">
                      <div className="text-sm text-gray-700">{l.summary}</div>
                      {metaLine && <div className="mt-1 text-xs text-gray-500">{metaLine}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {logHasMore && logNextCursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => loadLogs(false)}>
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

function ActionTypePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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
              active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            )}
          >
            {t}
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

function DetailCard({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-base font-medium text-gray-900">{primary}</div>
      {secondary ? <div className="mt-1 text-sm text-gray-500">{secondary}</div> : null}
    </div>
  );
}

function MetadataSummaryGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
          <div className="mt-1 break-words text-sm text-gray-900">{item.value}</div>
        </div>
      ))}
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
  const actorSecondary = log.actor?.id
    ? `ID: ${truncateMiddle(log.actor.id, 10, 8)}`
    : `ID: ${truncateMiddle(log.userId, 10, 8)}`;

  const targetPrimary = getTargetPrimary(log);
  const targetSecondary = log.document?.id
    ? `Document ID: ${truncateMiddle(log.document.id, 10, 8)}`
    : log.documentId
      ? `Document ID: ${truncateMiddle(log.documentId, 10, 8)}`
      : null;

  const metadataItems = humanizeMetadata(log.actionType, log.metadata);
  const hasDetails = metadataItems.length > 0 || Boolean(log.metadata);

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="Close audit log details"
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xl font-semibold text-gray-900">{formatActionTypeLabel(log.actionType)}</div>
              <div className="mt-1 text-sm text-gray-600">{log.summary}</div>
              <div className="mt-2 text-sm text-gray-500" title={new Date(log.createdAt).toISOString()}>
                {formatAuditTime(log.createdAt)} · {formatExactAuditTime(log.createdAt)}
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

        <div className="space-y-5 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getRiskBadgeVariant(log.riskLevel)}>{log.riskLevel}</Badge>
            <Badge variant="neutral">{formatActionTypeLabel(log.actionType)}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailCard title="Actor" primary={actorPrimary} secondary={actorSecondary} />
            <DetailCard title="Target" primary={targetPrimary} secondary={targetSecondary} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">What happened</div>
            <div className="mt-2 text-sm leading-6 text-gray-700">{log.summary}</div>
          </div>

          {hasDetails && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">Details</div>

              {metadataItems.length > 0 && (
                <div className="mt-3">
                  <MetadataSummaryGrid items={metadataItems} />
                </div>
              )}

              {Boolean(log.metadata) && (
                <div className="mt-4">
                  <Collapsible title="Raw metadata JSON" preview={previewMetadata(log.metadata)}>
                    <pre className="mt-3 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                      {safeJson(log.metadata)}
                    </pre>
                  </Collapsible>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}