import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-secret-12345";

// mock auth middleware: inject fake authenticated user
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

// mock doc role middleware so protected document role checks do not block tests
vi.mock("../../src/middleware/docRoleMiddleware", () => ({
  requireDocumentRole: () => (_req: any, _res: any, next: any) => next(),
}));

const mockCreateDocument = vi.fn();
const mockListMyDocuments = vi.fn();
const mockGetDocument = vi.fn();
const mockUpdateDocument = vi.fn();
const mockSoftDeleteDocument = vi.fn();
const mockExportDocument = vi.fn();
const mockResolveEffectiveRole = vi.fn();

vi.mock("../../src/modules/documents/documentService", () => ({
  documentService: {
    createDocument: mockCreateDocument,
    listMyDocuments: mockListMyDocuments,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    softDeleteDocument: mockSoftDeleteDocument,
  },
}));

vi.mock("../../src/modules/documents/exportService", () => ({
  exportService: {
    exportDocument: mockExportDocument,
  },
}));

vi.mock("../../src/modules/permissions/permissionService", () => ({
  permissionService: {
    resolveEffectiveRole: mockResolveEffectiveRole,
  },
}));

describe("Document routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a document when authenticated", async () => {
    mockCreateDocument.mockResolvedValue({
      id: "doc-1",
      title: "My Document",
      ownerId: "user-1",
      createdAt: new Date("2026-03-28T10:00:00.000Z"),
      updatedAt: new Date("2026-03-28T10:00:00.000Z"),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer fake-token")
      .send({ title: "My Document" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "doc-1",
      title: "My Document",
      ownerId: "user-1",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
    });

    expect(mockCreateDocument).toHaveBeenCalledWith({
      title: "My Document",
      ownerId: "user-1",
      orgId: "org-1",
    });
  });

  it("rejects invalid request body for POST /api/documents", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer fake-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("code");
    expect(res.body).toHaveProperty("message");
  });

  it("lists documents for the authenticated user", async () => {
    mockListMyDocuments.mockResolvedValue([
      {
        id: "doc-1",
        title: "Doc One",
        ownerId: "user-1",
        updatedAt: new Date("2026-03-28T12:00:00.000Z"),
      },
      {
        id: "doc-2",
        title: "Doc Two",
        ownerId: "user-2",
        updatedAt: new Date("2026-03-28T13:00:00.000Z"),
      },
    ]);

    mockResolveEffectiveRole
      .mockResolvedValueOnce("Owner")
      .mockResolvedValueOnce("Editor");

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: "doc-1",
        title: "Doc One",
        ownerId: "user-1",
        updatedAt: "2026-03-28T12:00:00.000Z",
        role: "Owner",
      },
      {
        id: "doc-2",
        title: "Doc Two",
        ownerId: "user-2",
        updatedAt: "2026-03-28T13:00:00.000Z",
        role: "Editor",
      },
    ]);

    expect(mockListMyDocuments).toHaveBeenCalledWith("user-1", "org-1");
    expect(mockResolveEffectiveRole).toHaveBeenCalledTimes(2);
  });

  it("gets a document by id when the user has access", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Editor");
    mockGetDocument.mockResolvedValue({
      id: "doc-1",
      title: "Doc One",
      content: "Hello world",
      headVersionId: "ver-1",
      updatedAt: new Date("2026-03-28T14:00:00.000Z"),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-1")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: "doc-1",
      title: "Doc One",
      content: "Hello world",
      versionHeadId: "ver-1",
      updatedAt: "2026-03-28T14:00:00.000Z",
      role: "Editor",
    });

    expect(mockResolveEffectiveRole).toHaveBeenCalledWith({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: undefined,
    });
    expect(mockGetDocument).toHaveBeenCalledWith("doc-1");
  });

  it("forwards a share-link token into document access checks", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Viewer");
    mockGetDocument.mockResolvedValue({
      id: "doc-1",
      title: "Shared Doc",
      content: "Read only",
      headVersionId: "ver-2",
      updatedAt: new Date("2026-03-28T14:05:00.000Z"),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-1")
      .set("Authorization", "Bearer fake-token")
      .set("x-document-link-token", "share-token-1");

    expect(res.status).toBe(200);
    expect(mockResolveEffectiveRole).toHaveBeenCalledWith({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: "share-token-1",
    });
  });

  it("returns 403 when the user has no access to the document", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce(null);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-2")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("code");
    expect(res.body).toHaveProperty("message", "No access to this document");
  });

  it("exports a document for an authorized user and returns a download reference", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Editor");
    mockExportDocument.mockResolvedValue({
      downloadUrl: "http://localhost:4000/exports/doc-1_abcd1234.pdf",
      format: "pdf",
      filename: "doc-1_abcd1234.pdf",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/export")
      .set("Authorization", "Bearer fake-token")
      .send({ format: "pdf" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      downloadUrl: "http://localhost:4000/exports/doc-1_abcd1234.pdf",
      format: "pdf",
      filename: "doc-1_abcd1234.pdf",
    });

    expect(mockResolveEffectiveRole).toHaveBeenCalledWith({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: undefined,
    });

    expect(mockExportDocument).toHaveBeenCalledWith({
      documentId: "doc-1",
      format: "pdf",
    });
  });

  it("blocks export when the user has no access", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce(null);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/export")
      .set("Authorization", "Bearer fake-token")
      .send({ format: "pdf" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBeDefined();
    expect(res.body.message).toBe("No access to this document");
    expect(mockExportDocument).not.toHaveBeenCalled();
  });

  it("blocks export for viewers", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Viewer");

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/export")
      .set("Authorization", "Bearer fake-token")
      .send({ format: "pdf" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBeDefined();
    expect(res.body.message).toBe("Only Editors and Owners can export this document");
    expect(mockExportDocument).not.toHaveBeenCalled();
  });

  it("rejects invalid export format clearly", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/export")
      .set("Authorization", "Bearer fake-token")
      .send({ format: "txt" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBeDefined();
    expect(res.body.message).toBeDefined();
    expect(mockExportDocument).not.toHaveBeenCalled();
  });

  it("returns an error when export fails instead of failing silently", async () => {
    mockResolveEffectiveRole.mockResolvedValueOnce("Owner");
    mockExportDocument.mockRejectedValue({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Export generation failed",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/documents/doc-1/export")
      .set("Authorization", "Bearer fake-token")
      .send({ format: "docx" });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(res.body.message).toBe("Export generation failed");
  });
});

const ERROR_CODES = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
};
