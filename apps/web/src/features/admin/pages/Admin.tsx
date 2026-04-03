// apps/web/src/pages/Admin.tsx

import React, { useEffect, useMemo, useState } from "react";
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
import { Badge } from "../../../components/ui/Badge";

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-gray-900">Admin console</h1>
          <div className="mt-1 text-sm text-gray-600">
            Manage membership, AI policy, and audit activity.
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium text-red-900">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <div className="border-b border-gray-200 bg-white px-5 py-4">
              <div className="text-sm font-semibold text-gray-900">Navigation</div>
              <div className="mt-1 text-xs text-gray-600">Pick an admin area.</div>
            </div>

            <div className="p-2">
              <AdminNavItem
                label="Overview"
                active={section === "overview"}
                onClick={() => setSection("overview")}
                right={<Badge variant="neutral">{users.length} users</Badge>}
              />
              <AdminNavItem
                label="AI policy"
                active={section === "ai"}
                onClick={() => setSection("ai")}
                right={<Badge variant="neutral">{policy?.enabledRoles?.length ?? 0} roles</Badge>}
              />
              <AdminNavItem
                label="Members"
                active={section === "members"}
                onClick={() => setSection("members")}
                right={<Badge variant="neutral">{orgAdminCount} admins</Badge>}
              />
              <AdminNavItem
                label="Audit logs"
                active={section === "logs"}
                onClick={() => setSection("logs")}
                right={<Badge variant="neutral">Search</Badge>}
              />
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-xs text-gray-600">Org admins</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{orgAdminCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-gray-600">Users</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{users.length}</div>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-9">
          {section === "overview" && (
            <AdminOverview policy={policy} users={users} onNavigate={setSection} />
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
  active,
  onClick,
  right,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors",
        active ? "bg-gray-900 text-white" : "text-gray-800 hover:bg-gray-100"
      )}
      aria-pressed={active}
    >
      <span className="text-sm font-medium">{label}</span>
      {right}
    </button>
  );
}