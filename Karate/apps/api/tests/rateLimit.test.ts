import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "../src/middleware/rateLimit";

/**
 * The rateLimit middleware no-ops under NODE_ENV=test (see rateLimit.ts) so
 * the rest of the suite isn't rate-limited — real enforcement is verified
 * here by temporarily overriding NODE_ENV around each assertion.
 */
function mockReq(ip: string): Request {
  return { ip, user: undefined } as unknown as Request;
}

describe("rateLimit middleware (production enforcement)", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("allows requests under the limit", () => {
    const middleware = rateLimit({ windowMs: 60_000, maxRequests: 3 });
    const next = vi.fn();
    for (let i = 0; i < 3; i++) {
      middleware(mockReq("1.2.3.4"), {} as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls.every((call) => call.length === 0)).toBe(true);
  });

  it("blocks a request once the limit is exceeded within the window", () => {
    const middleware = rateLimit({ windowMs: 60_000, maxRequests: 2 });
    const next = vi.fn();
    middleware(mockReq("5.6.7.8"), {} as Response, next as NextFunction);
    middleware(mockReq("5.6.7.8"), {} as Response, next as NextFunction);
    middleware(mockReq("5.6.7.8"), {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(3);
    const lastCallArg = next.mock.calls[2]![0];
    expect(lastCallArg).toBeInstanceOf(Error);
  });

  it("tracks separate IPs independently", () => {
    const middleware = rateLimit({ windowMs: 60_000, maxRequests: 1 });
    const next = vi.fn();
    middleware(mockReq("10.0.0.1"), {} as Response, next as NextFunction);
    middleware(mockReq("10.0.0.2"), {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0]).toHaveLength(0);
    expect(next.mock.calls[1]).toHaveLength(0);
  });

  it("resets the window after windowMs elapses", () => {
    vi.useFakeTimers();
    try {
      const middleware = rateLimit({ windowMs: 1_000, maxRequests: 1 });
      const next = vi.fn();
      middleware(mockReq("9.9.9.9"), {} as Response, next as NextFunction);
      middleware(mockReq("9.9.9.9"), {} as Response, next as NextFunction);
      expect(next.mock.calls[1]![0]).toBeInstanceOf(Error);

      vi.advanceTimersByTime(1_001);
      middleware(mockReq("9.9.9.9"), {} as Response, next as NextFunction);
      expect(next.mock.calls[2]).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op under NODE_ENV=test (so the integration suite is never rate-limited)", () => {
    process.env.NODE_ENV = "test";
    const middleware = rateLimit({ windowMs: 60_000, maxRequests: 1 });
    const next = vi.fn();
    for (let i = 0; i < 20; i++) {
      middleware(mockReq("1.1.1.1"), {} as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(20);
    expect(next.mock.calls.every((call) => call.length === 0)).toBe(true);
  });
});
