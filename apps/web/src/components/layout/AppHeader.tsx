import { useRef, useState, useEffect } from "react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import type { OrgRole } from "../../app/session";
import { getCollaborationColor } from "../../features/presence/colorPalette";

type MeUser = {
  id: string;
  name: string;
  email?: string;
  orgRole: OrgRole;
};

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

type Props = {
  me: MeUser | null;
  isAdmin: boolean;
  isOrgOwner: boolean;
  inAdmin: boolean;
  onToggleAdmin: () => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
};

export function AppHeader({
  me,
  isAdmin,
  isOrgOwner,
  inAdmin,
  onToggleAdmin,
  onDeleteAccount,
  onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const close = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setMenuOpen(false);
    };

    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const userLabel = me?.name ?? "";
  const avatarBg = me ? getCollaborationColor(me.id, me.name) : "#111827";
  const avatarFg = "#ffffff";

  const headerTitle = inAdmin ? "Admin console" : "Collab Editor";
  const headerSubtitle = inAdmin
    ? "Manage users, AI policy, and audit logs"
    : "Collaborative documents with AI and comments";

  return (
    <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-900 text-white">
            CE
          </div>

          <div>
            <div className="text-sm font-semibold text-gray-900">{headerTitle}</div>
            <div className="text-xs text-gray-600">{headerSubtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={onToggleAdmin}>
              {inAdmin ? "Workspace" : "Admin console"}
            </Button>
          )}

          {me && (
            <div className="relative" ref={ref}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors hover:bg-gray-100"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: avatarBg, color: avatarFg }}
                >
                  {initials(userLabel)}
                </div>

                <div className="hidden text-xs sm:block">
                  <div className="font-medium text-gray-900">{userLabel}</div>
                  <div className="mt-0.5 text-gray-600">
                    {isAdmin ? <Badge variant="neutral">{me.orgRole}</Badge> : "Member"}
                  </div>
                </div>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <div className="text-sm font-medium text-gray-900">{userLabel}</div>
                    {me.email ? (
                      <div className="mt-0.5 text-xs text-gray-500">{me.email}</div>
                    ) : null}
                  </div>

                  <div className="mt-1 space-y-1">
                    <button
                      type="button"
                      onClick={onDeleteAccount}
                      disabled={isOrgOwner}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-red-600 transition-colors duration-150 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>Delete account</span>
                      {isOrgOwner ? (
                        <span className="text-[11px] text-gray-400">Disabled</span>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}