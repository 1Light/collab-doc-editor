// apps/ai-service/src/app.ts

import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ERROR_CODES } from "@repo/contracts";

import jobRoutes from "./modules/jobs/jobRoutes";
import { config } from "./config/env";

function statusFromCode(code?: string): number {
  switch (code) {
    case ERROR_CODES.INVALID_REQUEST:
      return 400;
    case ERROR_CODES.UNAUTHORIZED:
      return 401;
    case ERROR_CODES.FORBIDDEN:
      return 403;
    case ERROR_CODES.NOT_FOUND:
      return 404;
    case ERROR_CODES.AI_DISABLED_BY_POLICY:
      return 403;
    case ERROR_CODES.AI_QUOTA_EXCEEDED:
      return 429;
    case ERROR_CODES.AI_PROVIDER_UNAVAILABLE:
      return 503;
    case ERROR_CODES.INTERNAL_ERROR:
    default:
      return 500;
  }
}

export function createApp() {
  const app = express();

  app.use(helmet());

  if (config.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  // Body parsing
  app.use(express.json({ limit: "1mb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * AI job routes
   * Mounted at /jobs
   */
  app.use("/jobs", jobRoutes);

  // Error handler: return standardized { code, message, details? }
  app.use(
    (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // eslint-disable-next-line no-console
      console.error("[AI Service Error]", err);

      // Pass through structured ApiError-like objects
      const code =
        err && typeof err === "object" && typeof err.code === "string"
          ? err.code
          : ERROR_CODES.INTERNAL_ERROR;

      const message =
        err && typeof err === "object" && typeof err.message === "string"
          ? err.message
          : "AI service error";

      const details =
        err && typeof err === "object" && "details" in err ? err.details : undefined;

      const status = statusFromCode(code);

      res.status(status).json({
        code,
        message,
        ...(config.NODE_ENV === "development" && details !== undefined ? { details } : {}),
      });
    }
  );

  return app;
}