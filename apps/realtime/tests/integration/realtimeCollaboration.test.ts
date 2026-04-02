import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as createClient, Socket as ClientSocket } from "socket.io-client";
import * as Y from "yjs";

import { SessionManager } from "../../src/session/sessionManager";
import { registerYjsAdapter } from "../../src/sync/yjsAdapter";
import { YjsDocStore } from "../../src/sync/yjsDocStore";

type TestClient = {
  socket: ClientSocket;
  ydoc: Y.Doc;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceEvent<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

function uint8ToArr(u8: Uint8Array): number[] {
  return Array.from(u8);
}

function arrToUint8(arr: number[]): Uint8Array {
  return Uint8Array.from(arr);
}

function createYDocText(ydoc: Y.Doc) {
  return ydoc.getText("default");
}

async function connectClient(baseUrl: string, auth: { userId: string; name: string }) {
  const socket = createClient(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    autoConnect: true,
    auth,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });

  const ydoc = new Y.Doc();

  socket.on("yjs:sync_step2", (payload: { documentId: string; update: number[] }) => {
    if (!Array.isArray(payload?.update)) return;
    Y.applyUpdate(ydoc, arrToUint8(payload.update), "remote");
  });

  socket.on("yjs:update", (payload: { documentId: string; update: number[] }) => {
    if (!Array.isArray(payload?.update)) return;
    Y.applyUpdate(ydoc, arrToUint8(payload.update), "remote");
  });

  return { socket, ydoc } satisfies TestClient;
}

async function joinDocument(client: TestClient, documentId: string) {
  const joined = onceEvent<{ documentId: string }>(client.socket, "document:joined");

  client.socket.emit("join_document", { documentId });

  await joined;

  const stateVector = Y.encodeStateVector(client.ydoc);
  client.socket.emit("yjs:sync_step1", {
    documentId,
    stateVector: uint8ToArr(stateVector),
  });

  await wait(50);
}

function emitFullDocUpdate(client: TestClient, documentId: string) {
  const update = Y.encodeStateAsUpdate(client.ydoc);
  client.socket.emit("yjs:update", {
    documentId,
    update: uint8ToArr(update),
  });
}

describe("Realtime collaboration", () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let baseUrl: string;
  let store: YjsDocStore;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: "*" },
    });

    store = new YjsDocStore();
    sessionManager = new SessionManager();

    io.use((socket, next) => {
      const auth = (socket.handshake.auth ?? {}) as { userId?: string; name?: string };
      if (!auth.userId) {
        next(new Error("Unauthorized"));
        return;
      }

      socket.data.userId = auth.userId;
      socket.data.name = auth.name ?? auth.userId;
      next();
    });

    io.on("connection", (socket) => {
      registerYjsAdapter(io, socket, store);

      socket.on("join_document", (payload: { documentId: string }) => {
        const documentId = payload?.documentId?.trim();
        if (!documentId) return;

        const userId = String(socket.data.userId);
        const name = String(socket.data.name ?? userId);

        socket.join(documentId);

        sessionManager.joinRoom(documentId, {
          userId,
          name,
          socketId: socket.id,
          joinedAt: Date.now(),
        });

        const users = sessionManager.listUsers(documentId).map((u) => ({
          userId: u.userId,
          name: u.name,
          color: u.color,
        }));

        io.to(documentId).emit("presence:roster", {
          documentId,
          users,
        });

        socket.emit("document:joined", { documentId });
      });

      socket.on("leave_document", (payload: { documentId: string }) => {
        const documentId = payload?.documentId?.trim();
        if (!documentId) return;

        const userId = String(socket.data.userId);

        socket.leave(documentId);
        sessionManager.leaveRoom(documentId, userId, socket.id);

        const users = sessionManager.listUsers(documentId).map((u) => ({
          userId: u.userId,
          name: u.name,
          color: u.color,
        }));

        io.to(documentId).emit("presence:roster", {
          documentId,
          users,
        });
      });

      socket.on("disconnect", () => {
        const affectedDocs = sessionManager.handleDisconnect(socket.id);

        for (const documentId of affectedDocs) {
          const users = sessionManager.listUsers(documentId).map((u) => ({
            userId: u.userId,
            name: u.name,
            color: u.color,
          }));

          io.to(documentId).emit("presence:roster", {
            documentId,
            users,
          });
        }
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  });

  it("allows multiple users to join the same document session", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    const clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-1");
      await joinDocument(clientB, "doc-1");

      const roster = sessionManager.listUsers("doc-1");

      expect(roster).toHaveLength(2);
      expect(roster.map((u) => u.userId).sort()).toEqual(["u1", "u2"]);
    } finally {
      clientA.socket.disconnect();
      clientB.socket.disconnect();
    }
  });

  it("propagates document updates between collaborators", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    const clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-2");
      await joinDocument(clientB, "doc-2");

      const textA = createYDocText(clientA.ydoc);
      textA.insert(0, "Hello world");
      emitFullDocUpdate(clientA, "doc-2");

      await wait(120);

      const textB = createYDocText(clientB.ydoc);
      expect(textB.toString()).toBe("Hello world");
    } finally {
      clientA.socket.disconnect();
      clientB.socket.disconnect();
    }
  });

  it("converges after concurrent edits", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    const clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-3");
      await joinDocument(clientB, "doc-3");

      createYDocText(clientA.ydoc).insert(0, "A");
      createYDocText(clientB.ydoc).insert(0, "B");

      emitFullDocUpdate(clientA, "doc-3");
      emitFullDocUpdate(clientB, "doc-3");

      await wait(180);

      const aText = createYDocText(clientA.ydoc).toString();
      const bText = createYDocText(clientB.ydoc).toString();

      expect(aText).toBe(bText);
      expect(aText.includes("A")).toBe(true);
      expect(aText.includes("B")).toBe(true);
    } finally {
      clientA.socket.disconnect();
      clientB.socket.disconnect();
    }
  });

  it("restores shared state after reconnect and resync", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    let clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-4");
      await joinDocument(clientB, "doc-4");

      createYDocText(clientA.ydoc).insert(0, "Before reconnect");
      emitFullDocUpdate(clientA, "doc-4");
      await wait(120);

      expect(createYDocText(clientB.ydoc).toString()).toBe("Before reconnect");

      clientB.socket.disconnect();
      await wait(50);

      createYDocText(clientA.ydoc).insert(createYDocText(clientA.ydoc).length, " plus more");
      emitFullDocUpdate(clientA, "doc-4");
      await wait(120);

      clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });
      await joinDocument(clientB, "doc-4");
      await wait(120);

      expect(createYDocText(clientB.ydoc).toString()).toBe("Before reconnect plus more");
    } finally {
      clientA.socket.disconnect();
      clientB.socket.disconnect();
    }
  });

  it("cleans up stale presence on disconnect", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    const clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-5");
      await joinDocument(clientB, "doc-5");

      expect(sessionManager.listUsers("doc-5")).toHaveLength(2);

      clientB.socket.disconnect();
      await wait(100);

      const roster = sessionManager.listUsers("doc-5");
      expect(roster).toHaveLength(1);
      expect(roster[0]?.userId).toBe("u1");
    } finally {
      clientA.socket.disconnect();
    }
  });

  it("keeps server-side document state when one collaborator disconnects", async () => {
    const clientA = await connectClient(baseUrl, { userId: "u1", name: "Alice" });
    const clientB = await connectClient(baseUrl, { userId: "u2", name: "Bob" });

    try {
      await joinDocument(clientA, "doc-6");
      await joinDocument(clientB, "doc-6");

      createYDocText(clientA.ydoc).insert(0, "Persistent content");
      emitFullDocUpdate(clientA, "doc-6");
      await wait(120);

      clientB.socket.disconnect();
      await wait(50);

      const storedDoc = store.getOrCreate("doc-6");
      expect(storedDoc.getText("default").toString()).toBe("Persistent content");
    } finally {
      clientA.socket.disconnect();
    }
  });
});