import { describe, it, expect } from "vitest";
import { SessionManager } from "../../src/session/sessionManager";

describe("SessionManager", () => {
  it("adds a user to a room and lists them", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    const users = sm.listUsers("doc-1");

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });
    expect(users[0].color).toBeTruthy();
  });

  it("assigns a stable color for the same user within a room", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    const firstColor = sm.listUsers("doc-1")[0].color;

    sm.leaveRoom("doc-1", "user-1", "socket-1");

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-2",
      joinedAt: 2000,
    });

    const secondColor = sm.listUsers("doc-1")[0].color;

    expect(secondColor).toBe(firstColor);
  });

  it("keeps one presence entry per user and picks the most recent socket", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-2",
      joinedAt: 2000,
    });

    const users = sm.listUsers("doc-1");

    expect(users).toHaveLength(1);
    expect(users[0].socketId).toBe("socket-2");
    expect(sm.listUserSockets("doc-1")).toHaveLength(2);
  });

  it("orders listed users by most recent first", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "A",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    sm.joinRoom("doc-1", {
      userId: "user-2",
      name: "B",
      socketId: "socket-2",
      joinedAt: 3000,
    });

    sm.joinRoom("doc-1", {
      userId: "user-3",
      name: "C",
      socketId: "socket-3",
      joinedAt: 2000,
    });

    const users = sm.listUsers("doc-1");

    expect(users.map((u) => u.userId)).toEqual(["user-2", "user-3", "user-1"]);
  });

  it("removes only one socket when leaving with socketId", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-2",
      joinedAt: 2000,
    });

    sm.leaveRoom("doc-1", "user-1", "socket-2");

    const users = sm.listUsers("doc-1");
    const sockets = sm.listUserSockets("doc-1");

    expect(users).toHaveLength(1);
    expect(users[0].socketId).toBe("socket-1");
    expect(sockets).toHaveLength(1);
    expect(sockets[0].socketId).toBe("socket-1");
  });

  it("removes the whole user when leaving without socketId", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-2",
      joinedAt: 2000,
    });

    sm.leaveRoom("doc-1", "user-1");

    expect(sm.listUsers("doc-1")).toEqual([]);
    expect(sm.listUserSockets("doc-1")).toEqual([]);
  });

  it("handleDisconnect removes all memberships for a socket and returns affected docs", () => {
    const sm = new SessionManager();

    sm.joinRoom("doc-1", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    sm.joinRoom("doc-2", {
      userId: "user-1",
      name: "Nasir",
      socketId: "socket-1",
      joinedAt: 1000,
    });

    const affected = sm.handleDisconnect("socket-1").sort();

    expect(affected).toEqual(["doc-1", "doc-2"]);
    expect(sm.listUsers("doc-1")).toEqual([]);
    expect(sm.listUsers("doc-2")).toEqual([]);
  });

  it("returns empty arrays for unknown rooms or sockets", () => {
    const sm = new SessionManager();

    expect(sm.listUsers("missing-doc")).toEqual([]);
    expect(sm.listUserSockets("missing-doc")).toEqual([]);
    expect(sm.handleDisconnect("missing-socket")).toEqual([]);
  });
});