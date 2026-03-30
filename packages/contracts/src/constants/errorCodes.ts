// packages/contracts/src/constants/errorCodes.ts

/**
 * Standardized application error codes.
 * These must match backend responses exactly.
 */

export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: "UNAUTHORIZED", // 401
  FORBIDDEN: "FORBIDDEN", // 403

  // Validation / Request
  INVALID_REQUEST: "INVALID_REQUEST", // 400
  NOT_FOUND: "NOT_FOUND", // 404
  CONFLICT: "CONFLICT", // 409

  // AI-specific
  AI_DISABLED_BY_POLICY: "AI_DISABLED_BY_POLICY", // 403
  AI_QUOTA_EXCEEDED: "AI_QUOTA_EXCEEDED", // 429
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE", // 502/503

  // Generic fallback
  INTERNAL_ERROR: "INTERNAL_ERROR", // 500
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Standard API error response shape.
 * All backend errors should conform to this contract.
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}