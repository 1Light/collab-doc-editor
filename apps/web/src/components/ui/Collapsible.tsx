// apps/web/src/components/ui/Collapsible.tsx

import React, { useId, useState } from "react";

type Props = {
  title: string;
  preview?: string;
  children: React.ReactNode;
};

export function Collapsible({ title, preview, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full rounded-2xl px-4 py-3 text-left",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          "transition-colors hover:bg-gray-50",
        ].join(" ")}
        aria-expanded={open}
        aria-controls={id}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">{title}</div>
            {preview ? (
              <div className="mt-1 truncate text-xs text-gray-600">{preview}</div>
            ) : null}
          </div>

          <div className="shrink-0 text-xs font-medium text-gray-700">
            {open ? "Hide" : "Show"}
          </div>
        </div>
      </button>

      {open ? (
        <div id={id} className="px-4 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}