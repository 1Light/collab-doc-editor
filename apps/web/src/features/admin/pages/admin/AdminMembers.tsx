// apps/web/src/features/admin/pages/admin/AdminMembers.tsx
import { useMemo, useState } from "react";
import type { AdminUser, OrgRole } from "../../../../features/admin/api";
import { removeUserFromOrg } from "../../../../features/admin/api";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Badge } from "../../../../components/ui/Badge";

type RoleFilter = "all" | "admins" | "members";
type InviteRole = "Member" | "OrgAdmin";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type AdminInvite = {
  id: string;
  email: string;
  orgRole: InviteRole;
  status: InviteStatus;
  invitedByName?: string;
  invitedByEmail?: string;
  expiresAt: string;
  createdAt: string;
  inviteLink?: string;
};

function formatDate(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
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

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getCurrentUserId(): string | null {
  const direct = localStorage.getItem("userId");
  if (direct && direct.trim()) return direct.trim();

  const userJson = localStorage.getItem("user");
  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      if (u?.id) return String(u.id);
    } catch {
      // ignore
    }
  }
  return null;
}

function isOrgAdminLike(role: OrgRole) {
  return role === "OrgAdmin" || role === "OrgOwner";
}

function roleLabel(role: OrgRole) {
  if (role === "OrgOwner") return "OrgOwner";
  if (role === "OrgAdmin") return "OrgAdmin";
  return "Member";
}

function inviteRoleLabel(role: InviteRole) {
  return role === "OrgAdmin" ? "OrgAdmin" : "Member";
}

function inviteStatusLabel(status: InviteStatus) {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "revoked") return "Revoked";
  return "Expired";
}

function canRemoveUser(params: {
  currentUserId: string | null;
  targetUser: AdminUser;
  orgAdminCount: number;
}) {
  const { currentUserId, targetUser, orgAdminCount } = params;

  if (currentUserId && currentUserId === targetUser.id) return { ok: false, reason: "You" };
  if (targetUser.orgRole === "OrgOwner") return { ok: false, reason: "OrgOwner" };
  if (targetUser.orgRole === "OrgAdmin" && orgAdminCount <= 1) {
    return { ok: false, reason: "Last OrgAdmin" };
  }

  return { ok: true, reason: "" };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function AdminMembers({
  users,
  invites = [],
  onToggleOrgAdmin,
  onUsersChanged,
  onCreateInvite,
  onRevokeInvite,
  onResendInvite,
}: {
  users: AdminUser[];
  invites?: AdminInvite[];
  onToggleOrgAdmin: (userId: string, makeAdmin: boolean) => Promise<any>;
  onUsersChanged?: (users: AdminUser[]) => void;
  onCreateInvite?: (input: { email: string; orgRole: InviteRole }) => Promise<AdminInvite>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onResendInvite?: (inviteId: string) => Promise<AdminInvite | void>;
}) {
  const [memberQuery, setMemberQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("Member");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [localInvites, setLocalInvites] = useState<AdminInvite[]>(invites);

  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const orgAdminCount = useMemo(() => users.filter((u) => u.orgRole === "OrgAdmin").length, [users]);
  const orgOwnerCount = useMemo(() => users.filter((u) => u.orgRole === "OrgOwner").length, [users]);
  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);

  const effectiveInvites = useMemo(() => localInvites, [localInvites]);

  const pendingInvites = useMemo(
    () => effectiveInvites.filter((i) => i.status === "pending"),
    [effectiveInvites]
  );

  const filteredUsers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();

    return users
      .filter((u) => {
        const adminLike = isOrgAdminLike(u.orgRole);
        if (roleFilter === "admins" && !adminLike) return false;
        if (roleFilter === "members" && adminLike) return false;

        if (!q) return true;
        const name = (u.name ?? "").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .sort((a, b) => {
        const rank = (r: OrgRole) => (r === "OrgOwner" ? 0 : r === "OrgAdmin" ? 1 : 2);
        const ra = rank(a.orgRole);
        const rb = rank(b.orgRole);
        if (ra !== rb) return ra - rb;
        return (a.email ?? "").localeCompare(b.email ?? "");
      });
  }, [users, memberQuery, roleFilter]);

  async function toggle(user: AdminUser) {
    if (user.orgRole === "OrgOwner") {
      setUiError("OrgOwner role cannot be changed here.");
      return;
    }

    const isAdmin = user.orgRole === "OrgAdmin";
    setUiError(null);
    setBusyUserId(user.id);
    try {
      await onToggleOrgAdmin(user.id, !isAdmin);
      setOpenMenuUserId(null);
      onUsersChanged?.(users);
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to update role");
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeMember(user: AdminUser) {
    setUiError(null);

    const allow = canRemoveUser({
      currentUserId,
      targetUser: user,
      orgAdminCount,
    });

    if (!allow.ok) {
      if (allow.reason === "You") setUiError("You cannot remove yourself.");
      else if (allow.reason === "OrgOwner") {
        setUiError("You cannot remove the OrgOwner. Transfer ownership first.");
      } else {
        setUiError("You cannot remove the last OrgAdmin.");
      }
      return;
    }

    const ok = window.confirm(`Remove "${user.email}" from this organization?\n\nThey will lose access immediately.`);
    if (!ok) return;

    setBusyUserId(user.id);
    try {
      await removeUserFromOrg(user.id);

      const next = users.filter((u) => u.id !== user.id);
      onUsersChanged?.(next);

      setOpenMenuUserId(null);
      if (selectedUserId === user.id) setSelectedUserId(null);
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to remove user");
    } finally {
      setBusyUserId(null);
    }
  }

  async function submitInvite() {
    setUiError(null);

    const email = inviteEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setUiError("Please enter a valid work email.");
      return;
    }

    const existingUser = users.some((u) => (u.email ?? "").toLowerCase() === email);
    if (existingUser) {
      setUiError("That user is already a member of this organization.");
      return;
    }

    const existingPending = effectiveInvites.some(
      (i) => i.status === "pending" && i.email.toLowerCase() === email
    );
    if (existingPending) {
      setUiError("A pending invite already exists for that email.");
      return;
    }

    setInviteBusy(true);
    try {
      if (onCreateInvite) {
        const created = await onCreateInvite({ email, orgRole: inviteRole });
        setLocalInvites((prev) => [created, ...prev]);
      } else {
        const fakeInvite: AdminInvite = {
          id: `local-${Date.now()}`,
          email,
          orgRole: inviteRole,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
        setLocalInvites((prev) => [fakeInvite, ...prev]);
      }

      setInviteEmail("");
      setInviteRole("Member");
      setInviteModalOpen(false);
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to send invite");
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(invite: AdminInvite) {
    const ok = window.confirm(`Revoke invite for "${invite.email}"?`);
    if (!ok) return;

    setUiError(null);
    setBusyInviteId(invite.id);
    try {
      if (onRevokeInvite) {
        await onRevokeInvite(invite.id);
      }

      setLocalInvites((prev) =>
        prev.map((i) => (i.id === invite.id ? { ...i, status: "revoked" } : i))
      );
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to revoke invite");
    } finally {
      setBusyInviteId(null);
    }
  }

  async function resendInvite(invite: AdminInvite) {
    setUiError(null);
    setBusyInviteId(invite.id);
    try {
      if (onResendInvite) {
        const updated = await onResendInvite(invite.id);
        if (updated) {
          setLocalInvites((prev) => prev.map((i) => (i.id === invite.id ? updated : i)));
        }
      }
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to resend invite");
    } finally {
      setBusyInviteId(null);
    }
  }

  async function copyInviteLink(invite: AdminInvite) {
    setUiError(null);
    try {
      await navigator.clipboard.writeText(invite.inviteLink ?? invite.email);
    } catch (e: any) {
      setUiError(e?.message ?? "Failed to copy invite link");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
<div className="border-b border-slate-200 bg-white px-6 py-5">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

    {/* LEFT: title */}
    <div>
      <div className="text-lg font-semibold text-slate-950">Members</div>
      <div className="mt-1 text-sm text-slate-600">
        Manage organization membership and admin privileges.
      </div>
    </div>

    {/* RIGHT: actions */}
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
        <span>{users.length} users</span>
        <span>•</span>
        <span>{orgAdminCount} admins</span>
        <span>•</span>
        <span>{pendingInvites.length} pending</span>
      </div>

      <Button variant="primary" size="sm" onClick={() => setInviteModalOpen(true)}>
        Invite
      </Button>
    </div>
  </div>

  {uiError && (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {uiError}
    </div>
  )}

  {/* SEARCH + FILTER */}
  <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex-1 max-w-md">
      <Input
        value={memberQuery}
        onChange={(e) => setMemberQuery(e.target.value)}
        placeholder="Search users..."
      />
    </div>

    <div className="flex items-center gap-2">
      <RoleChip active={roleFilter === "all"} label="All" onClick={() => setRoleFilter("all")} />
      <RoleChip active={roleFilter === "admins"} label="Admins" onClick={() => setRoleFilter("admins")} />
      <RoleChip active={roleFilter === "members"} label="Members" onClick={() => setRoleFilter("members")} />
    </div>
  </div>
</div>

        <div className="relative">
          <div className="hidden grid-cols-12 gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold text-gray-700 sm:grid sm:px-6">
            <div className="col-span-4">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Joined</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-5 text-sm text-gray-600 sm:p-6">No matching users</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
              {filteredUsers.map((u) => {
                const isOwner = u.orgRole === "OrgOwner";
                const isAdmin = u.orgRole === "OrgAdmin";
                const joinedAt = (u as any).joinedAt as string | undefined;
                const isBusy = busyUserId === u.id;

                const allowRemove = canRemoveUser({
                  currentUserId,
                  targetUser: u,
                  orgAdminCount,
                });

                return (
                  <div
                    key={u.id}
                    className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-12 sm:items-center sm:gap-3 sm:px-6"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(u.id)}
                      className="col-span-4 min-w-0 text-left"
                    >
                      <div className="truncate text-sm font-medium text-gray-900">
                        {u.name || "Unnamed"}
                        {currentUserId && currentUserId === u.id ? (
                          <span className="ml-2 text-xs font-semibold text-gray-500">(you)</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 sm:hidden">
                        Created: {formatDate(u.createdAt)}
                      </div>
                    </button>

                    <div className="col-span-3 min-w-0 truncate text-sm text-gray-700">{u.email}</div>

                    <div className="col-span-2">
                      <Badge variant={isOwner ? "success" : isAdmin ? "success" : "neutral"}>
                        {roleLabel(u.orgRole)}
                      </Badge>
                    </div>

                    <div className="col-span-2 text-sm text-gray-700">
                      {joinedAt ? formatDate(joinedAt) : "—"}
                    </div>

                    <div className="col-span-1 relative flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOpenMenuUserId((prev) => (prev === u.id ? null : u.id))}
                        disabled={isBusy}
                      >
                        {isBusy ? "Working..." : "Actions"}
                      </Button>

                      {openMenuUserId === u.id && (
                        <div
                          className="absolute right-0 top-10 z-20 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
                          onMouseLeave={() => setOpenMenuUserId(null)}
                        >
                          <div className="px-3 py-2 text-xs font-semibold text-gray-700">{u.email}</div>
                          <div className="h-px bg-gray-100" />

                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setOpenMenuUserId(null);
                            }}
                          >
                            View details
                          </button>

                          <button
                            type="button"
                            className={cx(
                              "w-full px-3 py-2 text-left text-sm hover:bg-gray-50",
                              "text-gray-900",
                              (isOwner || isBusy) && "opacity-50"
                            )}
                            disabled={isOwner || isBusy}
                            title={isOwner ? "OrgOwner role cannot be changed here" : undefined}
                            onClick={() => toggle(u)}
                          >
                            {isAdmin ? "Remove OrgAdmin" : "Make OrgAdmin"}
                          </button>

                          <button
                            type="button"
                            className={cx(
                              "w-full px-3 py-2 text-left text-sm hover:bg-gray-50",
                              "text-red-700",
                              (!allowRemove.ok || isBusy) && "opacity-50"
                            )}
                            disabled={!allowRemove.ok || isBusy}
                            title={
                              !allowRemove.ok
                                ? allowRemove.reason === "You"
                                  ? "You cannot remove yourself"
                                  : allowRemove.reason === "OrgOwner"
                                    ? "You cannot remove the OrgOwner"
                                    : "You cannot remove the last OrgAdmin"
                                : "Remove member from organization"
                            }
                            onClick={() => removeMember(u)}
                          >
                            Remove from org
                          </button>

                          <div className="h-px bg-gray-100" />

                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(u.email);
                              } finally {
                                setOpenMenuUserId(null);
                              }
                            }}
                          >
                            Copy email
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="sm:hidden space-y-2">
                      <Button
                        variant={isAdmin ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => toggle(u)}
                        className="w-full"
                        disabled={isOwner || isBusy}
                      >
                        {isAdmin ? "Remove OrgAdmin" : "Make OrgAdmin"}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeMember(u)}
                        className="w-full"
                        disabled={!allowRemove.ok || isBusy}
                      >
                        Remove from org
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedUser && (
            <div className="fixed inset-0 z-30">
              <button
                type="button"
                className="absolute inset-0 bg-black/30"
                onClick={() => setSelectedUserId(null)}
                aria-label="Close member details"
              />
              <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {selectedUser.name || "Unnamed"}
                    </div>
                    <div className="mt-1 truncate text-sm text-gray-600">{selectedUser.email}</div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedUserId(null)}>
                    Close
                  </Button>
                </div>

                <div className="px-5 py-5">
                  <div className="flex items-center gap-2">
                    <Badge variant={isOrgAdminLike(selectedUser.orgRole) ? "success" : "neutral"}>
                      {roleLabel(selectedUser.orgRole)}
                    </Badge>
                    <Badge variant="neutral">Created: {formatDate(selectedUser.createdAt)}</Badge>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold text-gray-900">Membership</div>
                    <div className="mt-2 text-sm text-gray-700">
                      Joined:{" "}
                      <span className="font-medium text-gray-900">
                        {(selectedUser as any).joinedAt
                          ? formatDate((selectedUser as any).joinedAt)
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      Role:{" "}
                      <span className="font-medium text-gray-900">
                        {roleLabel(selectedUser.orgRole)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-gray-900">Actions</div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <Button
                        variant={selectedUser.orgRole === "OrgAdmin" ? "secondary" : "primary"}
                        onClick={() => toggle(selectedUser)}
                        disabled={busyUserId === selectedUser.id || selectedUser.orgRole === "OrgOwner"}
                      >
                        {selectedUser.orgRole === "OrgAdmin" ? "Remove OrgAdmin" : "Make OrgAdmin"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => removeMember(selectedUser)}
                        disabled={
                          busyUserId === selectedUser.id ||
                          !canRemoveUser({
                            currentUserId,
                            targetUser: selectedUser,
                            orgAdminCount,
                          }).ok
                        }
                      >
                        Remove from org
                      </Button>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      Org admins manage membership. Document access is managed per document.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {inviteModalOpen && (
            <div className="fixed inset-0 z-30">
              <button
                type="button"
                className="absolute inset-0 bg-black/30"
                onClick={() => setInviteModalOpen(false)}
                aria-label="Close invite member modal"
              />
              <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 px-4">
                <div className="rounded-3xl border border-gray-200 bg-white shadow-2xl">
                  <div className="border-b border-gray-200 px-5 py-4">
                    <div className="text-sm font-semibold text-gray-900">Invite member</div>
                    <div className="mt-1 text-sm text-gray-600">
                      Send an email invite so the user can join and set up their account.
                    </div>
                  </div>

                  <div className="space-y-4 px-5 py-5">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-gray-700">Work email</div>
                      <Input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="name@company.com"
                        autoFocus
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold text-gray-700">Org role</div>
                      <div className="flex items-center gap-2">
                        <RoleChip
                          active={inviteRole === "Member"}
                          label="Member"
                          onClick={() => setInviteRole("Member")}
                        />
                        <RoleChip
                          active={inviteRole === "OrgAdmin"}
                          label="OrgAdmin"
                          onClick={() => setInviteRole("OrgAdmin")}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                      The invited user will receive a link, create or complete their account, and
                      then join this organization.
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setInviteModalOpen(false)}
                      disabled={inviteBusy}
                    >
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={submitInvite} disabled={inviteBusy}>
                      {inviteBusy ? "Sending..." : "Send invite"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-gray-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Pending invites</div>
              <div className="mt-1 text-sm text-gray-600">
                Invitations that have been sent but not yet accepted.
              </div>
            </div>
            <Badge variant="neutral">{pendingInvites.length} pending</Badge>
          </div>
        </div>

        {pendingInvites.length === 0 ? (
          <div className="px-5 py-5 text-sm text-gray-600 sm:px-6">No pending invites.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold text-gray-700 sm:grid sm:grid-cols-[minmax(0,2.4fr)_minmax(110px,0.9fr)_minmax(110px,0.9fr)_minmax(160px,1.1fr)_minmax(240px,1.4fr)] sm:gap-4 sm:px-6">
              <div>Email</div>
              <div>Role</div>
              <div>Status</div>
              <div>Expires</div>
              <div className="text-right">Actions</div>
            </div>

            {pendingInvites.map((invite) => {
              const isBusy = busyInviteId === invite.id;

              return (
                <div
                  key={invite.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[minmax(0,2.4fr)_minmax(110px,0.9fr)_minmax(110px,0.9fr)_minmax(160px,1.1fr)_minmax(240px,1.4fr)] sm:items-start sm:gap-4 sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{invite.email}</div>
                    <div className="mt-1 text-xs text-gray-500 sm:hidden">
                      Invited: {formatDate(invite.createdAt)}
                    </div>
                  </div>

                  <div>
                    <Badge variant={invite.orgRole === "OrgAdmin" ? "success" : "neutral"}>
                      {inviteRoleLabel(invite.orgRole)}
                    </Badge>
                  </div>

                  <div>
                    <Badge variant="warning">{inviteStatusLabel(invite.status)}</Badge>
                  </div>

                  <div className="min-w-0 text-sm text-gray-700">
                    <div className="break-words leading-6">{formatDateTime(invite.expiresAt)}</div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => copyInviteLink(invite)}
                        disabled={isBusy}
                      >
                        Copy link
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => resendInvite(invite)}
                        disabled={isBusy}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => revokeInvite(invite)}
                        disabled={isBusy}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function RoleChip({
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
    >
      {label}
    </button>
  );
}