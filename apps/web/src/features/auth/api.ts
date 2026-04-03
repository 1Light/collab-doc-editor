// apps/web/src/features/auth/auth.ts

import { http } from "../../lib/http";
import { disconnectSocket } from "../realtime/socket";

export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    orgRole: "OrgAdmin" | "OrgOwner" | null;
    orgId?: string | null;
  };
};

export type MeResponse = {
  id: string;
  name: string;
  email: string;
  orgRole: "OrgAdmin" | "OrgOwner" | null;
  orgId: string | null;
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
};

export type SignupOwnerInput = {
  name: string;
  email: string;
  password: string;
  organizationName: string;
};

export type SignupInviteInput = {
  name: string;
  email: string;
  password: string;
  token: string;
};

export type CreateOrganizationInput = {
  organizationName: string;
};

export type CreateOrganizationResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    orgId: string;
    orgRole: "OrgOwner";
  };
  organization: {
    id: string;
    name: string;
  };
};

export type OrgInvitePreviewResponse = {
  valid: boolean;
  status: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  orgId: string;
  orgName: string;
  orgRole: "OrgAdmin" | "OrgOwner" | null;
  invitedByName: string | null;
  invitedByEmail: string | null;
  expiresAt: string;
};

export type DeleteAccountResponse = {
  success: boolean;
  message: string;
};

function storeAuth(data: LoginResponse | { accessToken: string }) {
  localStorage.setItem("accessToken", data.accessToken);
}

function storeMe(meData: MeResponse) {
  localStorage.setItem("me", JSON.stringify(meData));
  localStorage.setItem("orgId", meData.orgId ?? "");
}

function clearStoredAuth() {
  try {
    disconnectSocket();
  } catch {
    // ignore
  }

  localStorage.removeItem("accessToken");
  localStorage.removeItem("me");
  localStorage.removeItem("orgId");
}

/**
 * Login
 */
export async function login(email: string, password: string) {
  const data = await http<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });

  storeAuth(data);

  const meData = await me();
  storeMe(meData);

  return meData;
}

/**
 * Signup as normal platform user
 */
export async function signup(input: SignupInput) {
  const data = await http<LoginResponse>("/auth/signup", {
    method: "POST",
    body: input,
  });

  storeAuth(data);

  const meData = await me();
  storeMe(meData);

  return meData;
}

/**
 * Signup as new organization owner
 */
export async function signupOwner(input: SignupOwnerInput) {
  const data = await http<LoginResponse>("/auth/signup-owner", {
    method: "POST",
    body: input,
  });

  storeAuth(data);

  const meData = await me();
  storeMe(meData);

  return meData;
}

/**
 * Signup via org invite
 */
export async function signupInvite(input: SignupInviteInput) {
  const data = await http<LoginResponse>("/auth/signup-invite", {
    method: "POST",
    body: input,
  });

  storeAuth(data);

  const meData = await me();
  storeMe(meData);

  return meData;
}

/**
 * Logged-in existing user creates a new organization
 * and becomes OrgOwner in that organization.
 */
export async function createOrganization(input: CreateOrganizationInput) {
  const data = await http<CreateOrganizationResponse>("/auth/create-organization", {
    method: "POST",
    body: input,
  });

  storeAuth(data);

  const meData = await me();
  storeMe(meData);

  return {
    me: meData,
    organization: data.organization,
  };
}

/**
 * Preview organization invite before auth
 */
export async function previewOrgInvite(token: string) {
  const qs = new URLSearchParams({ token: token.trim() }).toString();
  return http<OrgInvitePreviewResponse>(`/invite/preview?${qs}`, {
    method: "GET",
  });
}

/**
 * Current user
 */
export async function me() {
  return http<MeResponse>("/auth/me", { method: "GET" });
}

/**
 * Self delete account
 */
export async function deleteAccount() {
  const data = await http<DeleteAccountResponse>("/auth/account", {
    method: "DELETE",
  });

  clearStoredAuth();
  return data;
}

/**
 * Logout
 */
export async function logout() {
  await http<{ success: boolean }>("/auth/logout", { method: "POST" }).catch(() => undefined);
  clearStoredAuth();
}