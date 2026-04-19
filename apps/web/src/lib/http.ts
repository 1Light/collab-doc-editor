/**
 * Minimal HTTP client wrapper for the Web app.
 * Uses fetch and injects Authorization + x-org-id if available.
 */

import { clearSession } from "../app/session";
import { disconnectSocket } from "../features/realtime/socket";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

function getToken(): string | null {
  return localStorage.getItem("accessToken");
}

function getOrgId(): string | null {
  const raw = localStorage.getItem("orgId");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type HttpOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
};

type RefreshResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    orgId: string | null;
    orgRole: "OrgAdmin" | "OrgOwner" | null;
  };
};

type ErrorPayload = {
  message?: string;
  code?: string;
  details?: unknown;
  error?: {
    message?: string;
    code?: string;
    details?: unknown;
  };
};

type HttpResponseData = ErrorPayload | string | null;

export class HttpError extends Error {
  code?: string;
  details?: unknown;
  status: number;
  url: string;

  constructor(
    message: string,
    init: {
      status: number;
      url: string;
      code?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "HttpError";
    this.status = init.status;
    this.url = init.url;
    this.code = init.code;
    this.details = init.details;
  }
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null;
}

let refreshPromise: Promise<string | null> | null = null;

function normalizePath(path: string) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function handleUnauthorized() {
  try {
    disconnectSocket();
  } catch {
    // ignore
  }

  clearSession();

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

function storeRefreshedSession(data: RefreshResponse) {
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem(
    "me",
    JSON.stringify({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      orgId: data.user.orgId ?? null,
      orgRole: data.user.orgRole ?? null,
    })
  );
  localStorage.setItem("orgId", data.user.orgId ?? "");
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const orgId = getOrgId();

    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        ...(orgId ? { "x-org-id": orgId } : {}),
      },
      credentials: "include",
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json().catch(() => null)) as RefreshResponse | null;
    if (!data?.accessToken) {
      return null;
    }

    storeRefreshedSession(data);
    return data.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function http<T>(path: string, opts: HttpOptions = {}): Promise<T> {
  const token = getToken();
  const orgId = getOrgId();

  const headers: Record<string, string> = {
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "x-org-id": orgId } : {}),
    ...(opts.headers ?? {}),
  };

  const url = `${API_BASE_URL}${normalizePath(path)}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    signal: opts.signal,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: HttpResponseData = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.skipAuthRefresh) {
      const refreshed = await refreshAccessToken().catch(() => null);

      if (refreshed) {
        return http<T>(path, {
          ...opts,
          skipAuthRefresh: true,
        });
      }
    }

    const backendMessage =
      (typeof data === "object" && data && (data.message || data.error?.message)) ||
      (typeof data === "string" && data) ||
      null;

    const message =
      res.status === 401
        ? backendMessage ?? "Session expired. Please log in again."
        : backendMessage ?? `Request failed (${res.status})`;

    const err = new HttpError(message, {
      status: res.status,
      url,
      code: isErrorPayload(data) ? data.code ?? data.error?.code : undefined,
      details: isErrorPayload(data) ? data.details ?? data.error?.details : undefined,
    });

    if (res.status === 401) {
      handleUnauthorized();
    }

    throw err;
  }

  return data as T;
}
