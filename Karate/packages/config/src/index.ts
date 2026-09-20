import { z } from "zod";

/**
 * Server-side environment schema. Never import this module from web/mobile
 * client bundles — it is intended for apps/api and other Node processes
 * only, and reading it validates + fails fast at process startup instead of
 * surfacing `undefined` deep inside a request handler.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SPORTSHUB_API_BASE_URL: z.string().url().optional(),
  SPORTSHUB_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/**
 * Parses and validates process.env exactly once per process. Throws on the
 * first missing/invalid variable, with the offending keys named, instead of
 * limping along with partially-undefined config.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (result.data.NODE_ENV === "production" && result.data.CORS_ALLOWED_ORIGINS.length === 0) {
    throw new Error("Invalid environment configuration: CORS_ALLOWED_ORIGINS is required in production.");
  }
  cachedEnv = result.data;
  return cachedEnv;
}

export function getCorsAllowedOrigins(env: ServerEnv): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
