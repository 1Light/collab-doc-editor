const DOCUMENT_LINK_STORAGE_KEY = "documentLinkAccessToken";

type StoredDocumentLinkAccess = {
  documentId: string;
  token: string;
};

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  return normalizeToken(params.get("access"));
}

function readDocumentIdFromPathname(pathname: string): string | null {
  const match = /^\/documents\/([^/?#]+)/.exec(pathname);
  return normalizeToken(match?.[1] ?? null);
}

function readStoredDocumentLinkAccess(): StoredDocumentLinkAccess | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(DOCUMENT_LINK_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredDocumentLinkAccess>;
    const documentId = normalizeToken(parsed.documentId);
    const token = normalizeToken(parsed.token);

    if (!documentId || !token) return null;
    return { documentId, token };
  } catch {
    return null;
  }
}

export function getDocumentLinkToken(): string | null {
  const fromLocation = readTokenFromLocation();
  if (fromLocation) return fromLocation;

  if (typeof window === "undefined") return null;

  const currentDocumentId = readDocumentIdFromPathname(window.location.pathname);
  const stored = readStoredDocumentLinkAccess();

  if (!currentDocumentId || !stored) return null;
  return stored.documentId === currentDocumentId ? stored.token : null;
}

export function persistDocumentLinkToken() {
  if (typeof window === "undefined") return;

  const token = readTokenFromLocation();
  const documentId = readDocumentIdFromPathname(window.location.pathname);
  if (token) {
    if (documentId) {
      window.sessionStorage.setItem(
        DOCUMENT_LINK_STORAGE_KEY,
        JSON.stringify({ documentId, token } satisfies StoredDocumentLinkAccess)
      );
    }
    return;
  }

  if (!window.location.pathname.startsWith("/documents/")) {
    window.sessionStorage.removeItem(DOCUMENT_LINK_STORAGE_KEY);
  }
}
