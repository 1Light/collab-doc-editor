import { useEffect, useRef } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

export type PresenceUser = {
  userId: string;
  name?: string;
  color?: string;
  status?: "active" | "idle" | "offline";
};

export type SidePanel = "none" | "comments" | "ai" | "versions";
export type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner";

export type CommentChangedEvent = {
  documentId: string;
  action: "created" | "updated" | "resolved" | "deleted";
  commentId: string;
  actorUserId: string;
  parentCommentId?: string | null;
  status?: "open" | "resolved" | null;
  emittedAt?: string;
};

export function readMe(): { id: string; name: string } {
  const raw = localStorage.getItem("me");
  if (!raw) return { id: "unknown", name: "Unknown" };

  try {
    const u = JSON.parse(raw);
    return {
      id: u.id ?? "unknown",
      name: u.name ?? "Unknown",
    };
  } catch {
    return { id: "unknown", name: "Unknown" };
  }
}

export function canEdit(role: DocumentRole | null) {
  return role === "Owner" || role === "Editor";
}

export function isYdocEmpty(ydoc: any): boolean {
  try {
    const frag = ydoc.getXmlFragment("default");
    const asString = typeof frag?.toString === "function" ? frag.toString() : "";
    return asString.trim().length === 0;
  } catch {
    return true;
  }
}

export function useLatestRef<T>(value: T) {
  const r = useRef(value);

  useEffect(() => {
    r.current = value;
  }, [value]);

  return r;
}

export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;

  while (cur) {
    const style = window.getComputedStyle(cur);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll") && cur.scrollHeight > cur.clientHeight;

    if (canScroll) return cur;
    cur = cur.parentElement;
  }

  return null;
}

export function scrollPosIntoView(editor: TiptapEditor, pos: number) {
  const editorDom = editor.view.dom as HTMLElement;
  const scrollParent = findScrollParent(editorDom);

  const STICKY_HEADER_OFFSET = 140;

  const doScroll = () => {
    const coords = editor.view.coordsAtPos(pos);

    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const targetTop =
        scrollParent.scrollTop + (coords.top - parentRect.top) - STICKY_HEADER_OFFSET;

      scrollParent.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "auto",
      });
      return;
    }

    const targetY = window.scrollY + coords.top - STICKY_HEADER_OFFSET;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "auto" });
  };

  try {
    doScroll();

    window.requestAnimationFrame(() => {
      try {
        doScroll();
      } catch {
        // ignore
      }
    });

    window.setTimeout(() => {
      try {
        doScroll();
      } catch {
        // ignore
      }
    }, 30);
  } catch {
    // ignore
  }
}