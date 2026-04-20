import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-secret-12345";

vi.mock("../../src/middleware/authMiddleware", () => ({
  default: async (req: any, _res: any, next: any) => {
    req.authUser = {
      id: "user-1",
      name: "Nasir",
      email: "nasir@example.com",
      orgId: "org-1",
      orgRole: "OrgOwner",
    };
    next();
  },
}));

const mockCreateComment = vi.fn();
const mockListComments = vi.fn();
const mockEditComment = vi.fn();
const mockResolveComment = vi.fn();
const mockDeleteComment = vi.fn();
const mockDocumentCommentChanged = vi.fn();

vi.mock("../../src/modules/comments/commentService", () => ({
  commentService: {
    createComment: mockCreateComment,
    listComments: mockListComments,
    editComment: mockEditComment,
    resolveComment: mockResolveComment,
    deleteComment: mockDeleteComment,
  },
}));

vi.mock("../../src/integrations/realtimeNotifyService", () => ({
  realtimeNotifyService: {
    documentCommentChanged: mockDocumentCommentChanged,
  },
}));

describe("Comment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a comment and notifies realtime listeners", async () => {
    mockCreateComment.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      authorId: "user-1",
      body: "Looks good",
      parentCommentId: null,
      anchorStart: 0,
      anchorEnd: 9,
      quote: "Hello doc",
      status: "open",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
      author: {
        name: "Nasir",
        email: "nasir@example.com",
      },
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/comments")
      .set("Authorization", "Bearer fake-token")
      .send({
        body: "Looks good",
        anchor: { start: 0, end: 9 },
        quote: "Hello doc",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      commentId: "comment-1",
      documentId: "doc-1",
      body: "Looks good",
      quote: "Hello doc",
      status: "open",
      anchor: { start: 0, end: 9 },
    });

    expect(mockCreateComment).toHaveBeenCalledWith({
      documentId: "doc-1",
      authorId: "user-1",
      body: "Looks good",
      anchor: { start: 0, end: 9 },
      quote: "Hello doc",
      parentCommentId: undefined,
      linkToken: undefined,
    });

    expect(mockDocumentCommentChanged).toHaveBeenCalledWith({
      documentId: "doc-1",
      action: "created",
      commentId: "comment-1",
      actorUserId: "user-1",
      parentCommentId: null,
      status: "open",
    });
  });

  it("lists threaded comments and forwards share-link token", async () => {
    mockListComments.mockResolvedValue([
      {
        id: "comment-1",
        documentId: "doc-1",
        authorId: "user-1",
        body: "Parent",
        parentCommentId: null,
        anchorStart: null,
        anchorEnd: null,
        quote: null,
        status: "open",
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        updatedAt: new Date("2026-04-01T10:00:00.000Z"),
        author: { name: "Nasir", email: "nasir@example.com" },
        replies: [
          {
            id: "comment-2",
            documentId: "doc-1",
            authorId: "user-1",
            body: "Reply",
            parentCommentId: "comment-1",
            anchorStart: null,
            anchorEnd: null,
            quote: null,
            status: "open",
            createdAt: new Date("2026-04-01T10:01:00.000Z"),
            updatedAt: new Date("2026-04-01T10:01:00.000Z"),
            author: { name: "Nasir", email: "nasir@example.com" },
          },
        ],
      },
    ]);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-1/comments?status=open")
      .set("Authorization", "Bearer fake-token")
      .set("x-document-link-token", "share-token-1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      commentId: "comment-1",
      body: "Parent",
      replies: [{ commentId: "comment-2", body: "Reply" }],
    });

    expect(mockListComments).toHaveBeenCalledWith({
      documentId: "doc-1",
      requesterId: "user-1",
      status: "open",
      linkToken: "share-token-1",
    });
  });

  it("resolves a comment thread", async () => {
    mockResolveComment.mockResolvedValue({
      id: "comment-1",
      documentId: "doc-1",
      authorId: "user-1",
      body: "Resolved thread",
      parentCommentId: null,
      anchorStart: null,
      anchorEnd: null,
      quote: null,
      status: "resolved",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:02:00.000Z"),
      resolvedBy: "user-1",
      resolvedAt: new Date("2026-04-01T10:02:00.000Z"),
      author: { name: "Nasir", email: "nasir@example.com" },
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/comments/comment-1/resolve")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      commentId: "comment-1",
      status: "resolved",
      resolvedBy: "user-1",
    });

    expect(mockResolveComment).toHaveBeenCalledWith({
      documentId: "doc-1",
      commentId: "comment-1",
      requesterId: "user-1",
      linkToken: undefined,
    });
  });

  it("rejects invalid comment status filters", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-1/comments?status=bad-status")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid status filter");
    expect(mockListComments).not.toHaveBeenCalled();
  });
});
