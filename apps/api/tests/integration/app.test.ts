import request from "supertest";
import { describe, it, expect } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-secret-12345";

describe("API app", () => {
  it("returns health status", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("code");
    expect(res.body).toHaveProperty("message");
  });
});