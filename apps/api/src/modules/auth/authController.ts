// apps/api/src/modules/auth/authController.ts

import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { userRepo } from "./userRepo";
import { prisma } from "../../lib/prisma";
import { config } from "../../config/env";
import { auditLogService } from "../audit/auditLogService";
import { ERROR_CODES } from "@repo/contracts";

type AppOrgRole = "OrgAdmin" | "OrgOwner";

type JwtPayload = {
  userId: string;
  name: string;
  iat?: number;
  exp?: number;
};

function readOrgIdFromRequest(req: Request): string | null {
  const raw = req.headers["x-org-id"];
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function normalizeEmail(email: string | undefined | null) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeOrgRole(role: unknown): AppOrgRole | null {
  if (role === "OrgAdmin" || role === "OrgOwner") return role;
  return null;
}

function makeDeletedEmail(userId: string, email: string) {
  const normalized = normalizeEmail(email);
  const localPart = normalized.includes("@") ? normalized.split("@")[0] : "user";
  const safeLocalPart = localPart.replace(/[^a-zA-Z0-9._+-]/g, "").slice(0, 32) || "user";
  return `deleted+${safeLocalPart}+${userId}+${Date.now()}@deleted.local`;
}

function makeDeletedPassword() {
  return crypto.randomBytes(32).toString("hex");
}

async function buildAuthResponse(params: {
  userId: string;
  name: string;
  email: string;
  orgId: string | null;
  orgRole: AppOrgRole | null;
}) {
  const accessToken = jwt.sign(
    {
      userId: params.userId,
      name: params.name,
    } as JwtPayload,
    config.JWT_SECRET,
    { expiresIn: "1h" }
  );

  return {
    accessToken,
    expiresIn: 3600,
    user: {
      id: params.userId,
      name: params.name,
      email: params.email,
      orgId: params.orgId,
      orgRole: params.orgRole,
    },
  };
}

export const authController = {
  /**
   * POST /auth/login
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail || !password) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid email or password" };
      }

      const user = await userRepo.findByEmail(normalizedEmail);
      if (!user || user.isDeleted) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid email or password" };
      }

      const requestedOrgId = readOrgIdFromRequest(req);

      const membership = requestedOrgId
        ? await prisma.organizationMember.findUnique({
            where: { orgId_userId: { orgId: requestedOrgId, userId: user.id } },
            select: { orgId: true, orgRole: true },
          })
        : await prisma.organizationMember.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { orgId: true, orgRole: true },
          });

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await auditLogService.logAction({
          userId: user.id,
          orgId: membership?.orgId ?? requestedOrgId ?? null,
          actionType: "LOGIN_FAILED",
          metadata: {
            email: normalizedEmail,
            reason: "invalid_password",
          },
        });

        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid email or password" };
      }

      const response = await buildAuthResponse({
        userId: user.id,
        name: user.name,
        email: user.email,
        orgId: membership?.orgId ?? null,
        orgRole: normalizeOrgRole(membership?.orgRole),
      });

      await auditLogService.logAction({
        userId: user.id,
        orgId: membership?.orgId ?? requestedOrgId ?? null,
        actionType: "LOGIN_SUCCESS",
        metadata: {
          email: normalizedEmail,
          orgRole: membership?.orgRole ?? null,
        },
      });

      return res.json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /auth/signup
   * Create standalone user without organization membership
   */
  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password } = req.body as {
        name?: string;
        email?: string;
        password?: string;
      };

      const cleanName = typeof name === "string" ? name.trim() : "";
      const normalizedEmail = normalizeEmail(email);

      if (!cleanName || !normalizedEmail || !password) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "name, email, and password are required",
        };
      }

      const existingUser = await userRepo.findAnyByEmail(normalizedEmail);
      if (existingUser && !existingUser.isDeleted) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "An account with this email already exists",
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.$transaction(async (tx) => {
        if (existingUser && existingUser.isDeleted) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: makeDeletedEmail(existingUser.id, existingUser.email),
              password: makeDeletedPassword(),
            },
          });
        }

        return tx.user.create({
          data: {
            name: cleanName,
            email: normalizedEmail,
            password: passwordHash,
          },
        });
      });

      await auditLogService.logAction({
        userId: user.id,
        orgId: null,
        actionType: "SIGNUP_SUCCESS",
        metadata: {
          email: normalizedEmail,
          signupType: "standalone",
        },
      });

      const response = await buildAuthResponse({
        userId: user.id,
        name: user.name,
        email: user.email,
        orgId: null,
        orgRole: null,
      });

      return res.status(201).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /auth/signup-owner
   * Create user + organization + OrgOwner membership
   */
  async signupOwner(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, organizationName } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        organizationName?: string;
      };

      const cleanName = typeof name === "string" ? name.trim() : "";
      const cleanOrgName = typeof organizationName === "string" ? organizationName.trim() : "";
      const normalizedEmail = normalizeEmail(email);

      if (!cleanName || !normalizedEmail || !password || !cleanOrgName) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "name, email, password, and organizationName are required",
        };
      }

      const existingUser = await userRepo.findAnyByEmail(normalizedEmail);
      if (existingUser && !existingUser.isDeleted) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "An account with this email already exists",
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const out = await prisma.$transaction(async (tx) => {
        if (existingUser && existingUser.isDeleted) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: makeDeletedEmail(existingUser.id, existingUser.email),
              password: makeDeletedPassword(),
            },
          });
        }

        const user = await tx.user.create({
          data: {
            name: cleanName,
            email: normalizedEmail,
            password: passwordHash,
          },
        });

        const org = await tx.organization.create({
          data: {
            name: cleanOrgName,
          },
        });

        const membership = await tx.organizationMember.create({
          data: {
            orgId: org.id,
            userId: user.id,
            orgRole: "OrgOwner",
          },
        });

        return { user, org, membership };
      });

      await auditLogService.logAction({
        userId: out.user.id,
        orgId: out.org.id,
        actionType: "SIGNUP_OWNER_SUCCESS",
        metadata: {
          email: normalizedEmail,
          organizationName: out.org.name,
          orgRole: "OrgOwner",
        },
      });

      const response = await buildAuthResponse({
        userId: out.user.id,
        name: out.user.name,
        email: out.user.email,
        orgId: out.org.id,
        orgRole: "OrgOwner",
      });

      return res.status(201).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /auth/signup-invite
   * Create user + accept pending org invite
   */
  async signupInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password, token } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        token?: string;
      };

      const cleanName = typeof name === "string" ? name.trim() : "";
      const normalizedEmail = normalizeEmail(email);
      const cleanToken = typeof token === "string" ? token.trim() : "";

      if (!cleanName || !normalizedEmail || !password || !cleanToken) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "name, email, password, and token are required",
        };
      }

      const existingUser = await userRepo.findAnyByEmail(normalizedEmail);
      if (existingUser && !existingUser.isDeleted) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "An account with this email already exists. Please sign in to accept the invite.",
        };
      }

      const tokenHash = sha256(cleanToken);

      const invite = await prisma.organizationInvite.findUnique({
        where: { tokenHash },
        include: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invite || invite.status !== "pending") {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Invalid invite" };
      }

      if (invite.expiresAt < new Date()) {
        await prisma.organizationInvite.update({
          where: { id: invite.id },
          data: { status: "expired" },
        });

        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Invite expired" };
      }

      if (normalizeEmail(invite.email) !== normalizedEmail) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Invite email mismatch",
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const out = await prisma.$transaction(async (tx) => {
        if (existingUser && existingUser.isDeleted) {
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: makeDeletedEmail(existingUser.id, existingUser.email),
              password: makeDeletedPassword(),
            },
          });
        }

        const user = await tx.user.create({
          data: {
            name: cleanName,
            email: normalizedEmail,
            password: passwordHash,
          },
        });

        const membership = await tx.organizationMember.upsert({
          where: {
            orgId_userId: {
              orgId: invite.orgId,
              userId: user.id,
            },
          },
          update: {
            orgRole: invite.orgRole ?? null,
          },
          create: {
            orgId: invite.orgId,
            userId: user.id,
            orgRole: invite.orgRole ?? null,
          },
        });

        await tx.organizationInvite.update({
          where: { id: invite.id },
          data: {
            status: "accepted",
            acceptedAt: new Date(),
          },
        });

        return { user, membership };
      });

      await auditLogService.logAction({
        userId: out.user.id,
        orgId: invite.orgId,
        actionType: "ORG_INVITE_SIGNUP_SUCCESS",
        metadata: {
          inviteId: invite.id,
          email: normalizedEmail,
          orgRole: invite.orgRole ?? null,
          orgName: invite.org.name,
        },
      });

      const response = await buildAuthResponse({
        userId: out.user.id,
        name: out.user.name,
        email: out.user.email,
        orgId: invite.orgId,
        orgRole: normalizeOrgRole(out.membership.orgRole),
      });

      return res.status(201).json(response);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /auth/create-organization
   * Logged-in user creates a new organization and becomes OrgOwner there.
   */
  async createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const { organizationName } = req.body as {
        organizationName?: string;
      };

      const cleanOrgName = typeof organizationName === "string" ? organizationName.trim() : "";

      if (!cleanOrgName || cleanOrgName.length < 2) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "organizationName must be at least 2 characters",
        };
      }

      const existingSameNameOwned = await prisma.organizationMember.findFirst({
        where: {
          userId: req.authUser.id,
          orgRole: "OrgOwner",
          org: {
            name: {
              equals: cleanOrgName,
              mode: "insensitive",
            },
          },
        },
        select: {
          orgId: true,
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (existingSameNameOwned) {
        throw {
          code: ERROR_CODES.INVALID_REQUEST,
          message: "You already own an organization with this name",
        };
      }

      const out = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: cleanOrgName,
          },
        });

        const membership = await tx.organizationMember.create({
          data: {
            orgId: org.id,
            userId: req.authUser!.id,
            orgRole: "OrgOwner",
          },
        });

        return { org, membership };
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId: out.org.id,
        actionType: "ORGANIZATION_CREATED",
        metadata: {
          organizationName: out.org.name,
          orgRole: "OrgOwner",
          createdVia: "authenticated_user",
        },
      });

      const response = await buildAuthResponse({
        userId: req.authUser.id,
        name: req.authUser.name,
        email: req.authUser.email,
        orgId: out.org.id,
        orgRole: "OrgOwner",
      });

      return res.status(201).json({
        ...response,
        organization: {
          id: out.org.id,
          name: out.org.name,
        },
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /auth/me
   */
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      return res.json({
        id: req.authUser.id,
        name: req.authUser.name,
        email: req.authUser.email,
        orgId: req.authUser.orgId,
        orgRole: normalizeOrgRole(req.authUser.orgRole),
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /auth/account
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const user = await userRepo.findAnyById(req.authUser.id);
      if (!user || user.isDeleted) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "User not found" };
      }

      const memberships = await prisma.organizationMember.findMany({
        where: { userId: user.id },
        select: {
          orgId: true,
          orgRole: true,
        },
      });

      const isOrgOwner = memberships.some((m) => m.orgRole === "OrgOwner");
      if (isOrgOwner) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Organization owners cannot delete their account.",
        };
      }

      const ownedDocumentCount = await prisma.document.count({
        where: {
          ownerId: user.id,
          isDeleted: false,
        },
      });

      const membershipCount = memberships.length;
      const orgIdsForAudit = [...new Set(memberships.map((m) => m.orgId).filter(Boolean))];
      const deletedEmail = makeDeletedEmail(user.id, user.email);
      const deletedPasswordHash = await bcrypt.hash(makeDeletedPassword(), 10);

      await prisma.$transaction(async (tx) => {
        await tx.organizationMember.deleteMany({
          where: { userId: user.id },
        });

        await tx.documentPermission.deleteMany({
          where: {
            principalType: "user",
            principalId: user.id,
          },
        });

        await tx.presence.deleteMany({
          where: { userId: user.id },
        });

        await tx.organizationInvite.updateMany({
          where: {
            email: user.email,
            status: "pending",
          },
          data: {
            status: "revoked",
          },
        });

        await tx.documentInvite.updateMany({
          where: {
            email: user.email,
            status: "pending",
          },
          data: {
            status: "revoked",
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            email: deletedEmail,
            password: deletedPasswordHash,
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
      });

      await Promise.all(
        orgIdsForAudit.map((orgId) =>
          auditLogService.logAction({
            userId: user.id,
            orgId,
            actionType: "ACCOUNT_SELF_DELETED",
            metadata: {
              email: user.email,
              deletedEmail,
              name: user.name,
              ownedDocumentCount,
              membershipCount,
            },
          })
        )
      );

      return res.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /auth/logout
   */
  async logout(_req: Request, res: Response) {
    return res.json({ success: true });
  },
};