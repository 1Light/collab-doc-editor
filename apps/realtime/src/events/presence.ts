// apps/realtime/src/events/presence.ts

import type { Server, Socket } from "socket.io";

/**
 * Presence updates can get noisy (typing, focus, idle, etc).
 * Batch updates per document room on a short interval.
 *
 * Client emits:
 * - presence:state { documentId, state }
 *
 * Server broadcasts:
 * - presence:state_batch { documentId, updates: [{ userId, state }] }
 */

type PresenceState = {
  status?: "active" | "idle" | "offline";
};

type PresenceUpdate = {
  userId: string;
  state: PresenceState;
};

type RoomQueue = {
  updatesByUser: Map<string, PresenceState>;
  timer: NodeJS.Timeout | null;
};

const FLUSH_INTERVAL_MS = 120;

function isDocumentRoom(room: string) {
  // doc rooms are raw documentId strings in your app
  // org rooms are "org:<id>"
  return Boolean(room) && !room.startsWith("org:");
}

export function registerPresenceEvents(io: Server, socket: Socket) {
  // documentId -> queued updates (shared across sockets)
  const queues: Map<string, RoomQueue> = (io as any).__presenceQueues ?? new Map();
  (io as any).__presenceQueues = queues;

  const getQueue = (documentId: string): RoomQueue => {
    let q = queues.get(documentId);
    if (!q) {
      q = { updatesByUser: new Map(), timer: null };
      queues.set(documentId, q);
    }
    return q;
  };

  const maybeCleanupQueue = (documentId: string) => {
    const q = queues.get(documentId);
    if (!q) return;
    if (q.timer) return;
    if (q.updatesByUser.size > 0) return;
    queues.delete(documentId);
  };

  const flush = (documentId: string) => {
    const q = queues.get(documentId);
    if (!q) return;

    const updates: PresenceUpdate[] = Array.from(q.updatesByUser.entries()).map(
      ([userId, state]) => ({ userId, state })
    );

    q.updatesByUser.clear();
    q.timer = null;

    if (updates.length > 0) {
      io.to(documentId).emit("presence:state_batch", {
        documentId,
        updates,
      });
    }

    maybeCleanupQueue(documentId);
  };

  socket.on(
    "presence:state",
    (payload: { documentId: string; state: PresenceState }) => {
      const documentId = payload?.documentId?.trim?.() ?? payload?.documentId;
      if (!documentId) return;

      // Only allow if socket is actually in the room
      if (!socket.rooms.has(documentId)) return;

      const userId = (socket.data as any)?.userId as string | undefined;
      if (!userId) return;

      const q = getQueue(documentId);

      q.updatesByUser.set(userId, payload.state ?? { status: "active" });

      if (!q.timer) {
        q.timer = setTimeout(() => flush(documentId), FLUSH_INTERVAL_MS);
      }
    }
  );

  socket.on("disconnect", () => {
    const userId = (socket.data as any)?.userId as string | undefined;
    if (!userId) return;

    // Prefer joinedDocs tracked by joinLeave/server
    const joinedDocs = socket.data?.joinedDocs as Set<string> | undefined;
    const docRooms =
      joinedDocs && joinedDocs.size > 0
        ? Array.from(joinedDocs)
        : Array.from(socket.rooms).filter((r) => r !== socket.id);

    for (const room of docRooms) {
      if (!isDocumentRoom(room)) continue;

      const q = getQueue(room);
      q.updatesByUser.set(userId, { status: "offline" });

      if (!q.timer) {
        q.timer = setTimeout(() => flush(room), FLUSH_INTERVAL_MS);
      }
    }
  });
}