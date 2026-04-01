// apps/ai-service/src/modules/jobs/jobController.ts

import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@repo/contracts";
import { runJob } from "./runJob";

function apiError(
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  details?: unknown
) {
  return { code, message, ...(details !== undefined ? { details } : {}) };
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

function normalizeParameters(parameters: unknown) {
  const raw = parameters && typeof parameters === "object" ? parameters : {};

  const out: {
    style?: string;
    summaryStyle?: string;
    language?: string;
    formatStyle?: string;
  } = {};

  if (typeof (raw as any).style === "string" && (raw as any).style.trim()) {
    out.style = (raw as any).style.trim();
  }

  if (
    typeof (raw as any).summaryStyle === "string" &&
    (raw as any).summaryStyle.trim()
  ) {
    out.summaryStyle = (raw as any).summaryStyle.trim();
  }

  if (
    typeof (raw as any).language === "string" &&
    (raw as any).language.trim()
  ) {
    out.language = (raw as any).language.trim();
  }

  if (
    typeof (raw as any).formatStyle === "string" &&
    (raw as any).formatStyle.trim()
  ) {
    out.formatStyle = (raw as any).formatStyle.trim();
  }

  return out;
}

export const jobController = {
  /**
   * POST /jobs/run
   * Body: { jobId, operation, selectedText, parameters? }
   * Res: { result }
   */
  async run(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId, operation, selectedText, parameters } = req.body as {
        jobId?: unknown;
        operation?: unknown;
        selectedText?: unknown;
        parameters?: unknown;
      };

      if (!jobId || typeof jobId !== "string") {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "jobId is required");
      }

      if (!isValidOperation(operation)) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "Invalid operation");
      }

      if (typeof selectedText !== "string") {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "selectedText is required");
      }

      const trimmedSelectedText = selectedText.trim();

      if (trimmedSelectedText.length === 0) {
        throw apiError(ERROR_CODES.INVALID_REQUEST, "selectedText is empty");
      }

      const MAX_SELECTED = 20_000;
      if (selectedText.length > MAX_SELECTED) {
        throw apiError(
          ERROR_CODES.INVALID_REQUEST,
          `selectedText too large (max ${MAX_SELECTED} chars)`
        );
      }

      const normalizedParameters = normalizeParameters(parameters);

      if (operation === "translate" && !normalizedParameters.language) {
        throw apiError(
          ERROR_CODES.INVALID_REQUEST,
          "language is required for translate"
        );
      }

      if (operation === "reformat" && !normalizedParameters.formatStyle) {
        throw apiError(
          ERROR_CODES.INVALID_REQUEST,
          "formatStyle is required for reformat"
        );
      }

      const out = await runJob({
        jobId,
        operation,
        selectedText,
        parameters: normalizedParameters,
      });

      if (!out?.result || typeof out.result !== "string") {
        throw apiError(
          ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
          "Provider returned invalid response"
        );
      }

      return res.json({ result: out.result });
    } catch (err: any) {
      if (
        err &&
        typeof err === "object" &&
        typeof err.code === "string" &&
        typeof err.message === "string"
      ) {
        return next(err);
      }

      return next(
        apiError(ERROR_CODES.AI_PROVIDER_UNAVAILABLE, "AI provider unavailable", {
          originalMessage: err?.message ?? String(err),
        })
      );
    }
  },
};