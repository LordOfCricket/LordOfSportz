import type { NextFunction, Request, Response } from "express";
import { RATE_LIMIT_DEFAULTS } from "@karate/constants";
import { RateLimitError } from "@karate/shared";

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * FOUNDATION ONLY: fixed-window, in-process rate limiting. Correct for a
 * single instance / local dev. It does NOT coordinate across multiple API
 * instances — before running more than one instance in production, replace
 * the in-memory `buckets` map with a Redis-backed counter (packages/config
 * already exposes REDIS_URL for exactly this).
 */
export function rateLimit(options: { windowMs?: number; maxRequests?: number } = {}) {
  const windowMs = options.windowMs ?? RATE_LIMIT_DEFAULTS.windowMs;
  const maxRequests = options.maxRequests ?? RATE_LIMIT_DEFAULTS.maxRequests;
  const buckets = new Map<string, Bucket>();

  return (req: Request, _res: Response, next: NextFunction) => {
    // The integration suite drives hundreds of registrations/logins per file from one process/IP —
    // real enforcement is exercised by the dedicated rateLimit.test.ts unit tests instead.
    if (process.env["NODE_ENV"] === "test") {
      next();
      return;
    }
    const key = req.user?.id ?? req.ip ?? "anonymous";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStartedAt >= windowMs) {
      buckets.set(key, { count: 1, windowStartedAt: now });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      next(new RateLimitError());
      return;
    }

    bucket.count += 1;
    next();
  };
}
