import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/authMiddleware", () => ({
  default: async (req: any, _res: any, next: any) => {
    req.authUser = {
      id: "user-1",
      name: "Test",
      email: "test@example.com",
      orgId: "org-1",
      orgRole: "OrgOwner",
    };
    next();
  },
}));

const mockResolveEffectiveRole = vi.fn();
const mockCreateJob = vi.fn();
const mockGetJob = vi.fn();
const mockApplyJob = vi.fn();

vi.mock("../../src/modules/permissions/permissionService", () => ({
  permissionService: {
    resolveEffectiveRole: mockResolveEffectiveRole,
  },
}));

vi.mock("../../src/modules/ai/aiJobService", () => ({
  aiJobService: {
    createJob: mockCreateJob,
    getJob: mockGetJob,
    applyJob: mockApplyJob,
  },
}));

describe("AI routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveEffectiveRole.mockResolvedValue("Editor");
  });

  it("creates AI job (201, async contract)", async () => {
    mockCreateJob.mockResolvedValue({
      id: "job-1",
      status: "queued",
      result: null,
      errorMessage: null,
      createdAt: new Date("2026-03-30T10:00:00Z"),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("queued");
  });

  it("rejects forbidden role (403)", async () => {
    mockCreateJob.mockRejectedValue({
      code: "FORBIDDEN",
      message: "Forbidden",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("handles AI disabled by policy (403)", async () => {
    mockCreateJob.mockRejectedValue({
      code: "AI_DISABLED_BY_POLICY",
      message: "disabled",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AI_DISABLED_BY_POLICY");
  });

  it("handles quota exceeded (429)", async () => {
    mockCreateJob.mockRejectedValue({
      code: "AI_QUOTA_EXCEEDED",
      message: "quota exceeded",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe("AI_QUOTA_EXCEEDED");
  });

  it("returns 503 when AI provider unavailable (network)", async () => {
    mockCreateJob.mockRejectedValue({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "network down",
      details: { reason: "network" },
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(503);
  });

  it("returns 502 when AI provider returns bad response", async () => {
    mockCreateJob.mockRejectedValue({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "bad upstream",
      details: { reason: "upstream_error" },
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .set("Authorization", "Bearer token")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(502);
  });

  it("retrieves job (polling)", async () => {
    mockGetJob.mockResolvedValue({
      id: "job-1",
      documentId: "doc-1",
      status: "running",
      result: null,
      errorMessage: null,
      createdAt: new Date(),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/ai/jobs/job-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
  });

  it("returns failed job with error", async () => {
    mockGetJob.mockResolvedValue({
      id: "job-1",
      documentId: "doc-1",
      status: "failed",
      result: null,
      errorMessage: "provider down",
      createdAt: new Date(),
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/ai/jobs/job-1")
      .set("Authorization", "Bearer token");

    expect(res.status).toBe(200);
    expect(res.body.error).toBeDefined();
  });

  it("applies AI job (success)", async () => {
    mockApplyJob.mockResolvedValue({
      versionHeadId: "v2",
      updatedAt: "2026-03-30T10:00:00.000Z",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs/job-1/apply")
      .set("Authorization", "Bearer token")
      .send({ finalText: "new text" });

    expect(res.status).toBe(200);
  });
});