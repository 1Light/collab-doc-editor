// apps/web/src/features/realtime/reconnect.ts

import type { Socket } from "socket.io-client";

/**
 * Option A: Read-only on disconnect.
 *
 * Behavior:
 * - Treat ANY successful connect as "connected" (initial connect + reconnect).
 * - Treat disconnect + connect_error as "disconnected".
 * - De-dupe spammy sequences so UI does not flicker.
 */

export type ReconnectHandlers = {
  onDisconnected?: (info?: { reason?: string; error?: string }) => void;
  onReconnected?: () => void;
};

export function attachReconnectBehavior(socket: Socket, handlers: ReconnectHandlers) {
  const { onDisconnected, onReconnected } = handlers;

  // Track last known state to avoid duplicate UI updates
  let isCurrentlyConnected = Boolean(socket.connected);

  // Throttle repeated connect_error spam (Socket.IO can fire many times quickly)
  let lastDisconnectSigAt = 0;
  const DISCONNECT_DEDUP_MS = 300;

  const emitDisconnected = (info?: { reason?: string; error?: string }) => {
    const now = Date.now();

    // if already disconnected and signals arrive rapidly, ignore duplicates
    if (!isCurrentlyConnected && now - lastDisconnectSigAt < DISCONNECT_DEDUP_MS) return;

    isCurrentlyConnected = false;
    lastDisconnectSigAt = now;
    onDisconnected?.(info);
  };

  const handleDisconnect = (reason: string) => {
    // ignore explicit client disconnects if you want to avoid UI noise on logout
    // if (reason === "io client disconnect") return;
    emitDisconnected({ reason });
  };

  const handleConnect = () => {
    if (isCurrentlyConnected) return;
    isCurrentlyConnected = true;
    onReconnected?.();
  };

  const handleConnectError = (err: any) => {
    const msg = String(err?.message ?? err);
    emitDisconnected({ error: msg });
  };

  socket.on("disconnect", handleDisconnect);

  // Fires on initial connect and every reconnect
  socket.on("connect", handleConnect);

  // Fires when the transport fails before connect
  socket.on("connect_error", handleConnectError);

  return () => {
    socket.off("disconnect", handleDisconnect);
    socket.off("connect", handleConnect);
    socket.off("connect_error", handleConnectError);
  };
}