import type { NextFunction, Request, Response } from "express";
import type { ZodIssue } from "zod";
import { isDomainError } from "@karate/shared";
import type { ApiErrorResponse } from "@karate/types";

/**
 * Structural check instead of `instanceof ZodError`. In a pnpm workspace,
 * `zod` can end up loaded as more than one physical module instance across
 * packages/build tools (observed under vitest specifically), which makes
 * `instanceof` unreliable even for the "same" version. Zod error shape
 * (`name: "ZodError"` + an `issues` array) is stable across instances.
 */
function isZodError(err: unknown): err is { name: "ZodError"; issues: ZodIssue[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

/**
 * The single place API errors are translated into client responses.
 * Every other layer should THROW (a DomainError subclass, or let an
 * unexpected exception bubble) rather than catch-and-respond itself —
 * see docs/architecture/error-handling-strategy.md for the full policy.
 *
 * Contract: never leak stack traces, SQL, internal file paths, or raw
 * driver/library error messages to the client. Unexpected errors always
 * become a generic INTERNAL_ERROR message; full detail goes to the log only.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const timestamp = new Date().toISOString();

  if (isDomainError(err)) {
    req.log.warn({ err, code: err.code }, "handled domain error");
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId: req.requestId,
        timestamp,
        details: err.details,
      },
    };
    res.status(err.httpStatus).json(body);
    return;
  }

  if (isZodError(err)) {
    req.log.warn({ issues: err.issues }, "request validation failed");
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request could not be validated.",
        requestId: req.requestId,
        timestamp,
        details: {
          issues: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
    };
    res.status(400).json(body);
    return;
  }

  // Unexpected error: log the full detail, tell the client nothing beyond a generic message.
  req.log.error({ err }, "unhandled error");
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
      requestId: req.requestId,
      timestamp,
    },
  };
  res.status(500).json(body);
}
