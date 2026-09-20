# Security Strategy

## Implemented in Phase 1

- **Password storage**: bcrypt, cost factor 12 (`apps/api/src/modules/auth/auth.service.ts`). Never
  plaintext, never reversible encryption.
- **Authentication**: short-lived JWT access tokens (15 min default) + opaque, rotating refresh
  tokens (Phase 3 — see below). Login failure paths return the same generic message whether the
  email doesn't exist or the password is wrong, to avoid user enumeration.
- **Authorization is always server-side**: role claims come only from the verified JWT
  (`middleware/auth.ts`), never from a client-supplied header/body field. Organization-scoped actions
  additionally verify DB-backed membership (`requireAcademyAdministrator`) — see
  `03-role-permission-model.md` for why the role check alone is insufficient (IDOR/BOLA).
- **Input validation**: every mutating route validates its body/query/params against a zod schema
  from `@karate/validation` before the controller runs (`middleware/validate.ts`); invalid input never
  reaches a service function.
- **Rate limiting**: applied to `/auth/login` (10 requests/minute per IP) as a brute-force mitigation.
  Documented as in-memory/single-instance only in Phase 1 — see the limitation note in
  `middleware/rateLimit.ts`.
- **Secure HTTP headers**: `helmet()` on every response; `x-powered-by` disabled.
- **CORS**: explicit allow-list from `CORS_ALLOWED_ORIGINS`, not a wildcard.
- **Secrets handling**: all secrets come from environment variables, validated and typed at startup
  (`@karate/config`); `.env` is git-ignored, `.env.example` documents required keys without real
  values.
- **Safe logging**: `@karate/logger` redacts `password`, `passwordHash`, tokens, `authorization`
  headers, cookies, and medical-related fields at any nesting depth, in every log line, by
  configuration rather than by trusting each call site to remember.
- **PII / medical data minimization**: `MedicalClearance` stores a status and a document reference
  only — never raw medical detail — by schema design (see `05-belt-grading-architecture.md`'s sibling
  principle applied to `registrations.prisma`).
- **Audit trail**: `AuditLog` is append-only and schema-ready; `TournamentStatusHistory` and
  `ScoreEvent` are append-only ledgers for their respective domains.
- **Safe error responses**: see `09-error-handling-strategy.md` — no stack traces, SQL, or internal
  paths ever reach a client, verified by smoke test.

## Refresh token lifecycle (Phase 3)

Refresh tokens are opaque, cryptographically random strings (`crypto.randomBytes(40)`), **not JWTs**
— only their SHA-256 hash is persisted (`RefreshSession.tokenHash`, see
`packages/database/prisma/schema/sessions.prisma`). This is a deliberate change from the Phase 2 JWT
refresh token: an opaque token can be looked up and revoked server-side, which rotation and reuse
detection both require; a stateless JWT cannot be individually invalidated without a separate
revocation list anyway, so the stateless benefit was never real for this use case.

- **Rotation**: every successful `/auth/refresh` call atomically revokes the presented session
  (`revokedReason: ROTATED`) and issues a new one in the same rotation family
  (`apps/api/src/modules/auth/refresh.service.ts`). The claim step is a conditional `updateMany`
  (`WHERE id = ? AND revokedAt IS NULL`) inside a transaction — Postgres row-level locking makes this
  safe under concurrent requests for the same token: exactly one succeeds.
- **Reuse detection**: presenting an already-ROTATED token revokes every session in its family,
  forcing full re-authentication — the strongest available signal that a token was captured. A short
  grace period (5s) prevents this from misfiring on a genuine concurrent race (two near-simultaneous
  requests for the same still-fresh token); only a token that was rotated *before* that window fails
  by declaring theft. See the `REUSE_GRACE_PERIOD_MS` comment in `refresh.service.ts`.
- **Revocation on logout**: `/auth/logout` revokes the specific session (`revokedReason: LOGOUT`) and
  is idempotent — safe to call on an already-revoked or unknown token.
- **Web storage**: refresh (and access) tokens live only in httpOnly, `SameSite=lax` cookies scoped to
  the Next.js origin — never returned to client JS, never in localStorage.
- **Mobile storage**: `expo-secure-store` (Keychain/Keystore-backed) — never AsyncStorage.
- **Client 401 recovery**: both web (`middleware.ts` for SSR navigation, `lib/client/api-fetch.ts` for
  future client-side calls) and mobile (`lib/api-client.ts`) share a single in-flight refresh promise
  across concurrent 401s and retry the original request exactly once; non-idempotent requests are
  only retried when explicitly marked safe to retry.

## Explicitly NOT implemented (do not assume otherwise)

- Refresh-token revocation on password change / "log out all devices."
- Email verification enforcement (the column exists; nothing currently requires it before login).
- Distributed rate limiting (Redis-backed) — required before running more than one API instance.
- Explicit CSRF tokens. The Web app's browser-facing Route Handlers now do set httpOnly cookies
  (Phase 6+), but `SameSite=lax` already blocks the cookie from being sent on cross-site POST/PUT/
  DELETE, and every actual API mutation is called server-side via `callBackend` using a Bearer token
  read from that cookie — the browser never sends the cookie to `apps/api` directly. Revisit only if
  a cookie-authenticated endpoint is ever called directly from client-side JS across origins.
- Dependency/SAST scanning in CI (no CI pipeline exists yet in Phase 1).
- Field-level encryption at rest for sensitive columns.

## Threat model notes worth carrying into later phases

- Once `OfficialAssignment`-gated scoring endpoints exist, every `ScoreEvent` write must verify the
  acting user holds an active assignment for that specific bout's tournament/tatami — the same
  event-level authorization pattern as `requireAcademyAdministrator`, applied one level deeper.
- `sportsHubIdentityId` being unique-but-nullable means two `User` rows can never claim the same
  external identity, which matters once SportsHub becomes the identity source of truth.
