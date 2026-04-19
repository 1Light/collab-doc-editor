import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { getDocument, updateDocument } from "../../documents/api";
import type { Comment } from "../../comments/api";
import { persistDocumentLinkToken } from "../../../lib/documentAccess";

import { PresenceLayer } from "../../presence/PresenceLayer";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";

import { EditorToolbar } from "../EditorToolbar";
import { EditorBubbleMenu } from "../EditorBubbleMenu";
import { CollabEditor } from "../CollabEditor";
import { EditorSidePanel } from "../EditorSidePanel";
import { useCollabEditorSession } from "../useCollabEditorSession";
import {
  canEdit,
  isYdocEmpty,
  readMe,
  scrollPosIntoView,
  useLatestRef,
  type DocumentRole,
  type SidePanel,
} from "../editorUtils";
import { useCommentSummary } from "../../comments/useCommentSummary";
import type { AIOperation } from "../../ai/api";

type Props = {
  documentId: string;
  onBack?: () => void;
  onCurrentUserColorChange?: (color: string | null) => void;
};

type EditorSelection = {
  start: number;
  end: number;
  text: string;
  pmFrom: number;
  pmTo: number;
};

type PendingCommentAnchor = {
  start: number;
  end: number;
  text: string;
  pmFrom?: number;
  pmTo?: number;
};

type SaveState = "saved" | "pending" | "saving" | "error";

type UndoableAIChange = {
  previousHtml: string;
  label: string;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBulletListText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && lines.every((line) => line.startsWith("- "));
}

function textToHtml(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return "<p></p>";
  }

  if (isBulletListText(normalized)) {
    const items = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<li>${escapeHtml(line.replace(/^-\s*/, "").trim())}</li>`)
      .join("");

    return `<ul>${items}</ul>`;
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`);

  return paragraphs.join("");
}

function normalizeAnchorText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveCommentAnchorInEditor(
  editor: TiptapEditor | null,
  comment: Comment,
  searchRadius = 400
): { from: number; to: number } | null {
  if (!editor) return null;
  if (!comment.anchor) return null;

  const quote = normalizeAnchorText(comment.quote ?? "");
  if (!quote) return null;

  const doc = editor.state.doc;
  const docSize = doc.content.size;

  const rawFrom = comment.anchor.start;
  const rawTo = comment.anchor.end;

  const from = Math.max(0, Math.min(rawFrom, docSize));
  const to = Math.max(0, Math.min(rawTo, docSize));

  if (to <= from) return null;

  const exactText = normalizeAnchorText(doc.textBetween(from, to, " ", " "));
  if (exactText && exactText === quote) {
    return { from, to };
  }

  const searchFrom = Math.max(0, from - searchRadius);
  const searchTo = Math.min(docSize, to + searchRadius);

  if (searchTo <= searchFrom) return null;

  const windowTextRaw = doc.textBetween(searchFrom, searchTo, "\n", "\n");
  const windowText = normalizeAnchorText(windowTextRaw);

  if (!windowText) return null;

  const pattern = new RegExp(escapeRegExp(quote), "i");
  const match = pattern.exec(windowText);

  if (!match || match.index < 0) return null;

  const matchedText = match[0];
  const normalizedPrefix = windowText.slice(0, match.index);

  const approxFrom = searchFrom + normalizedPrefix.length;
  const approxTo = approxFrom + matchedText.length;

  const safeFrom = Math.max(0, Math.min(approxFrom, docSize));
  const safeTo = Math.max(safeFrom, Math.min(approxTo, docSize));

  if (safeTo <= safeFrom) return null;

  return {
    from: safeFrom,
    to: safeTo,
  };
}

export function EditorPage({ documentId, onBack, onCurrentUserColorChange }: Props) {
  const meRef = useRef(readMe());
  const me = meRef.current;

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [undoableAIChange, setUndoableAIChange] = useState<UndoableAIChange | null>(null);

  const isConnectedRef = useLatestRef(isConnected);
  const loadingRef = useLatestRef(loading);

  const [docTitle, setDocTitle] = useState<string>("Untitled document");
  const [docRole, setDocRole] = useState<DocumentRole | null>(null);
  const docRoleRef = useLatestRef(docRole);

  const [selection, setSelection] = useState<EditorSelection>({
    start: 0,
    end: 0,
    text: "",
    pmFrom: 0,
    pmTo: 0,
  });
  const selectionRef = useLatestRef({
    start: selection.start,
    end: selection.end,
  });

  const [sidePanel, setSidePanel] = useState<SidePanel>("none");
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<PendingCommentAnchor | null>(
    null
  );

  const editorRef = useLatestRef<TiptapEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);

  const {
    totalCommentsCount,
    openCommentsCount,
    openComments,
    applyOpenCommentHighlights,
    refreshCommentSummary,
    scheduleRefreshCommentSummary,
    clearScheduledCommentRefresh,
  } = useCommentSummary({
    documentId,
    editorRef,
    setSidePanel,
  });

  useEffect(() => {
    editorRef.current = editorInstance;
    if (editorInstance) {
      applyOpenCommentHighlights(editorInstance, openComments);
    }
  }, [editorInstance, openComments, applyOpenCommentHighlights, editorRef]);

  const initialHtmlRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");
  const hydrateDoneRef = useRef(false);
  const suppressAutosaveRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingSaveHtmlRef = useRef<string | null>(null);

  const seedT1Ref = useRef<number | null>(null);
  const seedT2Ref = useRef<number | null>(null);
  const ySaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    persistDocumentLinkToken();
  }, [documentId]);

  function clearSeedTimers() {
    if (seedT1Ref.current) window.clearTimeout(seedT1Ref.current);
    if (seedT2Ref.current) window.clearTimeout(seedT2Ref.current);
    seedT1Ref.current = null;
    seedT2Ref.current = null;
  }

  function clearYSaveTimer() {
    if (ySaveTimerRef.current) window.clearTimeout(ySaveTimerRef.current);
    ySaveTimerRef.current = null;
  }

  const isCommentAnchorValid = useCallback(
    (comment: Comment) => {
      return Boolean(resolveCommentAnchorInEditor(editorRef.current, comment));
    },
    [editorRef]
  );

  const persistDocumentContent = useCallback(async (nextHtml: string) => {
    const trimmedNext = nextHtml ?? "";
    const trimmedLast = lastSavedContentRef.current ?? "";

    if (trimmedNext === trimmedLast) {
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveHtmlRef.current = trimmedNext;
      return;
    }

    saveInFlightRef.current = true;
    setSaveState("saving");

    try {
      await updateDocument(documentId, trimmedNext);
      lastSavedContentRef.current = trimmedNext;
      pendingSaveHtmlRef.current = null;
      setBanner(null);
      setSaveState("saved");
    } catch (e: any) {
      if (e?.status === 403) {
        setBanner("You do not have permission to edit this document.");
      } else if (e?.status === 401) {
        setBanner("Session expired. Please log in again.");
      } else {
        setBanner(e?.message ?? "Failed to save document");
      }
      pendingSaveHtmlRef.current = trimmedNext;
      setSaveState("error");
    } finally {
      saveInFlightRef.current = false;

      const queued = pendingSaveHtmlRef.current;
      if (queued && queued !== lastSavedContentRef.current) {
        pendingSaveHtmlRef.current = null;
        void persistDocumentContent(queued);
      }
    }
  }, [documentId, setBanner]);

  function applyLiveAIResult(params: {
    finalText: string;
    applyMode: "replace" | "insert_below";
    operation: AIOperation;
    targetSelection: {
      start: number;
      end: number;
      text: string;
      pmFrom: number;
      pmTo: number;
    };
  }) {
    const editor = editorRef.current;
    if (!editor) return;

    const previousHtml = editor.getHTML();
    const from = params.targetSelection.pmFrom;
    const to = params.targetSelection.pmTo;
    const html = textToHtml(params.finalText);

    suppressAutosaveRef.current = true;
    hydrateDoneRef.current = false;

    try {
      if (params.applyMode === "insert_below") {
        const insertPos = Math.max(from, to);
        editor.chain().focus().insertContentAt(insertPos, `<p></p>${html}`).run();
      } else {
        editor.chain().focus().insertContentAt({ from, to }, html).run();
      }

      const nextHtml = editor.getHTML();
      initialHtmlRef.current = nextHtml;
      lastSavedContentRef.current = nextHtml;
      setUndoableAIChange({
        previousHtml,
        label: params.operation === "summarize" ? "AI summary applied" : "AI suggestion applied",
      });
      void persistDocumentContent(nextHtml);
    } finally {
      window.setTimeout(() => {
        hydrateDoneRef.current = true;
        suppressAutosaveRef.current = false;
      }, 0);
    }
  }

  function applyServerContentWithoutAutosave(content: string) {
    const editor = editorRef.current;
    if (!editor) return;

    suppressAutosaveRef.current = true;
    hydrateDoneRef.current = false;

    initialHtmlRef.current = content;
    lastSavedContentRef.current = content;

    try {
      const cmdAny = editor.commands as any;
      if (typeof cmdAny.setContent === "function") {
        try {
          cmdAny.setContent(content, false);
        } catch {
          editor.commands.setContent(content);
        }
      }
    } finally {
      window.setTimeout(() => {
        hydrateDoneRef.current = true;
        suppressAutosaveRef.current = false;
      }, 0);
    }
  }

  async function undoLastAIApply() {
    if (!undoableAIChange) return;

    applyServerContentWithoutAutosave(undoableAIChange.previousHtml);
    setUndoableAIChange(null);
    setBanner(null);
    await persistDocumentContent(undoableAIChange.previousHtml);
  }

  const {
    presenceUsers,
    collabExtensions,
    managerRef,
    canSeedRef,
    initialSyncDoneRef,
  } = useCollabEditorSession({
    documentId,
    me,
    editorRef,
    selectionRef,
    isConnectedRef,
    loadingRef,
    setDocRole,
    setBanner,
    setIsConnected,
    scheduleRefreshCommentSummary,
  });

  useEffect(() => {
    const myLiveColor = presenceUsers.find((u) => u.userId === me.id)?.color?.trim() || null;
    onCurrentUserColorChange?.(myLiveColor);
  }, [presenceUsers, me.id, onCurrentUserColorChange]);

  useEffect(() => {
    return () => {
      onCurrentUserColorChange?.(null);
    };
  }, [onCurrentUserColorChange, documentId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setBanner(null);
      setSaveState("saved");

      initialHtmlRef.current = "";
      lastSavedContentRef.current = "";
      hydrateDoneRef.current = false;
      suppressAutosaveRef.current = false;
      saveInFlightRef.current = false;
      pendingSaveHtmlRef.current = null;

      try {
        const doc = await getDocument(documentId);
        if (!alive) return;

        const role = (doc as any)?.role as DocumentRole | undefined;
        setDocRole(role ?? null);

        const maybeTitle =
          (doc as any)?.title ?? (doc as any)?.name ?? (doc as any)?.documentTitle ?? null;

        setDocTitle(
          typeof maybeTitle === "string" && maybeTitle.trim().length > 0
            ? maybeTitle.trim()
            : "Untitled document"
        );

        const content = (doc as any)?.content || "";
        initialHtmlRef.current = content;
        lastSavedContentRef.current = content;
        setSaveState("saved");

        await refreshCommentSummary({ maybeAutoOpen: true });
      } catch (e: any) {
        if (!alive) return;

        if (e?.status === 403) {
          setBanner("You do not have access to this document.");
        } else if (e?.status === 404) {
          setBanner("Document not found.");
        } else if (e?.status === 401) {
          setBanner("Session expired. Please log in again.");
        } else {
          setBanner(e?.message ?? "Failed to load document");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [documentId, refreshCommentSummary]);

  useEffect(() => {
    const mgr = managerRef.current;
    const editor = editorInstance;
    if (!mgr || !editor) return;

    editor.setEditable(canEdit(docRoleRef.current) && isConnected && !loading);

    clearSeedTimers();

    const html = (initialHtmlRef.current || "").trim();

    if (html.length > 0) {
      const trySeed = () => {
        try {
          if (!canSeedRef.current) return;
          if (!initialSyncDoneRef.current) return;

          const ydoc = mgr.ydoc as any;
          const meta = ydoc.getMap("__meta");

          if (meta.get("seeded") === true) return;

          if (!isYdocEmpty(ydoc)) {
            meta.set("seeded", true);
            return;
          }

          meta.set("seeded", true);

          mgr.ydoc.transact(() => {
            editor.commands.setContent(html);
          });
        } catch {
          // ignore
        }
      };

      seedT1Ref.current = window.setTimeout(trySeed, 50);
      seedT2Ref.current = window.setTimeout(trySeed, 250);
    }

    window.setTimeout(() => {
      hydrateDoneRef.current = true;
    }, 0);

    const onYDocUpdate = () => {
      if (suppressAutosaveRef.current) return;
      if (!hydrateDoneRef.current) return;
      if (!canEdit(docRoleRef.current)) return;
      if (!isConnected) return;
      if (!initialSyncDoneRef.current) return;

      clearYSaveTimer();
      ySaveTimerRef.current = window.setTimeout(() => {
        const editorNow = editorRef.current;
        if (!editorNow) return;

        const nextHtml = editorNow.getHTML();
        initialHtmlRef.current = nextHtml;

        if (nextHtml !== lastSavedContentRef.current) {
          setSaveState("pending");
          void persistDocumentContent(nextHtml);
        }
      }, 900);
    };

    mgr.ydoc.on("update", onYDocUpdate);

    return () => {
      mgr.ydoc.off("update", onYDocUpdate);
      clearSeedTimers();
      clearYSaveTimer();
    };
  }, [
    editorInstance,
    isConnected,
    loading,
    managerRef,
    canSeedRef,
    initialSyncDoneRef,
    docRoleRef,
    editorRef,
    documentId,
    persistDocumentContent,
  ]);

  useEffect(() => {
    return () => {
      clearSeedTimers();
      clearYSaveTimer();
      clearScheduledCommentRefresh();
    };
  }, [documentId, editorInstance, clearScheduledCommentRefresh]);

  function jumpToAnchor(anchor: { start: number; end: number }) {
    const editor = editorInstance;
    if (!editor) return;

    const from = Math.max(0, anchor.start);
    const to = Math.max(from, anchor.end);

    editor.commands.setTextSelection({ from, to });
    editor.commands.focus();

    scrollPosIntoView(editor, from);
  }

  function jumpToResolvedCommentAnchor(comment: Comment) {
    const editor = editorInstance;
    if (!editor) return;

    const resolved = resolveCommentAnchorInEditor(editor, comment);

    if (!resolved) {
      if (comment.anchor) {
        jumpToAnchor(comment.anchor);
      }
      return;
    }

    editor.commands.setTextSelection({
      from: resolved.from,
      to: resolved.to,
    });
    editor.commands.focus();

    scrollPosIntoView(editor, resolved.from);
  }

  const connectionBadge = (
   <span
    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
      isConnected
        ? "bg-green-100 text-green-700"
        : "bg-amber-100 text-amber-700"
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full ${
        isConnected ? "bg-green-500" : "bg-amber-500"
      }`}
    />
    {isConnected ? "Connected" : "Reconnecting"}
   </span>
);

  const saveBadge = (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        saveState === "saved"
          ? "bg-slate-100 text-slate-700"
          : saveState === "saving"
            ? "bg-blue-100 text-blue-700"
            : saveState === "pending"
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          saveState === "saved"
            ? "bg-slate-500"
            : saveState === "saving"
              ? "bg-blue-500"
              : saveState === "pending"
                ? "bg-amber-500"
                : "bg-red-500"
        }`}
      />
      {saveState === "saved"
        ? "Saved"
        : saveState === "saving"
          ? "Saving"
          : saveState === "pending"
            ? "Draft changes"
            : "Save failed"}
    </span>
  );

  const showSidePanel = sidePanel !== "none";
  const bubbleDisabled = loading;

  const editorBody = useMemo(() => {
    if (!collabExtensions) {
      return (
        <div className="px-12 py-10">
          <div className="h-4 w-40 rounded bg-gray-100" />
        </div>
      );
    }

    return (
      <CollabEditor
        loading={loading}
        isConnected={isConnected}
        docRole={docRole}
        extensions={collabExtensions}
        onEditorReady={setEditorInstance}
        onSelectionChange={setSelection}
      />
    );
  }, [collabExtensions, loading, isConnected, docRole]);

   return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back
            </Button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                  {docTitle}
                </h1>
                <span className="hidden sm:inline-flex">{connectionBadge}</span>
                <span className="hidden sm:inline-flex">{saveBadge}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
                 <span>Signed in as {me.name}</span>

                 {docRole && (
                   <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {docRole}
                   </span>
                 )}
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <span className="sm:hidden">{saveBadge}</span>
              <PresenceLayer users={presenceUsers} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/80">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => {
                setSidePanel((cur) => (cur === "versions" ? "none" : "versions"));
                setPendingCommentAnchor(null);
              }}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                sidePanel === "versions"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
              aria-pressed={sidePanel === "versions"}
              title="Open version history"
            >
              Version History
            </button>

            <button
              type="button"
              onClick={() => {
                setSidePanel((cur) => (cur === "ai-history" ? "none" : "ai-history"));
                setPendingCommentAnchor(null);
              }}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                sidePanel === "ai-history"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-700 hover:bg-white hover:text-slate-900"
              }`}
              aria-pressed={sidePanel === "ai-history"}
              title="Open AI interaction history"
            >
              AI Interaction History
            </button>

            {docRole && ["Editor", "Owner"].includes(docRole) && (
              <button
                type="button"
                onClick={() => {
                  const trimmed = selection.text.trim();
                  if (!trimmed) {
                    setBanner("Select text in the editor to open AI suggestions.");
                    return;
                  }

                  setSidePanel((cur) => (cur === "ai" ? "none" : "ai"));
                  setPendingCommentAnchor(null);
                  setBanner(null);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  sidePanel === "ai"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-white hover:text-slate-900"
                }`}
                aria-pressed={sidePanel === "ai"}
                title="Open AI suggestions"
              >
                AI Suggestions
              </button>
            )}

            {totalCommentsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSidePanel((cur) => (cur === "comments" ? "none" : "comments"));
                  setPendingCommentAnchor(null);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  sidePanel === "comments"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-700 hover:bg-white hover:text-slate-900"
                }`}
                aria-pressed={sidePanel === "comments"}
                title="Toggle comments panel"
              >
                Comments
                {openCommentsCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                    {openCommentsCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {banner && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            {banner}
          </div>
        )}

        {undoableAIChange && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>{undoableAIChange.label}. You can undo this accepted AI change.</div>
            <Button variant="secondary" size="sm" onClick={() => void undoLastAIApply()}>
              Undo AI apply
            </Button>
          </div>
        )}

        {docRole && !canEdit(docRole) && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            You have read-only access to this document.
          </div>
        )}

        <div className={`grid gap-5 ${showSidePanel ? "lg:grid-cols-12 lg:gap-6" : ""}`}>
          <div className={showSidePanel ? "lg:col-span-8" : ""}>
            <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <EditorToolbar
                  editor={editorInstance}
                  documentId={documentId}
                  disabled={
                    loading ||
                    !isConnected ||
                    !editorInstance ||
                    !docRole ||
                    !["Editor", "Owner"].includes(docRole)
                  }
                  role={docRole}
                  meId={me.id}
                />
              </div>

              <div className="bg-slate-100/70">
                <div className="mx-auto max-w-[920px] px-3 py-8 sm:px-6 sm:py-10">
                  <div className="rounded-[28px] border border-slate-200 bg-white shadow-md">
                    <div className="relative">
                      <EditorBubbleMenu
                        editor={editorInstance}
                        disabled={bubbleDisabled || !editorInstance}
                        role={docRole}
                        onComment={() => {
                          if (!docRole || !["Commenter", "Editor", "Owner"].includes(docRole)) {
                            setBanner("You do not have permission to comment on this document.");
                            return;
                          }

                          const trimmed = selection.text.trim();
                          if (!trimmed) return;

                          setSidePanel("comments");
                          setPendingCommentAnchor({
                            start: selection.pmFrom,
                            end: selection.pmTo,
                            pmFrom: selection.pmFrom,
                            pmTo: selection.pmTo,
                            text: selection.text,
                          });
                        }}
                        onAI={() => {
                          if (!docRole || !["Editor", "Owner"].includes(docRole)) {
                            setBanner("You do not have permission to use AI on this document.");
                            return;
                          }

                          const trimmed = selection.text.trim();
                          if (!trimmed) return;

                          setSidePanel("ai");
                          setPendingCommentAnchor(null);
                        }}
                      />

                      {editorBody}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {showSidePanel && (
            <div className="lg:col-span-4">
              <div className="sticky top-28">
                <EditorSidePanel
                  sidePanel={sidePanel}
                  documentId={documentId}
                  selection={selection}
                  pendingCommentAnchor={pendingCommentAnchor}
                  role={docRole}
                  meId={me.id}
                  onClose={() => {
                    setSidePanel("none");
                    setPendingCommentAnchor(null);
                  }}
                  onJumpToAnchor={(anchor) => {
                    const matchingComment = openComments.find(
                      (c) => c.anchor?.start === anchor.start && c.anchor?.end === anchor.end
                    );

                    if (matchingComment) {
                      jumpToResolvedCommentAnchor(matchingComment);
                      return;
                    }

                    jumpToAnchor(anchor);
                  }}
                  isAnchorValid={isCommentAnchorValid}
                  onCommentsChanged={async () => {
                    setPendingCommentAnchor(null);
                    await refreshCommentSummary();
                  }}
                  onVersionReverted={async () => {
                    const doc = await getDocument(documentId);

                    const nextTitle =
                      (doc as any)?.title ??
                      (doc as any)?.name ??
                      (doc as any)?.documentTitle ??
                      "Untitled document";

                    const nextContent = (doc as any)?.content ?? "";

                    setDocTitle(
                      typeof nextTitle === "string" && nextTitle.trim().length > 0
                        ? nextTitle.trim()
                        : "Untitled document"
                    );

                    applyServerContentWithoutAutosave(nextContent);

                    setSidePanel("none");
                    setBanner(null);
                  }}
                  onVersionDeleted={async () => {
                    setBanner(null);
                  }}
                  onAIApplied={async ({
                    finalText,
                    applyMode,
                    operation,
                    targetSelection,
                  }) => {
                    applyLiveAIResult({
                      finalText,
                      applyMode,
                      operation,
                      targetSelection,
                    });

                    setSelection({
                      start: 0,
                      end: 0,
                      text: "",
                      pmFrom: 0,
                      pmTo: 0,
                    });
                    setPendingCommentAnchor(null);
                    setBanner(null);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  }
