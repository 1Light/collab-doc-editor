import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPolicy = vi.fn();
const mockUpdatePolicy = vi.fn();

const mockListLogs = vi.fn();
const mockExportLogs = vi.fn();
const mockLogAction = vi.fn();

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCount = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpsert = vi.fn();
const mockTransaction = vi.fn();
const mockOrgAdminDataChanged = vi.fn();

let mockAuthUser: any = {
  id: "user-1",
  name: "Admin User",
  email: "admin@example.com",
  orgId: "org-1",
  orgRole: "OrgAdmin",
};

let forceUnauthorized = false;

// auth middleware mock
vi.mock("../../src/middleware/authMiddleware", () => ({
  default: async (req: any, _res: any, next: any) => {
    if (forceUnauthorized) {
      return next({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    req.authUser = mockAuthUser;
    next();
  },
}));

vi.mock("../../src/modules/ai/aiPolicyService", () => ({
  aiPolicyService: {
    getPolicy: mockGetPolicy,
    updatePolicy: mockUpdatePolicy,
  },
}));

vi.mock("../../src/modules/audit/auditLogService", () => ({
  auditLogService: {
    listLogs: mockListLogs,
    exportLogs: mockExportLogs,
    logAction: mockLogAction,
  },
}));

vi.mock("../../src/integrations/emailService", () => ({
  emailService: {
    sendOrgInvite: vi.fn(),
  },
}));

vi.mock("../../src/integrations/realtimeNotifyService", () => ({
  realtimeNotifyService: {
    orgAdminDataChanged: mockOrgAdminDataChanged,
  },
}));

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findFirst: mockFindFirst,
      delete: mockDelete,
    },
    organizationMember: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      update: mockUpdate,
      count: mockCount,
      delete: mockDelete,
    },
    organization: {
      findUnique: mockFindUnique,
    },
    organizationInvite: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      create: mockUpdate,
      update: mockUpdate,
    },
    user: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
    document: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
    documentPermission: {
      deleteMany: mockDelete,
      upsert: mockUpsert,
    },
    $transaction: mockTransaction,
  },
}));

describe("Admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forceUnauthorized = false;

    mockAuthUser = {
      id: "user-1",
      name: "Admin User",
      email: "admin@example.com",
      orgId: "org-1",
      orgRole: "OrgAdmin",
    };

    mockGetPolicy.mockReturnValue({
      enabledRoles: ["Editor", "Owner"],
      quotaPolicy: { perUserPerDay: 50, perOrgPerDay: 500 },
      updatedAt: "2026-03-30T10:00:00.000Z",
    });

    mockUpdatePolicy.mockReturnValue({
      policy: {
        enabledRoles: ["Owner"],
        quotaPolicy: { perUserPerDay: 10, perOrgPerDay: 100 },
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
      diff: {
        enabledRoles: { from: ["Editor", "Owner"], to: ["Owner"] },
      },
    });

    mockListLogs.mockResolvedValue({
      items: [
        {
          id: "log-1",
          orgId: "org-1",
          userId: "user-1",
          actionType: "AI_POLICY_UPDATED",
          documentId: null,
          metadata: { changed: true },
          createdAt: new Date("2026-03-30T11:00:00.000Z"),
          actor: { id: "user-1", name: "Admin User", email: "admin@example.com" },
          document: null,
          summary: "AI policy updated",
          riskLevel: "low",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    mockExportLogs.mockResolvedValue("id,actionType\nlog-1,AI_POLICY_UPDATED\n");

    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({
      id: "member-1",
      orgRole: "OrgAdmin",
    });
    mockDelete.mockResolvedValue({ count: 1 });
    mockCount.mockResolvedValue(2);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockUpsert.mockResolvedValue({});
    mockTransaction.mockImplementation(async (cb: any) =>
      cb({
        document: {
          findMany: mockFindMany,
          updateMany: mockUpdateMany,
        },
        organizationMember: {
          delete: mockDelete,
        },
        documentPermission: {
          deleteMany: mockDelete,
          upsert: mockUpsert,
        },
      })
    );
  });

  it("allows OrgAdmin to read AI policy", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/admin/policies/ai")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabledRoles: ["Editor", "Owner"],
      quotaPolicy: { perUserPerDay: 50, perOrgPerDay: 500 },
      updatedAt: "2026-03-30T10:00:00.000Z",
    });
  });

  it("denies admin access to non-admin users", async () => {
    mockAuthUser = {
      id: "user-2",
      name: "Member",
      email: "member@example.com",
      orgId: "org-1",
      orgRole: "Member",
    };

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/admin/policies/ai")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.message).toBe("Admin privileges required");
  });

  it("updates AI policy for admin users", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .put("/api/admin/policies/ai")
      .set("Authorization", "Bearer fake-token")
      .send({
        enabledRoles: ["Owner"],
        quotaPolicy: {
          perUserPerDay: 10,
          perOrgPerDay: 100,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabledRoles: ["Owner"],
      quotaPolicy: { perUserPerDay: 10, perOrgPerDay: 100 },
      updatedAt: "2026-03-30T11:00:00.000Z",
    });

    expect(mockUpdatePolicy).toHaveBeenCalledWith({
      enabledRoles: ["Owner"],
      quotaPolicy: { perUserPerDay: 10, perOrgPerDay: 100 },
    });
    expect(mockLogAction).toHaveBeenCalled();
  });

  it("rejects invalid AI policy config with validation error", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .put("/api/admin/policies/ai")
      .set("Authorization", "Bearer fake-token")
      .send({
        enabledRoles: ["Viewer"],
        quotaPolicy: {},
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBeDefined();
    expect(res.body.message).toBeDefined();
    expect(mockUpdatePolicy).not.toHaveBeenCalled();
  });

  it("lists audit logs for admin users", async () => {
    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", "Bearer fake-token")
      .query({ limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].actionType).toBe("AI_POLICY_UPDATED");
  });

  it("surfaces audit export failures clearly", async () => {
    mockExportLogs.mockRejectedValue({
      code: "INTERNAL_ERROR",
      message: "Audit export failed",
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/admin/audit-logs/export")
      .set("Authorization", "Bearer fake-token")
      .query({ maxRows: 100 });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
    expect(res.body.message).toBe("Audit export failed");
  });

  it("returns 401 when not authenticated for admin routes", async () => {
    forceUnauthorized = true;

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app).get("/api/admin/policies/ai");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.message).toBe("Authentication required");
  });

  it("does not grant document access just because a user is org admin", async () => {
    mockAuthUser = {
      id: "user-9",
      name: "Org Admin",
      email: "orgadmin@example.com",
      orgId: "org-1",
      orgRole: "OrgAdmin",
    };

    mockFindFirst.mockResolvedValueOnce({
      id: "doc-999",
      ownerId: "owner-1",
      orgId: "org-1",
      isDeleted: false,
    });

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .get("/api/documents/doc-999")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("No access to this document");
  });

  it("transfers owned documents to the org owner when removing a member", async () => {
    mockFindUnique.mockResolvedValueOnce({
      orgRole: null,
      user: { email: "member@example.com", id: "user-2" },
    });

    mockFindFirst.mockResolvedValueOnce({
      userId: "owner-1",
    });

    mockFindMany.mockResolvedValueOnce([
      { id: "doc-1" },
      { id: "doc-2" },
    ]);

    const { createApp } = await import("../../src/app");
    const app = createApp();

    const res = await request(app)
      .delete("/api/admin/users/user-2")
      .set("Authorization", "Bearer fake-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true, userId: "user-2" });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        ownerId: "user-2",
        isDeleted: false,
      },
      data: {
        ownerId: "owner-1",
      },
    });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockOrgAdminDataChanged).toHaveBeenCalledWith({
      orgId: "org-1",
      reason: "member_removed",
      actorUserId: "user-1",
      targetUserId: "user-2",
    });
  });
});
