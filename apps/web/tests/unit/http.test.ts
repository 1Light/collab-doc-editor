import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDisconnectSocket = vi.fn();

vi.mock("../../src/features/realtime/socket", () => ({
  disconnectSocket: mockDisconnectSocket,
}));

describe("http client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, "location", {
      value: { pathname: "/documents", replace: vi.fn() },
      writable: true,
    });
  });

  it("silently refreshes on 401 and retries the original request", async () => {
    localStorage.setItem("accessToken", "old-token");
    localStorage.setItem("orgId", "org-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "expired" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "new-token",
            expiresIn: 1200,
            user: {
              id: "user-1",
              name: "Nasir",
              email: "nasir@example.com",
              orgId: "org-1",
              orgRole: "OrgOwner",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { http } = await import("../../src/lib/http");
    const result = await http<{ ok: true }>("/documents");

    expect(result).toEqual({ ok: true });
    expect(localStorage.getItem("accessToken")).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
