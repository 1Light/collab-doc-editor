// apps/realtime/src/sync/yjsDocStore.ts

import * as Y from "yjs";

type StoredDoc = {
  doc: Y.Doc;
  createdAt: number;
  updatedAt: number;

  // Total active sockets attached to this doc room.
  connections: number;

  // Track which socketIds are currently counted for this document.
  // This prevents double-acquire (join called twice) from inflating
  // connections and prevents double-release from going negative.
  socketIds: Set<string>;
};

export class YjsDocStore {
  private docs: Map<string, StoredDoc> = new Map();

  has(documentId: string): boolean {
    return this.docs.has(documentId);
  }

  get(documentId: string): Y.Doc | undefined {
    return this.docs.get(documentId)?.doc;
  }

  getOrCreate(documentId: string): Y.Doc {
    const existing = this.docs.get(documentId);
    if (existing) return existing.doc;

    const now = Date.now();
    const doc = new Y.Doc();

    this.docs.set(documentId, {
      doc,
      createdAt: now,
      updatedAt: now,
      connections: 0,
      socketIds: new Set(),
    });

    return doc;
  }

  /**
   * Mark doc as recently active (called on updates / sync).
   */
  touch(documentId: string) {
    const existing = this.docs.get(documentId);
    if (!existing) return;
    existing.updatedAt = Date.now();
  }

  /**
   * Called when a socket joins a document room.
   * Idempotent per (documentId, socketId).
   * Returns current connection count after (possible) increment.
   */
  acquire(documentId: string, socketId: string): number {
    const entry =
      this.docs.get(documentId) ??
      (() => {
        this.getOrCreate(documentId);
        return this.docs.get(documentId)!;
      })();

    // If already acquired for this socket, do nothing.
    if (entry.socketIds.has(socketId)) {
      entry.updatedAt = Date.now();
      return entry.connections;
    }

    entry.socketIds.add(socketId);
    entry.connections += 1;
    entry.updatedAt = Date.now();
    return entry.connections;
  }

  /**
   * Called when a socket leaves a document room (or disconnects).
   * Idempotent per (documentId, socketId).
   * Returns current connection count after (possible) decrement.
   */
  release(documentId: string, socketId: string): number {
    const entry = this.docs.get(documentId);
    if (!entry) return 0;

    // If we never counted this socket, do nothing.
    if (!entry.socketIds.has(socketId)) {
      entry.updatedAt = Date.now();
      return entry.connections;
    }

    entry.socketIds.delete(socketId);
    entry.connections = Math.max(0, entry.connections - 1);
    entry.updatedAt = Date.now();
    return entry.connections;
  }

  getConnectionCount(documentId: string): number {
    return this.docs.get(documentId)?.connections ?? 0;
  }

  delete(documentId: string): boolean {
    const existing = this.docs.get(documentId);
    if (!existing) return false;

    existing.doc.destroy();
    this.docs.delete(documentId);
    return true;
  }

  /**
   * Cleanup helper:
   * Deletes docs with 0 connections that have been idle for at least idleMs.
   * Returns list of deleted documentIds.
   */
  cleanupIdle(opts: { idleMs: number; now?: number }): string[] {
    const now = opts.now ?? Date.now();
    const deleted: string[] = [];

    for (const [documentId, entry] of this.docs.entries()) {
      const idleFor = now - entry.updatedAt;

      if (entry.connections === 0 && idleFor >= opts.idleMs) {
        entry.doc.destroy();
        this.docs.delete(documentId);
        deleted.push(documentId);
      }
    }

    return deleted;
  }

  listActive(): Array<{
    documentId: string;
    createdAt: number;
    updatedAt: number;
    connections: number;
  }> {
    return Array.from(this.docs.entries()).map(([documentId, v]) => ({
      documentId,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      connections: v.connections,
    }));
  }
}