export type OrgRole = "OrgAdmin" | "OrgOwner" | null;

export type MeUser = {
  id: string;
  name: string;
  email?: string;
  orgRole: OrgRole;
};

export function hasToken() {
  return !!localStorage.getItem("accessToken");
}

export function readMeLocal(): MeUser | null {
  const raw = localStorage.getItem("me");
  if (!raw) return null;

  try {
    const u = JSON.parse(raw);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      orgRole: u.orgRole ?? null,
    };
  } catch {
    return null;
  }
}

export function normalizeMe(u: any): MeUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    orgRole: u.orgRole ?? null,
  };
}

export function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("me");
  localStorage.removeItem("orgId");
}