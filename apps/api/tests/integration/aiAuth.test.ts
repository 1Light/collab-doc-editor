import request from "supertest";
import { describe, it, expect, vi } from "vitest";

// mock auth to always fail
vi.mock("../../src/middleware/authMiddleware", () => ({
  default: async (_req: any, _res: any, next: any) => {
    next({ code: "UNAUTHORIZED", message: "Authentication required" });
  },
}));

describe("AI routes - auth", () => {
  it("returns 401 when unauthorized", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/ai/jobs")
      .send({
        documentId: "doc-1",
        operation: "enhance",
        selection: { start: 0, end: 10, text: "hello" },
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });
});