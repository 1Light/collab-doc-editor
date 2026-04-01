import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";

import "prosemirror-view/style/prosemirror.css";

import { canEdit, type DocumentRole } from "./editorUtils";

type Props = {
  loading: boolean;
  isConnected: boolean;
  docRole: DocumentRole | null;
  extensions: any[];
  onEditorReady: (ed: TiptapEditor | null) => void;
  onSelectionChange: (sel: {
    start: number;
    end: number;
    text: string;
    pmFrom: number;
    pmTo: number;
  }) => void;
};

function getSelectionSnapshot(editor: TiptapEditor): {
  start: number;
  end: number;
  text: string;
  pmFrom: number;
  pmTo: number;
} {
  const { from, to } = editor.state.selection;
  const doc = editor.state.doc;

  const start = doc.textBetween(0, from, "\n", "\n").length;
  const end = doc.textBetween(0, to, "\n", "\n").length;
  const text = doc.textBetween(from, to, "\n", "\n");

  return {
    start,
    end,
    text,
    pmFrom: from,
    pmTo: to,
  };
}

export function CollabEditor(props: Props) {
  const notifySelectionFrameRef = useRef<number | null>(null);

  const extensionsKey = useMemo(() => {
    return props.extensions
      .map((ext: any, idx: number) => {
        if (!ext) return `null:${idx}`;

        const name =
          typeof ext?.name === "string"
            ? ext.name
            : typeof ext?.config?.name === "string"
              ? ext.config.name
              : `anon:${idx}`;

        return `${idx}:${name}`;
      })
      .join("|");
  }, [props.extensions]);

  function emitSelectionChange(editor: TiptapEditor) {
    const next = getSelectionSnapshot(editor);

    if (notifySelectionFrameRef.current != null) {
      cancelAnimationFrame(notifySelectionFrameRef.current);
    }

    notifySelectionFrameRef.current = requestAnimationFrame(() => {
      props.onSelectionChange(next);
      notifySelectionFrameRef.current = null;
    });
  }

  function syncCursorToAwareness(editor: TiptapEditor) {
    const manager = (window as any).__editorManager;
    if (!manager || typeof manager.updateCursor !== "function") return;

    const { from, to } = editor.state.selection;
    manager.updateCursor(from, to);
  }

  const editor = useEditor(
    {
      extensions: props.extensions,
      autofocus: false,
      editorProps: {
        attributes: {
          class: [
            "prose prose-sm sm:prose-base prose-gray max-w-none",
            "text-gray-900",
            "focus:outline-none",
            "min-h-[58vh] lg:min-h-[72vh]",
            "px-6 py-8 sm:px-12 sm:py-10",
            "leading-relaxed",
            "ProseMirror",
            "cursor-text",
            "select-text",
          ].join(" "),
        },
        handleDOMEvents: {
          blur: () => {
            const manager = (window as any).__editorManager;
            if (manager && typeof manager.clearCursor === "function") {
              manager.clearCursor();
            }
            return false;
          },
        },
      },
      onCreate(ctx) {
        syncCursorToAwareness(ctx.editor);
        emitSelectionChange(ctx.editor);
      },
      onFocus(ctx) {
        syncCursorToAwareness(ctx.editor);
        emitSelectionChange(ctx.editor);
      },
      onSelectionUpdate(ctx) {
        emitSelectionChange(ctx.editor);
        syncCursorToAwareness(ctx.editor);
      },
      onTransaction(ctx) {
        emitSelectionChange(ctx.editor);
        syncCursorToAwareness(ctx.editor);
      },
    },
    [extensionsKey]
  );

  useEffect(() => {
    props.onEditorReady(editor ?? null);
    return () => props.onEditorReady(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit(props.docRole) && props.isConnected && !props.loading);
  }, [editor, props.docRole, props.isConnected, props.loading]);

  useEffect(() => {
    return () => {
      if (notifySelectionFrameRef.current != null) {
        cancelAnimationFrame(notifySelectionFrameRef.current);
      }

      const manager = (window as any).__editorManager;
      if (manager && typeof manager.clearCursor === "function") {
        manager.clearCursor();
      }
    };
  }, []);

  if (!editor) {
    return (
      <div className="px-12 py-10">
        <div className="h-4 w-40 rounded bg-gray-100" />
      </div>
    );
  }

  return <EditorContent key={extensionsKey} editor={editor} />;
}