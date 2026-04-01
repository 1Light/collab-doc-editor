// apps/web/src/components/layout/VersionHistoryPanel.tsx

import { useEffect, useState } from "react";
import {
  listVersions,
  revertVersion,
  deleteVersion,
  type VersionSummary,
} from "../../features/documents/versions";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

type Props = {
  documentId: string;
  role: "Viewer" | "Commenter" | "Editor" | "Owner" | null;
  onReverted?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
};

function canRevert(role: Props["role"]) {
  return role === "Editor" || role === "Owner";
}

function canDelete(role: Props["role"]) {
  return role === "Owner";
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function formatReason(reason?: string) {
  if (!reason) return "Version";
  const normalized = reason.replace(/_/g, " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getAuthorLabel(v: VersionSummary) {
  if (typeof v.authorName === "string" && v.authorName.trim().length > 0) {
    return v.authorName.trim();
  }
  return v.authorId;
}

export function VersionHistoryPanel({
  documentId,
  role,
  onReverted,
  onDeleted,
}: Props) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const data = await listVersions(documentId, 20);
      setVersions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert(versionId: string) {
    if (!canRevert(role)) return;

    const ok = window.confirm(
      "Revert to this version?\n\nThis will create a new head version and replace the current document content."
    );
    if (!ok) return;

    try {
      setReverting(versionId);
      await revertVersion(documentId, versionId);
      await load();
      await onReverted?.();
    } catch (e: any) {
      alert(e?.message ?? "Failed to revert version");
    } finally {
      setReverting(null);
    }
  }

  async function handleDelete(versionId: string) {
    if (!canDelete(role)) return;

    const ok = window.confirm(
      "Remove this version from history?\n\nYou cannot remove the current version."
    );
    if (!ok) return;

    try {
      setDeleting(versionId);
      await deleteVersion(documentId, versionId);
      await load();
      await onDeleted?.();
    } catch (e: any) {
      alert(e?.message ?? "Failed to remove version");
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    void load();
  }, [documentId]);

  if (loading) {
    return <div className="text-sm text-gray-600">Loading version history...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (versions.length === 0) {
    return <div className="text-sm text-gray-600">No versions available.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">Showing latest {versions.length} versions</div>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
        {versions.map((v) => {
          const isHead = Boolean(v.isCurrent);
          const isReverting = reverting === v.versionId;
          const isDeleting = deleting === v.versionId;
          const busy = isReverting || isDeleting;

          return (
            <div key={v.versionId} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(v.createdAt)}
                  </div>

                  <div className="text-xs text-gray-600">Author: {getAuthorLabel(v)}</div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral" size="sm">
                      {formatReason(v.reason)}
                    </Badge>

                    {isHead && (
                      <Badge variant="success" size="sm">
                        Current
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!isHead && canDelete(role) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleDelete(v.versionId)}
                    >
                      {isDeleting ? "Removing..." : "Remove"}
                    </Button>
                  )}

                  {!isHead && canRevert(role) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handleRevert(v.versionId)}
                    >
                      {isReverting ? "Reverting..." : "Revert"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}