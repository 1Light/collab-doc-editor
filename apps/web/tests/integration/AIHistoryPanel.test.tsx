import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIHistoryPanel } from "../../src/components/layout/AIHistoryPanel";

const { mockListAIHistory } = vi.hoisted(() => ({
  mockListAIHistory: vi.fn(),
}));

vi.mock("../../src/features/ai/api", () => ({
  listAIHistory: mockListAIHistory,
}));

describe("AIHistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays AI history in the dedicated panel", async () => {
    mockListAIHistory.mockResolvedValue([
      {
        jobId: "job-1",
        operation: "rewrite",
        status: "succeeded",
        createdAt: "2026-04-17T10:00:00.000Z",
        author: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
        },
        selection: {
          start: 0,
          end: 5,
          text: "hello",
        },
        prompt: "Improve this",
        model: "mock-model",
        parameters: {},
        decisionStatus: "accepted",
        result: "Improved hello",
        errorMessage: null,
        acceptedAt: "2026-04-17T10:01:00.000Z",
        acceptedById: "user-1",
        finalText: "Improved hello",
        applicationCount: 1,
      },
    ]);

    render(<AIHistoryPanel documentId="doc-1" />);

    expect(await screen.findByText(/showing latest 1 ai interactions/i)).toBeInTheDocument();
    expect(screen.getByText(/test user/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/selection: hello/i)).toBeInTheDocument();
  });
});
