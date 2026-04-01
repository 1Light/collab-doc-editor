import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRun = vi.fn();
const mockWithRetry = vi.fn();
const mockBuildPrompt = vi.fn();

vi.mock("../../src/config/env", () => ({
  config: {
    LLM_PROVIDER: "mock",
  },
}));

vi.mock("../../src/providers/mockProvider", () => ({
  MockProvider: vi.fn().mockImplementation(() => ({
    run: mockRun,
  })),
}));

vi.mock("../../src/providers/lmStudioProvider", () => ({
  LMStudioProvider: vi.fn().mockImplementation(() => ({
    run: mockRun,
  })),
}));

vi.mock("../../src/lib/retry", () => ({
  withRetry: mockWithRetry,
}));

vi.mock("../../src/modules/jobs/promptTemplates", () => ({
  buildPrompt: mockBuildPrompt,
}));

describe("runJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds prompt, runs provider, and returns result", async () => {
    mockBuildPrompt.mockReturnValue("test prompt");

    mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => {
      return fn();
    });

    mockRun.mockResolvedValue({ result: "AI output" });

    const { runJob } = await import("../../src/modules/jobs/runJob");

    const result = await runJob({
      jobId: "job-1",
      operation: "enhance",
      selectedText: "draft text",
      parameters: {
        style: "formal",
      },
    });

    expect(mockBuildPrompt).toHaveBeenCalledWith("enhance", {
      selectedText: "draft text",
      style: "formal",
      summaryStyle: undefined,
      language: undefined,
      formatStyle: undefined,
    });

    expect(mockWithRetry).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledWith({
      operation: "enhance",
      selectedText: "draft text",
      prompt: "test prompt",
      parameters: {
        style: "formal",
      },
    });

    expect(result).toEqual({ result: "AI output" });
  });

  it("throws when provider returns invalid response", async () => {
    mockBuildPrompt.mockReturnValue("test prompt");

    mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => {
      return fn();
    });

    mockRun.mockResolvedValue({ result: null });

    const { runJob } = await import("../../src/modules/jobs/runJob");

    await expect(
      runJob({
        jobId: "job-2",
        operation: "summarize",
        selectedText: "some text",
      })
    ).rejects.toMatchObject({
      message: "Provider returned invalid response",
    });
  });

  it("passes provider errors through retry wrapper", async () => {
    const providerError = new Error("network timeout");

    mockBuildPrompt.mockReturnValue("test prompt");
    mockWithRetry.mockRejectedValue(providerError);

    const { runJob } = await import("../../src/modules/jobs/runJob");

    await expect(
      runJob({
        jobId: "job-3",
        operation: "translate",
        selectedText: "hello",
        parameters: { language: "Arabic" },
      })
    ).rejects.toThrow("network timeout");
  });
});