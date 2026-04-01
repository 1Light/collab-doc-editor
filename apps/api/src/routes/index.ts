// apps/api/src/routes/index.ts

import { Router } from "express";

import authRoutes from "../modules/auth/authRoutes";
import documentRoutes from "../modules/documents/documentRoutes";
import commentRoutes from "../modules/comments/commentRoutes";
import aiRoutes from "../modules/ai/aiRoutes";
import adminRoutes from "../modules/admin/adminRoutes";
import inviteRoutes from "../modules/invites/inviteRoutes";

const router = Router();

/**
 * Auth routes
 * Mounted at /auth
 */
router.use("/auth", authRoutes);

/**
 * Org invite routes
 * Mounted at /org/invites
 */
router.use("/org/invites", inviteRoutes);

/**
 * Document routes
 * Mounted at /documents
 */
router.use("/documents", documentRoutes);

/**
 * Comment routes
 * Mounted at /documents/:id/comments
 */
router.use("/documents/:id/comments", commentRoutes);

/**
 * AI routes
 * Mounted at /ai
 */
router.use("/ai", aiRoutes);

/**
 * Admin routes
 * Mounted at /admin
 */
router.use("/admin", adminRoutes);
router.use("/invite", inviteRoutes);

export default router;