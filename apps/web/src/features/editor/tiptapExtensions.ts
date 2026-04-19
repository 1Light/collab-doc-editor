import { Extension, type CommandProps } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

import Link from "@tiptap/extension-link";

import { SlashCommand } from "./slashCommands";
import { getCollaborationColor } from "../presence/colorPalette";

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

type CommentHighlight = {
  from: number;
  to: number;
  commentId?: string;
};

type CommentHighlightPluginState = {
  deco: DecorationSet;
};

const commentHighlightKey = new PluginKey<CommentHighlightPluginState>("commentHighlight");

export type CollaborationCursorUser = {
  userId: string;
  name?: string;
  color?: string;
};

export function getCollaborationUserColor(user: CollaborationCursorUser) {
  if (user.color?.trim()) return user.color.trim();
  return getCollaborationColor(user.userId, user.name);
}

export function renderCollaborationCursor(user: CollaborationCursorUser) {
  const color = getCollaborationUserColor(user);
  const label = user.name?.trim() || "Collaborator";

  const wrapper = document.createElement("span");
  wrapper.classList.add("collaboration-cursor");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";
  wrapper.style.pointerEvents = "none";

  const caret = document.createElement("span");
  caret.classList.add("collaboration-cursor__caret");
  caret.style.borderLeft = `2px solid ${color}`;
  caret.style.borderRight = "none";
  caret.style.marginLeft = "-1px";
  caret.style.marginRight = "-1px";
  caret.style.position = "relative";
  caret.style.pointerEvents = "none";
  caret.style.display = "inline-block";
  caret.style.height = "1em";
  caret.style.verticalAlign = "text-top";

  const name = document.createElement("div");
  name.classList.add("collaboration-cursor__label");
  name.style.position = "absolute";
  name.style.top = "-1.45em";
  name.style.left = "-1px";
  name.style.backgroundColor = color;
  name.style.color = "#ffffff";
  name.style.fontSize = "12px";
  name.style.fontWeight = "600";
  name.style.lineHeight = "1";
  name.style.whiteSpace = "nowrap";
  name.style.borderRadius = "6px";
  name.style.padding = "3px 6px";
  name.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.18)";
  name.textContent = label;

  wrapper.appendChild(caret);
  wrapper.appendChild(name);

  return wrapper;
}

export const CommentHighlights = Extension.create({
  name: "commentHighlights",

  addCommands() {
    return {
      setCommentHighlights:
        (highlights: CommentHighlight[]) =>
        ({ editor }: CommandProps) => {
          const { state, view } = editor;
          const maxPos = state.doc.content.size;

          const safe = (Array.isArray(highlights) ? highlights : [])
            .map((h) => {
              const from = Math.max(0, Math.min(Number(h.from) || 0, maxPos));
              const to = Math.max(from, Math.min(Number(h.to) || 0, maxPos));
              const commentId = typeof h.commentId === "string" ? h.commentId : undefined;
              return { from, to, commentId };
            })
            .filter((h) => h.to > h.from);

          const tr = state.tr.setMeta(commentHighlightKey, { type: "set", highlights: safe });
          view.dispatch(tr);
          return true;
        },

      clearCommentHighlights:
        () =>
        ({ editor }: CommandProps) => {
          const { state, view } = editor;
          const tr = state.tr.setMeta(commentHighlightKey, { type: "clear" });
          view.dispatch(tr);
          return true;
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentHighlightPluginState>({
        key: commentHighlightKey,

        state: {
          init() {
            return { deco: DecorationSet.empty };
          },

          apply(tr, prev, _oldState, newState) {
            let deco = prev.deco.map(tr.mapping, newState.doc);

            const meta = tr.getMeta(commentHighlightKey) as
              | { type: "set"; highlights: CommentHighlight[] }
              | { type: "clear" }
              | undefined;

            if (meta?.type === "clear") {
              deco = DecorationSet.empty;
            }

            if (meta?.type === "set") {
              const maxPos = newState.doc.content.size;

              const decos: Decoration[] = [];
              for (const h of meta.highlights) {
                const from = Math.max(0, Math.min(h.from, maxPos));
                const to = Math.max(from, Math.min(h.to, maxPos));
                if (to <= from) continue;

                decos.push(
                  Decoration.inline(from, to, {
                    "data-comment-id": h.commentId ?? "",
                    style:
                      "background-color: rgba(147, 197, 253, 0.28); border-radius: 4px; padding: 0 1px;",
                  })
                );
              }

              deco = DecorationSet.create(newState.doc, decos);
            }

            return { deco };
          },
        },

        props: {
          decorations(state) {
            return commentHighlightKey.getState(state)?.deco ?? null;
          },
        },
      }),
    ];
  },
});

export const tiptapExtensions = [
  StarterKit.configure({
    undoRedo: false,
    codeBlock: {
      HTMLAttributes: {
        class: "editor-code-block",
      },
    },
  }),
  Underline,

  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: {
      class:
        "text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800",
    },
  }),

  CommentHighlights,
  SlashCommand,
];
