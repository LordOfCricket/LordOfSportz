import { z } from "zod";

/**
 * Server-only env for the Next.js app. Separate from @karate/config (that
 * package's schema is shaped for apps/api — DATABASE_URL, refresh secret,
 * etc. — which the web app has no business reading). `JWT_ACCESS_SECRET`
 * must match apps/api's value: both verify/sign the same access tokens.
 * Never import this module from a "use client" component.
 */
const webServerEnvSchema = z.object({
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must match the API's secret (>= 32 chars)"),
});

let cached: z.infer<typeof webServerEnvSchema> | undefined;

export function getWebServerEnv() {
  if (cached) return cached;
  const result = webServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid web server environment configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}
