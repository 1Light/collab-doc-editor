import { useCallback, useEffect, useMemo, useState } from "react";
import {
  leaveOrganization,
  listOrganizations,
  switchOrganization,
  type OrganizationSummary,
} from "../../../features/auth/api";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";

type Props = {
  onSessionChanged: () => Promise<void> | void;
  onOpenWorkspace: () => void;
};

function getActiveOrgId() {
  const raw = localStorage.getItem("orgId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatRole(role: "OrgAdmin" | "OrgOwner" | null) {
  if (role === "OrgOwner") return "OrgOwner";
  if (role === "OrgAdmin") return "OrgAdmin";
  return "Member";
}

function formatDocRole(role: OrganizationSummary["recentDocuments"][number]["role"]) {
  return role ?? "No role";
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function OrganizationsPage({ onSessionChanged, onOpenWorkspace }: Props) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => getActiveOrgId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await listOrganizations();
      setOrganizations(Array.isArray(out.organizations) ? out.organizations : []);
      setActiveOrgId(out.activeOrgId ?? getActiveOrgId());
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load organizations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasOrganizations = organizations.length > 0;
  const activeOrganization = useMemo(
    () => organizations.find((org) => org.orgId === activeOrgId) ?? null,
    [organizations, activeOrgId]
  );

  async function handleSwitch(org: OrganizationSummary) {
    setBusyOrgId(org.orgId);
    setError(null);
    try {
      await switchOrganization(org.orgId);
      await onSessionChanged();
      setActiveOrgId(org.orgId);
      onOpenWorkspace();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to switch organization"));
    } finally {
      setBusyOrgId(null);
    }
  }

  async function handleLeave(org: OrganizationSummary) {
    const confirmed = window.confirm(
      `Leave "${org.orgName}"?\n\nYou will lose access to its workspace and documents immediately.`
    );
    if (!confirmed) return;

    setBusyOrgId(org.orgId);
    setError(null);
    try {
      const out = await leaveOrganization(org.orgId);

      if (activeOrgId === org.orgId) {
        localStorage.setItem("orgId", out.nextOrgId ?? "");
      }

      if (out.nextOrgId && activeOrgId === org.orgId) {
        await switchOrganization(out.nextOrgId);
      }

      await onSessionChanged();
      await load();

      if (activeOrgId === org.orgId && out.nextOrgId) {
        onOpenWorkspace();
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to leave organization"));
    } finally {
      setBusyOrgId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Workspace
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Organizations
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            Review the organizations you belong to, switch active context, and manage membership.
          </div>
        </div>

        <Button variant="secondary" onClick={onOpenWorkspace} disabled={!activeOrganization}>
          <span data-testid="organizations-back-to-workspace-label">Back to Workspace</span>
        </Button>
      </div>

      {!activeOrganization && !loading && hasOrganizations && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select an organization to return to a workspace with document access.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <Card className="p-6 text-sm text-slate-600">Loading organizations...</Card>
      ) : !hasOrganizations ? (
        <Card className="p-6">
          <div className="text-base font-semibold text-slate-900">No organizations yet</div>
          <div className="mt-2 text-sm text-slate-600">
            This account is not currently a member of any organization.
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-900" data-testid="current-organization-heading">
                Current organization
              </div>
              {activeOrganization ? (
                <div className="mt-4 space-y-3" data-testid="current-organization-card">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">
                      {activeOrganization.orgName}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {activeOrganization.documentCount} document
                      {activeOrganization.documentCount === 1 ? "" : "s"} visible to you
                    </div>
                  </div>
                  <Badge variant="neutral">{formatRole(activeOrganization.orgRole)}</Badge>
                  <div className="text-xs text-slate-500">
                    Joined {formatDate(activeOrganization.joinedAt)}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-600">No active organization selected.</div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-8">
            <div className="space-y-4">
              {organizations.map((org) => {
                const isActive = org.orgId === activeOrgId;
                const isOwner = org.orgRole === "OrgOwner";
                const busy = busyOrgId === org.orgId;

                return (
                  <Card
                    key={org.orgId}
                    data-testid={`organization-card-${org.orgId}`}
                    className={`p-5 ${isActive ? "border-slate-900 shadow-md shadow-slate-900/5" : ""}`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-lg font-semibold text-slate-950">
                            {org.orgName}
                          </div>
                          {isActive && <Badge variant="success" data-testid={`organization-active-badge-${org.orgId}`}>Active</Badge>}
                          <Badge variant="neutral">{formatRole(org.orgRole)}</Badge>
                        </div>

                        <div className="mt-2 text-sm text-slate-600">
                          Joined {formatDate(org.joinedAt)} • {org.documentCount} visible document
                          {org.documentCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isActive && (
                          <Button
                            variant="primary"
                            size="sm"
                            loading={busy}
                            data-testid={`organization-switch-${org.orgId}`}
                            onClick={() => void handleSwitch(org)}
                          >
                            Switch
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busy}
                          disabled={isOwner}
                          data-testid={`organization-leave-${org.orgId}`}
                          onClick={() => void handleLeave(org)}
                        >
                          {isOwner ? "Owner cannot leave" : "Leave organization"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Recent Documents
                      </div>

                      {org.recentDocuments.length === 0 ? (
                        <div className="mt-3 text-sm text-slate-600">
                          No documents visible in this organization yet.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {org.recentDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex flex-col gap-1 rounded-xl bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900">
                                  {doc.title}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Updated {formatDate(doc.updatedAt)}
                                </div>
                              </div>
                              <Badge variant="neutral" size="sm">
                                {formatDocRole(doc.role)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
