// apps/api/src/modules/auth/authController.ts

import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { userRepo } from "./userRepo";
import { prisma } from "../../lib/prisma";
import { config } from "../../config/env";
import { auditLogService } from "../audit/auditLogService";
import { realtimeNotifyService } from "../../integrations/realtimeNotifyService";
import { ERROR_CODES } from "@repo/contracts";

type AppOrgRole = "OrgAdmin" | "OrgOwner";

type JwtPayload = {
  userId: string;
  name: string;
  iat?: number;
  exp?: number;
};

type RefreshJwtPayload = {
  userId: string;
  type: "refresh";
  iat?: number;
  exp?: number;
};

const ACCESS_TOKEN_TTL_SECONDS = config.JWT_ACCESS_TTL_MINUTES * 60;
const REFRESH_TOKEN_TTL_SECONDS = config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60;
const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth";

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

function signAccessToken(params: { userId: string; name: string }) {
  return jwt.sign(
    {
      userId: params.userId,
      name: params.name,
    } as JwtPayload,
    config.JWT_SECRET,
    { expiresIn: `${config.JWT_ACCESS_TTL_MINUTES}m` }
  );
}

function signRefreshToken(params: { userId: string }) {
  return jwt.sign(
    {
      userId: params.userId,
      type: "refresh",
    } as RefreshJwtPayload,
    config.JWT_SECRET,
    { expiresIn: `${config.JWT_REFRESH_TTL_DAYS}d` }
  );
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: REFRESH_COOKIE_PATH,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
  });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;

  const parts = raw.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      const value = rest.join("=").trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

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
  const accessToken = signAccessToken({
    userId: params.userId,
    name: params.name,
  });

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: params.userId,
      name: params.name,
      email: params.email,
      orgId: params.orgId,
      orgRole: params.orgRole,
    },
  };
}

async function transferOwnedDocumentsInOrg(params: {
  tx: Pick<typeof prisma, "document" | "documentPermission">;
  orgId: string;
  fromUserId: string;
  toUserId: string;
}) {
  const ownedDocs = await params.tx.document.findMany({
    where: {
      orgId: params.orgId,
      ownerId: params.fromUserId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (ownedDocs.length === 0) {
    return 0;
  }

  await params.tx.document.updateMany({
    where: {
      orgId: params.orgId,
      ownerId: params.fromUserId,
      isDeleted: false,
    },
    data: {
      ownerId: params.toUserId,
    },
  });

  for (const doc of ownedDocs) {
    await params.tx.documentPermission.deleteMany({
      where: {
        documentId: doc.id,
        principalType: "user",
        principalId: params.fromUserId,
      },
    });

    await params.tx.documentPermission.upsert({
      where: {
        documentId_principalType_principalId: {
          documentId: doc.id,
          principalType: "user",
          principalId: params.toUserId,
        },
      },
      create: {
        documentId: doc.id,
        principalType: "user",
        principalId: params.toUserId,
        role: "Owner",
      },
      update: {
        role: "Owner",
      },
    });
  }

  return ownedDocs.length;
}

async function listOrganizationDocumentsForUser(params: {
  orgId: string;
  userId: string;
  take?: number;
}) {
  const docs = await prisma.document.findMany({
    where: {
      orgId: params.orgId,
      isDeleted: false,
      OR: [
        { ownerId: params.userId },
        {
          permissions: {
            some: {
              principalType: "user",
              principalId: params.userId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      ownerId: true,
      permissions: {
        where: {
          principalType: "user",
          principalId: params.userId,
        },
        select: {
          role: true,
        },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: params.take,
  });

  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt.toISOString(),
    role:
      doc.ownerId === params.userId
        ? "Owner"
        : ((doc.permissions[0]?.role as "Viewer" | "Commenter" | "Editor" | "Owner" | undefined) ??
          null),
  }));
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
      setRefreshCookie(
        res,
        signRefreshToken({
          userId: user.id,
        })
      );

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
      setRefreshCookie(
        res,
        signRefreshToken({
          userId: user.id,
        })
      );

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
      setRefreshCookie(
        res,
        signRefreshToken({
          userId: out.user.id,
        })
      );

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

      await realtimeNotifyService.orgAdminDataChanged({
        orgId: invite.orgId,
        reason: "invite_accepted",
        actorUserId: out.user.id,
        targetUserId: out.user.id,
        inviteId: invite.id,
      });

      const response = await buildAuthResponse({
        userId: out.user.id,
        name: out.user.name,
        email: out.user.email,
        orgId: invite.orgId,
        orgRole: normalizeOrgRole(out.membership.orgRole),
      });
      setRefreshCookie(
        res,
        signRefreshToken({
          userId: out.user.id,
        })
      );

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
      setRefreshCookie(
        res,
        signRefreshToken({
          userId: req.authUser.id,
        })
      );

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
   * POST /auth/refresh
   * Uses HttpOnly refresh token cookie to issue a new short-lived access token.
   */
  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
      if (!refreshToken) {
        clearRefreshCookie(res);
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Missing refresh token" };
      }

      let payload: RefreshJwtPayload;
      try {
        const verified = jwt.verify(refreshToken, config.JWT_SECRET);
        payload =
          typeof verified === "string"
            ? (JSON.parse(verified) as RefreshJwtPayload)
            : (verified as RefreshJwtPayload);
      } catch {
        clearRefreshCookie(res);
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid or expired refresh token" };
      }

      if (!payload?.userId || payload.type !== "refresh") {
        clearRefreshCookie(res);
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid refresh token payload" };
      }

      const user = await userRepo.findAnyById(payload.userId);
      if (!user || user.isDeleted) {
        clearRefreshCookie(res);
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "User not found" };
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

      const response = await buildAuthResponse({
        userId: user.id,
        name: user.name,
        email: user.email,
        orgId: membership?.orgId ?? null,
        orgRole: normalizeOrgRole(membership?.orgRole),
      });

      setRefreshCookie(
        res,
        signRefreshToken({
          userId: user.id,
        })
      );

      return res.json(response);
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

  async listOrganizations(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const userId = req.authUser.id;

      const memberships = await prisma.organizationMember.findMany({
        where: { userId },
        orderBy: [{ createdAt: "asc" }],
        include: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const items = await Promise.all(
        memberships.map(async (membership) => {
          const documentCount = await prisma.document.count({
            where: {
              orgId: membership.orgId,
              isDeleted: false,
              OR: [
                { ownerId: userId },
                {
                  permissions: {
                    some: {
                      principalType: "user",
                      principalId: userId,
                    },
                  },
                },
              ],
            },
          });

          const recentDocuments = await listOrganizationDocumentsForUser({
            orgId: membership.orgId,
            userId,
            take: 5,
          });

          return {
            orgId: membership.org.id,
            orgName: membership.org.name,
            orgRole: normalizeOrgRole(membership.orgRole),
            joinedAt: membership.createdAt.toISOString(),
            documentCount,
            recentDocuments,
          };
        })
      );

      return res.json({
        activeOrgId: req.authUser.orgId,
        organizations: items,
      });
    } catch (err) {
      return next(err);
    }
  },

  async switchOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = String(req.body?.orgId ?? "").trim();
      if (!orgId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "orgId is required" };
      }

      const membership = await prisma.organizationMember.findUnique({
        where: {
          orgId_userId: {
            orgId,
            userId: req.authUser.id,
          },
        },
        include: {
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!membership) {
        throw { code: ERROR_CODES.FORBIDDEN, message: "You are not a member of that organization" };
      }

      return res.json({
        id: req.authUser.id,
        name: req.authUser.name,
        email: req.authUser.email,
        orgId: membership.org.id,
        orgName: membership.org.name,
        orgRole: normalizeOrgRole(membership.orgRole),
      });
    } catch (err) {
      return next(err);
    }
  },

  async leaveOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const orgId = String(req.params.orgId ?? "").trim();
      if (!orgId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "orgId is required" };
      }

      const membership = await prisma.organizationMember.findUnique({
        where: {
          orgId_userId: {
            orgId,
            userId: req.authUser.id,
          },
        },
        select: {
          orgRole: true,
          org: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!membership) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "You are not a member of this organization" };
      }

      if (membership.orgRole === "OrgOwner") {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Organization owners cannot leave their organization",
        };
      }

      const ownerMembership = await prisma.organizationMember.findFirst({
        where: {
          orgId,
          orgRole: "OrgOwner",
        },
        select: { userId: true },
      });

      if (!ownerMembership?.userId) {
        throw {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Organization owner is required before leaving the organization",
        };
      }

      const successorOwnerId = ownerMembership.userId;

      const transferredDocumentCount = await prisma.$transaction(async (tx) => {
        const transferred = await transferOwnedDocumentsInOrg({
          tx,
          orgId,
          fromUserId: req.authUser!.id,
          toUserId: successorOwnerId,
        });

        await tx.organizationMember.delete({
          where: {
            orgId_userId: {
              orgId,
              userId: req.authUser!.id,
            },
          },
        });

        await tx.documentPermission.deleteMany({
          where: {
            principalType: "user",
            principalId: req.authUser!.id,
            document: { orgId },
          },
        });

        await tx.presence.deleteMany({
          where: {
            userId: req.authUser!.id,
            document: { orgId },
          },
        });

        return transferred;
      });

      await auditLogService.logAction({
        userId: req.authUser.id,
        orgId,
        actionType: "ORG_MEMBER_REMOVED",
        metadata: {
          targetUserId: req.authUser.id,
          targetEmail: req.authUser.email,
          targetRole: membership.orgRole ?? null,
          selfInitiated: true,
          successorOwnerId,
          transferredDocumentCount,
        },
      });

      await realtimeNotifyService.orgAdminDataChanged({
        orgId,
        reason: "member_removed",
        actorUserId: req.authUser.id,
        targetUserId: req.authUser.id,
      });

      const remainingMemberships = await prisma.organizationMember.findMany({
        where: { userId: req.authUser.id },
        orderBy: { createdAt: "asc" },
        select: {
          orgId: true,
          orgRole: true,
        },
      });

      const nextMembership = remainingMemberships[0] ?? null;

      return res.json({
        left: true,
        orgId,
        orgName: membership.org.name,
        nextOrgId: nextMembership?.orgId ?? null,
        nextOrgRole: normalizeOrgRole(nextMembership?.orgRole ?? null),
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
      const successorOwnerEntries = await Promise.all(
        orgIdsForAudit.map(async (orgId) => {
          const ownerMembership = await prisma.organizationMember.findFirst({
            where: {
              orgId,
              orgRole: "OrgOwner",
            },
            select: { userId: true },
          });

          if (!ownerMembership?.userId) {
            throw {
              code: ERROR_CODES.INTERNAL_ERROR,
              message: "Organization owner is required before deleting this account",
            };
          }

          return [orgId, ownerMembership.userId] as const;
        })
      );

      const successorOwnerMap = new Map(successorOwnerEntries);
      const transferredCountsByOrg = new Map<string, number>();

      await prisma.$transaction(async (tx) => {
        for (const orgId of orgIdsForAudit) {
          const successorOwnerId = successorOwnerMap.get(orgId);
          if (!successorOwnerId) continue;

          const transferred = await transferOwnedDocumentsInOrg({
            tx,
            orgId,
            fromUserId: user.id,
            toUserId: successorOwnerId,
          });

          transferredCountsByOrg.set(orgId, transferred);
        }

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
              successorOwnerId: successorOwnerMap.get(orgId) ?? null,
              transferredDocumentCount: transferredCountsByOrg.get(orgId) ?? 0,
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
    clearRefreshCookie(res);
    return res.json({ success: true });
  },
};
