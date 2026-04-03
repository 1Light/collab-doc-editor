import { http } from "../lib/http";

export async function acceptDocumentInviteToken(token: string) {
  return await http<{ accepted: boolean; documentId: string; role: string }>(
    "/invite/accept-document",
    {
      method: "POST",
      body: { token },
    }
  );
}

export async function acceptOrgInviteToken(token: string) {
  return await http<{ joined: boolean; orgId: string; orgName?: string; orgRole?: string | null }>(
    "/org/invites/accept-org",
    {
      method: "POST",
      body: { token },
    }
  );
}