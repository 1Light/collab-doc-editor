// apps/api/src/modules/versions/versionController.ts

import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@repo/contracts";

import { getDocumentLinkToken } from "../../lib/documentLinkAccess";
import { permissionService } from "../permissions/permissionService";
import { versionService } from "./versionService";
import { documentService } from "../documents/documentService";

function requireAuthUser(req: Request) {
  if (!req.authUser) {
    throw {
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Authentication required",
    };
  }

  return req.authUser;
}

function requireParam(value: string | undefined, message: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw {
      code: ERROR_CODES.INVALID_REQUEST,
      message,
    };
  }
  return trimmed;
}

export const versionController = {
  /**
   * GET /documents/:id/versions
   * Requires Viewer+ access.
   * Returns latest 20 by default.
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const authUser = requireAuthUser(req);
      const documentId = requireParam(req.params.id, "documentId is required");

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "No access to this document",
        };
      }

      const rawLimit = req.query.limit;
      const parsedLimit =
        typeof rawLimit === "string" && Number.isFinite(Number(rawLimit))
          ? Math.floor(Number(rawLimit))
          : 20;

      const safeLimit = Math.max(1, Math.min(parsedLimit, 100));

      const [doc, versions] = await Promise.all([
        documentService.getDocument(documentId),
        versionService.listVersions(documentId, safeLimit),
      ]);

      return res.status(200).json(
        versions.map((version: any) => ({
          versionId: version.id,
          createdAt: version.createdAt.toISOString(),
          authorId: version.authorId,
          authorName: version.authorName ?? version.author?.name ?? undefined,
          reason: version.reason ?? undefined,
          isCurrent: doc.headVersionId === version.id,
        }))
      );
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /documents/:id/versions/:versionId/revert
   * Requires Editor or Owner.
   */
  async revert(req: Request, res: Response, next: NextFunction) {
    try {
      const authUser = requireAuthUser(req);

      const documentId = requireParam(req.params.id, "documentId is required");
      const targetVersionId = requireParam(req.params.versionId, "versionId is required");

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "No access to this document",
        };
      }

      if (role !== "Editor" && role !== "Owner") {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Insufficient role to revert versions",
        };
      }

      const result = await versionService.revertToVersion({
        documentId,
        targetVersionId,
        userId: authUser.id,
      });

      return res.status(200).json({
        newHeadVersionId: result.newHeadVersionId,
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * DELETE /documents/:id/versions/:versionId
   * Owner only.
   */
  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const authUser = requireAuthUser(req);

      const documentId = requireParam(req.params.id, "documentId is required");
      const versionId = requireParam(req.params.versionId, "versionId is required");

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: authUser.id,
        linkToken: getDocumentLinkToken(req),
      });

      if (!role) {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "No access to this document",
        };
      }

      if (role !== "Owner") {
        throw {
          code: ERROR_CODES.FORBIDDEN,
          message: "Only Owner can remove versions",
        };
      }

      const result = await versionService.deleteVersion({
        documentId,
        versionId,
        userId: authUser.id,
      });

      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  },
};
