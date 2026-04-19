import type { Request } from "express";

const DOCUMENT_LINK_HEADER = "x-document-link-token";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDocumentLinkToken(req: Request): string | null {
  const headerToken = normalizeToken(req.header(DOCUMENT_LINK_HEADER));
  if (headerToken) return headerToken;

  const queryToken = normalizeToken(req.query?.access);
  if (queryToken) return queryToken;

  return null;
}

