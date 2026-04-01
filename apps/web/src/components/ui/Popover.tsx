// apps/web/src/components/ui/Popover.tsx

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

type Props = {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  placement?: Placement;
  offset?: number;
  /**
   * Approx popover height used for viewport flipping.
   * Keep conservative so we flip early.
   */
  approxHeight?: number;
};

export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  placement = "bottom-start",
  offset = 8,
  approxHeight = 260,
}: Props) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; actualPlacement: Placement } | null>(
    null
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;

      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;

      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();

    const compute = (desired: Placement): { top: number; left: number; placement: Placement } => {
      const isTop = desired.startsWith("top");
      const isEnd = desired.endsWith("end");

      const top = isTop ? anchorRect.top - offset : anchorRect.bottom + offset;
      const left = isEnd ? anchorRect.right : anchorRect.left;

      return { top, left, placement: desired };
    };

    let desired = placement;
    let { top, left, placement: finalPlacement } = compute(desired);

    // Flip if overflowing viewport vertically
    if (desired.startsWith("bottom") && anchorRect.bottom + offset + approxHeight > window.innerHeight) {
      desired = desired.replace("bottom", "top") as Placement;
      const res = compute(desired);
      top = res.top;
      left = res.left;
      finalPlacement = res.placement;
    }

    if (desired.startsWith("top") && anchorRect.top - offset - approxHeight < 0) {
      desired = desired.replace("top", "bottom") as Placement;
      const res = compute(desired);
      top = res.top;
      left = res.left;
      finalPlacement = res.placement;
    }

    setPos({ top, left, actualPlacement: finalPlacement });
  }, [open, placement, offset, approxHeight, anchorRef]);

  if (!mounted || !open || !pos) return null;

  const isTop = pos.actualPlacement.startsWith("top");
  const isEnd = pos.actualPlacement.endsWith("end");

  return createPortal(
    <div
      ref={popRef}
      className={cx("fixed z-[100] transition-all duration-150 ease-out", "opacity-100 scale-100")}
      style={{
        top: pos.top,
        left: pos.left,
        transform: isTop
          ? isEnd
            ? "translate(-100%, -100%)"
            : "translate(0%, -100%)"
          : isEnd
          ? "translate(-100%, 0%)"
          : "translate(0%, 0%)",
      }}
    >
      {children}
    </div>,
    document.body
  );
}