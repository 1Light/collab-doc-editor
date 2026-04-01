// apps/api/src/middleware/errorHandler.ts

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ERROR_CODES } from "@repo/contracts";

type KnownError = {
  code?: string;
  status?: number;
  message?: string;
  details?: unknown;
};

/**
 * Map our semantic error codes to HTTP status codes.
 */
function mapErrorCodeToStatus(code?: string, details?: unknown): number {
  switch (code) {
    case ERROR_CODES.UNAUTHORIZED:
      return 401;

    case ERROR_CODES.FORBIDDEN:
    case ERROR_CODES.AI_DISABLED_BY_POLICY:
      return 403;

    case ERROR_CODES.INVALID_REQUEST:
      return 400;

    case ERROR_CODES.NOT_FOUND:
      return 404;

    case ERROR_CODES.CONFLICT:
      return 409;

    case ERROR_CODES.AI_QUOTA_EXCEEDED:
      return 429;

    case ERROR_CODES.AI_PROVIDER_UNAVAILABLE: {
      const d = details as
        | {
            reason?: string;
            status?: number;
          }
        | undefined;

      if (
        d?.reason === "network" ||
        d?.reason === "timeout" ||
        d?.reason === "unreachable"
      ) {
        return 503;
      }

      return 502;
    }

    case ERROR_CODES.INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * Standardized JSON error response emitter.
 */
function sendError(
  res: Response,
  payload: { code: string; message: string; details?: unknown }
) {
  const status = mapErrorCodeToStatus(payload.code, payload.details);

  res.status(status).json({
    code: payload.code,
    message: payload.message,
    details: payload.details,
  });
}

/**
 * Express error handling middleware (final).
 */
export default function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Zod validation errors -> INVALID_REQUEST
  if (
    err instanceof ZodError ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as any).name === "ZodError" &&
      "errors" in err &&
      Array.isArray((err as any).errors))
  ) {
    const zodErr = err as ZodError;
    const details = zodErr.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));

    return sendError(res, {
      code: ERROR_CODES.INVALID_REQUEST,
      message: "Invalid request payload",
      details,
    });
  }

  // Prisma errors -> try to give meaningful feedback for common codes
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return sendError(res, {
        code: ERROR_CODES.INVALID_REQUEST,
        message: "Unique constraint violation",
        details: { target: err.meta?.target },
      });
    }

    return sendError(res, {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Database error",
      details: { code: err.code, meta: err.meta },
    });
  }

  // Structured application errors
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in (err as KnownError)
  ) {
    const ke = err as KnownError;
    const code = (ke.code as string) ?? ERROR_CODES.INTERNAL_ERROR;
    const message = ke.message ?? "Error";

    return sendError(res, {
      code,
      message,
      details: ke.details,
    });
  }

  // Fallback: unknown / untyped error
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  return sendError(res, {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: isDev ? (err as Error)?.message ?? "Internal error" : "Internal server error",
    details: isDev ? { stack: (err as Error)?.stack } : undefined,
  });
}