// apps/api/src/app.ts

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";

import { config } from "./config/env";
import errorHandler from "./middleware/errorHandler";

// Routes
import indexRoutes from "./routes/index";

const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), "exports");

export function createApp() {
  const app = express();

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    })
  );

  // Use an explicit origin when configured; otherwise allow local development defaults.
  if (config.WEB_ORIGIN) {
    app.use(
      cors({
        origin: config.WEB_ORIGIN,
        credentials: true,
      })
    );
  } else {
    app.use(cors());
  }

  // Logging
  if (config.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  // Body parsing
  app.use(express.json({ limit: "2mb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Exported files
  app.use(
    "/exports",
    express.static(EXPORT_DIR, {
      index: false,
      fallthrough: false,
      setHeaders(res) {
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        res.setHeader("Cache-Control", "private, max-age=300");
      },
    })
  );

  // API routes under a stable prefix
  app.use("/api", indexRoutes);

  // 404 fallback for unknown routes
  app.use((_req, _res, next) => {
    next({ code: "NOT_FOUND", message: "Route not found" });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
