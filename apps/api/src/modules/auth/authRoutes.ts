// apps/api/src/modules/auth/authRoutes.ts

import { Router } from "express";
import { authController } from "./authController";
import authMiddleware from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/validateRequest";

import {
  loginRequestSchema,
  signupRequestSchema,
  inviteSignupRequestSchema,
  ownerSignupRequestSchema,
  createOrganizationRequestSchema,
} from "@repo/contracts";

const router = Router();

/**
 * POST /auth/login
 */
router.post(
  "/login",
  validateRequest({ body: loginRequestSchema }),
  authController.login
);

/**
 * POST /auth/signup
 * Create standalone user (no organization)
 */
router.post(
  "/signup",
  validateRequest({ body: signupRequestSchema }),
  authController.signup
);

/**
 * POST /auth/signup-owner
 * Create account + organization (OrgOwner)
 */
router.post(
  "/signup-owner",
  validateRequest({ body: ownerSignupRequestSchema }),
  authController.signupOwner
);

/**
 * POST /auth/signup-invite
 * Create account + accept org invite
 */
router.post(
  "/signup-invite",
  validateRequest({ body: inviteSignupRequestSchema }),
  authController.signupInvite
);

/**
 * POST /auth/create-organization
 * Logged-in user creates a new organization and becomes OrgOwner
 */
router.post(
  "/create-organization",
  authMiddleware,
  validateRequest({ body: createOrganizationRequestSchema }),
  authController.createOrganization
);

/**
 * GET /auth/me
 */
router.get(
  "/me",
  authMiddleware,
  authController.me
);

/**
 * DELETE /auth/account
 * Self-delete account
 */
router.delete(
  "/account",
  authMiddleware,
  authController.deleteAccount
);

/**
 * POST /auth/logout
 */
router.post(
  "/logout",
  authMiddleware,
  authController.logout
);

export default router;