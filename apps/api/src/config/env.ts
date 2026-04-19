// apps/api/src/config/env.ts

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Ports: prefer explicit service ports, allow PORT fallback
  API_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),

  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(20),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Internal service URL for the AI service.
  AI_SERVICE_URL: z.string().url().optional(),
  AI_SERVICE_PORT: z.coerce.number().int().positive().optional(),

  // CORS origin for the web app.
  WEB_ORIGIN: z.string().optional(),

  // Realtime internal bridge (API -> realtime)
  REALTIME_INTERNAL_URL: z.string().url().default("http://localhost:4001"),
  REALTIME_INTERNAL_SECRET: z.string().min(1).optional(),

  // Retention: audit logs (days)
  // Default: 90 days
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

type ParsedEnv = z.infer<typeof envSchema>;

type Env = ParsedEnv & {
  PORT: number;
  AI_SERVICE_URL: string;
};

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }

  const data = parsed.data;

  const port = data.API_PORT ?? data.PORT ?? 4000;

  // If AI_SERVICE_URL not provided, build it from AI_SERVICE_PORT (or default)
  const aiPort = data.AI_SERVICE_PORT ?? 4002;
  const aiUrl = data.AI_SERVICE_URL ?? `http://localhost:${aiPort}`;

  return {
    ...data,
    PORT: port,
    AI_SERVICE_URL: aiUrl,
    WEB_ORIGIN: data.WEB_ORIGIN?.trim() || undefined,
    REALTIME_INTERNAL_SECRET: data.REALTIME_INTERNAL_SECRET?.trim() || undefined,
  };
}

export const config = loadEnv();
