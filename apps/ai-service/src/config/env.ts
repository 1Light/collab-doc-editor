// apps/ai-service/src/config/config.ts

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4002),

  LLM_PROVIDER: z.enum(["lmstudio", "mock"]).default("mock"),

  /**
   * Optional for LM Studio.
   * Usually not required for local usage, but kept for compatibility
   * in case a local gateway/proxy expects a bearer token.
   */
  LLM_API_KEY: z.string().optional(),

  /**
   * LM Studio local server base URL.
   * Default LM Studio server commonly runs on localhost:1234.
   */
  LLM_BASE_URL: z.string().url().default("http://127.0.0.1:1234"),

  /**
   * The loaded local model identifier configured in LM Studio.
   */
  LLM_MODEL: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      "Invalid AI service environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Invalid AI service environment configuration");
  }

  const env = parsed.data;

  if (env.LLM_PROVIDER === "lmstudio" && !env.LLM_BASE_URL) {
    throw new Error("LLM_BASE_URL is required when LLM_PROVIDER=lmstudio");
  }

  return env;
}

const loaded = loadEnv();

export const config = {
  ...loaded,
  LLM_MODEL:
    loaded.LLM_MODEL ??
    (loaded.LLM_PROVIDER === "lmstudio" ? "qwen2.5-7b-instruct" : undefined),
};