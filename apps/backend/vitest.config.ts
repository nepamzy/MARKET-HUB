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
    },
  },
});
