import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-12345";
process.env.API_BASE_URL = "http://localhost:4000";

describe("verifySocketJwt", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the decoded user identity for a valid token", async () => {
    const token = jwt.sign(
      { userId: "user-1", name: "Nasir" },
      process.env.JWT_SECRET as string
    );

    const { verifySocketJwt } = await import("../../src/auth/verifySocketJwt");
    const out = verifySocketJwt(token);

    expect(out).toEqual({
      userId: "user-1",
      name: "Nasir",
    });
  });

  it("throws when the token is missing a userId", async () => {
    const token = jwt.sign({ name: "Nasir" }, process.env.JWT_SECRET as string);

    const { verifySocketJwt } = await import("../../src/auth/verifySocketJwt");

    expect(() => verifySocketJwt(token)).toThrow("JWT missing userId");
  });
});
