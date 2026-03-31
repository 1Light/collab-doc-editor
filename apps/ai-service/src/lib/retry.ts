// apps/ai-service/src/resilience/retry.ts

/**
 * Simple retry helper with exponential backoff + jitter.
 * Used for transient LLM/provider failures.
 */

export type RetryOptions = {
  retries?: number;      // total attempts = 1 + retries
  baseDelayMs?: number;  // initial backoff
  maxDelayMs?: number;   // cap
  jitterMs?: number;     // +/- jitter
  shouldRetry?: (err: unknown) => boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 3_000;
  const jitterMs = opts.jitterMs ?? 120;

  const shouldRetry =
    opts.shouldRetry ??
    (() => true); // default retry on any error (MVP)

  let attempt = 0;
  // total attempts = 1 + retries
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) {
        throw err;
      }

      const exp = baseDelayMs * Math.pow(2, attempt);
      const jitter =
        (Math.random() * 2 - 1) * jitterMs; // [-jitterMs, +jitterMs]
      const delay = clamp(exp + jitter, 0, maxDelayMs);

      await sleep(delay);
      attempt += 1;
    }
  }
}