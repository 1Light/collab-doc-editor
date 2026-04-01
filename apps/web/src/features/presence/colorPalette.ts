export const COLLABORATION_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#84cc16", // lime
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
];

function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function normalizeHex(hex: string) {
  return hex.trim().toLowerCase();
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function pickStep(length: number, seed: number) {
  const preferred = [7, 5, 11, 3, 1];
  for (const step of preferred) {
    if (step < length && gcd(step, length) === 1) return step;
  }

  let step = (seed % Math.max(1, length - 1)) + 1;
  while (gcd(step, length) !== 1) {
    step = (step % length) + 1;
  }
  return step;
}

export function getCollaborationColor(userId: string, name?: string) {
  const key = `${userId}:${name ?? ""}`;
  const index = hash(key) % COLLABORATION_COLORS.length;
  return COLLABORATION_COLORS[index];
}

export function assignCollaborationColors<T extends { userId: string; name?: string }>(users: T[]) {
  const sorted = [...users].sort((a, b) => {
    const ak = `${a.name?.trim() || ""}:${a.userId}`;
    const bk = `${b.name?.trim() || ""}:${b.userId}`;
    return ak.localeCompare(bk);
  });

  const total = COLLABORATION_COLORS.length;
  const seed = hash(sorted.map((u) => `${u.userId}:${u.name ?? ""}`).join("|"));
  const offset = seed % total;
  const step = pickStep(total, seed);

  const map = new Map<string, string>();

  sorted.forEach((user, index) => {
    const paletteIndex = (offset + index * step) % total;
    map.set(user.userId, COLLABORATION_COLORS[paletteIndex]);
  });

  return map;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = normalizeHex(hex).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;

  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case rn:
        h = 60 * (((gn - bn) / delta) % 6);
        break;
      case gn:
        h = 60 * ((bn - rn) / delta + 2);
        break;
      default:
        h = 60 * ((rn - gn) / delta + 4);
        break;
    }
  }

  if (h < 0) h += 360;

  return {
    h,
    s: s * 100,
    l: l * 100,
  };
}

function extractHue(color?: string): number | null {
  if (!color) return null;

  const hslMatch = color.match(/hsl\(\s*([0-9.]+)/i);
  if (hslMatch) {
    const parsed = Number(hslMatch[1]);
    if (!Number.isNaN(parsed)) return ((parsed % 360) + 360) % 360;
  }

  const hslaMatch = color.match(/hsla\(\s*([0-9.]+)/i);
  if (hslaMatch) {
    const parsed = Number(hslaMatch[1]);
    if (!Number.isNaN(parsed)) return ((parsed % 360) + 360) % 360;
  }

  const rgb = hexToRgb(color);
  if (!rgb) return null;

  return rgbToHsl(rgb.r, rgb.g, rgb.b).h;
}

export function getPresenceAvatarColors(color: string) {
  const hue = extractHue(color);

  if (hue == null) {
    return {
      bg: color,
      fg: "#ffffff",
      ring: "#dbeafe",
      panelBg: "#f8fafc",
      panelFg: "#334155",
    };
  }

  return {
    bg: color,
    fg: "#ffffff",
    ring: `hsl(${hue} 70% 85%)`,
    panelBg: `hsl(${hue} 85% 96%)`,
    panelFg: `hsl(${hue} 55% 28%)`,
  };
}