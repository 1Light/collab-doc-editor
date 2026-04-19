import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-secret-12345";

const mockFindByEmail = vi.fn();
const mockFindAnyByEmail = vi.fn();
const mockFindAnyById = vi.fn();
const mockCompare = vi.fn();
const mockHash = vi.fn();
const mockSign = vi.fn();
const mockVerify = vi.fn();
const mockLogAction = vi.fn();

const mockMembershipFindFirst = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockOrganizationCreate = vi.fn();
const mockOrganizationMemberCreate = vi.fn();
const mockInviteFindUnique = vi.fn();
const mockInviteUpdate = vi.fn();

vi.mock("../../src/modules/auth/userRepo", () => ({
  userRepo: {
    findByEmail: mockFindByEmail,
    findAnyByEmail: mockFindAnyByEmail,
    findAnyById: mockFindAnyById,
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mockCompare,
    hash: mockHash,
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: mockSign,
    verify: mockVerify,
  },
}));

vi.mock("../../src/modules/audit/auditLogService", () => ({
  auditLogService: {
    logAction: mockLogAction,
  },
}));

vi.mock("../../src/middleware/authMiddleware", () => ({
  default: async (req: any, _res: any, next: any) => {
    req.authUser = {
      id: "user-1",
      name: "Nasir",
      email: "nasir@example.com",
      orgId: "org-1",
      orgRole: "OrgOwner",
    };
    next();
  },
}));

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findFirst: mockMembershipFindFirst,
      findUnique: mockMembershipFindUnique,
      create: mockOrganizationMemberCreate,
      upsert: vi.fn(),
    },
    user: {
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    organization: {
      create: mockOrganizationCreate,
    },
    organizationInvite: {
      findUnique: mockInviteFindUnique,
      update: mockInviteUpdate,
    },
    $transaction: async (cb: any) =>
      cb({
        user: {
          create: mockUserCreate,
          update: mockUserUpdate,
        },
        organization: {
          create: mockOrganizationCreate,
        },
        organizationMember: {
          create: mockOrganizationMemberCreate,
          upsert: vi.fn(),
        },
        organizationInvite: {
          update: mockInviteUpdate,
        },
      }),
  },
}));

describe("Auth routes", () => {
  function readSetCookieHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value.join(";");
    return value ?? "";
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSign.mockReturnValue("signed-token");
    mockMembershipFindFirst.mockResolvedValue({
      orgId: "org-1",
      orgRole: "OrgOwner",
    });
    mockMembershipFindUnique.mockResolvedValue({
      orgId: "org-1",
      orgRole: "OrgOwner",
    });
  });

  it("logs in successfully and sets a refresh cookie", async () => {
    mockFindByEmail.mockResolvedValue({
      id: "user-1",
      name: "Nasir",
      email: "nasir@example.com",
      password: "hashed",
      isDeleted: false,
    });
    mockCompare.mockResolvedValue(true);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app).post("/api/auth/login").send({
      email: "nasir@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("signed-token");
    expect(res.body.expiresIn).toBe(20 * 60);
    expect(readSetCookieHeader(res.headers["set-cookie"])).toContain("refreshToken=");
  });

  it("signs up with hashed password", async () => {
    mockFindAnyByEmail.mockResolvedValue(null);
    mockHash.mockResolvedValue("hashed-password");
    mockUserCreate.mockResolvedValue({
      id: "user-2",
      name: "New User",
      email: "new@example.com",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app).post("/api/auth/signup").send({
      name: "New User",
      email: "new@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(201);
    expect(mockHash).toHaveBeenCalledWith("secret123", 10);
    expect(mockUserCreate).toHaveBeenCalled();
    expect(readSetCookieHeader(res.headers["set-cookie"])).toContain("refreshToken=");
  });

  it("refreshes an access token from the refresh cookie", async () => {
    mockVerify.mockReturnValue({
      userId: "user-1",
      type: "refresh",
    });
    mockFindAnyById.mockResolvedValue({
      id: "user-1",
      name: "Nasir",
      email: "nasir@example.com",
      isDeleted: false,
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=valid-refresh-token"]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("signed-token");
    expect(readSetCookieHeader(res.headers["set-cookie"])).toContain("refreshToken=");
  });

  it("clears the refresh cookie on logout", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(readSetCookieHeader(res.headers["set-cookie"])).toContain("refreshToken=");
  });
});
