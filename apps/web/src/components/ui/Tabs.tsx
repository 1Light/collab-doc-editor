// apps/web/src/components/ui/Tabs.tsx

import React, { useMemo, useState } from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Tab = {
  value: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  panels: Record<string, React.ReactNode>;
  defaultValue?: string;

  // NEW (controlled support)
  value?: string;
  onValueChange?: (value: string) => void;
};

export function Tabs({ tabs, panels, defaultValue, value, onValueChange }: Props) {
  const initial = useMemo(() => {
    if (defaultValue && tabs.some((t) => t.value === defaultValue)) return defaultValue;
    return tabs[0]?.value ?? "";
  }, [defaultValue, tabs]);

  const [internalValue, setInternalValue] = useState(initial);

  if (!tabs.length) return null;

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  function setValue(next: string) {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
        {tabs.map((t) => {
          const active = t.value === currentValue;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setValue(t.value)}
              className={cx(
                "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100",
                active ? "bg-white text-gray-900 shadow-sm" : "text-gray-700 hover:text-gray-900"
              )}
              aria-pressed={active}
            >
              <span className="block truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-w-0">{panels[currentValue] ?? null}</div>
    </div>
  );
}