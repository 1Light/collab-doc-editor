// apps/api/src/modules/comments/commentRoutes.ts
import { Router } from "express";

import { commentController } from "./commentController";
import authMiddleware from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/validateRequest";

import {
  createCommentRequestSchema,
  updateCommentRequestSchema,
} from "@repo/contracts";

// mergeParams is required so req.params.id from /documents/:id/comments is available here
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post(
  "/",
  validateRequest({ body: createCommentRequestSchema }),
  commentController.create
);

router.get("/", commentController.list);

router.put(
  "/:commentId",
  validateRequest({ body: updateCommentRequestSchema }),
  commentController.update
);

router.post("/:commentId/resolve", commentController.resolve);

router.delete("/:commentId", commentController.remove);

export default router;