// apps/api/src/middleware/orgAdminMiddleware.ts

import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@repo/contracts";

/**
 * Requires authMiddleware to have already run.
 * Enforces OrgAdmin or OrgOwner for the current org context.
 */
export default function orgAdminMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
    }

    if (!req.authUser.orgId) {
      throw { code: ERROR_CODES.FORBIDDEN, message: "No organization context" };
    }

    const role = req.authUser.orgRole;
    if (role !== "OrgAdmin" && role !== "OrgOwner") {
      throw { code: ERROR_CODES.FORBIDDEN, message: "Admin privileges required" };
    }

    return next();
  } catch (err) {
    return next(err);
  }
}