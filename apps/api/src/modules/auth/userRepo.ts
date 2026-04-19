import { prisma } from "../../lib/prisma";
import type { OrgRole } from "@repo/contracts";

export const userRepo = {
  async findById(id: string) {
    return prisma.user.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findFirst({
      where: {
        email,
        isDeleted: false,
      },
    });
  },

  async findAnyByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findActiveById(id: string) {
    return prisma.user.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });
  },

  async findAnyById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Create user ONLY.
   * Org membership must be created separately
   * in OrganizationMember.
   */
  async create(data: {
    name: string;
    email: string;
    password: string;
  }) {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: data.password,
      },
    });
  },

  /**
   * List active users by organization
   * via OrganizationMember.
   */
  async listAllByOrg(orgId: string) {
    const members = await prisma.organizationMember.findMany({
      where: {
        orgId,
        user: {
          isDeleted: false,
        },
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return members.map((m) => m.user);
  },

  async findMembershipsByUserId(userId: string) {
    return prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  },

  async findOwnedDocuments(userId: string) {
    return prisma.document.findMany({
      where: {
        ownerId: userId,
        isDeleted: false,
      },
      select: {
        id: true,
        orgId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  async removeMembershipsByUserId(userId: string) {
    return prisma.organizationMember.deleteMany({
      where: { userId },
    });
  },

  async removeDocumentPermissionsByUserId(userId: string) {
    return prisma.documentPermission.deleteMany({
      where: {
        principalType: "user",
        principalId: userId,
      },
    });
  },

  async removePresenceByUserId(userId: string) {
    return prisma.presence.deleteMany({
      where: { userId },
    });
  },

  async revokePendingOrgInvitesByEmail(email: string) {
    return prisma.organizationInvite.updateMany({
      where: {
        email,
        status: "pending",
      },
      data: {
        status: "revoked",
      },
    });
  },

  async revokePendingDocumentInvitesByEmail(email: string) {
    return prisma.documentInvite.updateMany({
      where: {
        email,
        status: "pending",
      },
      data: {
        status: "revoked",
      },
    });
  },

  async updateOrgRole(userId: string, orgId: string, orgRole: OrgRole | null) {
    return prisma.organizationMember.update({
      where: {
        orgId_userId: { orgId, userId },
      },
      data: { orgRole },
    });
  },

  async softDeleteById(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  },
};