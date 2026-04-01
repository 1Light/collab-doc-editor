// apps/realtime/src/sync/yjsAdapter.ts

import type { Server, Socket } from "socket.io";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { YjsDocStore } from "./yjsDocStore";

function toUint8Array(arr: number[]): Uint8Array {
  return Uint8Array.from(arr);
}

function fromUint8Array(u8: Uint8Array): number[] {
  return Array.from(u8);
}

type AwarenessUpdatePayload = {
  documentId: string;
  added: number[];
  updated: number[];
  removed: number[];
  states: number[];
};

const MAX_DOC_UPDATE_BYTES = 2 * 1024 * 1024;
const MAX_AWARENESS_BYTES = 1 * 1024 * 1024;

const docObservers = new Map<string, { ydoc: Y.Doc; unsubscribe: () => void }>();
const docAwarenessMap = new Map<string, Awareness>();

/**
 * socketId -> (documentId -> clientIds owned by that socket for that doc)
 */
const socketAwarenessClients = new Map<string, Map<string, Set<number>>>();

function getTrackedClientSet(socketId: string, documentId: string): Set<number> {
  let docs = socketAwarenessClients.get(socketId);
  if (!docs) {
    docs = new Map();
    socketAwarenessClients.set(socketId, docs);
  }

  let ids = docs.get(documentId);
  if (!ids) {
    ids = new Set<number>();
    docs.set(documentId, ids);
  }

  return ids;
}

function deleteTrackedClientSet(socketId: string, documentId: string) {
  const docs = socketAwarenessClients.get(socketId);
  if (!docs) return;

  docs.delete(documentId);

  if (docs.size === 0) {
    socketAwarenessClients.delete(socketId);
  }
}

function getOrCreateAwareness(store: YjsDocStore, documentId: string): Awareness {
  const existing = docAwarenessMap.get(documentId);
  if (existing) return existing;

  const ydoc = store.getOrCreate(documentId);
  const awareness = new Awareness(ydoc);
  docAwarenessMap.set(documentId, awareness);
  return awareness;
}

function cleanupAwarenessIfDocMissing(store: YjsDocStore, documentId: string) {
  if (!store.has(documentId)) {
    docAwarenessMap.delete(documentId);
  }
}

function ensureDocObserver(io: Server, store: YjsDocStore, documentId: string) {
  const existing = docObservers.get(documentId);
  if (existing && !store.has(documentId)) {
    try {
      existing.unsubscribe();
    } catch {
      // ignore
    }
    docObservers.delete(documentId);
    cleanupAwarenessIfDocMissing(store, documentId);
  }

  if (docObservers.has(documentId)) return;

  const ydoc = store.getOrCreate(documentId);
  getOrCreateAwareness(store, documentId);

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    const originSocketId =
      typeof origin === "string" && origin.length > 0 ? origin : undefined;

    const originUserId =
      originSocketId && (io.sockets.sockets.get(originSocketId)?.data as any)
        ? ((io.sockets.sockets.get(originSocketId)?.data as any).userId as
            | string
            | undefined)
        : undefined;

    const room = io.to(documentId);
    const roomExceptOrigin = originSocketId ? room.except(originSocketId) : room;

    roomExceptOrigin.emit("yjs:update", {
      documentId,
      update: fromUint8Array(update),
      originUserId,
    });

    store.touch(documentId);
  };

  ydoc.on("update", onUpdate);

  docObservers.set(documentId, {
    ydoc,
    unsubscribe: () => ydoc.off("update", onUpdate),
  });
}

function emitAwarenessSnapshotToSocket(
  socket: Socket,
  store: YjsDocStore,
  documentId: string
) {
  const awareness = getOrCreateAwareness(store, documentId);
  const clientIds = Array.from(awareness.getStates().keys());

  if (clientIds.length === 0) return;

  const encoded = encodeAwarenessUpdate(awareness, clientIds);

  socket.emit("yjs:awareness_update", {
    documentId,
    added: clientIds,
    updated: [],
    removed: [],
    states: fromUint8Array(encoded),
  } satisfies AwarenessUpdatePayload);
}

function cleanupSocketAwarenessForDocument(
  io: Server,
  store: YjsDocStore,
  socketId: string,
  documentId: string
) {
  const trackedIds = getTrackedClientSet(socketId, documentId);
  if (trackedIds.size === 0) {
    deleteTrackedClientSet(socketId, documentId);
    return;
  }

  const awareness = getOrCreateAwareness(store, documentId);
  const clientIds = Array.from(trackedIds);

  removeAwarenessStates(awareness, clientIds, "server");

  const encoded = encodeAwarenessUpdate(awareness, clientIds);

  io.to(documentId).emit("yjs:awareness_update", {
    documentId,
    added: [],
    updated: [],
    removed: clientIds,
    states: fromUint8Array(encoded),
  } satisfies AwarenessUpdatePayload);

  deleteTrackedClientSet(socketId, documentId);
}

export function registerYjsAdapter(io: Server, socket: Socket, store: YjsDocStore) {
  socket.on("yjs:sync_step1", (payload: { documentId: string; stateVector: number[] }) => {
    try {
      const { documentId, stateVector } = payload ?? {};
      if (!documentId || !Array.isArray(stateVector)) return;
      if (!socket.rooms.has(documentId)) return;

      ensureDocObserver(io, store, documentId);

      const ydoc = store.getOrCreate(documentId);
      const sv = toUint8Array(stateVector);
      const update = Y.encodeStateAsUpdate(ydoc, sv);

      socket.emit("yjs:sync_step2", {
        documentId,
        update: fromUint8Array(update),
      });

      // Important: also send the current awareness snapshot so collaborator
      // cursors/selections show up for newly joined clients.
      emitAwarenessSnapshotToSocket(socket, store, documentId);
    } catch {
      return;
    }
  });

  socket.on("yjs:update", (payload: { documentId: string; update: number[] }) => {
    try {
      const { documentId, update } = payload ?? {};
      if (!documentId || !Array.isArray(update)) return;
      if (!socket.rooms.has(documentId)) return;

      if (update.length > MAX_DOC_UPDATE_BYTES) return;

      ensureDocObserver(io, store, documentId);

      const ydoc = store.getOrCreate(documentId);
      const u8 = toUint8Array(update);

      Y.applyUpdate(ydoc, u8, socket.id);
    } catch {
      return;
    }
  });

  socket.on("yjs:awareness_update", (payload: AwarenessUpdatePayload) => {
    try {
      const { documentId, added, updated, removed, states } = payload ?? ({} as any);
      if (!documentId) return;
      if (!socket.rooms.has(documentId)) return;

      if (!Array.isArray(added) || !Array.isArray(updated) || !Array.isArray(removed)) return;
      if (!Array.isArray(states)) return;

      if (states.length > MAX_AWARENESS_BYTES) return;

      ensureDocObserver(io, store, documentId);

      const awareness = getOrCreateAwareness(store, documentId);
      const trackedIds = getTrackedClientSet(socket.id, documentId);

      for (const id of added) {
        if (typeof id === "number") trackedIds.add(id);
      }
      for (const id of updated) {
        if (typeof id === "number") trackedIds.add(id);
      }
      for (const id of removed) {
        if (typeof id === "number") trackedIds.delete(id);
      }

      applyAwarenessUpdate(awareness, toUint8Array(states), socket.id);

      io.to(documentId).except(socket.id).emit("yjs:awareness_update", {
        documentId,
        added,
        updated,
        removed,
        states,
      } satisfies AwarenessUpdatePayload);
    } catch {
      return;
    }
  });

  socket.on("leave_document", (payload: { documentId: string }) => {
    const documentId = payload?.documentId?.trim();
    if (!documentId) return;

    cleanupSocketAwarenessForDocument(io, store, socket.id, documentId);
  });

  socket.on("disconnect", () => {
    const docs = socketAwarenessClients.get(socket.id);
    if (!docs) return;

    for (const documentId of docs.keys()) {
      cleanupSocketAwarenessForDocument(io, store, socket.id, documentId);
    }

    socketAwarenessClients.delete(socket.id);
  });
}