// apps/realtime/src/session/sessionManager.ts

export type PresenceUser = {
  userId: string;
  name?: string;
  socketId: string;
  joinedAt: number;
  color: string;
};

type RoomState = {
  // userId -> (socketId -> PresenceUser)
  usersById: Map<string, Map<string, PresenceUser>>;

  // userId -> color (stable per session)
  userColors: Map<string, string>;
};

type SocketJoin = { documentId: string; userId: string };

const CURSOR_COLOR_PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
];

export class SessionManager {
  private rooms: Map<string, RoomState> = new Map();

  // socketId -> set of joins (supports multi-doc per socket)
  private socketToJoins: Map<string, Set<string>> = new Map();
  // key encoding: `${documentId}::${userId}`

  private key(documentId: string, userId: string) {
    return `${documentId}::${userId}`;
  }

  private ensureRoom(documentId: string): RoomState {
    let room = this.rooms.get(documentId);
    if (!room) {
      room = {
        usersById: new Map(),
        userColors: new Map(),
      };
      this.rooms.set(documentId, room);
    }
    return room;
  }

  private hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  private assignColor(room: RoomState, documentId: string, userId: string): string {
    const existing = room.userColors.get(userId);
    if (existing) return existing;

    const usedColors = new Set(room.userColors.values());

    for (const color of CURSOR_COLOR_PALETTE) {
      if (!usedColors.has(color)) {
        room.userColors.set(userId, color);
        return color;
      }
    }

    // fallback deterministic hash if palette exhausted
    const idx =
      this.hashString(`${documentId}:${userId}`) %
      CURSOR_COLOR_PALETTE.length;

    const color = CURSOR_COLOR_PALETTE[idx];
    room.userColors.set(userId, color);
    return color;
  }

  joinRoom(documentId: string, user: Omit<PresenceUser, "color">) {
    const room = this.ensureRoom(documentId);

    const color = this.assignColor(room, documentId, user.userId);

    const presenceUser: PresenceUser = {
      ...user,
      color,
    };

    let socketsForUser = room.usersById.get(user.userId);
    if (!socketsForUser) {
      socketsForUser = new Map();
      room.usersById.set(user.userId, socketsForUser);
    }

    socketsForUser.set(user.socketId, presenceUser);

    // reverse lookup for disconnect cleanup
    const joinKey = this.key(documentId, user.userId);
    let joins = this.socketToJoins.get(user.socketId);
    if (!joins) {
      joins = new Set();
      this.socketToJoins.set(user.socketId, joins);
    }
    joins.add(joinKey);
  }

  leaveRoom(documentId: string, userId: string, socketId?: string) {
    const room = this.rooms.get(documentId);
    if (!room) return;

    const socketsForUser = room.usersById.get(userId);
    if (!socketsForUser) return;

    if (socketId) {
      socketsForUser.delete(socketId);

      const joins = this.socketToJoins.get(socketId);
      if (joins) {
        joins.delete(this.key(documentId, userId));
        if (joins.size === 0) this.socketToJoins.delete(socketId);
      }
    } else {
      // remove all sockets for that user in this room
      for (const sid of socketsForUser.keys()) {
        const joins = this.socketToJoins.get(sid);
        if (joins) {
          joins.delete(this.key(documentId, userId));
          if (joins.size === 0) this.socketToJoins.delete(sid);
        }
      }
      socketsForUser.clear();
    }

    if (socketsForUser.size === 0) {
      room.usersById.delete(userId);
      room.userColors.delete(userId);
    }

    if (room.usersById.size === 0) {
      this.rooms.delete(documentId);
    }
  }

  /**
   * Remove all room memberships for a disconnected socket.
   * Returns the list of affected documentIds so callers can broadcast presence updates efficiently.
   */
  handleDisconnect(socketId: string): string[] {
    const joins = this.socketToJoins.get(socketId);
    if (!joins) return [];

    const affectedDocs = new Set<string>();

    for (const joinKey of joins) {
      const idx = joinKey.indexOf("::");
      if (idx <= 0) continue;

      const documentId = joinKey.slice(0, idx);
      const userId = joinKey.slice(idx + 2);

      affectedDocs.add(documentId);
      this.leaveRoom(documentId, userId, socketId);
    }

    this.socketToJoins.delete(socketId);

    return Array.from(affectedDocs);
  }

  /**
   * List unique users for a room (one entry per user).
   * If a user has multiple sockets, returns the most recently joined socket record.
   */
  listUsers(documentId: string): PresenceUser[] {
    const room = this.rooms.get(documentId);
    if (!room) return [];

    const out: PresenceUser[] = [];

    for (const socketsForUser of room.usersById.values()) {
      let best: PresenceUser | null = null;
      for (const u of socketsForUser.values()) {
        if (!best || u.joinedAt > best.joinedAt) best = u;
      }
      if (best) out.push(best);
    }

    // stable order: most recent first
    out.sort((a, b) => b.joinedAt - a.joinedAt);

    return out;
  }

  /**
   * Optional: list all sockets (if you ever need per-tab presence).
   */
  listUserSockets(documentId: string): PresenceUser[] {
    const room = this.rooms.get(documentId);
    if (!room) return [];
    return Array.from(room.usersById.values()).flatMap((m) =>
      Array.from(m.values())
    );
  }
}