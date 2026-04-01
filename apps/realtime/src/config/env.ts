// apps/realtime/src/utils/config.ts

import { z } from "zod";

/**
 * Environment configuration for Realtime Service
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  REALTIME_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),

  JWT_SECRET: z.string().min(16),

  WEB_ORIGIN: z.string().optional(),

  REALTIME_INTERNAL_SECRET: z.string().optional(),

  // 🔐 Needed to verify document access via API
  API_BASE_URL: z.string().url(),
});

type Env = z.infer<typeof envSchema> & { PORT: number };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      "Invalid Realtime service environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Invalid Realtime service environment configuration");
  }

  const data = parsed.data;
  const port = data.REALTIME_PORT ?? data.PORT ?? 4001;

  return {
    ...data,
    PORT: port,
    WEB_ORIGIN: data.WEB_ORIGIN?.trim() || undefined,
    REALTIME_INTERNAL_SECRET: data.REALTIME_INTERNAL_SECRET?.trim() || undefined,
    API_BASE_URL: data.API_BASE_URL.trim(),
  };
}

export const config = loadEnv();