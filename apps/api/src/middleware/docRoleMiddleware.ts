// apps/api/src/middleware/docRoleMiddleware.ts

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ERROR_CODES } from "@repo/contracts";
import type { DocumentRole } from "@repo/contracts";
import { getDocumentLinkToken } from "../lib/documentLinkAccess";
import { permissionService } from "../modules/permissions/permissionService";
import { documentRepo } from "../modules/documents/documentRepo";

function getDocumentId(req: Request): string | null {
  const candidates = [
    req.params?.id,
    req.params?.documentId,
    req.body?.documentId,
    req.query?.documentId,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

/**
 * Middleware factory enforcing document-level role access.
 *
 * Notes:
 * - Owner is always allowed through permissionService.
 * - Use this for coarse document access gates.
 * - Fine-grained comment rules should still live in commentService.
 */
export function requireDocumentRole(allowedRoles: DocumentRole[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.authUser) {
        throw { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required" };
      }

      const documentId = getDocumentId(req);
      if (!documentId) {
        throw { code: ERROR_CODES.INVALID_REQUEST, message: "Missing documentId" };
      }

      const document = await documentRepo.findById(documentId);
      if (!document) {
        throw { code: ERROR_CODES.NOT_FOUND, message: "Document not found" };
      }

      const effectiveRole = await permissionService.resolveEffectiveRole({
        documentId,
        userId: req.authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!permissionService.hasRequiredRole(effectiveRole, allowedRoles)) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: effectiveRole ? "Insufficient document role" : "No access to this document",
        };
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
