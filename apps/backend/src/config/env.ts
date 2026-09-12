import "dotenv/config";
import { z } from "zod";

/**
 * Environment schema. Fails fast at startup if required configuration is
 * missing or malformed instead of limping along with `undefined` secrets.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d|w|y)$/, 'JWT_ACCESS_TTL must look like "15m", "1h", "30s", etc.')
    .default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  SEED_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  SEED_ADMIN_PASSWORD: z.string().optional().or(z.literal("")),
  SEED_ADMIN_NAME: z.string().optional().or(z.literal("")),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
