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

vi.mock("../../src/middleware/docRoleMiddleware", () => ({
  requireDocumentRole: () => (_req: any, _res: any, next: any) => next(),
}));

const mockResolveEffectiveRole = vi.fn();
const mockGetDocument = vi.fn();
const mockListVersions = vi.fn();
const mockRevertToVersion = vi.fn();
const mockDeleteVersion = vi.fn();

vi.mock("../../src/modules/permissions/permissionService", () => ({
  permissionService: {
    resolveEffectiveRole: mockResolveEffectiveRole,
  },
}));

vi.mock("../../src/modules/documents/documentService", () => ({
  documentService: {
    getDocument: mockGetDocument,
  },
}));

vi.mock("../../src/modules/versions/versionService", () => ({
  versionService: {
    listVersions: mockListVersions,
    revertToVersion: mockRevertToVersion,
    deleteVersion: mockDeleteVersion,
  },
}));

describe("Version routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists versions for an authorized user", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Viewer");
    mockGetDocument.mockResolvedValue({
      id: "doc-1",
      headVersionId: "ver-2",
    });
    mockListVersions.mockResolvedValue([
      {
        id: "ver-2",
        authorId: "user-1",
        authorName: "Nasir",
        reason: "manual_save",
        createdAt: new Date("2026-04-01T10:10:00.000Z"),
      },
      {
        id: "ver-1",
        authorId: "user-1",
        authorName: "Nasir",
        reason: "checkpoint",
        createdAt: new Date("2026-04-01T09:00:00.000Z"),
      },
    ]);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-1/versions?limit=5")
      .set("Authorization", "Bearer fake-token")
      .set("x-document-link-token", "share-token-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        versionId: "ver-2",
        createdAt: "2026-04-01T10:10:00.000Z",
        authorId: "user-1",
        authorName: "Nasir",
        reason: "manual_save",
        isCurrent: true,
      },
      {
        versionId: "ver-1",
        createdAt: "2026-04-01T09:00:00.000Z",
        authorId: "user-1",
        authorName: "Nasir",
        reason: "checkpoint",
        isCurrent: false,
      },
    ]);

    expect(mockResolveEffectiveRole).toHaveBeenCalledWith({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: "share-token-1",
    });
    expect(mockListVersions).toHaveBeenCalledWith("doc-1", 5);
  });

  it("reverts a version for an editor", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Editor");
    mockRevertToVersion.mockResolvedValue({
      newHeadVersionId: "ver-3",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/versions/ver-1/revert")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      newHeadVersionId: "ver-3",
    });
    expect(mockRevertToVersion).toHaveBeenCalledWith({
      documentId: "doc-1",
      targetVersionId: "ver-1",
      userId: "user-1",
    });
  });

  it("blocks version revert for viewers", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Viewer");

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/versions/ver-1/revert")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Insufficient role to revert versions");
    expect(mockRevertToVersion).not.toHaveBeenCalled();
  });

  it("deletes a version for the owner", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Owner");
    mockDeleteVersion.mockResolvedValue({
      deleted: true,
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .delete("/api/documents/doc-1/versions/ver-1")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(mockDeleteVersion).toHaveBeenCalledWith({
      documentId: "doc-1",
      versionId: "ver-1",
      userId: "user-1",
    });
  });
});
