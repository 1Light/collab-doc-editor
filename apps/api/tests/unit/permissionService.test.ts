import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindDocumentById = vi.fn();
const mockFindUserById = vi.fn();
const mockFindOrgMembership = vi.fn();
const mockFindByUser = vi.fn();
const mockFindByLink = vi.fn();

vi.mock("../../src/modules/documents/documentRepo", () => ({
  documentRepo: {
    findById: mockFindDocumentById,
  },
}));

vi.mock("../../src/modules/auth/userRepo", () => ({
  userRepo: {
    findById: mockFindUserById,
  },
}));

vi.mock("../../src/modules/permissions/permissionRepo", () => ({
  permissionRepo: {
    findByUser: mockFindByUser,
    findByLink: mockFindByLink,
  },
}));

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    organizationMember: {
      findUnique: mockFindOrgMembership,
    },
  },
}));

describe("permissionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when document does not exist", async () => {
    mockFindDocumentById.mockResolvedValue(null);

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("returns null when user does not exist", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "owner-1",
    });
    mockFindUserById.mockResolvedValue(null);

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("returns null when user is not in the same org", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "owner-1",
    });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    mockFindOrgMembership.mockResolvedValue(null);

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("returns Owner when user is the document owner", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "user-1",
    });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
    });
    mockFindOrgMembership.mockResolvedValue({ id: "membership-1" });

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
    });

    expect(result).toBe("Owner");
  });

  it("returns explicit user permission when present", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "owner-1",
    });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    mockFindOrgMembership.mockResolvedValue({ id: "membership-1" });
    mockFindByUser.mockResolvedValue({ role: "Editor" });

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
    });

    expect(result).toBe("Editor");
  });

  it("returns link-based permission when explicit user permission is absent", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "owner-1",
    });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    mockFindOrgMembership.mockResolvedValue({ id: "membership-1" });
    mockFindByUser.mockResolvedValue(null);
    mockFindByLink.mockResolvedValue({ role: "Viewer" });

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: "link-123",
    });

    expect(result).toBe("Viewer");
  });

  it("returns null when no matching permission exists", async () => {
    mockFindDocumentById.mockResolvedValue({
      id: "doc-1",
      orgId: "org-1",
      ownerId: "owner-1",
    });
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    mockFindOrgMembership.mockResolvedValue({ id: "membership-1" });
    mockFindByUser.mockResolvedValue(null);
    mockFindByLink.mockResolvedValue(null);

    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    const result = await permissionService.resolveEffectiveRole({
      documentId: "doc-1",
      userId: "user-1",
      linkToken: "link-123",
    });

    expect(result).toBeNull();
  });

  it("hasRequiredRole returns true only for allowed roles", async () => {
    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    expect(permissionService.hasRequiredRole("Editor", ["Editor", "Owner"])).toBe(true);
    expect(permissionService.hasRequiredRole("Viewer", ["Editor", "Owner"])).toBe(false);
    expect(permissionService.hasRequiredRole(null, ["Editor", "Owner"])).toBe(false);
  });

  it("hasAtLeastRole compares role hierarchy correctly", async () => {
    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    expect(permissionService.hasAtLeastRole("Owner", "Editor")).toBe(true);
    expect(permissionService.hasAtLeastRole("Editor", "Commenter")).toBe(true);
    expect(permissionService.hasAtLeastRole("Viewer", "Editor")).toBe(false);
    expect(permissionService.hasAtLeastRole(null, "Viewer")).toBe(false);
  });

  it("helper role checks behave correctly", async () => {
    const { permissionService } = await import("../../src/modules/permissions/permissionService");

    expect(permissionService.isViewerOrAbove("Viewer")).toBe(true);
    expect(permissionService.isCommenterOrAbove("Viewer")).toBe(false);
    expect(permissionService.isEditorOrOwner("Editor")).toBe(true);
    expect(permissionService.isEditorOrOwner("Commenter")).toBe(false);
    expect(permissionService.isOwner("Owner")).toBe(true);
    expect(permissionService.isOwner("Editor")).toBe(false);
  });
});