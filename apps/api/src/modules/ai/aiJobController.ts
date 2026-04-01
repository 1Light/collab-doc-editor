// apps/api/src/modules/ai/aiJobController.ts

import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@repo/contracts";
import { aiJobService } from "./aiJobService";
import { permissionService } from "../permissions/permissionService";
import { config } from "../../config/env";

function apiError(
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  details?: unknown
) {
  return { code, message, ...(details !== undefined ? { details } : {}) };
}

function assertAuth(req: Request) {
  if (!req.authUser) {
    throw apiError(ERROR_CODES.UNAUTHORIZED, "Authentication required");
  }
  return req.authUser;
}

function isValidOperation(
  op: any
): op is "enhance" | "summarize" | "translate" | "reformat" {
  return (
    op === "enhance" ||
    op === "summarize" ||
    op === "translate" ||
    op === "reformat"
  );
}

function normalizeSelection(sel: any): { start: number; end: number; text: string } {
  const start = Number(sel?.start);
  const end = Number(sel?.end);
  const text = typeof sel?.text === "string" ? sel.text : "";

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range", {
      reason: "start/end must be numbers",
    });
  }

  if (start < 0 || end < 0 || end <= start) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid selection range", {
      reason: "end must be > start and both must be >= 0",
    });
  }

  const MAX_LEN = 20_000;
  const len = end - start;
  if (len > MAX_LEN) {
    throw apiError(
      ERROR_CODES.INVALID_REQUEST,
      `Selection too large (max ${MAX_LEN} chars)`,
      { max: MAX_LEN, got: len }
    );
  }

  if (text.length === 0) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "selection.text is required");
  }

  return { start, end, text };
}

function normalizeParameters(
  parameters: any,
  operation: "enhance" | "summarize" | "translate" | "reformat"
) {
  const raw = parameters && typeof parameters === "object" ? parameters : {};

  const out: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
    applyMode?: "replace" | "insert_below";
  } = {};

  if (typeof raw.style === "string" && raw.style.trim()) {
    out.style = raw.style.trim();
  }

  if (typeof raw.summaryStyle === "string" && raw.summaryStyle.trim()) {
    out.summaryStyle = raw.summaryStyle.trim();
  }

  if (typeof raw.language === "string" && raw.language.trim()) {
    out.language = raw.language.trim();
  }

  if (typeof raw.formatStyle === "string" && raw.formatStyle.trim()) {
    out.formatStyle = raw.formatStyle.trim();
  }

  if (raw.applyMode === "replace" || raw.applyMode === "insert_below") {
    out.applyMode = raw.applyMode;
  }

  if (operation === "translate" && !out.language) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "language is required for translate");
  }

  if (operation === "reformat" && !out.formatStyle) {
    throw apiError(ERROR_CODES.INVALID_REQUEST, "formatStyle is required for reformat");
  }

  return out;
}

function toJobError(job: { errorMessage?: string | null }) {
  if (!job.errorMessage) return undefined;

  const dev = config.NODE_ENV === "development";

  return {
    code: ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
    message: "AI service unavailable",
    ...(dev ? { details: { providerMessage: job.errorMessage } } : {}),
  };
}

export const aiJobController = {
  /**
   * POST /ai/jobs
   * Body: { documentId, operation, selection, parameters? }
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = assertAuth(req);

      const { documentId, operation, selection, parameters } = req.body as {
        documentId: unknown;
        operation: unknown;
        selection: unknown;
        parameters?: unknown;
      };

      if (!documentId || typeof documentId !== "string") {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "documentId is required");
      }

      if (!isValidOperation(operation)) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid operation");
      }

      const normalizedSelection = normalizeSelection(selection);
      const normalizedParameters = normalizeParameters(parameters, operation);

      const role = await permissionService.resolveEffectiveRole({
        documentId,
        userId: user.id,
      });

      if (!role) {
        throw apiError(ERROR_CODES.FORBIDDEN, "No access to this document");
      }

      const job = await aiJobService.createJob({
        documentId,
        requesterId: user.id,
        operation,
        selection: normalizedSelection,
        parameters: normalizedParameters,
      });

      return res.status(201).json({
        jobId: job.id,
        status: job.status,
        result: job.result ?? undefined,
        error: toJobError(job),
        createdAt: job.createdAt.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /ai/jobs/:jobId
   * Must have access to the underlying document.
   */
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const user = assertAuth(req);

      const jobId = req.params.jobId;
      if (!jobId) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "jobId is required");
      }

      const job = await aiJobService.getJob(jobId);

      const role = await permissionService.resolveEffectiveRole({
        documentId: job.documentId,
        userId: user.id,
      });

      if (!role) {
        throw apiError(ERROR_CODES.FORBIDDEN, "No access to this AI job");
      }

      return res.json({
        jobId: job.id,
        status: job.status,
        result: job.result ?? undefined,
        error: toJobError(job),
        createdAt: job.createdAt.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /ai/jobs/:jobId/apply
   * Body: { finalText }
   * Requires Editor/Owner (enforced in service).
   */
  async apply(req: Request, res: Response, next: NextFunction) {
    try {
      const user = assertAuth(req);

      const jobId = req.params.jobId;
      if (!jobId) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "jobId is required");
      }

      const { finalText } = req.body as { finalText?: unknown };
      if (typeof finalText !== "string" || finalText.trim().length === 0) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "finalText is required");
      }

      const result = await aiJobService.applyJob({
        jobId,
        requesterId: user.id,
        finalText,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },
};