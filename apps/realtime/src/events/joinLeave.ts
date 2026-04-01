// apps/realtime/src/events/joinLeave.ts

import type { Server, Socket } from "socket.io";
import axios from "axios";
import { SessionManager, PresenceUser } from "../session/sessionManager";
import { config } from "../config/env";
import { YjsDocStore } from "../sync/yjsDocStore";

function orgRoom(orgId: string) {
  return `org:${orgId}`;
}

type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner";

function isDocumentRole(v: unknown): v is DocumentRole {
  return v === "Viewer" || v === "Commenter" || v === "Editor" || v === "Owner";
}

async function userHasAccess(documentId: string, token: string, orgId: string | null) {
  try {
    await axios.get(`${config.API_BASE_URL}/api/documents/${documentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(orgId ? { "x-org-id": orgId } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function getUserRole(
  documentId: string,
  token: string,
  orgId: string | null
): Promise<DocumentRole | null> {
  try {
    const res = await axios.get(`${config.API_BASE_URL}/api/documents/${documentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(orgId ? { "x-org-id": orgId } : {}),
      },
    });

    const rawRole = (res.data as any)?.role;
    return isDocumentRole(rawRole) ? rawRole : null;
  } catch {
    return null;
  }
}

function getBearerToken(socket: Socket): string | null {
  const authToken = (socket.handshake.auth as any)?.token as string | undefined;
  if (authToken && authToken.trim()) return authToken.trim();

  const header = socket.handshake.headers.authorization;
  if (!header) return null;

  const asString = Array.isArray(header) ? header[0] : header;
  if (!asString) return null;

  return asString.replace(/^Bearer\s+/i, "").trim() || null;
}

type JoinedDocsSet = Set<string>;

function getJoinedDocs(socket: Socket): JoinedDocsSet {
  if (!socket.data.joinedDocs) socket.data.joinedDocs = new Set<string>();
  return socket.data.joinedDocs as JoinedDocsSet;
}

export function registerJoinLeaveEvents(
  io: Server,
  socket: Socket,
  sessions: SessionManager,
  store: YjsDocStore
) {
  socket.on("org:join", (payload: { orgId: string }) => {
    const orgId = payload?.orgId?.trim();
    if (!orgId) return;

    socket.join(orgRoom(orgId));
    socket.data.orgId = orgId;

    io.to(socket.id).emit("org:joined", { orgId });
  });

  socket.on("org:leave", (payload: { orgId: string }) => {
    const orgId = payload?.orgId?.trim();
    if (!orgId) return;

    socket.leave(orgRoom(orgId));

    if (socket.data?.orgId === orgId) {
      socket.data.orgId = null;
    }

    io.to(socket.id).emit("org:left", { orgId });
  });

  socket.on("join_document", async (payload: { documentId: string }) => {
    const documentId = payload?.documentId?.trim();
    if (!documentId) return;

    const userId = socket.data?.userId as string | undefined;
    const name = socket.data?.name as string | undefined;
    const orgId = socket.data?.orgId as string | null;

    const token = getBearerToken(socket);
    if (!userId || !token) return;

    const joinedDocs = getJoinedDocs(socket);

    if (joinedDocs.has(documentId)) {
      io.to(socket.id).emit("document:joined", { documentId });

      io.to(socket.id).emit("presence:update", {
        documentId,
        users: sessions.listUsers(documentId),
      });

      return;
    }

    const allowed = await userHasAccess(documentId, token, orgId ?? null);
    if (!allowed) {
      socket.emit("presence:error", { message: "Access denied" });
      return;
    }

    socket.join(documentId);
    joinedDocs.add(documentId);

    const count = store.acquire(documentId, socket.id);

    if (count === 1) {
      io.to(socket.id).emit("yjs:seed_leader", { documentId });
    }

    sessions.joinRoom(documentId, {
      userId,
      name,
      socketId: socket.id,
      joinedAt: Date.now(),
    });

    io.to(socket.id).emit("document:joined", { documentId });

    const users: PresenceUser[] = sessions.listUsers(documentId);

    io.to(documentId).emit("presence:update", {
      documentId,
      users,
    });
  });

  socket.on(
    "document:role_change",
    async (payload: {
      documentId: string;
      principalType: "user" | "link";
      principalId: string;
      role: "Viewer" | "Commenter" | "Editor";
    }) => {
      const documentId = payload?.documentId?.trim();
      const principalType = payload?.principalType;
      const principalId = payload?.principalId?.trim();
      const role = payload?.role;

      if (!documentId || !principalType || !principalId || !role) return;

      const token = getBearerToken(socket);
      const orgId = (socket.data?.orgId as string | null) ?? null;
      if (!token) return;

      const myRole = await getUserRole(documentId, token, orgId);
      if (myRole !== "Owner") return;

      io.to(documentId).emit("document:role_updated", {
        documentId,
        principalType,
        principalId,
        role,
      });
    }
  );

  socket.on("leave_document", (payload: { documentId: string }) => {
    const documentId = payload?.documentId?.trim();
    if (!documentId) return;

    const userId = socket.data?.userId as string | undefined;
    if (!userId) return;

    const joinedDocs = getJoinedDocs(socket);
    if (!joinedDocs.has(documentId)) return;

    socket.leave(documentId);
    joinedDocs.delete(documentId);

    sessions.leaveRoom(documentId, userId, socket.id);

    const remaining = store.release(documentId, socket.id);

    const users: PresenceUser[] = sessions.listUsers(documentId);

    io.to(documentId).emit("presence:update", {
      documentId,
      users,
    });

    if (remaining === 0) {
      store.cleanupIdle({ idleMs: 60_000 });
    }
  });

  socket.on("disconnect", () => {
    const joinedDocs = getJoinedDocs(socket);

    const affectedDocs = sessions.handleDisconnect(socket.id);

    for (const documentId of joinedDocs) {
      store.release(documentId, socket.id);
    }

    for (const documentId of affectedDocs) {
      const users: PresenceUser[] = sessions.listUsers(documentId);

      io.to(documentId).emit("presence:update", {
        documentId,
        users,
      });
    }

    joinedDocs.clear();

    store.cleanupIdle({ idleMs: 60_000 });
  });
}