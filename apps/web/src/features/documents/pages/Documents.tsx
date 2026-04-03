// apps/web/src/features/documents/pages/Documents.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listDocuments,
  createDocument,
  deleteDocument,
  type DocumentSummary,
} from "../api";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Badge } from "../../../components/ui/Badge";

type Props = {
  onOpenDocument: (documentId: string) => void;
};

function formatUpdatedAt(value: string | number | Date) {
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

export function Documents({ onOpenDocument }: Props) {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const canCreate = useMemo(
    () => newTitle.trim().length > 0 && !creating,
    [newTitle, creating]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments();
      setDocs(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [showCreate]);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title || creating) return;

    setCreating(true);
    setError(null);

    try {
      const created = await createDocument(title);
      setNewTitle("");
      setShowCreate(false);
      setDocs((prev) => [
        {
          id: created.id,
          title: created.title,
          ownerId: created.ownerId,
          updatedAt: created.updatedAt,
          role: "Owner",
        },
        ...prev,
      ]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create document");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);

    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
            <p className="mt-1 text-sm text-gray-600">
              Create and manage collaborative docs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="neutral">{docs.length}</Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreate((v) => !v)}
            >
              New document
            </Button>
          </div>
        </div>

        {showCreate && (
          <Card className="mt-5 p-4 sm:mt-6 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700">
                  Title
                </label>
                <div className="mt-2">
                  <Input
                    ref={titleRef as any}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Example: Q2 product brief"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setShowCreate(false);
                    }}
                    disabled={creating}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 sm:pt-6">
                <Button
                  variant="primary"
                  onClick={handleCreate}
                  disabled={!canCreate}
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
          </Card>
        )}

        {!showCreate && error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mt-5 sm:mt-6">
          {loading ? (
            <div className="space-y-3">
              <DocumentsSkeleton />
              <DocumentsSkeleton />
              <DocumentsSkeleton />
            </div>
          ) : docs.length === 0 ? (
            <EmptyState />
          ) : (
            <Card className="overflow-hidden">
              <div className="divide-y divide-gray-100">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-3 p-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  >
                    <div>
                      <div className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                        {doc.title || "Untitled document"}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        Updated: {formatUpdatedAt(doc.updatedAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenDocument(doc.id)}
                      >
                        Open
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 rounded-xl bg-gray-100" />
          <div className="h-9 w-24 rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-6 sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100">
          +
        </div>
        <h2 className="mt-4 text-base font-semibold text-gray-900">
          No documents yet
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Use the “New document” button above to create your first document.
        </p>
      </div>
    </Card>
  );
}