// apps/web/src/features/admin/pages/admin/AdminAIPolicy.tsx

import { useEffect, useMemo, useState } from "react";
import type { AIPolicy } from "../../../../features/admin/api";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Badge } from "../../../../components/ui/Badge";
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
    <Card className="overflow-hidden">
      <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">AI policy</div>
            <div className="mt-1 text-sm text-gray-600">
              Configure which roles can use AI and set daily quotas.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Roles: {policy?.enabledRoles?.length ?? enabledRoles.length}</Badge>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-900">Enabled roles</div>
            <div className="mt-3 space-y-2">
              <Checkbox
                checked={enabledEditor}
                onChange={setEnabledEditor}
                label="Editor"
                description="Can request suggestions and summaries."
              />
              <Checkbox
                checked={enabledOwner}
                onChange={setEnabledOwner}
                label="Owner"
                description="Can request suggestions and manage settings."
              />
            </div>
            <div className="mt-3 text-xs text-gray-600">
              Current:{" "}
              <span className="font-medium text-gray-900">
                {policy?.enabledRoles.join(", ") ?? "-"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-900">Daily quotas</div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Per user per day</label>
                <div className="mt-2">
                  <Input
                    value={perUserPerDay}
                    onChange={(e) => setPerUserPerDay(e.target.value)}
                    placeholder="Example: 50"
                    inputMode="numeric"
                  />
                </div>
                <div className="mt-1 text-xs text-gray-500">Limits usage for each individual user.</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">Per org per day</label>
                <div className="mt-2">
                  <Input
                    value={perOrgPerDay}
                    onChange={(e) => setPerOrgPerDay(e.target.value)}
                    placeholder="Example: 500"
                    inputMode="numeric"
                  />
                </div>
                <div className="mt-1 text-xs text-gray-500">Caps total org-wide usage.</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              Updated:{" "}
              <span className="font-medium text-gray-900">
                {policy?.updatedAt ? formatDateTime(policy.updatedAt) : "-"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-900">Actions</div>
            <div className="mt-3 space-y-2">
              <Button variant="primary" onClick={save} disabled={savingPolicy} className="w-full">
                {savingPolicy ? "Saving..." : "Save policy"}
              </Button>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Enabled roles must be a subset of Editor and Owner.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}