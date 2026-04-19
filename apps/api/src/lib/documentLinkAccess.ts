import type { Request } from "express";

const DOCUMENT_LINK_HEADER = "x-document-link-token";

function normalizeToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getDocumentLinkToken(req: Request): string | undefined {
  const headerToken = normalizeToken(req.header(DOCUMENT_LINK_HEADER));
  if (headerToken) return headerToken;

  const queryToken = normalizeToken(req.query?.access);
  if (queryToken) return queryToken;

  return undefined;
}
