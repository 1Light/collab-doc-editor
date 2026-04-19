import request from "supertest";
import { describe, it, expect, vi } from "vitest";

const mockRunJob = vi.fn();
const mockStreamJob = vi.fn();

vi.mock("../../src/modules/jobs/runJob", () => ({
  runJob: mockRunJob,
  streamJob: mockStreamJob,
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

  it("streams SSE chunks from the AI provider", async () => {
    mockStreamJob.mockImplementation(async ({ onChunk }: any) => {
      await onChunk("Hello ");
      await onChunk("world");
      return {
        result: "Hello world",
        prompt: "Prompt",
        model: "mock-model",
      };
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/jobs/stream")
      .send({
        jobId: "job-stream",
        operation: "enhance",
        selectedText: "draft text",
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("event: chunk");
    expect(res.text).toContain("Hello ");
    expect(res.text).toContain("event: done");
  });
});
