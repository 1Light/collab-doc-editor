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
};

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
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const backendMessage =
      (typeof data === "object" && data && (data.message || data.error?.message)) ||
      (typeof data === "string" && data) ||
      null;

    const message =
      res.status === 401
        ? backendMessage ?? "Session expired. Please log in again."
        : backendMessage ?? `Request failed (${res.status})`;

    const err = new Error(message) as any;
    err.code =
      (typeof data === "object" && data && (data.code || data.error?.code)) || undefined;
    err.details =
      (typeof data === "object" && data && (data.details || data.error?.details)) ||
      undefined;
    err.status = res.status;
    err.url = url;

    if (res.status === 401) {
      handleUnauthorized();
    }

    throw err;
  }

  return data as T;
}