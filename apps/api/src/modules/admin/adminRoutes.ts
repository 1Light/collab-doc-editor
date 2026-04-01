// apps/api/src/routes/adminRoutes.ts
import { Router } from "express";
import { adminController } from "./adminController";
import authMiddleware from "../../middleware/authMiddleware";
import orgAdminMiddleware from "../../middleware/orgAdminMiddleware";
import { validateRequest } from "../../middleware/validateRequest";

import {
  updateAIPolicyRequestSchema,
  auditLogQuerySchema,
  auditLogExportQuerySchema,
} from "@repo/contracts";

const router = Router();

/**
 * All admin routes require:
 * - Authentication
 * - orgRole = OrgAdmin / OrgOwner equivalent access via middleware
 */
router.use(authMiddleware, orgAdminMiddleware);

/**
 * GET /admin/policies/ai
 */
router.get("/policies/ai", adminController.getAIPolicy);

/**
 * PUT /admin/policies/ai
 */
router.put(
  "/policies/ai",
  validateRequest({ body: updateAIPolicyRequestSchema }),
  adminController.updateAIPolicy
);

/**
 * GET /admin/audit-logs
 */
router.get(
  "/audit-logs",
  validateRequest({ query: auditLogQuerySchema }),
  adminController.listAuditLogs
);

/**
 * DELETE /admin/audit-logs/:logId
 */
router.delete("/audit-logs/:logId", adminController.deleteAuditLog);

/**
 * GET /admin/audit-logs/export
 */
router.get(
  "/audit-logs/export",
  validateRequest({ query: auditLogExportQuerySchema ?? auditLogQuerySchema }),
  adminController.exportAuditLogs
);

/**
 * GET /admin/users
 */
router.get("/users", adminController.listUsers);

/**
 * PUT /admin/users/:userId/org-role
 */
router.put("/users/:userId/org-role", adminController.setUserOrgRole);

/**
 * DELETE /admin/users/:userId
 */
router.delete("/users/:userId", adminController.removeUserFromOrg);

/**
 * GET /admin/org-invites
 */
router.get("/org-invites", adminController.listOrgInvites);

/**
 * POST /admin/org-invites
 * Body: { email: string, orgRole?: "Member" | "OrgAdmin" }
 */
router.post("/org-invites", adminController.createOrgInvite);

/**
 * POST /admin/org-invites/:inviteId/resend
 */
router.post("/org-invites/:inviteId/resend", adminController.resendOrgInvite);

/**
 * DELETE /admin/org-invites/:inviteId
 */
router.delete("/org-invites/:inviteId", adminController.revokeOrgInvite);

export default router;