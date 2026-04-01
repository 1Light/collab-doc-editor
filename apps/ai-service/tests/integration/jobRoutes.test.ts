import request from "supertest";
import { describe, it, expect, vi } from "vitest";

const mockRunJob = vi.fn();

vi.mock("../../src/modules/jobs/runJob", () => ({
  runJob: mockRunJob,
}));

describe("POST /jobs/run", () => {
  it("returns AI result successfully", async () => {
    mockRunJob.mockResolvedValue({
      result: "AI generated text",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs/run")
      .send({
        jobId: "job-1",
        operation: "enhance",
        selectedText: "draft text",
        parameters: { style: "formal" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: "AI generated text",
    });
  });

  it("returns error when runJob throws", async () => {
    mockRunJob.mockRejectedValue({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "Provider failed",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs/run")
      .send({
        jobId: "job-2",
        operation: "summarize",
        selectedText: "text",
      });

    expect(res.status).toBe(503); // important: matches your error mapping
    expect(res.body).toHaveProperty("code", "AI_PROVIDER_UNAVAILABLE");
    expect(res.body).toHaveProperty("message");
  });
});