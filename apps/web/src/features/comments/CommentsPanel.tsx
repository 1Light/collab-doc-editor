import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createComment,
  deleteComment,
  listComments,
  resolveComment,
  updateComment,
  type Comment,
} from "./api";

import { getSocket, connectSocket } from "../realtime/socket";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";

import {
  canComment,
  canDeleteThisComment,
  canEditThisComment,
  canModerateComments,
  canReplyToComment,
  type DocumentRole,
} from "./commentPermissions";
import { normalizeCommentTree, type ReplyableComment } from "./commentTree";

type Props = {
  documentId: string;
  selection: {
    start: number;
    end: number;
    text: string;
    pmFrom?: number;
    pmTo?: number;
  };
  onJumpToAnchor?: (anchor: { start: number; end: number }) => void;
  isAnchorValid?: (comment: Comment) => boolean;
  role?: DocumentRole;
  meId?: string;
  autoFocus?: boolean;
  onChanged?: () => void;
};

type Tab = "open" | "resolved";

type CommentChangedEvent = {
  documentId: string;
  action: "created" | "updated" | "resolved" | "deleted";
  commentId: string;
  actorUserId: string;
  parentCommentId?: string | null;
  status?: "open" | "resolved" | null;
  emittedAt?: string;
};

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

function clampPreview(text: string, max = 140) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function ActionButton({
  title,
  icon,
  onClick,
  disabled,
  danger = false,
}: {
  title: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        danger
          ? "border-red-200 text-red-700 hover:bg-red-50 disabled:border-red-100 disabled:text-red-300"
          : "border-gray-200 text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100",
      ].join(" ")}
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}

export function CommentsPanel({
  documentId,
  selection,
  onJumpToAnchor,
  isAnchorValid,
  role,
  meId,
  autoFocus = false,
  onChanged,
}: Props) {
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const [newBody, setNewBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevAutoFocusRef = useRef<boolean>(false);

  const refreshTimeoutRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(0);

  const allowComment = canComment(role ?? null);
  const allowModerate = canModerateComments(role ?? null);

  const canAnchor = useMemo(() => selection.end > selection.start, [selection]);
  const selectionLen = useMemo(() => Math.max(0, selection.end - selection.start), [selection]);
  const selectionPreview = useMemo(() => clampPreview(selection.text, 180), [selection.text]);

  const commentTree = useMemo(() => normalizeCommentTree(items), [items]);

  useEffect(() => {
    const prev = prevAutoFocusRef.current;
    prevAutoFocusRef.current = autoFocus;

    if (!autoFocus) return;
    if (!prev && autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const refresh = useCallback(
    async (nextTab: Tab = tab) => {
      lastRefreshAtRef.current = Date.now();
      setLoading(true);
      setError(null);

      try {
        const data = await listComments(documentId, nextTab);
        setItems(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load comments");
      } finally {
        setLoading(false);
      }
    },
    [documentId, tab]
  );

  const scheduleRefresh = useCallback(
    (nextTab?: Tab) => {
      const now = Date.now();
      const elapsed = now - lastRefreshAtRef.current;

      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      if (elapsed > 250) {
        void refresh(nextTab ?? tab);
        return;
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void refresh(nextTab ?? tab);
      }, 250);
    },
    [refresh, tab]
  );

  useEffect(() => {
    void refresh(tab);
  }, [documentId, tab, refresh]);

  useEffect(() => {
    const socket = getSocket();
    connectSocket();

    const handleCommentChanged = (event: CommentChangedEvent) => {
      if (!event || event.documentId !== documentId) return;
      scheduleRefresh(tab);
      onChanged?.();
    };

    socket.on("document:comment_changed", handleCommentChanged);

    return () => {
      socket.off("document:comment_changed", handleCommentChanged);

      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [documentId, onChanged, scheduleRefresh, tab]);

  async function addComment() {
    if (!allowComment) {
      setError("You do not have permission to add comments.");
      return;
    }

    if (!newBody.trim()) return;

    setError(null);
    setBusyId("new");

    try {
      const anchorStart = selection.pmFrom ?? selection.start;
      const anchorEnd = selection.pmTo ?? selection.end;

      await createComment(documentId, newBody.trim(), {
        anchor: canAnchor ? { start: anchorStart, end: anchorEnd } : undefined,
        quote: canAnchor ? selection.text : undefined,
      });

      setNewBody("");
      onChanged?.();
      await refresh(tab);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create comment");
    } finally {
      setBusyId(null);
    }
  }

  async function addReply(parent: ReplyableComment) {
    if (!allowComment) {
      setError("You do not have permission to reply.");
      return;
    }

    if (!replyBody.trim()) return;

    setError(null);
    setBusyId(`reply:${parent.commentId}`);

    try {
      await createComment(documentId, replyBody.trim(), {
        parentCommentId: parent.commentId,
      });

      setReplyBody("");
      setReplyingToId(null);
      onChanged?.();
      await refresh(tab);
    } catch (e: any) {
      setError(e?.message ?? "Failed to reply to comment");
    } finally {
      setBusyId(null);
    }
  }

  async function onResolve(commentId: string) {
    if (!allowModerate) {
      setError("Only Editors or Owners can resolve comments.");
      return;
    }

    setError(null);
    setBusyId(commentId);

    try {
      await resolveComment(documentId, commentId);
      onChanged?.();
      await refresh(tab);
    } catch (e: any) {
      setError(e?.message ?? "Failed to resolve comment");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(commentId: string) {
    const c = items.find((x) => x.commentId === commentId);
    if (!c) return;

    const allowed = canDeleteThisComment({ role: role ?? null, meId, comment: c });
    if (!allowed) {
      setError("Only the author can delete open comments. Owners can delete any comment.");
      return;
    }

    setError(null);
    setBusyId(commentId);

    try {
      await deleteComment(documentId, commentId);
      onChanged?.();
      await refresh(tab);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete comment");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(c: Comment) {
    const allowed = canEditThisComment({ meId, comment: c });
    if (!allowed) {
      setError("Only the comment author can edit an open comment.");
      return;
    }

    setEditingId(c.commentId);
    setEditingBody(c.body);
    setReplyingToId(null);
    setReplyBody("");
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;

    const c = items.find((x) => x.commentId === editingId);
    if (!c) return;

    const allowed = canEditThisComment({ meId, comment: c });
    if (!allowed) {
      setError("Only the comment author can edit an open comment.");
      return;
    }

    setError(null);
    setBusyId(editingId);

    try {
      await updateComment(documentId, editingId, editingBody.trim());
      setEditingId(null);
      setEditingBody("");
      onChanged?.();
      await refresh(tab);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update comment");
    } finally {
      setBusyId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingBody("");
  }

  function startReply(commentId: string) {
    setEditingId(null);
    setEditingBody("");
    setReplyingToId(commentId);
    setReplyBody("");
    setError(null);
  }

  function cancelReply() {
    setReplyingToId(null);
    setReplyBody("");
  }

  const openCount = useMemo(() => items.filter((i) => i.status === "open").length, [items]);

  return (
    <Card className="w-full overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Comments</div>
            <div className="mt-1 text-xs text-slate-500">
              Add comments, reply in threads, and jump to anchored selections.
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Role: {role ?? "Unknown"}
              {!allowComment ? " • View-only" : allowModerate ? " • Can resolve" : " • Can comment"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="neutral">{openCount} open</Badge>
            <Badge variant={canAnchor ? "success" : "neutral"}>
              {canAnchor ? "Anchoring on" : "No selection"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-700">View</div>
          <div className="mt-2 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {(["open", "resolved"] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={[
                    "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100",
                    active
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-700 hover:text-gray-900",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {t === "open" ? "Open" : "Resolved"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-900">New comment</div>
            <div className="text-xs text-gray-600">
              {canAnchor ? `Anchored: ${selectionLen} chars` : "Unanchored"}
            </div>
          </div>

          {canAnchor && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-[11px] font-medium text-gray-700">Selection preview</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-800">
                {selectionPreview || "Selection is empty."}
              </div>
            </div>
          )}

          <div className="mt-3">
            <textarea
              ref={textareaRef}
              className={[
                "w-full min-h-[96px] rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm",
                "placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              ].join(" ")}
              placeholder={
                allowComment
                  ? canAnchor
                    ? "Write a comment about this selection..."
                    : "Write a general comment..."
                  : "You do not have permission to comment."
              }
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              disabled={!allowComment || busyId === "new"}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-600">
              {canAnchor
                ? "Tip: keep comments focused to make review faster."
                : "Tip: select text in the editor to create an anchored comment."}
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={addComment}
              disabled={!allowComment || !newBody.trim() || busyId === "new"}
              className="w-full sm:w-auto"
            >
              {busyId === "new" ? "Adding..." : "Add comment"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-medium text-red-900">Could not complete action</div>
            <div className="mt-1">{error}</div>
          </div>
        )}

        <div className="mt-4">
          {loading ? (
            <div className="space-y-3">
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
            </div>
          ) : commentTree.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              No comments in this view.
            </div>
          ) : (
            <div className="space-y-3">
              {commentTree.map((c) => {
                const isDetached = Boolean(isAnchorValid && c.anchor && !isAnchorValid(c));

                return (
                  <CommentCard
                    key={c.commentId}
                    c={c}
                    role={role ?? null}
                    meId={meId}
                    allowComment={allowComment}
                    allowModerate={allowModerate}
                    isEditing={editingId === c.commentId}
                    editingBody={editingBody}
                    setEditingBody={setEditingBody}
                    replyingToId={replyingToId}
                    replyBody={replyBody}
                    setReplyBody={setReplyBody}
                    onStartEdit={() => startEdit(c)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={saveEdit}
                    onStartReply={() => startReply(c.commentId)}
                    onCancelReply={cancelReply}
                    onSaveReply={() => addReply(c)}
                    onResolve={() => onResolve(c.commentId)}
                    onDelete={() => onDelete(c.commentId)}
                    onJump={() => {
                      if (c.anchor && (!isAnchorValid || isAnchorValid(c))) {
                        onJumpToAnchor?.(c.anchor);
                      }
                    }}
                    isDetached={isDetached}
                    busy={busyId === c.commentId || busyId === `reply:${c.commentId}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function CommentCard({
  c,
  role,
  meId,
  allowComment,
  allowModerate,
  isEditing,
  editingBody,
  setEditingBody,
  replyingToId,
  replyBody,
  setReplyBody,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartReply,
  onCancelReply,
  onSaveReply,
  onResolve,
  onDelete,
  onJump,
  isDetached,
  busy,
}: {
  c: ReplyableComment;
  role: DocumentRole;
  meId?: string;
  allowComment: boolean;
  allowModerate: boolean;
  isEditing: boolean;
  editingBody: string;
  setEditingBody: (v: string) => void;
  replyingToId: string | null;
  replyBody: string;
  setReplyBody: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSaveReply: () => void;
  onResolve: () => void;
  onDelete: () => void;
  onJump: () => void;
  isDetached: boolean;
  busy: boolean;
}) {
  const author = c.authorName ?? c.authorEmail ?? c.authorId ?? "Unknown";
  const canEdit = canEditThisComment({ meId, comment: c });
  const canDelete = canDeleteThisComment({ role, meId, comment: c });
  const canReply = canReplyToComment(role, c);
  const isReplying = replyingToId === c.commentId;
  const showPermissionHint = !canEdit && !canDelete;
  const hasReplies = Boolean(c.replies?.length);
  const hasAnchor = Boolean(c.anchor);
  const canJumpToAnchor = hasAnchor && !isDetached;
  const quotePreview = clampPreview(c.quote ?? "", 180);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="max-w-full truncate text-base font-semibold text-gray-900">{author}</div>
            {c.status === "resolved" ? (
              <Badge variant="neutral">Resolved</Badge>
            ) : (
              <Badge variant="success">Open</Badge>
            )}
            {hasAnchor && isDetached && <Badge variant="warning">Linked text moved</Badge>}
          </div>

          <div className="mt-1 text-xs text-gray-600">{formatDateTime(c.createdAt)}</div>

          {hasAnchor && quotePreview && (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] font-medium text-gray-700">
                {isDetached ? "Original quoted text" : "Quoted text"}
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-xs italic text-gray-800">
                “{quotePreview}”
              </div>
            </div>
          )}

          {!isEditing ? (
            <div className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-900">
              {c.body}
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-xs font-medium text-gray-700">Edit comment</div>
              <textarea
                className={[
                  "mt-2 w-full min-h-[96px] rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                ].join(" ")}
                value={editingBody}
                onChange={(e) => setEditingBody(e.target.value)}
                disabled={!canEdit || busy}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={onSaveEdit}
                  disabled={!canEdit || busy || !editingBody.trim()}
                >
                  {busy ? "Saving..." : "Save"}
                </Button>
                <Button variant="secondary" size="xs" onClick={onCancelEdit} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!isEditing && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canJumpToAnchor && (
                <ActionButton
                  title="Jump to anchor"
                  icon="↗"
                  onClick={onJump}
                  disabled={busy}
                />
              )}

              {c.status === "open" && (
                <ActionButton
                  title="Resolve comment"
                  icon="✓"
                  onClick={onResolve}
                  disabled={busy || !allowModerate}
                />
              )}

              <ActionButton
                title="Edit comment"
                icon="✎"
                onClick={onStartEdit}
                disabled={busy || !canEdit}
              />

              <ActionButton
                title="Delete comment"
                icon="🗑"
                onClick={onDelete}
                disabled={busy || !canDelete}
                danger
              />

              {canReply && (
                <ActionButton
                  title="Reply to comment"
                  icon="↩"
                  onClick={onStartReply}
                  disabled={busy}
                />
              )}
            </div>
          )}

          {showPermissionHint && allowComment && !isEditing && (
            <div className="mt-3 text-[11px] text-gray-500">
              Edit: author only : Delete: author for open comments, Owner always
            </div>
          )}

          {isReplying && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium text-gray-700">Reply</div>
              <textarea
                className={[
                  "mt-2 w-full min-h-[88px] rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                ].join(" ")}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                disabled={busy}
                placeholder="Write a reply..."
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="xs"
                  onClick={onSaveReply}
                  disabled={busy || !replyBody.trim()}
                >
                  {busy ? "Replying..." : "Reply"}
                </Button>
                <Button variant="secondary" size="xs" onClick={onCancelReply} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {hasReplies && (
            <div className="mt-5 space-y-3 border-l-2 border-gray-200 pl-4">
              {c.replies!.map((reply) => (
                <CommentReplyBlock key={reply.commentId} c={reply} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentReplyBlock({ c }: { c: ReplyableComment }) {
  const author = c.authorName ?? c.authorEmail ?? c.authorId ?? "Unknown";
  const hasReplies = Boolean(c.replies?.length);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="max-w-full truncate text-sm font-semibold text-gray-900">{author}</div>
        {c.status === "resolved" ? (
          <Badge variant="neutral">Resolved</Badge>
        ) : (
          <Badge variant="success">Open</Badge>
        )}
      </div>

      <div className="mt-1 text-[11px] text-gray-600">{formatDateTime(c.createdAt)}</div>

      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-900">
        {c.body}
      </div>

      {hasReplies && (
        <div className="mt-3 space-y-3 border-l-2 border-gray-200 pl-4">
          {c.replies!.map((reply) => (
            <CommentReplyBlock key={reply.commentId} c={reply} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-5 w-40 rounded bg-gray-100" />
      <div className="mt-2 h-3 w-32 rounded bg-gray-100" />
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-10/12 rounded bg-gray-100" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-8 w-8 rounded-lg bg-gray-100" />
        <div className="h-8 w-8 rounded-lg bg-gray-100" />
        <div className="h-8 w-8 rounded-lg bg-gray-100" />
        <div className="h-8 w-8 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}