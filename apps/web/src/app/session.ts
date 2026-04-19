export type OrgRole = "OrgAdmin" | "OrgOwner" | null;

export type MeUser = {
  id: string;
  name: string;
  email?: string;
  orgRole: OrgRole;
};

type MeCandidate = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  orgRole?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMeUser(value: unknown): MeUser | null {
  if (!isRecord(value)) return null;

  const candidate = value as MeCandidate;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    email: typeof candidate.email === "string" ? candidate.email : undefined,
    orgRole:
      candidate.orgRole === "OrgAdmin" || candidate.orgRole === "OrgOwner"
        ? candidate.orgRole
        : null,
  };
}

export function hasToken() {
  return !!localStorage.getItem("accessToken");
}

export function readMeLocal(): MeUser | null {
  const raw = localStorage.getItem("me");
  if (!raw) return null;

  try {
    return toMeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeMe(u: unknown): MeUser {
  return toMeUser(u) ?? { id: "", name: "", orgRole: null };
}

export function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("me");
  localStorage.removeItem("orgId");
}
