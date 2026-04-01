import React, { useEffect, useMemo, useRef, useState } from "react";

export type PresenceUser = {
  userId: string;
  name?: string;
  color?: string;
  status?: "active" | "idle" | "offline";
};

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  users: PresenceUser[];
  onClose: () => void;
};

function statusDotClass(status?: PresenceUser["status"]) {
  if (status === "idle") return "bg-yellow-500";
  if (status === "offline") return "bg-gray-400";
  return "bg-emerald-500";
}

function statusLabel(status?: PresenceUser["status"]) {
  if (status === "idle") return "Idle";
  if (status === "offline") return "Offline";
  return "Active";
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function hashToHue(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 360;
}

function extractHue(color?: string): number | null {
  if (!color) return null;

  const hslMatch = color.match(/hsl\(\s*([0-9.]+)/i);
  if (hslMatch) {
    const hue = Number(hslMatch[1]);
    if (!Number.isNaN(hue)) return ((hue % 360) + 360) % 360;
  }

  const hslaMatch = color.match(/hsla\(\s*([0-9.]+)/i);
  if (hslaMatch) {
    const hue = Number(hslaMatch[1]);
    if (!Number.isNaN(hue)) return ((hue % 360) + 360) % 360;
  }

  return null;
}

function normalizeHue(hue: number) {
  const buckets = [0, 28, 48, 88, 140, 176, 220, 262, 304, 336];
  let best = buckets[0];
  let bestDist = Infinity;

  for (const bucket of buckets) {
    const dist = Math.min(Math.abs(bucket - hue), 360 - Math.abs(bucket - hue));
    if (dist < bestDist) {
      best = bucket;
      bestDist = dist;
    }
  }

  return best;
}

function getStableProfileColor(user: PresenceUser) {
  const base = `${user.userId}:${user.name ?? ""}`.trim();
  const rawHue = hashToHue(base || "user");
  const hue = normalizeHue(rawHue);

  return `hsl(${hue} 78% 46%)`;
}

function getAvatarColors(user: PresenceUser) {
  const base = user.color?.trim() || getStableProfileColor(user);
  const hue = extractHue(base) ?? 220;

  return {
    bg: base,
    fg: "white",
    ring: `hsl(${hue} 65% 82%)`,
    panelBg: `hsl(${hue} 80% 96%)`,
    panelFg: `hsl(${hue} 55% 30%)`,
  };
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function PresencePopover({ open, anchorRef, users, onClose }: Props) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 150);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  const filtered = useMemo(() => {
    const live = users.filter((u) => u.status !== "offline");

    const score = (u: PresenceUser) => (u.status === "active" ? 0 : 1);
    const sorted = [...live].sort((a, b) => score(a) - score(b));

    const needle = dq.trim().toLowerCase();
    if (!needle) return sorted;

    return sorted.filter((u) => {
      const name = (u.name ?? "").toLowerCase();
      const id = (u.userId ?? "").toLowerCase();
      return name.includes(needle) || id.includes(needle);
    });
  }, [users, dq]);

  const anchorRect = anchorRef.current?.getBoundingClientRect();
  if (!open || !anchorRect) return null;

  const top = anchorRect.bottom + 8;
  const left = Math.max(12, anchorRect.right - 360);

  return (
    <div
      ref={popRef}
      className="fixed z-50 w-[360px] rounded-2xl border border-gray-200 bg-white shadow-lg"
      style={{ top, left }}
      role="dialog"
      aria-label="Live viewers"
    >
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Live viewers</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            Close
          </button>
        </div>

        <div className="mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or id"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-300"
            autoFocus
          />
        </div>
      </div>

      <div className="max-h-[320px] overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-sm text-gray-600">No matching users</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filtered.map((u) => {
              const label = u.name?.trim() || u.userId;
              const { bg, fg, ring, panelBg, panelFg } = getAvatarColors(u);

              return (
                <li key={u.userId} className="flex items-center gap-3 p-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white text-xs font-semibold shadow-sm select-none"
                    style={{
                      backgroundColor: bg,
                      color: fg,
                      boxShadow: `0 0 0 1px ${ring}`,
                    }}
                    aria-hidden
                  >
                    {initials(u.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{label}</div>
                    {u.name && <div className="truncate text-xs text-gray-600">{u.userId}</div>}
                  </div>

                  <div
                    className="rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: panelBg,
                      borderColor: ring,
                      color: panelFg,
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={["h-2 w-2 rounded-full", statusDotClass(u.status)].join(" ")} />
                      <span>{statusLabel(u.status)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
        Showing {filtered.length} {filtered.length === 1 ? "user" : "users"}
      </div>
    </div>
  );
}