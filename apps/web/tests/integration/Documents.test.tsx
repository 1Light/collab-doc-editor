import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Documents } from "../../src/features/documents/pages/Documents";

const {
  mockListDocuments,
  mockCreateDocument,
  mockDeleteDocument,
} = vi.hoisted(() => ({
  mockListDocuments: vi.fn(),
  mockCreateDocument: vi.fn(),
  mockDeleteDocument: vi.fn(),
}));

vi.mock("../../src/features/documents/api", () => ({
  listDocuments: mockListDocuments,
  createDocument: mockCreateDocument,
  deleteDocument: mockDeleteDocument,
}));

describe("Documents page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays documents", async () => {
    mockListDocuments.mockResolvedValue([
      {
        id: "doc-1",
        title: "Project Plan",
        ownerId: "user-1",
        updatedAt: "2026-03-28T10:00:00.000Z",
        role: "Owner",
      },
      {
        id: "doc-2",
        title: "Meeting Notes",
        ownerId: "user-2",
        updatedAt: "2026-03-28T11:00:00.000Z",
        role: "Editor",
      },
    ]);

    render(<Documents onOpenDocument={vi.fn()} />);

    expect(screen.getByText(/documents/i)).toBeInTheDocument();
    expect(await screen.findByText("Project Plan")).toBeInTheDocument();
    expect(screen.getByText("Meeting Notes")).toBeInTheDocument();

    expect(mockListDocuments).toHaveBeenCalledTimes(1);
  });

  it("creates a document and shows it in the list", async () => {
    const user = userEvent.setup();

    mockListDocuments.mockResolvedValue([]);
    mockCreateDocument.mockResolvedValue({
      id: "doc-3",
      title: "New Spec",
      ownerId: "user-1",
      updatedAt: "2026-03-28T12:00:00.000Z",
    });

    render(<Documents onOpenDocument={vi.fn()} />);

    await screen.findByText(/no documents yet/i);

    await user.click(screen.getByRole("button", { name: /new document/i }));
    await user.type(screen.getByPlaceholderText(/example: q2 product brief/i), "New Spec");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockCreateDocument).toHaveBeenCalledWith("New Spec");
    });

    expect(await screen.findByText("New Spec")).toBeInTheDocument();
  });

  it("calls onOpenDocument when Open is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDocument = vi.fn();

    mockListDocuments.mockResolvedValue([
      {
        id: "doc-1",
        title: "Project Plan",
        ownerId: "user-1",
        updatedAt: "2026-03-28T10:00:00.000Z",
        role: "Owner",
      },
    ]);

    render(<Documents onOpenDocument={onOpenDocument} />);

    await screen.findByText("Project Plan");
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(onOpenDocument).toHaveBeenCalledWith("doc-1");
  });
});