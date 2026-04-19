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

function roleLabel(role: OrgRole) {
  if (role === "OrgOwner") return "OrgOwner";
  if (role === "OrgAdmin") return "OrgAdmin";
  return "Member";
}

type Props = {
  me: MeUser | null;
  isAdmin: boolean;
  isOrgOwner: boolean;
  inAdmin: boolean;
  onOpenOrganizations: () => void;
  onToggleAdmin: () => void;
  onDeleteAccount: () => void;
  onLogout: () => void;
};

export function AppHeader({
  me,
  isAdmin,
  isOrgOwner,
  inAdmin,
  onOpenOrganizations,
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

  const headerTitle = inAdmin ? "Admin Console" : "Collab Editor";
  const headerSubtitle = inAdmin
    ? "Manage users, AI policy, and audit logs"
    : "Collaborative documents with AI and comments";

  return (
    <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold tracking-wide text-white shadow-sm shadow-slate-950/15">
            CE
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold tracking-tight text-slate-950">
                {headerTitle}
              </div>
              {inAdmin ? (
                <Badge variant="neutral" size="sm" className="hidden sm:inline-flex">
                  Admin
                </Badge>
              ) : null}
            </div>

            <div className="mt-0.5 truncate text-sm text-slate-600">{headerSubtitle}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin && (
            <Button
              variant={inAdmin ? "primary" : "secondary"}
              size="sm"
              onClick={onToggleAdmin}
              className="rounded-xl"
            >
              {inAdmin ? "Workspace" : "Admin console"}
            </Button>
          )}

          {me && (
            <div className="relative" ref={ref}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold shadow-sm"
                  style={{ backgroundColor: avatarBg, color: avatarFg }}
                >
                  {initials(userLabel)}
                </div>

                <div className="hidden min-w-0 text-left sm:block">
                  <div className="truncate text-sm font-semibold text-slate-900">{userLabel}</div>
                    <div className="mt-1">
                    {isAdmin ? (
                      <Badge variant="neutral" size="sm">
                        {roleLabel(me.orgRole)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-500">Member</span>
                    )}
                  </div>
                </div>

                <svg
                  className="hidden h-4 w-4 text-slate-400 sm:block"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-72 overflow-hidden rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                  <div className="border-b border-slate-100 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ backgroundColor: avatarBg, color: avatarFg }}
                      >
                        {initials(userLabel)}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{userLabel}</div>
                        {me.email ? (
                          <div className="mt-0.5 truncate text-xs text-slate-500">{me.email}</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Badge variant="neutral" size="sm">
                        {roleLabel(me.orgRole)}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenOrganizations();
                      }}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100"
                    >
                      Organizations
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteAccount();
                      }}
                      disabled={isOrgOwner}
                      className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>Delete account</span>
                      {isOrgOwner ? (
                        <span className="text-[11px] font-medium text-slate-400">Disabled</span>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100"
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
