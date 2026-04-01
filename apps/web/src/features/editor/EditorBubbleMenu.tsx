import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Editor } from "@tiptap/react";
import { IconButton } from "../../components/ui/IconButton";

type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner" | null;

type Props = {
  editor: Editor | null;
  disabled?: boolean;
  role?: DocumentRole;
  onComment?: () => void;
  onAI?: () => void;
};

type Pos = {
  top: number;
  left: number;
  visible: boolean;
  placement: "top" | "bottom";
};

type DragOffset = {
  x: number;
  y: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function findRelativeRoot(el: HTMLElement | null) {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.classList.contains("relative")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function canEdit(role: DocumentRole) {
  return role === "Owner" || role === "Editor";
}

function canComment(role: DocumentRole) {
  return role === "Owner" || role === "Editor" || role === "Commenter";
}

export function EditorBubbleMenu({ editor, disabled, role, onComment, onAI }: Props) {
  const [pos, setPos] = useState<Pos>({
    top: 0,
    left: 0,
    visible: false,
    placement: "top",
  });

  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const selectionKeyRef = useRef<string>("");

  const allowEdit = canEdit(role ?? null);
  const allowComment = canComment(role ?? null);

  useEffect(() => {
    if (!editor || disabled) {
      setPos((p) => ({ ...p, visible: false }));
      return;
    }

    const update = () => {
      const { from, to } = editor.state.selection;

      if (from === to) {
        setPos((p) => ({ ...p, visible: false }));
        return;
      }

      const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
      if (!selectedText) {
        setPos((p) => ({ ...p, visible: false }));
        return;
      }

      const nextSelectionKey = `${from}:${to}:${selectedText}`;
      if (selectionKeyRef.current !== nextSelectionKey) {
        selectionKeyRef.current = nextSelectionKey;
        setDragOffset({ x: 0, y: 0 });
      }

      let start: { left: number; right: number; top: number; bottom: number };
      let end: { left: number; right: number; top: number; bottom: number };

      try {
        start = editor.view.coordsAtPos(from);
        end = editor.view.coordsAtPos(to);
      } catch {
        setPos((p) => ({ ...p, visible: false }));
        return;
      }

      const rect = {
        left: Math.min(start.left, end.left),
        right: Math.max(start.right, end.right),
        top: Math.min(start.top, end.top),
        bottom: Math.max(start.bottom, end.bottom),
        width: Math.max(1, Math.max(start.right, end.right) - Math.min(start.left, end.left)),
        height: Math.max(1, Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top)),
      };

      const anchorEl = anchorRef.current;
      const root = findRelativeRoot(anchorEl) ?? (anchorEl?.offsetParent as HTMLElement | null);
      const rootRect = root?.getBoundingClientRect();

      const rootTop = rootRect?.top ?? 0;
      const rootLeft = rootRect?.left ?? 0;
      const rootWidth = rootRect?.width ?? window.innerWidth;

      const centerX = rect.left - rootLeft + rect.width / 2;

      const topCandidate = rect.top - rootTop - 12;
      const bottomCandidate = rect.bottom - rootTop + 12;

      const placement: "top" | "bottom" = topCandidate < 56 ? "bottom" : "top";
      const top = placement === "top" ? topCandidate : bottomCandidate;
      const left = clamp(centerX, 40, Math.max(40, rootWidth - 40));

      setPos({
        top: clamp(top, 8, 100000),
        left,
        visible: true,
        placement,
      });
    };

    const onSelection = () => window.requestAnimationFrame(update);

    editor.on("selectionUpdate", onSelection);
    editor.on("transaction", onSelection);
    window.addEventListener("scroll", onSelection, true);
    window.addEventListener("resize", onSelection);

    onSelection();

    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("transaction", onSelection);
      window.removeEventListener("scroll", onSelection, true);
      window.removeEventListener("resize", onSelection);
    };
  }, [editor, disabled]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;

      const dx = e.clientX - start.pointerX;
      const dy = e.clientY - start.pointerY;

      setDragOffset({
        x: start.startX + dx,
        y: start.startY + dy,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isDragging]);

  if (!editor || disabled) return <div ref={anchorRef} />;

  const { from, to } = editor.state.selection;
  const hasSelection = from !== to && editor.state.doc.textBetween(from, to, " ").trim().length > 0;

  const canUseFormatting = allowEdit && hasSelection && !disabled;
  const canUseComment = Boolean(onComment) && allowComment && hasSelection && !disabled;
  const canUseAI = Boolean(onAI) && allowComment && hasSelection && !disabled;

  const keepSelection = (e: ReactMouseEvent) => e.preventDefault();

  const handleDragStart = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: dragOffset.x,
      startY: dragOffset.y,
    };

    setIsDragging(true);
  };

  const translateBase =
    pos.placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0%)";

  return (
    <div ref={anchorRef} className="pointer-events-none">
      <div
        className={[
          "pointer-events-auto absolute z-30",
          "transition-[opacity,transform] duration-200 ease-out will-change-transform",
          pos.visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
          isDragging ? "select-none" : "",
        ].join(" ")}
        style={{
          top: pos.top + dragOffset.y,
          left: pos.left + dragOffset.x,
          transform: `${translateBase} translate3d(0, 0, 0)`,
        }}
        aria-hidden={!pos.visible}
      >
        <div className="flex items-center gap-1 rounded-[28px] border border-gray-200/90 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-md">
          <button
            type="button"
            aria-label="Drag toolbar"
            title="Drag toolbar"
            onPointerDown={handleDragStart}
            onMouseDown={(e) => e.preventDefault()}
            className={[
              "mr-1 flex h-9 w-7 cursor-grab items-center justify-center rounded-xl text-gray-400 transition",
              "hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing",
            ].join(" ")}
          >
            <span className="grid grid-cols-2 gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
          </button>

          <IconButton
            label="Bold"
            title={allowEdit ? "Bold" : "Read-only"}
            active={editor.isActive("bold")}
            disabled={!canUseFormatting}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseFormatting) return;
              editor.chain().focus().toggleBold().run();
            }}
          >
            B
          </IconButton>

          <IconButton
            label="Italic"
            title={allowEdit ? "Italic" : "Read-only"}
            active={editor.isActive("italic")}
            disabled={!canUseFormatting}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseFormatting) return;
              editor.chain().focus().toggleItalic().run();
            }}
          >
            I
          </IconButton>

          <IconButton
            label="Underline"
            title={allowEdit ? "Underline" : "Read-only"}
            active={editor.isActive("underline")}
            disabled={!canUseFormatting}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseFormatting) return;
              editor.chain().focus().toggleUnderline().run();
            }}
          >
            U
          </IconButton>

          <IconButton
            label="Strike"
            title={allowEdit ? "Strikethrough" : "Read-only"}
            active={editor.isActive("strike")}
            disabled={!canUseFormatting}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseFormatting) return;
              editor.chain().focus().toggleStrike().run();
            }}
          >
            S
          </IconButton>

          <div className="mx-1 h-5 w-px bg-gray-200" />

          <IconButton
            label="Comment"
            title={canUseComment ? "Add comment" : "No permission to comment"}
            active={false}
            disabled={!canUseComment}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseComment) return;
              onComment?.();
            }}
          >
            💬
          </IconButton>

          <IconButton
            label="AI"
            title={canUseAI ? "Ask AI about selection" : "No permission"}
            active={false}
            disabled={!canUseAI}
            onMouseDown={keepSelection}
            onClick={() => {
              if (!canUseAI) return;
              onAI?.();
            }}
          >
            ✨
          </IconButton>
        </div>
      </div>
    </div>
  );
}