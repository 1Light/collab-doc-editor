// apps/web/src/features/admin/pages/admin/AdminAIPolicy.tsx

import { useEffect, useMemo, useState } from "react";
import type { AIPolicy } from "../../../../features/admin/api";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Checkbox } from "../../../../components/ui/Checkbox";

function toNum(v: string): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function formatDateTime(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminAIPolicy({
  policy,
  onSave,
}: {
  policy: AIPolicy | null;
  onSave: (input: { enabledRoles: Array<"Editor" | "Owner">; quotaPolicy: any }) => Promise<any>;
}) {
  const [enabledEditor, setEnabledEditor] = useState(true);
  const [enabledOwner, setEnabledOwner] = useState(true);
  const [perUserPerDay, setPerUserPerDay] = useState<string>("50");
  const [perOrgPerDay, setPerOrgPerDay] = useState<string>("500");
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    if (!policy) return;
    setEnabledEditor(policy.enabledRoles.includes("Editor"));
    setEnabledOwner(policy.enabledRoles.includes("Owner"));
    setPerUserPerDay(String(policy.quotaPolicy.perUserPerDay ?? ""));
    setPerOrgPerDay(String(policy.quotaPolicy.perOrgPerDay ?? ""));
  }, [policy]);

  const enabledRoles = useMemo(() => {
    const roles: Array<"Editor" | "Owner"> = [];
    if (enabledEditor) roles.push("Editor");
    if (enabledOwner) roles.push("Owner");
    return roles;
  }, [enabledEditor, enabledOwner]);

  async function save() {
    setSavingPolicy(true);
    try {
      const perUser = toNum(perUserPerDay);
      const perOrg = toNum(perOrgPerDay);

      await onSave({
        enabledRoles,
        quotaPolicy: {
          ...(perUser !== undefined ? { perUserPerDay: perUser } : {}),
          ...(perOrg !== undefined ? { perOrgPerDay: perOrg } : {}),
        },
      });
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
      
      {/* HEADER */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-white px-6 py-5 sm:px-7">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            AI policy
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Configure AI access
          </div>
          <div className="mt-2 text-sm text-slate-600">
            Choose which roles can use AI and define daily usage limits.
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="p-6 sm:p-7 space-y-6">

        {/* ROLES */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Enabled roles
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Checkbox
                checked={enabledEditor}
                onChange={setEnabledEditor}
                label="Editor"
                description="Can request suggestions and summaries."
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Checkbox
                checked={enabledOwner}
                onChange={setEnabledOwner}
                label="Owner"
                description="Can request suggestions and manage settings."
              />
            </div>
          </div>

          <div className="mt-5 text-sm text-slate-600">
            Current:{" "}
            <span className="font-semibold text-slate-900">
              {policy?.enabledRoles.join(", ") ?? "-"}
            </span>
          </div>
        </div>

        {/* QUOTAS */}
        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Daily quotas
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="text-xs font-medium text-slate-500">
                Per user per day
              </label>
              <div className="mt-2">
                <Input
                  value={perUserPerDay}
                  onChange={(e) => setPerUserPerDay(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="text-xs font-medium text-slate-500">
                Per org per day
              </label>
              <div className="mt-2">
                <Input
                  value={perOrgPerDay}
                  onChange={(e) => setPerOrgPerDay(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 text-xs text-slate-500">
            Updated:{" "}
            <span className="font-medium text-slate-900">
              {policy?.updatedAt ? formatDateTime(policy.updatedAt) : "-"}
            </span>
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={save}
            disabled={savingPolicy}
            className="px-6"
          >
            {savingPolicy ? "Saving..." : "Save policy"}
          </Button>
        </div>

      </div>
    </Card>
  );
}