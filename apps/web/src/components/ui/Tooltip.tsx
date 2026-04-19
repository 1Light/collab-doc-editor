// apps/web/src/components/ui/Tooltip.tsx

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type TooltipChildProps = {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  "aria-describedby"?: string;
};

type Props = {
  content: React.ReactNode;
  children: React.ReactElement<TooltipChildProps>;
  side?: "top" | "bottom";
  delay?: number;
};

type Position = {
  top: number;
  left: number;
};

const GAP = 8;

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 150,
}: Props) {
  const id = useId();

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ top: -9999, left: -9999 });

  useEffect(() => {
    setMounted(true);
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top =
      side === "top"
        ? anchorRect.top - tooltipRect.height - GAP
        : anchorRect.bottom + GAP;

    let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;

    const minLeft = 8;
    const maxLeft = window.innerWidth - tooltipRect.width - 8;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    if (top < 8) {
      top = anchorRect.bottom + GAP;
    }

    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = Math.max(8, anchorRect.top - tooltipRect.height - GAP);
    }

    setPosition({ top, left });
  }, [side]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, content, updatePosition]);

  useEffect(() => {
    if (!visible) return;

    const handle = () => updatePosition();

    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);

    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [visible, content, updatePosition]);

  function show() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  }

  function hide() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }

  const childProps = children.props;

  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      hide();
    },
    "aria-describedby": visible ? id : undefined,
  });

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {child}
      </span>

      {mounted &&
        visible &&
        createPortal(
          <span
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className={cx(
              "pointer-events-none fixed z-[9999] whitespace-nowrap",
              "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5",
              "text-xs text-gray-800 shadow-sm"
            )}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
          >
            {content}
          </span>,
          document.body
        )}
    </>
  );
}
