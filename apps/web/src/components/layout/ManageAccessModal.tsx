// apps/web/src/components/layout/ManageAccessModal.tsx

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
  shareDocument,
  deletePermission,
  listPermissions,
  updatePermission,
  type DocumentRole,
  type Permission,
  type PrincipalType,
  listDocumentInvites,
  type DocumentInvite,
  revokeDocumentInvite,
} from "../../features/documents/sharing";

type Props = {
  open: boolean;
  documentId: string;
  onClose: () => void;
  meId?: string;
};

const ROLE_OPTIONS: Array<{ value: Exclude<DocumentRole, "Owner">; label: string }> = [
  { value: "Viewer", label: "Viewer" },
  { value: "Commenter", label: "Commenter" },
  { value: "Editor", label: "Editor" },
];

const DEFAULT_LINK_ROLE: Exclude<DocumentRole, "Owner"> = "Viewer";

function displayName(p: Permission) {
  if (p.role === "Owner") return "Owner";
  if (p.principalType === "link") return "Anyone in org with link";
  const u = p.user;
  const name = u?.name?.trim();
  const email = u?.email?.trim();
  return name || email || p.principalId;
}

function displaySub(p: Permission) {
  if (p.principalType === "link") return p.principalId;
  const u = p.user;
  const email = u?.email?.trim();
  const main = displayName(p);
  return email && email !== main ? email : p.principalId;
}

function sortPermissions(list: Permission[]) {
  const rank = (p: Permission) => {
    if (p.role === "Owner") return 0;
    if (p.principalType === "user") return 1;
    return 2;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

function dedupeByPrincipal(list: Permission[]) {
  const seen = new Map<string, Permission>();

  for (const p of list) {
    const key = `${p.principalType}:${p.principalId}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
      continue;
    }

    if (existing.role !== "Owner" && p.role === "Owner") {
      seen.set(key, p);
    }
  }

  return Array.from(seen.values());
}

function sortInvites(list: DocumentInvite[]) {
  const rank = (s: DocumentInvite["status"]) => {
    if (s === "pending") return 0;
    if (s === "accepted") return 1;
    if (s === "revoked") return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a.status) - rank(b.status));
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function buildShareUrl(documentId: string, token: string) {
  if (typeof window === "undefined") return `/documents/${documentId}?access=${token}`;
  const url = new URL(`/documents/${documentId}`, window.location.origin);
  url.searchParams.set("access", token);
  return url.toString();
}

export function ManageAccessModal({ open, documentId, onClose, meId }: Props) {
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copyingToken, setCopyingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<Permission[]>([]);
  const [invites, setInvites] = useState<DocumentInvite[]>([]);

  const title = useMemo(() => "Manage access", []);

  const reload = async () => {
    setError(null);
    setLoading(true);

    try {
      const [permData, inviteData] = await Promise.all([
        listPermissions(documentId),
        listDocumentInvites(documentId),
      ]);

      const base = sortPermissions(Array.isArray(permData) ? permData : []);
      const deduped = dedupeByPrincipal(base);

      const filtered =
        meId && meId.trim().length > 0
          ? deduped.filter((p) => !(p.principalType === "user" && p.principalId === meId))
          : deduped;

      setItems(filtered);

      // ✅ Invites: show pending only (accepted access is managed in Permissions)
      const inviteList = Array.isArray(inviteData) ? inviteData : [];
      const pendingInvites = inviteList.filter((i) => i.status === "pending");
      setInvites(sortInvites(pendingInvites));
    } catch (e: any) {
      setItems([]);
      setInvites([]);
      setError(e?.message ?? "Failed to load access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId, meId]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function onChangeRole(p: Permission, nextRole: Exclude<DocumentRole, "Owner">) {
    if (p.role === "Owner") return;

    const key = `${p.principalType}:${p.principalId}`;
    setSavingKey(key);
    setError(null);

    const prev = items;

    // optimistic
    setItems((cur) =>
      cur.map((x) =>
        x.principalType === p.principalType && x.principalId === p.principalId
          ? { ...x, role: nextRole }
          : x
      )
    );

    try {
      await updatePermission(documentId, {
        principalType: p.principalType as PrincipalType,
        principalId: p.principalId,
        role: nextRole,
      });

      // No client-side socket emit:
      // API commits role change then notifies realtime service.

      await reload();
    } catch (e: any) {
      setItems(prev);
      setError(e?.message ?? "Failed to update role");
    } finally {
      setSavingKey(null);
    }
  }

  async function onRemoveAccess(p: Permission) {
    if (p.role === "Owner") return;

    const key = `${p.principalType}:${p.principalId}`;
    setRevokingKey(key);
    setError(null);

    const prev = items;

    // optimistic
    setItems((cur) =>
      cur.filter((x) => !(x.principalType === p.principalType && x.principalId === p.principalId))
    );

    try {
      await deletePermission(documentId, {
        principalType: p.principalType as PrincipalType,
        principalId: p.principalId,
      });

      // No client-side socket emit:
      // API commits revoke then notifies realtime service.

      await reload();
    } catch (e: any) {
      setItems(prev);
      setError(e?.message ?? "Failed to remove access");
    } finally {
      setRevokingKey(null);
    }
  }

  async function onRevokeInvite(invite: DocumentInvite) {
    // Pending only in this UI, but keep the guard anyway
    const canRemove = invite.status === "pending";
    if (!canRemove) return;

    setError(null);
    setRevokingInviteId(invite.id);

    const prev = invites;

    setInvites((cur) => cur.filter((x) => x.id !== invite.id));

    try {
      await revokeDocumentInvite(documentId, invite.id);
      await reload();
    } catch (e: any) {
      setInvites(prev);
      setError(e?.message ?? "Failed to revoke invite");
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function onCreateLink() {
    setError(null);
    setCreatingLink(true);

    try {
      await shareDocument(documentId, {
        targetType: "link",
        role: DEFAULT_LINK_ROLE,
      });

      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create link");
    } finally {
      setCreatingLink(false);
    }
  }

  async function copyLink(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return;

    const fullUrl = buildShareUrl(documentId, trimmed);
    setCopyingToken(trimmed);

    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch (e: any) {
      setError(e?.message ?? "Failed to copy link");
    } finally {
      setCopyingToken(null);
    }
  }

  const entriesCount = items.length + invites.length;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close manage access dialog"
        onClick={onClose}
      />

      <div className="relative mx-auto mt-24 w-[92vw] max-w-2xl">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">{title}</div>
              <div className="mt-0.5 text-xs text-gray-600">
                Change roles or remove access for this document
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          <div className="max-h-[78vh] overflow-y-auto bg-white px-4 py-3">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {error}
              </div>
            )}

            <div className="mb-2 text-xs font-medium text-gray-600">
              {loading ? "Loading..." : `${entriesCount} entries`}
            </div>

            <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Share by link</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Generate an org-only document link. You can adjust its role later in
                    permissions.
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={creatingLink}
                    onClick={() => void onCreateLink()}
                  >
                    Create link
                  </Button>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div className="mb-3 overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                Permissions
              </div>

              {loading ? (
                <div className="p-3 text-sm text-gray-600">Loading permissions...</div>
              ) : items.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">No permissions</div>
              ) : (
                <ul className="max-h-[22rem] divide-y divide-gray-200 overflow-y-auto">
                  {items.map((p) => {
                    const key = `${p.principalType}:${p.principalId}`;
                    const isOwner = p.role === "Owner";
                    const isSaving = savingKey === key;
                    const isRemoving = revokingKey === key;

                    return (
                      <li key={key} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {displayName(p)}
                          </div>
                          <div className="truncate text-xs text-gray-600">{displaySub(p)}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          {p.principalType === "link" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void copyLink(p.principalId)}
                              disabled={copyingToken === p.principalId || isSaving || isRemoving}
                            >
                              {copyingToken === p.principalId ? "Copying..." : "Copy link"}
                            </Button>
                          )}

                          {isOwner ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
                              Owner
                            </div>
                          ) : (
                            <select
                              value={p.role}
                              onChange={(e) =>
                                void onChangeRole(
                                  p,
                                  e.target.value as Exclude<DocumentRole, "Owner">
                                )
                              }
                              disabled={isSaving || isRemoving}
                              className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-gray-300"
                              aria-label="Change role"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          )}

                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onRemoveAccess(p)}
                            disabled={isOwner || isSaving || isRemoving}
                          >
                            {isRemoving ? "Removing..." : "Remove access"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Invites */}
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                Invites
              </div>

              {loading ? (
                <div className="p-3 text-sm text-gray-600">Loading invites...</div>
              ) : invites.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">No pending invites</div>
              ) : (
                <ul className="max-h-[16rem] divide-y divide-gray-200 overflow-y-auto">
                  {invites.map((i) => {
                    const key = `invite:${i.id}`;
                    const isRevoking = revokingInviteId === i.id;

                    const meta = i.expiresAt ? `Expires: ${fmtDate(i.expiresAt)}` : "";

                    return (
                      <li key={key} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {i.email}
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                              Pending
                            </div>
                          </div>

                          <div className="truncate text-xs text-gray-600">
                            Role: {i.role}
                            {meta ? ` • ${meta}` : ""}
                            {i.invitedBy?.email ? ` • Invited by: ${i.invitedBy.email}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void onRevokeInvite(i)}
                            disabled={isRevoking}
                          >
                            {isRevoking ? "Working..." : "Revoke invite"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Tip: “Anyone in org with link” entries are internal org link tokens; removing access
              disables that link.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
