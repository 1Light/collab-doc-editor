import { useCallback, useEffect, useState } from "react";
import { Badge } from "../ui/Badge";
import { listAIHistory, type AIHistoryItem } from "../../features/ai/api";

type Props = {
  documentId: string;
};

function clampPreview(text: string, max = 160) {
  const value = text ?? "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function getStatusLabel(item: AIHistoryItem) {
  if (item.decisionStatus === "accepted" || item.acceptedAt) return "Accepted";
  if (item.decisionStatus === "rejected") return "Rejected";
  return item.status;
}

function getStatusVariant(item: AIHistoryItem): "success" | "error" | "neutral" {
  if (item.decisionStatus === "accepted" || item.acceptedAt) return "success";
  if (item.decisionStatus === "rejected" || item.status === "failed") return "error";
  return "neutral";
}

export function AIHistoryPanel({ documentId }: Props) {
  const [items, setItems] = useState<AIHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listAIHistory(documentId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load AI history"));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="text-sm text-gray-600">Loading AI history...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="text-sm text-gray-600">No AI interactions yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">Showing latest {items.length} AI interactions</div>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.jobId} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="text-sm font-medium text-gray-900">
                  {item.operation} • {formatDate(item.createdAt)}
                </div>

                <div className="text-xs text-gray-600">
                  {item.author.name} • {item.model ?? "model unknown"}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusVariant(item)} size="sm">
                    {getStatusLabel(item)}
                  </Badge>

                  {typeof item.applicationCount === "number" && item.applicationCount > 0 && (
                    <Badge variant="neutral" size="sm">
                      Applied {item.applicationCount}x
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {item.selection.text ? (
              <div className="mt-3 text-xs text-slate-600">
                Selection: {clampPreview(item.selection.text, 140)}
              </div>
            ) : null}

            {item.result ? (
              <div className="mt-2 text-xs text-slate-600">
                Result: {clampPreview(item.result, 180)}
              </div>
            ) : null}

            {item.errorMessage ? (
              <div className="mt-2 text-xs text-red-700">Error: {item.errorMessage}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
