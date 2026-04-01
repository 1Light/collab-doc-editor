// apps/realtime/src/events/cursor.ts

import type { Server, Socket } from "socket.io";

/**
 * Cursor updates can be extremely high-frequency.
 * Batch updates per document room on a short interval and keep only latest per user.
 *
 * Client emits:
 * - cursor:update { documentId, cursor }
 *
 * Server broadcasts:
 * - cursor:batch { documentId, updates: [{ userId, cursor }] }
 */

export type CursorState = {
  start: number;
  end: number;
  x?: number;
  y?: number;
};

type CursorUpdate = {
  userId: string;
  cursor: CursorState;
};

type RoomQueue = {
  updatesByUser: Map<string, CursorState>;
  timer: NodeJS.Timeout | null;
};

const FLUSH_INTERVAL_MS = 60;

function isDocumentRoom(room: string) {
  return Boolean(room) && !room.startsWith("org:");
}

export function registerCursorEvents(io: Server, socket: Socket) {
  const queues: Map<string, RoomQueue> = (io as any).__cursorQueues ?? new Map();
  (io as any).__cursorQueues = queues;

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

    const updates: CursorUpdate[] = Array.from(q.updatesByUser.entries()).map(
      ([userId, cursor]) => ({ userId, cursor })
    );

    q.updatesByUser.clear();
    q.timer = null;

    if (updates.length > 0) {
      io.to(documentId).emit("cursor:batch", {
        documentId,
        updates,
      });
    }

    maybeCleanupQueue(documentId);
  };

  socket.on(
    "cursor:update",
    (payload: { documentId: string; cursor: CursorState }) => {
      const documentId = payload?.documentId?.trim?.() ?? payload?.documentId;
      if (!documentId) return;

      if (!socket.rooms.has(documentId)) return;

      const userId = (socket.data as any)?.userId as string | undefined;
      if (!userId) return;

      const cursor = payload?.cursor;
      if (!cursor) return;

      if (typeof cursor.start !== "number" || typeof cursor.end !== "number") return;

      const q = getQueue(documentId);
      q.updatesByUser.set(userId, cursor);

      if (!q.timer) {
        q.timer = setTimeout(() => flush(documentId), FLUSH_INTERVAL_MS);
      }
    }
  );

  socket.on("disconnect", () => {
    const userId = (socket.data as any)?.userId as string | undefined;
    if (!userId) return;

    const joinedDocs = socket.data?.joinedDocs as Set<string> | undefined;
    const docRooms =
      joinedDocs && joinedDocs.size > 0
        ? Array.from(joinedDocs)
        : Array.from(socket.rooms).filter((r) => r !== socket.id);

    for (const room of docRooms) {
      if (!isDocumentRoom(room)) continue;

      const q = getQueue(room);
      // cleared cursor convention
      q.updatesByUser.set(userId, { start: -1, end: -1 });

      if (!q.timer) {
        q.timer = setTimeout(() => flush(room), FLUSH_INTERVAL_MS);
      }
    }
  });
}