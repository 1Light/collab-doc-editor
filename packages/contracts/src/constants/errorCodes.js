"use strict";
// packages/contracts/src/constants/errorCodes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_CODES = void 0;
/**
 * Standardized application error codes.
 * These must match backend responses exactly.
 */
exports.ERROR_CODES = {
    // Auth
    UNAUTHORIZED: "UNAUTHORIZED", // 401
    FORBIDDEN: "FORBIDDEN", // 403
    // Validation / Request
    INVALID_REQUEST: "INVALID_REQUEST", // 400
    NOT_FOUND: "NOT_FOUND", // 404
    // AI-specific
    AI_DISABLED_BY_POLICY: "AI_DISABLED_BY_POLICY", // 403
    AI_QUOTA_EXCEEDED: "AI_QUOTA_EXCEEDED", // 429
    AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE", // 502/503
    // Generic fallback
    INTERNAL_ERROR: "INTERNAL_ERROR", // 500
};
