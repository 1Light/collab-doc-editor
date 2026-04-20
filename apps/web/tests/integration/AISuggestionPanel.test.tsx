import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AISuggestionPanel } from "../../src/features/ai/AISuggestionPanel";

const {
  mockStreamAIJob,
  mockApplyAIJob,
  mockRejectAIJob,
} = vi.hoisted(() => ({
  mockStreamAIJob: vi.fn(),
  mockApplyAIJob: vi.fn(),
  mockRejectAIJob: vi.fn(),
}));

vi.mock("../../src/features/ai/api", () => ({
  streamAIJob: mockStreamAIJob,
  applyAIJob: mockApplyAIJob,
  rejectAIJob: mockRejectAIJob,
}));

describe("AISuggestionPanel", () => {
  type StreamCallOptions = {
    onChunk: (chunk: string) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRejectAIJob.mockResolvedValue({ ok: true });
  });

  it("streams generated text and allows accepting it", async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();

    mockStreamAIJob.mockImplementation(async (_params: unknown, opts: StreamCallOptions) => {
      opts.onChunk("Hello ");
      opts.onChunk("world");
      return {
        jobId: "job-1",
        result: "Hello world",
        prompt: "prompt",
        model: "mock",
      };
    });

    mockApplyAIJob.mockResolvedValue({
      versionHeadId: "v2",
      updatedAt: "2026-04-17T10:00:00.000Z",
    });

    render(
      <AISuggestionPanel
        documentId="doc-1"
        selection={{
          start: 0,
          end: 11,
          text: "hello world",
          pmFrom: 1,
          pmTo: 12,
        }}
        onApplied={onApplied}
      />
    );

    await user.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Hello world")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(mockApplyAIJob).toHaveBeenCalledWith("job-1", "Hello world");
    });

    expect(onApplied).toHaveBeenCalled();
  });

  it("keeps generation UI focused without always showing AI history", () => {
    render(
      <AISuggestionPanel
        documentId="doc-1"
        selection={{
          start: 0,
          end: 5,
          text: "hello",
          pmFrom: 1,
          pmTo: 6,
        }}
      />
    );

    expect(screen.queryByText(/recent ai history/i)).not.toBeInTheDocument();
  });

  it("allows editing the generated suggestion before accepting", async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();

    mockStreamAIJob.mockResolvedValue({
      jobId: "job-2",
      result: "Alpha Beta Gamma",
      prompt: "prompt",
      model: "mock",
    });

    mockApplyAIJob.mockResolvedValue({
      versionHeadId: "v3",
      updatedAt: "2026-04-17T10:05:00.000Z",
    });

    render(
      <AISuggestionPanel
        documentId="doc-1"
        selection={{
          start: 0,
          end: 5,
          text: "hello",
          pmFrom: 1,
          pmTo: 6,
        }}
        onApplied={onApplied}
      />
    );

    await user.click(screen.getByRole("button", { name: /generate/i }));

    const textarea = (await screen.findByDisplayValue("Alpha Beta Gamma")) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "Beta");

    await user.click(screen.getByRole("button", { name: /accept/i }));

    await waitFor(() => {
      expect(mockApplyAIJob).toHaveBeenCalledWith("job-2", "Beta");
    });

    expect(onApplied).toHaveBeenCalled();
  });
});
