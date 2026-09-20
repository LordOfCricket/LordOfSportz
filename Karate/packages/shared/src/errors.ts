import type { ApiErrorCode } from "@karate/types";

/**
 * Base class for every error the domain/service layer raises on purpose.
 * `isOperational: true` marks it as an expected, handleable failure (bad
 * input, missing record, ...) as opposed to a genuine bug — the API error
 * middleware uses this to decide whether to log at `warn` or `error` and
 * whether the client-facing message is safe to return as-is.
 *
 * Only use these for expected domain failures. Let unexpected exceptions
 * (a null-pointer bug, a driver throwing something undocumented) propagate
 * up to the single top-level handler, which maps them to INTERNAL_ERROR and
 * never echoes their message to the client.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: number;
  readonly isOperational = true;
  readonly details?: Record<string, unknown>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly httpStatus = 400;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class AuthenticationError extends DomainError {
  readonly code = "AUTHENTICATION_ERROR" as const;
  readonly httpStatus = 401;

  constructor(message = "Authentication is required or has failed.") {
    super(message);
  }
}

export class AuthorizationError extends DomainError {
  readonly code = "AUTHORIZATION_ERROR" as const;
  readonly httpStatus = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;
  readonly httpStatus = 404;

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} '${identifier}' was not found.` : `${resource} was not found.`);
  }
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class RateLimitError extends DomainError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;

  constructor(message = "Too many requests. Please try again later.") {
    super(message);
  }
}

/**
 * A downstream dependency (database, external API, message broker) failed.
 * Use this to translate/wrap the infrastructure exception with domain
 * context — never let a raw driver error (with connection strings, SQL,
 * stack traces) reach the client.
 */
export class InfrastructureError extends DomainError {
  readonly code = "INFRASTRUCTURE_ERROR" as const;
  readonly httpStatus = 502;

  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
