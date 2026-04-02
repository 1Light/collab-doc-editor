import { useCallback, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { listComments, type Comment } from "./api";
import type { SidePanel } from "../editor/editorUtils";

type Args = {
  documentId: string;
  editorRef: React.MutableRefObject<TiptapEditor | null>;
  setSidePanel: React.Dispatch<React.SetStateAction<SidePanel>>;
};

function normalizeAnchorText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findQuoteNearAnchor(
  ed: TiptapEditor,
  comment: Comment,
  searchRadius = 400
): { from: number; to: number; commentId: string } | null {
  if (!comment.anchor || !comment.quote) return null;

  const doc = ed.state.doc;
  const docSize = doc.content.size;

  const rawFrom = comment.anchor.start;
  const rawTo = comment.anchor.end;

  const from = Math.max(0, Math.min(rawFrom, docSize));
  const to = Math.max(0, Math.min(rawTo, docSize));

  if (to <= from) return null;

  const originalQuote = normalizeAnchorText(comment.quote);
  if (!originalQuote) return null;

  const exactText = normalizeAnchorText(doc.textBetween(from, to, " ", " "));
  if (exactText && exactText === originalQuote) {
    return {
      from,
      to,
      commentId: comment.commentId,
    };
  }

  const searchFrom = Math.max(0, from - searchRadius);
  const searchTo = Math.min(docSize, to + searchRadius);

  if (searchTo <= searchFrom) return null;

  const windowTextRaw = doc.textBetween(searchFrom, searchTo, "\n", "\n");
  const windowText = normalizeAnchorText(windowTextRaw);

  if (!windowText) return null;

  const pattern = new RegExp(escapeRegExp(originalQuote), "i");
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
    commentId: comment.commentId,
  };
}

function getValidHighlightAnchors(ed: TiptapEditor | null, comments: Comment[]) {
  if (!ed) return [];

  return (Array.isArray(comments) ? comments : [])
    .filter(
      (c) =>
        c.status === "open" &&
        c.anchor &&
        typeof c.anchor.start === "number" &&
        typeof c.anchor.end === "number" &&
        typeof c.quote === "string" &&
        c.quote.trim().length > 0
    )
    .map((c) => findQuoteNearAnchor(ed, c))
    .filter((a): a is { from: number; to: number; commentId: string } => Boolean(a));
}

export function useCommentSummary({ documentId, editorRef, setSidePanel }: Args) {
  const [totalCommentsCount, setTotalCommentsCount] = useState<number>(0);
  const [openCommentsCount, setOpenCommentsCount] = useState<number>(0);
  const [openComments, setOpenComments] = useState<Comment[]>([]);

  const commentSummaryRefreshTimeoutRef = useRef<number | null>(null);
  const lastCommentSummaryRefreshAtRef = useRef<number>(0);

  const applyOpenCommentHighlights = useCallback(
    (ed: TiptapEditor | null, comments: Comment[]) => {
      if (!ed) return;

      const anchors = getValidHighlightAnchors(ed, comments);
      const cmdAny = ed.commands as any;

      if (typeof cmdAny.setCommentHighlights !== "function") return;

      if (anchors.length === 0) {
        if (typeof cmdAny.clearCommentHighlights === "function") {
          cmdAny.clearCommentHighlights();
        }
        return;
      }

      cmdAny.setCommentHighlights(anchors);
    },
    []
  );

  const refreshCommentSummary = useCallback(
    async (opts?: { maybeAutoOpen?: boolean }) => {
      lastCommentSummaryRefreshAtRef.current = Date.now();

      try {
        const [all, open] = await Promise.all([
          listComments(documentId, "all"),
          listComments(documentId, "open"),
        ]);

        const totalCount = Array.isArray(all) ? all.length : 0;
        const openCount = Array.isArray(open) ? open.length : 0;

        setTotalCommentsCount(totalCount);
        setOpenCommentsCount(openCount);

        const openItems = Array.isArray(open) ? open : [];
        setOpenComments(openItems);

        applyOpenCommentHighlights(editorRef.current, openItems);

        if (totalCount === 0) {
          setSidePanel((cur) => (cur === "comments" ? "none" : cur));
        }

        if (opts?.maybeAutoOpen && totalCount > 0) {
          setSidePanel((cur) => (cur === "ai" || cur === "versions" ? cur : "comments"));
        }
      } catch {
        setTotalCommentsCount(0);
        setOpenCommentsCount(0);
        setOpenComments([]);

        const ed = editorRef.current;
        const cmdAny = ed?.commands as any;

        if (ed && typeof cmdAny?.clearCommentHighlights === "function") {
          cmdAny.clearCommentHighlights();
        }

        setSidePanel((cur) => (cur === "comments" ? "none" : cur));
      }
    },
    [applyOpenCommentHighlights, documentId, editorRef, setSidePanel]
  );

  const scheduleRefreshCommentSummary = useCallback(
    (opts?: { maybeAutoOpen?: boolean }) => {
      const now = Date.now();
      const elapsed = now - lastCommentSummaryRefreshAtRef.current;

      if (commentSummaryRefreshTimeoutRef.current !== null) {
        window.clearTimeout(commentSummaryRefreshTimeoutRef.current);
        commentSummaryRefreshTimeoutRef.current = null;
      }

      if (elapsed > 250) {
        void refreshCommentSummary(opts);
        return;
      }

      commentSummaryRefreshTimeoutRef.current = window.setTimeout(() => {
        commentSummaryRefreshTimeoutRef.current = null;
        void refreshCommentSummary(opts);
      }, 250);
    },
    [refreshCommentSummary]
  );

  const clearScheduledCommentRefresh = useCallback(() => {
    if (commentSummaryRefreshTimeoutRef.current !== null) {
      window.clearTimeout(commentSummaryRefreshTimeoutRef.current);
      commentSummaryRefreshTimeoutRef.current = null;
    }
  }, []);

  return {
    totalCommentsCount,
    openCommentsCount,
    openComments,
    applyOpenCommentHighlights,
    refreshCommentSummary,
    scheduleRefreshCommentSummary,
    clearScheduledCommentRefresh,
  };
}