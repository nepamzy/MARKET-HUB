import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://markethub:markethub_dev_password@localhost:5432/markethub_test?schema=public",
      JWT_ACCESS_SECRET: "test-access-secret-do-not-use-in-production",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL_DAYS: "30",
      CORS_ORIGINS: "http://localhost:3000",
      // Phase 10 — Payments. A fixed test-only value so webhook signature
      // tests can compute a genuine HMAC-SHA512 against it (pure crypto,
      // no network dependency) and so PaystackProvider can be exercised
      // end-to-end with the global fetch mocked at the network boundary
      // only — never a shortcut inside payments.service.ts itself.
      PAYSTACK_SECRET_KEY: "test-paystack-secret-do-not-use-in-production",
    },
  },
});
