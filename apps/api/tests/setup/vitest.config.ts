import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-secret-12345678901234567890";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
  },
});