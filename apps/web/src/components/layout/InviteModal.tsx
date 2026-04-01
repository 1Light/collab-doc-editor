// apps/web/src/components/layout/InviteModal.tsx

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
  listOrgUsers,
  createDocumentInvite,
  listDocumentInvites,
  listPermissions,
  type OrgUser,
  type DocumentRole,
  type DocumentInvite,
  type Permission,
} from "../../features/documents/sharing";

type Props = {
  open: boolean;
  documentId: string;
  onClose: () => void;
  onInvited?: (user: OrgUser) => void;
};

const ROLE_OPTIONS: Array<{ value: Exclude<DocumentRole, "Owner">; label: string; helper: string }> = [
  { value: "Viewer", label: "Viewer", helper: "Can read" },
  { value: "Commenter", label: "Commenter", helper: "Can comment" },
  { value: "Editor", label: "Editor", helper: "Can edit" },
];

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

function roleHelper(role: DocumentRole) {
  if (role === "Owner") return "Full control";
  return ROLE_OPTIONS.find((r) => r.value === role)?.helper ?? "";
}

function normalizeEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase();
}

function isUserPermission(p: Permission) {
  return p.principalType === "user";
}

/**
 * ✅ Blocking logic:
 * - pending invites always block
 * - accepted invites only block if the user still has a permission row
 *   (prevents "accepted invite stuck forever" after access removal)
 */
function isBlockingInvite(inv: DocumentInvite, permEmails: Set<string>) {
  if (inv.status === "pending") return true;
  if (inv.status === "accepted") {
    const email = normalizeEmail(inv.email);
    return email ? permEmails.has(email) : false;
  }
  return false;
}

export function InviteModal({ open, documentId, onClose, onInvited }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Track existing invites + permissions for this document
  const [invites, setInvites] = useState<DocumentInvite[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loadingDocAccess, setLoadingDocAccess] = useState(false);

  // per-user selected role
  const [selectedRole, setSelectedRole] = useState<Record<string, Exclude<DocumentRole, "Owner">>>(
    {}
  );

  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) return;

    setError(null);
    setSendingTo(null);
    setQuery("");
    setUsers([]);
    setSelectedRole({});
    setInvites([]);
    setPermissions([]);
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Load existing document access when modal opens / document changes
  useEffect(() => {
    if (!open) return;
    if (!documentId) return;

    setLoadingDocAccess(true);
    (async () => {
      try {
        const [inviteData, permData] = await Promise.all([
          listDocumentInvites(documentId),
          listPermissions(documentId),
        ]);

        setInvites(Array.isArray(inviteData) ? inviteData : []);
        setPermissions(Array.isArray(permData) ? permData : []);
      } catch {
        setInvites([]);
        setPermissions([]);
      } finally {
        setLoadingDocAccess(false);
      }
    })();
  }, [open, documentId]);

  const permEmails = useMemo(() => {
    const set = new Set<string>();
    for (const p of permissions) {
      if (!isUserPermission(p)) continue;
      const email = normalizeEmail((p as any)?.user?.email);
      if (email) set.add(email);
    }
    return set;
  }, [permissions]);

  const blockedEmails = useMemo(() => {
    const set = new Set<string>();

    // Blocking invites
    for (const inv of invites) {
      if (!isBlockingInvite(inv, permEmails)) continue;
      const email = normalizeEmail(inv.email);
      if (email) set.add(email);
    }

    // Existing permissions block inviting again
    for (const email of permEmails) {
      set.add(email);
    }

    return set;
  }, [invites, permEmails]);

  // Load org users
  useEffect(() => {
    if (!open) return;

    setError(null);
    setLoadingUsers(true);

    (async () => {
      try {
        const data = await listOrgUsers(debouncedQuery);
        const list = Array.isArray(data) ? data : [];
        setUsers(list);

        // default role for newly appearing user: Viewer
        setSelectedRole((prev) => {
          const next = { ...prev };
          for (const u of list) {
            if (!next[u.id]) next[u.id] = "Viewer";
          }
          return next;
        });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load organization members");
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, [open, debouncedQuery]);

  const isBusy = Boolean(sendingTo) || loadingDocAccess;

  if (!open) return null;

  function getBlockReason(email: string): "has_access" | "invited" | null {
    const norm = normalizeEmail(email);
    if (!norm) return null;

    const hasPerm = permEmails.has(norm);
    if (hasPerm) return "has_access";

    const hasBlockingInvite = invites.some(
      (i) => normalizeEmail(i.email) === norm && isBlockingInvite(i, permEmails)
    );
    if (hasBlockingInvite) return "invited";

    return null;
  }

  async function onInviteUser(user: OrgUser) {
    if (sendingTo) return;

    const role = selectedRole[user.id] ?? "Viewer";

    setError(null);
    setSendingTo(user.id);
    try {
      const email = normalizeEmail(user.email);
      if (!email || !email.includes("@")) {
        throw new Error("Selected user does not have a valid email");
      }

      // If blocked, do nothing (UI should prevent, but keep it safe)
      if (blockedEmails.has(email)) {
        setSendingTo(null);
        return;
      }

      await createDocumentInvite(documentId, { email, role });

      // Refresh access state so badge/disable is always correct
      try {
        const [inviteData, permData] = await Promise.all([
          listDocumentInvites(documentId),
          listPermissions(documentId),
        ]);
        setInvites(Array.isArray(inviteData) ? inviteData : []);
        setPermissions(Array.isArray(permData) ? permData : []);
      } catch {
        // ignore
      }

      onInvited?.(user);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create invite");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close invite dialog"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative mx-auto mt-24 w-[92vw] max-w-2xl">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between border-b border-gray-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Invite</div>
              <div className="mt-0.5 text-xs text-gray-600">
                Invite org members to this document
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="bg-white px-4 py-3">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {error}
              </div>
            )}

            <label className="block text-xs font-medium text-gray-700">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or email"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-300"
              autoFocus
            />

            <div className="mt-3">
              <div className="mb-2 text-xs font-medium text-gray-600">
                {loadingUsers ? "Loading..." : `${users.length} people`}
              </div>

              <div className="max-h-[360px] overflow-auto rounded-xl border border-gray-200">
                {loadingUsers ? (
                  <div className="p-3 text-sm text-gray-600">Loading org members...</div>
                ) : users.length === 0 ? (
                  <div className="p-3 text-sm text-gray-600">No users found</div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {users.map((u) => {
                      const role = selectedRole[u.id] ?? "Viewer";
                      const email = normalizeEmail(u.email);
                      const blocked = Boolean(email) && blockedEmails.has(email);
                      const reason = email ? getBlockReason(email) : null;

                      const buttonLabel =
                        reason === "has_access"
                          ? "Has access"
                          : reason === "invited"
                            ? "Invited"
                            : "Share";

                      return (
                        <li
                          key={u.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">{u.name}</div>
                            <div className="truncate text-xs text-gray-600">{u.email}</div>
                          </div>

                          <div className="flex items-center gap-2 sm:flex-none">
                            <div className="flex flex-col">
                              <select
                                value={role}
                                onChange={(e) =>
                                  setSelectedRole((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value as Exclude<DocumentRole, "Owner">,
                                  }))
                                }
                                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-gray-300"
                                disabled={isBusy || blocked}
                              >
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-0.5 text-[11px] text-gray-500">{roleHelper(role)}</div>
                            </div>

                            <Button
                              size="sm"
                              onClick={() => void onInviteUser(u)}
                              disabled={isBusy || blocked}
                              title={
                                reason === "has_access"
                                  ? "This user already has access to this document"
                                  : reason === "invited"
                                    ? "This user already has a pending invite (or still has access)"
                                    : undefined
                              }
                            >
                              {sendingTo === u.id ? "Inviting..." : buttonLabel}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                This creates a pending invite. Access is granted only after acceptance.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}