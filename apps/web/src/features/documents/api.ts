// apps/web/src/features/documents/documents.ts

import { http } from "../../lib/http";

export type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner";
export type DocumentExportFormat = "pdf" | "docx";

export type DocumentSummary = {
  id: string;
  title: string;
  ownerId: string;
  updatedAt: string;
  role: DocumentRole | null;
};

export type DocumentDetail = {
  id: string;
  title: string;
  content: string;
  versionHeadId: string | null;
  updatedAt: string;
  role: DocumentRole;
};

/**
 * GET /documents
 */
export async function listDocuments() {
  return http<DocumentSummary[]>("/documents");
}

/**
 * POST /documents
 */
export async function createDocument(title: string) {
  return http<{
    id: string;
    title: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
  }>("/documents", {
    method: "POST",
    body: { title },
  });
}

/**
 * GET /documents/:id
 */
export async function getDocument(id: string) {
  return http<DocumentDetail>(`/documents/${id}`);
}

/**
 * Lightweight role refresh helper.
 */
export async function getMyRole(id: string) {
  const doc = await getDocument(id);
  return doc.role;
}

/**
 * PUT /documents/:id
 */
export async function updateDocument(id: string, content: string) {
  return http<{
    id: string;
    updatedAt: string;
    versionHeadId: string;
  }>(`/documents/${id}`, {
    method: "PUT",
    body: { content },
  });
}

/**
 * DELETE /documents/:id
 */
export async function deleteDocument(id: string) {
  return http<{ deleted: boolean }>(`/documents/${id}`, {
    method: "DELETE",
  });
}

/**
 * POST /documents/:id/export
 */
export async function exportDocument(id: string, format: DocumentExportFormat) {
  return http<{
    downloadUrl: string;
    format: DocumentExportFormat;
    filename: string;
  }>(`/documents/${id}/export`, {
    method: "POST",
    body: { format },
  });
}