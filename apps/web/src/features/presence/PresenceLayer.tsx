import { useMemo, useRef, useState } from "react";
import { PresencePopover, type PresenceUser } from "./PresencePopover";

type Props = {
  users: PresenceUser[];
  maxVisible?: number;
};

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function hashToHue(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
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

function stableUserColor(user: PresenceUser) {
  const base = `${user.userId}:${user.name ?? ""}`.trim();
  const rawHue = hashToHue(base || "user");
  const hue = normalizeHue(rawHue);

  return `hsl(${hue} 78% 46%)`;
}

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

function avatarColors(user: PresenceUser) {
  const base = user.color?.trim() || stableUserColor(user);
  const hue = extractHue(base) ?? 220;

  return {
    bg: base,
    fg: "white",
    ring: `hsl(${hue} 65% 82%)`,
    panelBg: `hsl(${hue} 80% 96%)`,
    panelFg: `hsl(${hue} 55% 30%)`,
  };
}

export function PresenceLayer({ users, maxVisible = 4 }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);

  const sortedLive = useMemo(() => {
    const live = users.filter((u) => u.status !== "offline");
    const score = (u: PresenceUser) => (u.status === "active" ? 0 : 1);
    return [...live].sort((a, b) => score(a) - score(b));
  }, [users]);

  const visible = sortedLive.slice(0, maxVisible);
  const hiddenCount = Math.max(0, sortedLive.length - visible.length);

  if (sortedLive.length === 0) {
   return (
    <div className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm sm:block">
      No one else here
    </div>
   );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {visible.map((u) => {
          const label = u.name?.trim() || u.userId;
          const { bg, fg, ring, panelBg, panelFg } = avatarColors(u);

          return (
            <div key={u.userId} className="group relative">
              <div
                className={[
                  "relative flex h-10 w-10 items-center justify-center rounded-full",
                  "border-2 border-white shadow-sm",
                  "text-xs font-semibold",
                  "select-none",
                ].join(" ")}
                style={{
                  backgroundColor: bg,
                  color: fg,
                  boxShadow: `0 0 0 1px ${ring}`,
                }}
                aria-label={`${label}: ${statusLabel(u.status)}`}
              >
                <span className="leading-none">{initials(u.name)}</span>

                <span
                  className={[
                    "absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full",
                    "ring-2 ring-white",
                    statusDotClass(u.status),
                  ].join(" ")}
                  aria-hidden
                />
              </div>

              <div
                className={[
                  "pointer-events-none absolute right-0 top-12 z-30",
                  "opacity-0 translate-y-1",
                  "group-hover:opacity-100 group-hover:translate-y-0",
                  "group-focus-within:opacity-100 group-focus-within:translate-y-0",
                  "transition-all",
                ].join(" ")}
              >
                <div
                  className="max-w-[220px] rounded-xl border px-3 py-2 text-xs shadow-sm"
                  style={{
                    backgroundColor: panelBg,
                    borderColor: ring,
                    color: panelFg,
                  }}
                >
                  <div className="truncate font-medium">{label}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-gray-600">
                    <span className={["h-2 w-2 rounded-full", statusDotClass(u.status)].join(" ")} />
                    <span>{statusLabel(u.status)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <>
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            className={[
              "rounded-lg px-2 py-1 text-xs font-medium",
              "text-gray-700 hover:text-gray-900 hover:bg-gray-100",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              "transition-colors",
            ].join(" ")}
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
          >
            +{hiddenCount}
          </button>

          <PresencePopover
            open={popoverOpen}
            anchorRef={moreBtnRef as any}
            users={sortedLive}
            onClose={() => setPopoverOpen(false)}
          />
        </>
      )}
    </div>
  );
}