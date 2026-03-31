// packages/contracts/src/schemas/adminSchemas.ts
import { z } from "zod";
import { DOCUMENT_ROLES } from "../constants/roles";

/* =========================
   AI Policy Update
========================= */

/**
 * Only Editor and Owner are allowed for AI enablement.
 * Viewer and Commenter must be rejected at validation level.
 */
export const aiEnabledRoleSchema = z.enum(
  DOCUMENT_ROLES.filter((r) => r === "Editor" || r === "Owner") as ["Editor", "Owner"]
);

export const quotaPolicySchema = z
  .object({
    perUserPerDay: z.number().int().positive().optional(),
    perOrgPerDay: z.number().int().positive().optional(),
  })
  .refine((val) => val.perUserPerDay !== undefined || val.perOrgPerDay !== undefined, {
    message: "At least one quota limit must be provided",
  });

export const updateAIPolicyRequestSchema = z.object({
  enabledRoles: z.array(aiEnabledRoleSchema).min(1),
  quotaPolicy: quotaPolicySchema,
});

export type UpdateAIPolicyRequest = z.infer<typeof updateAIPolicyRequestSchema>;

export const updateAIPolicyResponseSchema = z.object({
  updatedAt: z.string(), // ISO date
});

export type UpdateAIPolicyResponse = z.infer<typeof updateAIPolicyResponseSchema>;

/* =========================
   Audit Log Query (Cursor pagination)
========================= */

// lightweight ISO date validation: allow Date.parse-able strings
const isoDateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" });

// actionTypes comes as comma-separated list in query string: "A,B,C"
export const auditLogQuerySchema = z.object({
  documentId: z.string().optional(),
  userId: z.string().optional(),

  // New:
  actionTypes: z.string().optional(), // comma-separated
  q: z.string().min(1).optional(),

  from: isoDateString.optional(),
  to: isoDateString.optional(),

  limit: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 200, { message: "limit must be 1..200" })
    .optional(),

  cursorId: z.string().optional(),
  cursorCreatedAt: isoDateString.optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// Export query: same filters + maxRows
export const auditLogExportQuerySchema = auditLogQuerySchema.extend({
  maxRows: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 50000, { message: "maxRows must be 1..50000" })
    .optional(),
});

export type AuditLogExportQuery = z.infer<typeof auditLogExportQuerySchema>;

/* =========================
   Audit Log Response (Query-first)
========================= */

export const auditLogActorSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
});

export const auditLogDocumentSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
});

export const auditLogItemSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  userId: z.string(),
  actionType: z.string(),
  documentId: z.string().optional(),
  metadata: z.any().optional(),
  createdAt: z.string(), // ISO

  actor: auditLogActorSchema.optional(),
  document: auditLogDocumentSchema.optional(),

  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
});

export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const auditLogListResponseSchema = z.object({
  items: z.array(auditLogItemSchema),
  nextCursor: z
    .object({
      id: z.string(),
      createdAt: z.string(), // ISO
    })
    .nullable(),
  hasMore: z.boolean(),
});

export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;