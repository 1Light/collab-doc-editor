// apps/web/src/app/routes.ts

export type PendingInviteRoute =
  | { name: "signupInvite"; token: string }
  | { name: "orgInviteAccept"; token: string }
  | { name: "documentInviteAccept"; token: string };

export function rememberPendingInvite(route: PendingInviteRoute) {
  localStorage.setItem("pendingInvite", JSON.stringify(route));
}

export function readPendingInvite(): PendingInviteRoute | null {
  const raw = localStorage.getItem("pendingInvite");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed.token === "string" &&
      (parsed.name === "orgInviteAccept" ||
        parsed.name === "documentInviteAccept" ||
        parsed.name === "signupInvite")
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function takePendingInvite(): PendingInviteRoute | null {
  const raw = localStorage.getItem("pendingInvite");
  if (!raw) return null;

  localStorage.removeItem("pendingInvite");

  try {
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed.token === "string" &&
      (parsed.name === "orgInviteAccept" ||
        parsed.name === "documentInviteAccept" ||
        parsed.name === "signupInvite")
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}