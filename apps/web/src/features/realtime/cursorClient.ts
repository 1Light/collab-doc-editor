// apps/web/src/features/realtime/cursorClient.ts

import type { Socket } from "socket.io-client";

export type CursorState = {
  start: number;
  end: number;
  x?: number;
  y?: number;
};

export type CursorBatchPayload = {
  documentId: string;
  updates: Array<{ userId: string; cursor: CursorState }>;
};

export type CursorHandlers = {
  onBatch?: (payload: CursorBatchPayload) => void;
};

/**
 * Client helper for cursor updates.
 *
 * Note:
 * - This is separate from Yjs awareness cursors (CollaborationCursor).
 *   If you keep both, prefer:
 *   - CollaborationCursor for "carets + names" inside the editor
 *   - this cursor channel for lightweight selection indicators elsewhere (optional)
 */
export function createCursorClient(socket: Socket, handlers: CursorHandlers) {
  const onBatch = handlers.onBatch;

  let activeDocumentId: string | null = null;
  let lastCursor: CursorState | null = null;

  const handleBatch = (payload: CursorBatchPayload) => {
    if (!payload?.documentId) return;
    if (!Array.isArray(payload.updates)) return;
    onBatch?.(payload);
  };

  const handleConnect = () => {
    if (!activeDocumentId || !lastCursor) return;
    socket.emit("cursor:update", { documentId: activeDocumentId, cursor: lastCursor });
  };

  socket.on("cursor:batch", handleBatch);
  socket.on("connect", handleConnect);

  return {
    setActiveDocument(documentId: string | null) {
      activeDocumentId = documentId;
    },

    send(documentId: string, cursor: CursorState) {
      if (!documentId) return;
      if (!cursor) return;

      activeDocumentId = documentId;
      lastCursor = cursor;

      socket.emit("cursor:update", { documentId, cursor });
    },

    dispose() {
      socket.off("cursor:batch", handleBatch);
      socket.off("connect", handleConnect);
    },
  };
}