// apps/web/src/components/ui/DropdownMenu.tsx

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover } from "./Popover";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

function getFirstEnabledIndex(items: DropdownMenuItem[]) {
  const idx = items.findIndex((it) => !it.disabled);
  return idx >= 0 ? idx : 0;
}

export type DropdownMenuItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props = {
  label: string;
  value: string;
  items: DropdownMenuItem[];
  onChange: (id: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  buttonClassName?: string;
};

export function DropdownMenu({
  label,
  value,
  items,
  onChange,
  disabled,
  align = "left",
  buttonClassName,
}: Props) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null!);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const selectedIdx = items.findIndex((it) => it.id === value && !it.disabled);
    return selectedIdx >= 0 ? selectedIdx : getFirstEnabledIndex(items);
  });

  const selected = useMemo(
    () => items.find((it) => it.id === value) ?? null,
    [items, value]
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => {
          let next = i;
          for (let step = 0; step < items.length; step++) {
            next = Math.min(items.length - 1, next + 1);
            if (!items[next]?.disabled) return next;
          }
          return i;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => {
          let next = i;
          for (let step = 0; step < items.length; step++) {
            next = Math.max(0, next - 1);
            if (!items[next]?.disabled) return next;
          }
          return i;
        });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const it = items[activeIndex];
        if (!it || it.disabled) return;
        onChange(it.id);
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items, activeIndex, onChange]);

  useEffect(() => {
    if (!open) return;

    const selectedIdx = items.findIndex((it) => it.id === value && !it.disabled);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : getFirstEnabledIndex(items));
  }, [open, items, value]);

  return (
    <div className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "h-9 inline-flex items-center gap-2 rounded-md",
          "bg-transparent px-2.5 text-[12px] text-gray-900",
          "border border-transparent hover:border-gray-200 hover:bg-gray-50",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
          "disabled:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-transparent",
          "transition-colors",
          buttonClassName
        )}
      >
        <span className="sr-only">{label}</span>
        <span className="max-w-[160px] truncate">{selected?.label ?? label}</span>
        <span className="text-gray-400 text-[11px]">▾</span>
      </button>

      <Popover
        anchorRef={buttonRef}
        open={open}
        onClose={() => {
          setOpen(false);
          buttonRef.current?.focus();
        }}
        placement={align === "right" ? "bottom-end" : "bottom-start"}
      >
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(
            "w-72 overflow-hidden rounded-xl",
            "border border-gray-200 bg-white shadow-lg"
          )}
        >
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="text-[11px] font-semibold text-gray-900">{label}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              ↑↓ navigate : Enter select
            </div>
          </div>

          <div className="max-h-72 overflow-auto p-1">
            {items.map((it, idx) => {
              const isSelected = it.id === value;
              const isActive = idx === activeIndex;

              return (
                <button
                  key={it.id}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (it.disabled) return;
                    onChange(it.id);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left",
                    "transition-colors duration-150",
                    it.disabled && "opacity-50 cursor-not-allowed",
                    !it.disabled && "hover:bg-gray-50",
                    isActive && !it.disabled && "bg-blue-50",
                    !isActive && "bg-transparent"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {it.label}
                      </div>
                      {it.description && (
                        <div className="mt-0.5 text-xs leading-snug text-gray-600">
                          {it.description}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <div className="shrink-0 text-sm text-gray-900">✓</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}