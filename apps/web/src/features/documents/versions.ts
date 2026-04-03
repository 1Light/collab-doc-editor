// apps/web/src/features/documents/versions.ts

import { http } from "../../lib/http";

export type VersionReason =
  | "checkpoint"
  | "manual_save"
  | "revert"
  | "ai_apply"
  | string;

export type VersionSummary = {
  versionId: string;
  createdAt: string;
  authorId: string;
  authorName?: string;
  reason?: VersionReason;
  isCurrent?: boolean;
};

export type ListVersionsResponse = VersionSummary[];

export type RevertVersionResponse = {
  newHeadVersionId: string;
};

export type DeleteVersionResponse = {
  deleted: boolean;
};

export async function listVersions(
  documentId: string,
  limit = 20
): Promise<ListVersionsResponse> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return http<ListVersionsResponse>(
    `/documents/${documentId}/versions?limit=${encodeURIComponent(String(safeLimit))}`
  );
}

export async function revertVersion(
  documentId: string,
  versionId: string
): Promise<RevertVersionResponse> {
  return http<RevertVersionResponse>(`/documents/${documentId}/versions/${versionId}/revert`, {
    method: "POST",
  });
}

export async function deleteVersion(
  documentId: string,
  versionId: string
): Promise<DeleteVersionResponse> {
  return http<DeleteVersionResponse>(`/documents/${documentId}/versions/${versionId}`, {
    method: "DELETE",
  });
}