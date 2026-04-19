// apps/web/src/features/realtime/socket.ts

import { io, Socket } from "socket.io-client";

const REALTIME_URL =
  import.meta.env.VITE_REALTIME_BASE_URL ?? "http://localhost:4001";

let socket: Socket | null = null;

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

function getOrgId(): string | null {
  const raw = localStorage.getItem("orgId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type Unsub = () => void;
type OwnedSocketHandlers = {
  onConnect: () => void;
  onDisconnect: (reason: string) => void;
  onConnectError: (err: unknown) => void;
};

// lightweight lifecycle hooks so editor code can resync on reconnect
const connectListeners = new Set<(s: Socket) => void>();
const disconnectListeners = new Set<(reason: string) => void>();
const ownedHandlers = new WeakMap<Socket, OwnedSocketHandlers>();

export function onSocketConnected(cb: (s: Socket) => void): Unsub {
  connectListeners.add(cb);
  return () => connectListeners.delete(cb);
}

export function onSocketDisconnected(cb: (reason: string) => void): Unsub {
  disconnectListeners.add(cb);
  return () => disconnectListeners.delete(cb);
}

function emitConnected(s: Socket) {
  for (const cb of connectListeners) cb(s);
}

function emitDisconnected(reason: string) {
  for (const cb of disconnectListeners) cb(reason);
}

/**
 * Create (or return existing) socket connection.
 * WebSocket only: no polling.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(REALTIME_URL, {
    autoConnect: false,
    transports: ["websocket"],
    upgrade: false,
    withCredentials: true,
    timeout: 20000,

    // Auth is dynamic so reconnects always use latest token + orgId
    auth: (cb) =>
      cb({
        token: getToken(),
        orgId: getOrgId(),
      }),
  });

  // listeners owned by this module (so we can safely clean them up)
  const onConnect = () => {
    console.log("[socket] connected:", socket?.id);

    // Join org room (orgId may have changed after handshake)
    const orgId = getOrgId();
    if (orgId) {
      socket?.emit("org:join", { orgId });
    }

    emitConnected(socket!);
  };

  const onDisconnect = (reason: string) => {
    console.log("[socket] disconnected:", reason);
    emitDisconnected(reason);
  };

  const onConnectError = (err: unknown) => {
    const msg =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message?: unknown }).message ?? err)
        : String(err);

    const ignorable =
      msg.includes("WebSocket is closed before the connection is established") ||
      msg.includes("transport close");

    if (!ignorable) {
      console.error("[socket] connection error:", msg);
    } else {
      console.warn("[socket] transient connect issue:", msg);
    }
  };

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("connect_error", onConnectError);

  ownedHandlers.set(socket, { onConnect, onDisconnect, onConnectError });

  return socket;
}

export function isSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected && !s.active) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (!socket) return;

  // Remove only the listeners this module registered
  const owned = ownedHandlers.get(socket);

  if (owned) {
    socket.off("connect", owned.onConnect);
    socket.off("disconnect", owned.onDisconnect);
    socket.off("connect_error", owned.onConnectError);
    ownedHandlers.delete(socket);
  }

  socket.disconnect();
  socket = null;
}

/**
 * Re-join the current organization room after auth or organization context changes.
 */
export function refreshOrgRoom() {
  const s = getSocket();
  const orgId = getOrgId();
  if (s.connected && orgId) {
    s.emit("org:join", { orgId });
  }
}
