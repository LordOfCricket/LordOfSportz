# Error Handling Strategy

## The rule

Domain/service code **throws**; it never catches-and-formats a response itself. Exactly one place
(`apps/api/src/middleware/errorHandler.ts`) decides how any error becomes an HTTP response. This is
what keeps error responses consistent without scattering `try/catch` blocks through every controller.

## The error hierarchy (`@karate/shared`)

`DomainError` (abstract) → `ValidationError` (400) · `AuthenticationError` (401) ·
`AuthorizationError` (403) · `NotFoundError` (404) · `ConflictError` (409) · `RateLimitError` (429) ·
`InfrastructureError` (502, wraps a downstream dependency failure with a `cause`).

Each carries a stable `code` (from `ApiErrorCode` in `@karate/types`) that the error handler maps
1:1 to an HTTP status and a client-safe message. Throw one of these for every _expected_ failure
(bad input, missing record, duplicate email, wrong role, ...).

## When to use try/catch (and when not to)

Use it to: recover, translate an infrastructure exception into an `InfrastructureError` with domain
context, run cleanup, or log-and-rethrow with additional context. Example:
`apps/api/src/errors/asyncHandler.ts` exists purely so `async` route handlers can `throw` and have
Express 4 forward the rejection to `next()` — that is infrastructure glue, not business-logic
try/catch.

Do **not** wrap every function body in try/catch "just in case." An unexpected exception (a real bug)
should propagate all the way to `errorHandler`, which logs it in full at `error` level and returns a
generic `INTERNAL_ERROR` to the client — never a caught-and-swallowed failure that silently succeeds
with wrong data.

## Response envelope

```ts
// success
{ success: true, data: T, meta?: { pagination?, requestId, timestamp } }

// error
{ success: false, error: { code, message, requestId, timestamp, details? } }
```

Both shapes are typed once in `@karate/types` (`ApiSuccessResponse<T>` / `ApiErrorResponse`) and
reused by every route — clients never need a special case per endpoint.

## What must never reach the client

Stack traces, SQL fragments, internal file paths, driver/library exception messages, or secrets.
`errorHandler` enforces this structurally: only `DomainError.message` (written by us, always safe) or
a hardcoded generic string ever becomes the client-facing `message`. Verified in Phase 1 by hitting
the running API with invalid input, a duplicate registration, a wrong-role request, and an unknown
route — see the smoke test transcript referenced in the Phase 1 completion report.
