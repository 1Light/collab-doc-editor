// apps/ai-service/src/modules/jobs/jobRoutes.ts

import { Router } from "express";
import { jobController } from "./jobController";

const router = Router();

/**
 * POST /jobs/run
 * Body: { jobId, operation, selectedText, parameters? }
 */
router.post("/run", jobController.run);
router.post("/stream", jobController.stream);

export default router;
