// apps/api/src/modules/invites/inviteRoutes.ts

import { Router } from "express";
import authMiddleware from "../../middleware/authMiddleware";
import { inviteController } from "./inviteController";
import { requireDocumentRole } from "../../middleware/docRoleMiddleware";

const router = Router();

/**
 * =========================
 * Organization Invites
 * =========================
 */

/**
 * Preview org invite:
 * GET /invites/preview?token=
 * Public so signup/login screens can show org info before auth.
 */
router.get("/preview", inviteController.preview);

/**
 * Accept org invite:
 * POST /invites/accept-org
 * Requires login so the invite is bound to the authenticated user.
 */
router.post("/accept-org", authMiddleware, inviteController.accept);

/**
 * List org users for invite picker:
 * GET /invites/org-users?q=
 */
router.get("/org-users", authMiddleware, inviteController.listOrgUsers);

/**
 * Invite an org member to a document (direct permission grant):
 * POST /invites/documents/:id
 * Body: { userId: string, message?: string }
 *
 * Owner-only.
 */
router.post(
  "/documents/:id",
  authMiddleware,
  requireDocumentRole(["Owner"]),
  inviteController.inviteToDocument
);

/**
 * =========================
 * Document Email Invites (token-based)
 * =========================
 */

/**
 * Accept document invite via token:
 * POST /invites/accept-document
 * Body: { token: string }
 */
router.post("/accept-document", authMiddleware, inviteController.acceptInvite);

export default router;