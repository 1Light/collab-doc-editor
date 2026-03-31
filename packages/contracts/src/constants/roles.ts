// packages/contracts/src/constants/roles.ts

/**
 * Document-level roles
 * These apply per document and control document content access.
 */
export const DOCUMENT_ROLES = [
  "Viewer",
  "Commenter",
  "Editor",
  "Owner",
] as const;

export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

/**
 * Organization-level roles
 * These apply at the organization scope only.
 */
export const ORG_ROLES = [
  "OrgAdmin",
  "OrgOwner",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number] | null;

/**
 * Utility helpers
 */

export const isDocumentRole = (value: unknown): value is DocumentRole => {
  return typeof value === "string" &&
    (DOCUMENT_ROLES as readonly string[]).includes(value);
};

export const isOrgRole = (value: unknown): value is OrgRole => {
  if (value === null) return true;
  return typeof value === "string" &&
    (ORG_ROLES as readonly string[]).includes(value);
};