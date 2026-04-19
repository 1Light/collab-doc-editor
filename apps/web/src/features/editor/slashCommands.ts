import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { Editor } from "@tiptap/core";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { SlashCommandMenu } from "./SlashCommandMenu";

type CommandId = "h1" | "h2" | "h3" | "bullets" | "numbers" | "paragraph" | "code";

export type SlashCommandItem = {
  id: CommandId;
  title: string;
  description: string;
  keywords: string[];
  run: (ctx: { editor: Editor; range: { from: number; to: number } }) => void;
};

function createItems(): SlashCommandItem[] {
  return [
    {
      id: "paragraph",
      title: "Paragraph",
      description: "Start with plain text.",
      keywords: ["p", "text", "paragraph", "normal"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).clearNodes().setParagraph().run();
      },
    },
    {
      id: "h1",
      title: "Heading 1",
      description: "Large section heading.",
      keywords: ["h1", "heading", "title", "section"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 1 }).run();
      },
    },
    {
      id: "h2",
      title: "Heading 2",
      description: "Medium section heading.",
      keywords: ["h2", "heading", "subtitle"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 2 }).run();
      },
    },
    {
      id: "h3",
      title: "Heading 3",
      description: "Small section heading.",
      keywords: ["h3", "heading"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).clearNodes().setHeading({ level: 3 }).run();
      },
    },
    {
      id: "bullets",
      title: "Bulleted list",
      description: "Create a simple bulleted list.",
      keywords: ["list", "bullets", "ul", "unordered"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      id: "numbers",
      title: "Numbered list",
      description: "Create a numbered list.",
      keywords: ["list", "numbers", "ol", "ordered"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      id: "code",
      title: "Code block",
      description: "Insert a monospaced multi-line code block.",
      keywords: ["code", "snippet", "pre", "block"],
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
  ];
}

function normalize(s: string) {
  return (s ?? "").toLowerCase().trim();
}

function filterItems(items: SlashCommandItem[], query: string) {
  const q = normalize(query);
  if (!q) return items;

  return items
    .map((it) => {
      const hay = [it.title, it.description, ...it.keywords].join(" ").toLowerCase();
      const score = hay.includes(q) ? 2 : it.keywords.some((k) => k.includes(q)) ? 1 : 0;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it);
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        allowSpaces: true,
      },
    };
  },

  addProseMirrorPlugins() {
    const items = createItems();

    let root: Root | null = null;
    let container: HTMLDivElement | null = null;

    const ensure = () => {
      if (container && root) return { container, root };

      container = document.createElement("div");
      container.className = "fixed inset-0 z-[60] pointer-events-none";
      document.body.appendChild(container);

      const mount = document.createElement("div");
      mount.className = "pointer-events-auto";
      container.appendChild(mount);

      root = createRoot(mount);
      return { container, root };
    };

    const destroy = () => {
      try {
        root?.unmount();
      } catch {
        // ignore
      }
      root = null;

      if (container?.parentNode) container.parentNode.removeChild(container);
      container = null;
    };

    const plugin = Suggestion({
      editor: this.editor,
      ...this.options.suggestion,

      items: ({ query }: { query: string }) => filterItems(items, query).slice(0, 8),

      render: () => {
        let activeIndex = 0;
        let latestItems: SlashCommandItem[] = [];
        let latestEditor: Editor = this.editor as unknown as Editor;
        let latestRange: { from: number; to: number } = { from: 0, to: 0 };
        let latestClientRect: DOMRect | null = null;

        const onSelect = (index: number) => {
          const item = latestItems[index];
          if (!item) return;
          item.run({ editor: latestEditor, range: latestRange });
        };

        const onKeyDown = (event: KeyboardEvent) => {
          if (!latestItems.length) return false;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % latestItems.length;
            renderNow();
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + latestItems.length) % latestItems.length;
            renderNow();
            return true;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            onSelect(activeIndex);
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            destroy();
            return true;
          }

          return false;
        };

        const renderNow = () => {
          const { root: r } = ensure();
          r.render(
            React.createElement(SlashCommandMenu, {
              items: latestItems,
              activeIndex,
              clientRect: latestClientRect,
              onSelect,
            })
          );
        };

        return {
          onStart: (props: any) => {
            activeIndex = 0;
            latestItems = props.items ?? [];
            latestEditor = props.editor;
            latestRange = props.range;
            latestClientRect = props.clientRect ? props.clientRect() : null;
            renderNow();
          },
          onUpdate: (props: any) => {
            latestItems = props.items ?? [];
            latestEditor = props.editor;
            latestRange = props.range;
            latestClientRect = props.clientRect ? props.clientRect() : null;
            if (activeIndex >= latestItems.length) activeIndex = 0;
            renderNow();
          },
          onKeyDown: (props: any) => {
            return onKeyDown(props.event);
          },
          onExit: () => {
            destroy();
          },
        };
      },
    });

    return [plugin];
  },
});
