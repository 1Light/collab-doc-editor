import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/lib/retry";

describe("withRetry", () => {
  it("retries until success", async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("fail");
        }
        return "success";
      },
      {
        retries: 3,
        baseDelayMs: 0,
        jitterMs: 0,
      }
    );

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("fails after max retries", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("fail");
        },
        {
          retries: 2,
          baseDelayMs: 0,
          jitterMs: 0,
        }
      )
    ).rejects.toThrow("fail");

    expect(attempts).toBe(3);
  });

  it("does not retry when shouldRetry returns false", async () => {
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("fatal");
        },
        {
          retries: 5,
          baseDelayMs: 0,
          jitterMs: 0,
          shouldRetry: () => false,
        }
      )
    ).rejects.toThrow("fatal");

    expect(attempts).toBe(1);
  });
});