import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SlashCommandItem } from "./slashCommands";

type Props = {
  items: SlashCommandItem[];
  activeIndex: number;
  clientRect: DOMRect | null;
  onSelect: (index: number) => void;
};

type DragOffset = {
  x: number;
  y: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useScrollIntoView(activeIndex: number) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (!el) return;

    const parent = el.closest('[data-role="slash-menu-scroll"]') as HTMLElement | null;
    if (!parent) return;

    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = parent.scrollTop;
    const viewBottom = viewTop + parent.clientHeight;

    if (elTop < viewTop) parent.scrollTop = elTop - 12;
    else if (elBottom > viewBottom) parent.scrollTop = elBottom - parent.clientHeight + 12;
  }, [activeIndex]);

  return itemRefs;
}

export function SlashCommandMenu({ items, activeIndex, clientRect, onSelect }: Props) {
  const itemRefs = useScrollIntoView(activeIndex);

  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [clientRect?.left, clientRect?.top, clientRect?.bottom]);

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;

      const dx = e.clientX - start.pointerX;
      const dy = e.clientY - start.pointerY;

      setDragOffset({
        x: start.startX + dx,
        y: start.startY + dy,
      });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isDragging]);

  const pos = useMemo(() => {
    const fallback = { top: 96, left: 24 };

    if (!clientRect) return fallback;

    const menuWidth = 400;
    const menuHeight = 360;

    const top = clientRect.bottom + 10;
    const left = clientRect.left - 10;

    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - menuHeight - 12);

    return {
      top: clamp(top, 12, maxTop),
      left: clamp(left, 12, maxLeft),
    };
  }, [clientRect]);

  const finalTop = clamp(pos.top + dragOffset.y, 12, Math.max(12, window.innerHeight - 120));
  const finalLeft = clamp(pos.left + dragOffset.x, 12, Math.max(12, window.innerWidth - 220));

  const handleDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: dragOffset.x,
      startY: dragOffset.y,
    };

    setIsDragging(true);
  };

  if (!items.length) {
    return (
      <div
        className="fixed z-[70]"
        style={{ top: finalTop, left: finalLeft }}
        role="dialog"
        aria-label="Slash commands"
      >
        <div className="w-[400px] rounded-[24px] border border-gray-200/80 bg-white/95 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div
              className="flex cursor-grab items-center gap-2 text-sm font-semibold text-gray-900 active:cursor-grabbing"
              onPointerDown={handleDragStart}
            >
              <span className="grid grid-cols-2 gap-0.5 text-gray-400">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
              Insert
            </div>
          </div>

          <div className="px-4 py-3 text-sm text-gray-600">
            No results. Try a different keyword.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[70]"
      style={{ top: finalTop, left: finalLeft }}
      role="dialog"
      aria-label="Slash commands"
    >
      <div
        className={[
          "w-[400px] overflow-hidden rounded-[24px] border border-gray-200/80 bg-white/95 shadow-xl backdrop-blur-md",
          "transition-[box-shadow,transform] duration-150 ease-out",
          isDragging ? "shadow-2xl" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div
            className="flex cursor-grab items-center gap-2 text-sm font-semibold text-gray-900 active:cursor-grabbing"
            onPointerDown={handleDragStart}
          >
            <span className="grid grid-cols-2 gap-0.5 text-gray-400">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
            Insert
          </div>

          <div className="text-xs text-gray-500">↑↓ navigate : Enter select</div>
        </div>

        <div data-role="slash-menu-scroll" className="max-h-[320px] overflow-auto p-2">
          {items.map((it, idx) => {
            const active = idx === activeIndex;

            return (
              <button
                key={it.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(idx);
                }}
                className={[
                  "w-full rounded-2xl px-4 py-3 text-left",
                  "focus:outline-none",
                  "transition-all duration-150 ease-out",
                  active ? "bg-gray-900 text-white shadow-sm" : "text-gray-900 hover:bg-gray-50",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{it.title}</div>
                  <div
                    className={[
                      "mt-1 text-sm leading-snug",
                      active ? "text-white/80" : "text-gray-600",
                    ].join(" ")}
                  >
                    {it.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}