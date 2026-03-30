// packages/contracts/src/schemas/documentSchemas.ts

import { z } from "zod";

/* =========================
   Shared enums / helpers
========================= */

export const documentRoleSchema = z.enum([
  "Viewer",
  "Commenter",
  "Editor",
  "Owner",
]);

export type DocumentRole = z.infer<typeof documentRoleSchema>;

/* =========================
   Create Document
========================= */

export const createDocumentRequestSchema = z.object({
  title: z.string().min(1).max(255),
});

export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const createDocumentResponseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  ownerId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateDocumentResponse = z.infer<typeof createDocumentResponseSchema>;

/* =========================
   List Documents
========================= */

export const documentListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  ownerId: z.string().min(1),
  updatedAt: z.string(),
  role: documentRoleSchema.nullable(),
});

export type DocumentListItem = z.infer<typeof documentListItemSchema>;

export const listDocumentsResponseSchema = z.array(documentListItemSchema);

export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;

/* =========================
   Get Document
========================= */

export const getDocumentResponseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  content: z.string(),
  versionHeadId: z.string().nullable(),
  updatedAt: z.string(),
  role: documentRoleSchema,
});

export type GetDocumentResponse = z.infer<typeof getDocumentResponseSchema>;

/* =========================
   Update Document
========================= */

export const updateDocumentRequestSchema = z.object({
  content: z.string(),
});

export type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;

export const updateDocumentResponseSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.string(),
  versionHeadId: z.string().min(1),
});

export type UpdateDocumentResponse = z.infer<typeof updateDocumentResponseSchema>;

/* =========================
   Delete Document
========================= */

export const deleteDocumentResponseSchema = z.object({
  deleted: z.boolean(),
});

export type DeleteDocumentResponse = z.infer<typeof deleteDocumentResponseSchema>;

/* =========================
   Export Document
========================= */

export const exportDocumentRequestSchema = z.object({
  format: z.enum(["pdf", "docx"]),
});

export type ExportDocumentRequest = z.infer<typeof exportDocumentRequestSchema>;

export const exportDocumentResponseSchema = z.object({
  downloadUrl: z.string(),
  format: z.enum(["pdf", "docx"]),
  filename: z.string(),
});

export type ExportDocumentResponse = z.infer<typeof exportDocumentResponseSchema>;