import { z } from "zod";
import { ORG_ROLES } from "../constants/roles";

/* =========================
   Shared role schema
========================= */

const orgRoleSchema = z.enum(ORG_ROLES);

/* =========================
   Login
========================= */

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    orgId: z.string().nullable(),
    orgRole: orgRoleSchema.nullable(),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/* =========================
   Me
========================= */

export const meResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  orgId: z.string().nullable(),
  orgRole: orgRoleSchema.nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/* =========================
   Member Signup (no org)
========================= */

export const signupRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const signupResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    orgId: z.null(),
    orgRole: z.null(),
  }),
});

export type SignupResponse = z.infer<typeof signupResponseSchema>;

/* =========================
   Invited Member Signup
========================= */

export const inviteSignupRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6),
  token: z.string().min(10),
});

export type InviteSignupRequest = z.infer<typeof inviteSignupRequestSchema>;

export const inviteSignupResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    orgId: z.string(),
    orgRole: orgRoleSchema.nullable(),
  }),
});

export type InviteSignupResponse = z.infer<typeof inviteSignupResponseSchema>;

/* =========================
   Owner Signup
========================= */

export const ownerSignupRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().min(2).max(200),
});

export type OwnerSignupRequest = z.infer<typeof ownerSignupRequestSchema>;

export const ownerSignupResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    orgId: z.string(),
    orgRole: orgRoleSchema,
  }),
});

export type OwnerSignupResponse = z.infer<typeof ownerSignupResponseSchema>;

/* =========================
   Create Organization
   (existing user creates new org)
========================= */

export const createOrganizationRequestSchema = z.object({
  organizationName: z.string().min(2).max(200),
});

export type CreateOrganizationRequest = z.infer<
  typeof createOrganizationRequestSchema
>;