// apps/web/src/pages/Admin.tsx

import { useEffect, useMemo, useState } from "react";
import {
  createOrgInvite,
  getAIPolicy,
  listOrgInvites,
  listUsers,
  resendOrgInvite,
  revokeOrgInvite,
  setUserOrgRole,
  updateAIPolicy,
  type AIPolicy,
  type AdminInvite,
  type AdminUser,
} from "../../../features/admin/api";

import { Card } from "../../../components/ui/Card";

import { AdminOverview } from "./admin/AdminOverview";
import { AdminAIPolicy } from "./admin/AdminAIPolicy";
import { AdminMembers } from "./admin/AdminMembers";
import { AdminAuditLogs } from "./admin/AdminAuditLogs";

type Props = {
  onBack?: () => void;
};

export type AdminSection = "overview" | "ai" | "members" | "logs";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AdminPage({ onBack: _onBack }: Props) {
  const [section, setSection] = useState<AdminSection>("overview");

  const [policy, setPolicy] = useState<AIPolicy | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);

  const [error, setError] = useState<string | null>(null);

  const orgAdminCount = useMemo(
    () => users.filter((u) => u.orgRole === "OrgAdmin").length,
    [users]
  );

  async function loadBase() {
    setError(null);
    try {
      const [p, u, i] = await Promise.all([getAIPolicy(), listUsers(), listOrgInvites()]);
      setPolicy(p);
      setUsers(u);
      setInvites(i);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load admin data");
    }
  }

  useEffect(() => {
    loadBase();
  }, []);

  async function savePolicy(input: {
    enabledRoles: Array<"Editor" | "Owner">;
    quotaPolicy: any;
  }) {
    setError(null);
    const updated = await updateAIPolicy(input);
    setPolicy(updated);
    return updated;
  }

  async function toggleOrgAdmin(userId: string, makeAdmin: boolean) {
    setError(null);
    const updated = await setUserOrgRole(userId, makeAdmin ? "OrgAdmin" : null);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, orgRole: updated.orgRole } : u))
    );
    return updated;
  }

  async function handleCreateInvite(input: { email: string; orgRole: "Member" | "OrgAdmin" }) {
    setError(null);
    const created = await createOrgInvite(input);
    setInvites((prev) => [created, ...prev]);
    return created;
  }

  async function handleRevokeInvite(inviteId: string) {
    setError(null);
    await revokeOrgInvite(inviteId);
    setInvites((prev) =>
      prev.map((invite) =>
        invite.id === inviteId ? { ...invite, status: "revoked" } : invite
      )
    );
  }

  async function handleResendInvite(inviteId: string) {
    setError(null);
    const updated = await resendOrgInvite(inviteId);
    setInvites((prev) => prev.map((invite) => (invite.id === inviteId ? updated : invite)));
    return updated;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {error && (
        <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 shadow-sm">
          <div className="font-semibold text-red-900">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <div className="border-b border-slate-200 bg-white px-5 py-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Navigation
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                Admin areas
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Move between core workspace controls.
              </div>
            </div>

            <div className="p-3">
              <div className="space-y-2">
                <AdminNavItem
                  label="Overview"
                  description="Health, activity, and shortcuts"
                  active={section === "overview"}
                  onClick={() => setSection("overview")}
                />
                <AdminNavItem
                  label="AI policy"
                  description="Roles, quotas, and controls"
                  active={section === "ai"}
                  onClick={() => setSection("ai")}
                />
                <AdminNavItem
                  label="Members"
                  description="Users, invites, and admin access"
                  active={section === "members"}
                  onClick={() => setSection("members")}
                />
                <AdminNavItem
                  label="Audit logs"
                  description="Search and review activity"
                  active={section === "logs"}
                  onClick={() => setSection("logs")}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-9">
{section === "overview" && (
  <AdminOverview
    policy={policy}
    users={users}
    orgAdminCount={orgAdminCount}
    onNavigate={setSection}
  />
)}

          {section === "ai" && <AdminAIPolicy policy={policy} onSave={savePolicy} />}

          {section === "members" && (
            <AdminMembers
              users={users}
              invites={invites}
              onToggleOrgAdmin={toggleOrgAdmin}
              onUsersChanged={setUsers}
              onCreateInvite={handleCreateInvite}
              onRevokeInvite={handleRevokeInvite}
              onResendInvite={handleResendInvite}
            />
          )}

          {section === "logs" && <AdminAuditLogs />}
        </div>
      </div>
    </div>
  );
}

function AdminNavItem({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-150",
        active
          ? "border-slate-900 bg-slate-950 text-white shadow-sm shadow-slate-950/10"
          : "border-transparent bg-white text-slate-800 hover:border-slate-200 hover:bg-slate-50"
      )}
      aria-pressed={active}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold tracking-tight">{label}</div>
        {description ? (
          <div className={cx("mt-1 text-xs", active ? "text-slate-300" : "text-slate-500")}>
            {description}
          </div>
        ) : null}
      </div>
    </button>
  );
}