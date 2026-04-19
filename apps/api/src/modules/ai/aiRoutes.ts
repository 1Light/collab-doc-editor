// apps/api/src/modules/ai/aiRoutes.ts

import { Router } from "express";

import { aiJobController } from "./aiJobController";
import authMiddleware from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/validateRequest";

import {
  createAIJobRequestSchema,
  applyAIJobRequestSchema,
} from "@repo/contracts";

const router = Router();

/**
 * All AI routes require authentication
 */
router.use(authMiddleware);

/**
 * POST /ai/jobs
 */
router.post(
  "/jobs",
  validateRequest({ body: createAIJobRequestSchema }),
  aiJobController.create
);

/**
 * POST /ai/jobs/stream
 */
router.post(
  "/jobs/stream",
  validateRequest({ body: createAIJobRequestSchema }),
  aiJobController.stream
);

/**
 * GET /ai/jobs/:jobId
 */
router.get(
  "/jobs/:jobId",
  aiJobController.get
);

/**
 * GET /ai/history/:documentId
 */
router.get(
  "/history/:documentId",
  aiJobController.history
);

/**
 * POST /ai/jobs/:jobId/apply
 */
router.post(
  "/jobs/:jobId/apply",
  validateRequest({ body: applyAIJobRequestSchema }),
  aiJobController.apply
);

router.post(
  "/jobs/:jobId/reject",
  aiJobController.reject
);

export default router;
