import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { config } from "../config/env";
import { ERROR_CODES } from "@repo/contracts";
import type { OrgRole } from "@repo/contracts";

type JwtPayload = {
  userId: string;
  name?: string;
  iat?: number;
  exp?: number;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        name: string;
        email: string;

        // org context (nullable: user might not belong to any org yet)
        orgId: string | null;
        orgRole: OrgRole | null;
      };
    }
  }
}

function readOrgIdFromRequest(req: Request): string | null {
  const raw = req.headers["x-org-id"];
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export default async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization ?? (req.headers.Authorization as any);
    if (!authHeader || typeof authHeader !== "string") {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "Missing Authorization header" };
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid Authorization format" };
    }

    const token = parts[1];

    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, config.JWT_SECRET);
      payload = typeof verified === "string" ? JSON.parse(verified) : (verified as JwtPayload);
    } catch {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid or expired token" };
    }

    if (!payload?.userId) {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "Token missing userId" };
    }

    // Load active user only
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "User not found" };
    }

    // Resolve org context
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

    req.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      orgId: membership?.orgId ?? null,
      orgRole: (membership?.orgRole as OrgRole | null) ?? null,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}