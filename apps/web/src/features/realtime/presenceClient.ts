// apps/web/src/features/realtime/presenceClient.ts

import type { Socket } from "socket.io-client";

export type PresenceState = {
  status?: "active" | "idle" | "offline";
};

export type PresenceBatchPayload = {
  documentId: string;
  updates: Array<{ userId: string; state: PresenceState }>;
};

export type PresenceUser = {
  userId: string;
  name?: string;
  color?: string;
};

export type PresenceRosterPayload = {
  documentId: string;
  users: PresenceUser[];
};

export type PresenceHandlers = {
  onBatch?: (payload: PresenceBatchPayload) => void;
  onRoster?: (payload: PresenceRosterPayload) => void;
};

export function createPresenceClient(socket: Socket, handlers: PresenceHandlers) {
  const { onBatch, onRoster } = handlers;

  let joinedDocumentId: string | null = null;

  const handleBatch = (payload: PresenceBatchPayload) => {
    if (!payload?.documentId) return;
    onBatch?.(payload);
  };

  const handleRoster = (payload: PresenceRosterPayload) => {
    if (!payload?.documentId) return;
    onRoster?.(payload);
  };

  const handleConnect = () => {
    if (!joinedDocumentId) return;

    socket.emit("presence:state", {
      documentId: joinedDocumentId,
      state: { status: "active" },
    });
  };

  socket.on("presence:state_batch", handleBatch);
  socket.on("presence:update", handleRoster);
  socket.on("connect", handleConnect);

  return {
    join(documentId: string) {
      if (!documentId) return;

      joinedDocumentId = documentId;

      socket.emit("presence:state", {
        documentId,
        state: { status: "active" },
      });
    },

    leave(documentId: string) {
      if (!documentId) return;

      if (joinedDocumentId === documentId) {
        joinedDocumentId = null;
      }

      socket.emit("presence:state", {
        documentId,
        state: { status: "offline" },
      });
    },

    setState(documentId: string, state: PresenceState) {
      if (!documentId) return;

      socket.emit("presence:state", { documentId, state });
    },

    dispose() {
      socket.off("presence:state_batch", handleBatch);
      socket.off("presence:update", handleRoster);
      socket.off("connect", handleConnect);
    },
  };
}