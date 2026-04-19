// apps/realtime/src/server.ts

import http from "node:http";
import express from "express";
import { Server } from "socket.io";

import { config } from "./config/env";
import { verifySocketJwt } from "./auth/verifySocketJwt";

import { SessionManager } from "./session/sessionManager";
import { registerJoinLeaveEvents } from "./events/joinLeave";
import { registerPresenceEvents } from "./events/presence";
import { registerCursorEvents } from "./events/cursor";

import { YjsDocStore } from "./sync/yjsDocStore";
import { registerYjsAdapter } from "./sync/yjsAdapter";

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: "1mb" }));

const allowedOrigins = config.WEB_ORIGIN
  ? config.WEB_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins ?? true,
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  allowUpgrades: false,
});

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * Internal auth for API -> Realtime calls.
 * Expect:
 * - header: x-internal-secret = REALTIME_INTERNAL_SECRET
 *
 * We read secret from:
 * - config.REALTIME_INTERNAL_SECRET if present
 * - otherwise process.env.REALTIME_INTERNAL_SECRET
 */
function requireInternalSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const secret =
    (config as any).REALTIME_INTERNAL_SECRET ?? process.env.REALTIME_INTERNAL_SECRET ?? null;

  if (!secret) {
    return res.status(503).json({ error: "Internal secret not configured" });
  }

  const hdr = req.header("x-internal-secret");
  if (!hdr || hdr !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

/**
 * Internal API: notify role updated so the affected user can instantly refresh role + UI.
 * POST /internal/events/document-role-updated
 * Body: { documentId: string, userId: string, role: string }
 */
app.post("/internal/events/document-role-updated", requireInternalSecret, (req, res) => {
  const { documentId, userId, role } = (req.body ?? {}) as {
    documentId?: string;
    userId?: string;
    role?: string;
  };

  if (!documentId || !userId || !role) {
    return res.status(400).json({ error: "documentId, userId, role are required" });
  }

  io.to(`user:${userId}`).emit("document:role_updated", {
    documentId,
    userId,
    role,
  });

  return res.json({ ok: true });
});

/**
 * Internal API: notify document-wide access rule changes so open sessions
 * can refresh effective role without a manual reload.
 * POST /internal/events/document-access-rules-changed
 * Body: { documentId: string }
 */
app.post("/internal/events/document-access-rules-changed", requireInternalSecret, (req, res) => {
  const { documentId } = (req.body ?? {}) as {
    documentId?: string;
  };

  if (!documentId) {
    return res.status(400).json({ error: "documentId is required" });
  }

  io.to(documentId).emit("document:role_updated", {
    documentId,
    userId: null,
    role: null,
  });

  return res.json({ ok: true });
});

/**
 * Internal API: notify document comment mutation so active clients can refresh immediately.
 * POST /internal/events/document-comment-changed
 * Body:
 * {
 *   documentId: string,
 *   action: "created" | "updated" | "resolved" | "deleted",
 *   commentId: string,
 *   actorUserId: string,
 *   parentCommentId?: string | null,
 *   status?: "open" | "resolved" | null
 * }
 */
app.post("/internal/events/document-comment-changed", requireInternalSecret, (req, res) => {
  const { documentId, action, commentId, actorUserId, parentCommentId, status } = (req.body ??
    {}) as {
    documentId?: string;
    action?: "created" | "updated" | "resolved" | "deleted";
    commentId?: string;
    actorUserId?: string;
    parentCommentId?: string | null;
    status?: "open" | "resolved" | null;
  };

  if (!documentId || !action || !commentId || !actorUserId) {
    return res.status(400).json({
      error: "documentId, action, commentId, actorUserId are required",
    });
  }

  const payload = {
    documentId,
    action,
    commentId,
    actorUserId,
    parentCommentId: parentCommentId ?? null,
    status: status ?? null,
    emittedAt: new Date().toISOString(),
  };

  io.to(documentId).emit("document:comment_changed", payload);

  return res.json({ ok: true });
});

/**
 * Internal API: notify org-level admin data mutations so open admin pages
 * can refresh members/invites without a manual reload.
 * POST /internal/events/org-admin-data-changed
 * Body:
 * {
 *   orgId: string,
 *   reason:
 *    | "member_joined"
 *    | "member_removed"
 *    | "member_role_updated"
 *    | "invite_created"
 *    | "invite_accepted"
 *    | "invite_re_sent"
 *    | "invite_revoked",
 *   actorUserId?: string | null,
 *   targetUserId?: string | null,
 *   inviteId?: string | null,
 *   emittedAt?: string
 * }
 */
app.post("/internal/events/org-admin-data-changed", requireInternalSecret, (req, res) => {
  const { orgId, reason, actorUserId, targetUserId, inviteId, emittedAt } = (req.body ??
    {}) as {
    orgId?: string;
    reason?:
      | "member_joined"
      | "member_removed"
      | "member_role_updated"
      | "invite_created"
      | "invite_accepted"
      | "invite_re_sent"
      | "invite_revoked";
    actorUserId?: string | null;
    targetUserId?: string | null;
    inviteId?: string | null;
    emittedAt?: string;
  };

  if (!orgId || !reason) {
    return res.status(400).json({ error: "orgId and reason are required" });
  }

  io.to(`org:${orgId}`).emit("admin:orgDataChanged", {
    orgId,
    reason,
    actorUserId: actorUserId ?? null,
    targetUserId: targetUserId ?? null,
    inviteId: inviteId ?? null,
    emittedAt: emittedAt ?? new Date().toISOString(),
  });

  return res.json({ ok: true });
});

const sessions = new SessionManager();
const yjsStore = new YjsDocStore();

/* ---------------- AUTH ---------------- */

io.use((socket, next) => {
  try {
    if (socket.conn.transport.name !== "websocket") {
      return next(new Error("WebSocket required"));
    }

    const authObj = socket.handshake.auth as Record<string, unknown> | undefined;

    const tokenFromAuth = typeof authObj?.token === "string" ? authObj.token : undefined;

    const authHeader = socket.handshake.headers.authorization;
    const tokenFromHeader =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;

    const token = tokenFromAuth ?? tokenFromHeader;
    if (!token) return next(new Error("Missing auth token"));

    const { userId, name } = verifySocketJwt(token);

    socket.data.userId = userId;
    socket.data.name = name ?? undefined;

    const orgIdFromAuth =
      typeof authObj?.orgId === "string" && authObj.orgId.trim().length > 0
        ? authObj.orgId.trim()
        : null;

    socket.data.orgId = orgIdFromAuth;

    socket.data.joinedDocs = new Set<string>();

    return next();
  } catch {
    return next(new Error("Invalid auth token"));
  }
});

/* ---------------- YJS IDLE CLEANUP ----------------
   Deletes docs that have:
   - 0 connections
   - idle for >= 5 minutes
*/
const CLEANUP_INTERVAL_MS = 60_000;
const DOC_IDLE_MS = 5 * 60_000;

setInterval(() => {
  try {
    yjsStore.cleanupIdle({ idleMs: DOC_IDLE_MS });
  } catch {
    // no-op
  }
}, CLEANUP_INTERVAL_MS).unref();

/* ---------------- CONNECTION ---------------- */

io.on("connection", (socket) => {
  const userId = socket.data?.userId as string | undefined;
  const orgId = socket.data?.orgId as string | null | undefined;

  if (userId) {
    socket.join(`user:${userId}`);
  }

  if (orgId) {
    socket.join(`org:${orgId}`);
  }

  registerJoinLeaveEvents(io, socket, sessions, yjsStore);
  registerPresenceEvents(io, socket);
  registerCursorEvents(io, socket);
  registerYjsAdapter(io, socket, yjsStore);

  socket.on("disconnect", (reason) => {
    void reason;
  });
});

server.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Realtime service running on port ${config.PORT} (${config.NODE_ENV})`);
});
