// apps/api/src/modules/documents/documentRoutes.ts

import { Router } from "express";

import { documentController } from "./documentController";
import { inviteController } from "../invites/inviteController";
import { versionController } from "../versions/versionController";

import authMiddleware from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/validateRequest";
import { requireDocumentRole } from "../../middleware/docRoleMiddleware";

import {
  createDocumentRequestSchema,
  updateDocumentRequestSchema,
  exportDocumentRequestSchema,
} from "@repo/contracts";

const router = Router();

/**
 * All document routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /documents
 */
router.post(
  "/",
  validateRequest({ body: createDocumentRequestSchema }),
  documentController.create
);

/**
 * GET /documents
 */
router.get("/", documentController.listMine);

/**
 * GET /documents/:id
 */
router.get("/:id", documentController.getById);

/**
 * PUT /documents/:id
 */
router.put(
  "/:id",
  requireDocumentRole(["Editor", "Owner"]),
  validateRequest({ body: updateDocumentRequestSchema }),
  documentController.update
);

/**
 * DELETE /documents/:id
 */
router.delete(
  "/:id",
  requireDocumentRole(["Owner"]),
  documentController.remove
);

/**
 * POST /documents/:id/export
 * Editor+
 */
router.post(
  "/:id/export",
  requireDocumentRole(["Editor", "Owner"]),
  validateRequest({ body: exportDocumentRequestSchema }),
  documentController.export
);

// =========================
// Versioning
// =========================

/**
 * GET /documents/:id/versions
 * Viewer+
 */
router.get(
  "/:id/versions",
  requireDocumentRole(["Viewer", "Commenter", "Editor", "Owner"]),
  versionController.list
);

/**
 * POST /documents/:id/versions/:versionId/revert
 * Editor+
 */
router.post(
  "/:id/versions/:versionId/revert",
  requireDocumentRole(["Editor", "Owner"]),
  versionController.revert
);

/**
 * DELETE /documents/:id/versions/:versionId
 * Owner only
 */
router.delete(
  "/:id/versions/:versionId",
  requireDocumentRole(["Owner"]),
  versionController.remove
);

// =========================
// Sharing / Permissions
// =========================

router.post(
  "/:id/share",
  requireDocumentRole(["Owner"]),
  documentController.share
);

router.get(
  "/:id/permissions",
  requireDocumentRole(["Owner"]),
  documentController.listPermissions
);

router.put(
  "/:id/permissions",
  requireDocumentRole(["Owner"]),
  documentController.updatePermission
);

router.delete(
  "/:id/permissions",
  requireDocumentRole(["Owner"]),
  documentController.deletePermission
);

// =========================
// Document Invites
// =========================

router.post(
  "/:id/invites",
  requireDocumentRole(["Owner"]),
  inviteController.createDocumentInvite
);

router.get(
  "/:id/invites",
  requireDocumentRole(["Owner"]),
  inviteController.listDocumentInvites
);

router.delete(
  "/:id/invites/:inviteId",
  requireDocumentRole(["Owner"]),
  inviteController.revokeDocumentInvite
);

export default router;