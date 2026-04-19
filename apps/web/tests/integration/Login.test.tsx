import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "../../src/features/auth/pages/Login";

const { mockLogin, mockPreviewOrgInvite } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPreviewOrgInvite: vi.fn(),
}));

vi.mock("../../src/features/auth/api", () => ({
  login: mockLogin,
  previewOrgInvite: mockPreviewOrgInvite,
}));

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits credentials and calls onLoggedIn", async () => {
    const user = userEvent.setup();
    const onLoggedIn = vi.fn();
    mockLogin.mockResolvedValue({ id: "user-1" });

    render(<Login onLoggedIn={onLoggedIn} />);

    await user.type(screen.getByPlaceholderText(/you@example.com/i), "nasir@example.com");
    await user.type(screen.getByPlaceholderText(/••••••••/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("nasir@example.com", "secret123");
    });

    expect(onLoggedIn).toHaveBeenCalled();
  });

  it("shows backend login errors", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error("Invalid email or password"));

    render(<Login />);

    await user.type(screen.getByPlaceholderText(/you@example.com/i), "nasir@example.com");
    await user.type(screen.getByPlaceholderText(/••••••••/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText(/could not sign in/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
  });
});
