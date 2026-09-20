# Authentication (Phase 3 — Unified OTP; Auth Enhancement — Password + Forgot Password)

> **Phase 6** added mandatory MFA + step-up re-authentication for SUPER_ADMIN and GROUND_OWNER on top of the
> login flow described here — see `docs/MFA.md`. Login itself (this document) is completely unchanged: MFA
> is enforced only at the point a privileged action is attempted, never at login. The one addition to this
> file's own flow is that `sessions.mfa_verified_at` now exists on the row described in "Session storage"
> below, and the legacy JWT branch under "Legacy JWT" is permanently unable to satisfy it (see `docs/MFA.md`
> for why).
>
> **Phase 7** performed a full adversarial security audit of this login flow (OTP rate limiting, session
> cookie attributes, legacy JWT exposure) with no findings against it — see `docs/SECURITY.md` for the
> full audit summary and threat model.
>
> **Phase 8** executed the "Legacy JWT" deprecation checklist below as far as it could safely go — see
> that section for exactly what was removed, what was deliberately kept, and why. This also fully
> resolved Phase 7's deferred D-01 finding (legacy JWT in `localStorage`): nothing writes to it anymore.
>
> **Auth Enhancement** added a second credential type — email/phone + password — to this SAME login entry
> point, plus a forgot-password flow, without touching anything above. This is unrelated to, and does not
> revive, the "Legacy JWT" path described further down: the new password login creates the identical
> HttpOnly-cookie session type OTP login does (`services/session.service.js#createSessionForUser`), never a
> JWT, never anything stored in `localStorage`. See "Password login" and "Forgot password" below.

## Overview

LOC has one common login entry point for every role (SUPER_ADMIN, GROUND_OWNER, STAFF, UMPIRE, PLAYER):
enter an email or phone number, then authenticate with either a 6-digit OTP or a password, and get a secure
server-side session either way. There is no separate signup form — verifying an OTP for an identifier with
no existing account creates one automatically (see "Find-or-create" below); a password can only ever
authenticate an account that already has one (no find-or-create for passwords — see "Password login" below).

This is genuinely new infrastructure (no OTP existed before Phase 3) layered *alongside* the pre-existing
email+password+JWT flow, not a replacement of it yet — see "Legacy JWT" below for the coexistence and
deprecation plan.

## Login flow

```
Email or Phone
      ↓
POST /api/auth/send-otp        { identifier }
      ↓
OTP delivered (Twilio Verify for phone, SendGrid for email, or the
console dev-provider if neither is configured)
      ↓
POST /api/auth/verify-otp      { identifier, code }
      ↓
Server: verify code -> find-or-create user -> check account status -> create session
      ↓
HttpOnly session cookie set (loc_session)
      ↓
GET /api/auth/me               -> trusted user context for the frontend
      ↓
Frontend redirects per role (models/roleRedirect.model.js, unchanged)
```

## Password login

```
Email or Phone + Password
      ↓
POST /api/auth/login-password  { identifier, password }
      ↓
Server: normalize identifier -> find user -> bcrypt.compare -> check account status -> create session
      ↓
HttpOnly session cookie set (loc_session) — SAME cookie, SAME session table row shape as OTP login
      ↓
GET /api/auth/me               -> identical trusted user context, either credential
      ↓
Frontend redirects per role (unchanged — same getPostLoginPath call either way)
```

`services/otpAuth.service.js#loginWithPassword` deliberately does **not** find-or-create — only 6 accounts
in this database have ever had a `password_hash` set (all pre-existing seed/dev accounts from before Phase
3 existed; see git history around the Auth Enhancement task for how this was confirmed), and a password can
only ever authenticate an account that already has one. `bcrypt.compare` always runs — even when no user or
no `password_hash` exists, against a fixed dummy hash generated once at module load — so "no such account",
"account has no password set", and "wrong password" all take the same code path, the same approximate time,
and return the byte-identical generic `INVALID_CREDENTIALS` error (§ anti-enumeration, verified by an
integration test asserting the two failure responses are `deepEqual`).

**Rate limiting**: `middlewares/rateLimit.js`'s `passwordLoginLimiter` (IP-based) chained with
`passwordLoginIdentifierLimiter` (keyed on the normalized identifier being attempted, not the caller — who
isn't authenticated yet) — the same two-independent-dimensions design OTP already uses, for the same
"§9: IP rotation defeats IP-only limiting" reason.

## Forgot password

```
Login (password step) -> "Forgot password?"
      ↓
POST /api/auth/forgot-password  { identifier }
      ↓
otpService.requestOtp(..., purpose: 'PASSWORD_RESET')  — SAME OTP infrastructure LOGIN/REGISTER_* already use
      ↓
Code delivered (Twilio Verify / SendGrid / console — same provider resolution as any other OTP)
      ↓
POST /api/auth/reset-password  { identifier, code, newPassword, confirmPassword }
      ↓
Server: validate confirmation match + password policy (BEFORE touching the OTP —
        a doomed request from a bad password shouldn't burn a valid code)
      ↓
otpService.verifyOtp(...) — SAME verification, same expiry/attempt-limit/single-use guarantees as any OTP
      ↓
Check the verified row's purpose === 'PASSWORD_RESET' (a still-valid LOGIN/REGISTER_* code for the
        same identifier must NOT satisfy a reset — otp.service.js#verifyOtp checks the most recent code
        for an identifier regardless of purpose; the purpose check is the caller's responsibility, same
        as verifyLoginOtp's own LOGIN/REGISTER_* branching)
      ↓
Find the account for this identifier (does NOT create one if missing — unlike LOGIN's find-or-create,
        an OTP can be verified for an identifier with no LOC account at all, since requestOtp never checks
        existence; this returns the same generic invalid-code error rather than ever revealing that)
      ↓
bcrypt.hash the new password, UPDATE users.password_hash
      ↓
revokeAllSessionsForUser(userId) — every existing session for this account ends immediately
      ↓
Account-audit events: PASSWORD_RESET, SESSION_REVOKED_FOR_SECURITY_REASON
      ↓
Generic success response — does NOT auto-login. The user authenticates fresh via /auth/login-password.
```

No new token system was introduced for this — `code + newPassword + confirmPassword` arrive together in
one call rather than a separate "verify, get a token, then set password" round trip, so `otp_codes` (already
random, short-lived, single-use, server-validated, never logged) is the entire reset-authorization
mechanism. `otp_codes.purpose` gained a fourth value, `'PASSWORD_RESET'` (additive CHECK constraint
widening, `server/src/config/schema.sql`/`prisma/migrations/3_password_auth/`) — its own original Phase 3
comment already anticipated this exact extension.

**Session invalidation**: `services/session.service.js#revokeAllSessionsForUser` (new caller of a
repository function that already existed, added for a future feature and never called until now) revokes
*every* session for the account — unlike Phase 6's `revokeAllSessionsForUserExceptCurrent` (used when an
already-logged-in user changes a security-sensitive factor), forgot-password happens from a logged-out
state, so there is no "current session" to exempt.

## Password policy

No policy existed anywhere in this codebase before this feature — `staffAccount.service.js#createPlatformStaff`
(a Super Admin manually creating a staff account) hashes whatever password is typed with zero validation.
Established here, applied to new/reset passwords only (`domain/otpAuth/password.js`):

- **Minimum 8 characters.** Length over character-class complexity, matching current guidance (NIST
  800-63B) rather than forcing uppercase/digit/symbol rules that mostly encourage predictable substitutions.
- **Maximum 128 characters.** Not arbitrary — bcrypt silently truncates/ignores input past 72 **bytes**;
  this cap is enforced explicitly (a clear `PASSWORD_POLICY_VIOLATION` error) rather than letting bcrypt
  silently drop the tail of an unusually long input.
- Hashed with `bcryptjs`, cost factor 10 — the same library and cost factor `staffAccount.service.js`
  already uses, not a second hashing scheme.

## Password security

- **Storage**: `users.password_hash` (bcrypt, cost 10). Never plaintext, never returned in any API response
  (verified by an integration test asserting the login response body contains no `password_hash` field and
  never echoes the submitted password back).
- **Never logged**: every log call around password login/reset logs only `userId`/masked identifier/status
  — never `password`, `newPassword`, or `code` (verified by an integration test asserting none of the raw
  password values used in that test file ever appear in captured log output across the whole suite run).
- **Anti-enumeration**: `forgot-password` returns the identical generic message whether or not the
  identifier is registered (`requestPasswordReset` never checks existence, same as `requestLoginOtp`).
  `login-password` returns the identical generic `INVALID_CREDENTIALS` for every failure reason (no
  account, no password set, wrong password).
- **Account status**: `loginWithPassword` checks `user.status !== 'ACTIVE'` after credential verification,
  before session creation — identical placement and identical `ACCOUNT_NOT_ACTIVE` error to
  `verifyLoginOtp`. A password reset does **not** additionally gate on account status (proving control of
  the identifier via OTP is independent of whether the account is currently suspended, and a fresh
  password is harmless to set for a suspended account — login itself still rejects it either way).
- **MFA**: not a login-time gate for either credential (see the Phase 6 note at the top of this document) —
  a password-authenticated session has `mfa_verified_at = NULL`, exactly like a fresh OTP session, so every
  existing `requireStaffRole`/`requireGroundRole` MFA/step-up gate applies identically regardless of which
  credential authenticated the session. No new MFA logic was needed or added.

## Architecture

```
routes/auth.routes.js
  -> controllers/auth.controller.js       (sendOtp, verifyOtpAndLogin, logout,
                                            loginWithPassword, forgotPassword, resetPassword — all thin)
     -> services/otpAuth.service.js       (orchestration: identify, verify, find-or-create, session —
                                            now also loginWithPassword/requestPasswordReset/resetPassword)
        -> services/otp.service.js        (OTP lifecycle: generate/hash/verify/attempts/cooldown —
                                            unmodified; PASSWORD_RESET is just another `purpose`)
           -> services/otpProviders/      (console | twilioProvider | sendgridProvider, behind
                                            resolveProvider() — the only place that decides which
                                            one handles a given identifier type)
        -> services/session.service.js    (createSessionForUser, revokeSession, and now
                                            revokeAllSessionsForUser — used by password reset)
        -> repositories/prisma/otpCode.prisma-repository.js   (Prisma — brand-new table)
        -> repositories/prisma/session.prisma-repository.js   (Prisma — brand-new table)
        -> models/user.model.js           (existing raw-SQL model, extended with
                                            findUserByPhone/findUserByIdentifier/createUserFromOtp —
                                            NOT replaced, since 67 call sites across the app read
                                            req.user's shape from this exact file; password_hash writes
                                            reuse the existing generic updateUser(id, fields), no new
                                            model function needed)
  -> middlewares/session.js               (cookie name/options)
  -> middlewares/rateLimit.js             (otpRequestLimiter/otpVerifyLimiter reused directly for
                                            forgot/reset-password; passwordLoginLimiter +
                                            passwordLoginIdentifierLimiter are the only new limiters)
  -> middlewares/auth.js#requireAuth      (dual-path: session cookie first, legacy JWT bearer
                                            fallback — both converge on the same
                                            models/user.model.js#findUserById, so req.user is
                                            byte-identical regardless of which authenticated the
                                            request)
```

Pure, dependency-free logic (OTP generation/hashing, identifier detection/normalization, session
token generation/hashing, and now password policy validation in `domain/otpAuth/password.js`) lives in
`domain/otpAuth/` with colocated unit tests, matching every other `domain/*` module's convention.

## Find-or-create (transitional compatibility adapter) — LOGIN purpose only

A successful `LOGIN`-purpose OTP verification for an identifier with no matching account still creates a
bare one — `role: 'user'` (not yet chosen), exactly matching the pre-existing password-signup default. The
resulting user goes through the *same* existing post-auth role-selection flow (`role-select`/`player-type`
pages, unchanged) a password signup already used.

**Phase 4 added dedicated, explicit provisioning paths** for the two self-registering roles
(`POST /auth/register/player`, `POST /auth/register/umpire` — see `docs/ACCOUNT_CREATION.md`) instead of
extending this permissive find-or-create further. GROUND_OWNER (request + Super Admin approval) and STAFF
(Ground-Owner-created) also now have their own dedicated, non-permissive provisioning paths. The bare
find-or-create above still exists only for the plain `LOGIN` purpose, kept for backward compatibility with
any account created before Phase 4's dedicated paths existed.

## Account status

`users.status` (`ACTIVE | SUSPENDED | DISABLED | PENDING`, defaults `ACTIVE`) is checked on every
authentication, regardless of which credential (session cookie or legacy JWT) is presented. The database is
the only source of truth — nothing about status is trusted from the client, ever.

## Session storage

`sessions` table (Prisma-managed): `id, user_id, token_hash (unique, sha256), created_at, expires_at,
revoked_at, last_used_at, ip_address, user_agent`. The raw session token is a 256-bit CSPRNG value
(`domain/otpAuth/sessionToken.js`), sent to the browser only inside an HttpOnly, `SameSite=Lax`,
production-only-`Secure` cookie (`loc_session`), additionally HMAC-signed via `cookie-parser`'s signed-cookie
support (`SESSION_COOKIE_SECRET`) for defense-in-depth. The raw token itself is never written to the
database — only its hash — mirroring how `password_hash` never stores a raw password.

Because every session lives in Postgres (not process memory), authentication is correct under Kubernetes
horizontal scaling out of the box — any replica can validate any session by hashing the presented token and
looking it up, with no sticky-session requirement.

## OTP security

- **Generation**: `crypto.randomInt` (CSPRNG), 6 digits by default (`OTP_LENGTH`).
- **Storage**: SHA-256 hash only (`otp_codes.otp_hash`), nullable for Twilio-Verify-delegated rows (Twilio
  owns that verification state remotely — see "Providers" below). SHA-256, not bcrypt, is a deliberate
  choice: a 6-digit code has only 10^6 possibilities and lives minutes, not years — the real defenses are
  expiry and max-attempts, not hash cost (contrast with `password_hash`, long-lived and higher-entropy,
  which does use bcrypt).
- **Expiry**: 5 minutes by default (`OTP_TTL_MINUTES`).
- **Max attempts**: 5 by default (`OTP_MAX_ATTEMPTS`) — the code is marked `LOCKED` after that, independent
  of whether it's also expired.
- **Resend cooldown**: 30 seconds by default (`OTP_RESEND_COOLDOWN_SECONDS`), enforced per-identifier via a
  real Postgres read (correct under horizontal scaling, no shared in-memory state needed).
- **Previous-OTP invalidation**: requesting a new OTP immediately marks any still-pending one for that
  identifier as `EXPIRED` — a stale code can never satisfy a later request.
- **Purpose scoping**: every row carries a `purpose` — `LOGIN`, or (Phase 4) `REGISTER_PLAYER`/
  `REGISTER_UMPIRE`. Requesting a code is purpose-scoped (a pending `REGISTER_PLAYER` code doesn't
  interfere with a pending `LOGIN` code for the same identifier, and vice versa), but a single
  `POST /auth/verify-otp` handles all three — see `docs/ACCOUNT_CREATION.md` for how
  `otpAuth.service.js#verifyLoginOtp` branches on the verified row's `purpose` to decide whether to log in,
  register a Player, or register an Umpire.
- **Consumed-code replay**: a successfully verified code is immediately marked `VERIFIED`
  (`otp.service.js#verifyOtp` calls `markVerified`) — the `status === 'VERIFIED'` replay check that already
  existed in this function is what actually fires now. (Phase 3 shipped the check but never called
  `markVerified`, so a correct code could be replayed any number of times within its TTL; found and fixed
  while extending this function for Phase 4's purpose-branching.)
- **Rate limiting, two independent dimensions** (per the brief's "not just IP" requirement):
  1. IP-based, `middlewares/rateLimit.js`'s `otpRequestLimiter`/`otpVerifyLimiter` (in-memory,
     single-process — same caveat as the pre-existing `authLimiter`, see `docs/DEPLOYMENT.md`).
  2. Identifier-based, inside `otp.service.js` itself, backed by a real Postgres count of recent
     `otp_codes` rows — correctly shared across every backend replica.
- **Anti-enumeration**: `send-otp` returns the identical generic message whether or not an account exists
  for the identifier. `verify-otp` returns the identical generic `"Invalid or expired code."` message for
  every failure reason (no code requested, wrong code, expired, locked) — the specific reason is only ever
  in the server-side structured log, via an internal `code` field (`INVALID_OTP`/`OTP_EXPIRED`/`OTP_LOCKED`)
  that the current frontend doesn't branch on differently anyway.
- **Never logged**: the OTP value itself. The dev-only console provider (see below) deliberately bypasses
  `utils/logger.js` entirely for this reason — see its file header.

## Providers

`services/otpProviders/resolveProvider(identifierType)` decides which provider handles a request:

| Identifier | Configured | Provider | How verification works |
|---|---|---|---|
| PHONE | `TWILIO_ACCOUNT_SID` + `TWILIO_API_KEY` + `TWILIO_API_SECRET` + `TWILIO_VERIFY_SERVICE_SID` all set | Twilio Verify | Twilio generates/delivers/checks the code remotely; LOC's `otp_codes` row for this case carries `otp_hash: null` and exists only for local rate-limit bookkeeping — not a second verification source. Auth is Twilio's Standard API Key scheme (SK key + secret), not the Account Auth Token. |
| PHONE (fallback) | Twilio not configured | console (dev only) | LOC generates/hashes/stores/verifies the code itself. |
| EMAIL | `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` both set | SendGrid | "Dumb" delivery channel — LOC generates/hashes/stores/verifies the code itself; SendGrid just sends the email. |
| EMAIL (fallback) | SendGrid not configured | console (dev only) | Same as above. |

**In this development environment, neither Twilio nor SendGrid is configured** (no real credentials were
available) — every OTP in this environment goes through the console provider, which logs
`[dev-otp] <type> <masked identifier> -> code: <code>` to the server's own stdout only, never to an HTTP
response, and hard-refuses to run at all if `NODE_ENV=production`. Dropping in real credentials later
requires zero code changes — only setting the env vars.

## Legacy JWT — Phase 8 resolution

**Phase 8 (2026-08-17) performed a full dependency audit** of the legacy email+password+JWT path and
executed most of the deprecation checklist below. What was found and done:

- **Zero reachable frontend UI callers existed.** A repo-wide grep confirmed no component ever
  destructured `login`/`signup` from `useAuth()` — OTP had been the only reachable login/signup surface
  since Phase 3, and this entire multi-phase initiative never had real production users on the password
  path to migrate away from mid-session.
- **Removed**: `POST /auth/login`, `POST /auth/signup` (`auth.routes.js`, `auth.controller.js`), the
  now-dead `authLimiter` (`rateLimit.js`), `AuthContext.jsx`'s `login`/`signup` functions,
  `authApi.js`'s equivalents, and `client/src/utils/authToken.js` entirely (the localStorage JWT
  storage helper) along with the Authorization-header interceptors in `api.js`/`canteenApi.js` that
  read it.
- **Kept**: `signToken`/`verifyToken` (`utils/jwt.js`) and `requireAuth`'s JWT-bearer verification
  branch. Not "temporary" — this has a permanent, narrow, documented purpose: the integration test
  suite mints JWTs directly via `signToken({id})` as a lightweight auth-fixture shortcut across 51 test
  files (never through the now-removed login route), and `matchChatRealtime.js`'s socket
  authentication keeps a JWT fallback behind its (now primary) session-cookie path, mirroring
  `requireAuth`'s own dual-path shape. `JWT_SECRET` stays a required production env var for exactly
  this reason: the verification branch still exists and must never fall back to the public dev secret.
- **A real, previously-hidden production bug found via this audit, not the test suite**: since no real
  user has been able to obtain a JWT since Phase 3, `matchChatRealtime.js`'s JWT-only socket
  authentication meant **match chat had been completely unreachable for every real user** since that
  deploy. Fixed by migrating it to the same session-cookie mechanism every REST route already uses
  (JWT kept only as a fallback) — see `docs/SECURITY.md`/the Phase 8 report for full detail and the new
  `matchChatRealtime.integration.test.js` coverage (previously zero).
- **A second, same-shaped bug found the same way**: `client/src/services/canteenApi.js` never set
  `withCredentials: true` and relied entirely on the same (dead) localStorage JWT — every
  `requireAuth`-gated canteen route (order placement, order history, staff menu management) had been
  receiving zero authentication credential from any real user since Phase 3. Fixed.
- **Not done, deliberately**: dropping `users.password_hash` entirely. `staffAccount.service.js` still
  uses it when a Super Admin creates a new platform staff account (setting an initial password on the
  row) — unrelated to login/signup, and out of scope for an authentication-surface cleanup; changing
  staff provisioning is a separate concern.

**Historical context** (Phase 3's original reasoning, preserved for anyone reading this later): the JWT
branch was originally kept alive because any account that had logged in with the old flow held a JWT
valid for up to 7 days, and deleting the branch immediately would have signed those sessions out
mid-session. That window closed long ago — by the time this audit ran, no real JWT had been issued to any
real user since the login route was still reachable, before Phase 3 shipped.

## Environment variables

See `server/.env.example` for the full list with inline documentation. New in Phase 3:
`SESSION_COOKIE_SECRET` (required in production, same fail-fast pattern as `JWT_SECRET`), `OTP_LENGTH`,
`OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`, `SESSION_TTL_DAYS` (all optional, sane
defaults), `TWILIO_ACCOUNT_SID`/`TWILIO_API_KEY`/`TWILIO_API_SECRET`/`TWILIO_VERIFY_SERVICE_SID` (Standard API
Key auth, not the Account Auth Token), `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` (all optional — console
fallback if unset, never required in any environment since that would make an environment un-bootable without
a paid third-party account).

## What Phase 3 deliberately did not implement

No RBAC/permission redesign, no Ground Owner/Staff permission model, no ground-ownership authorization
changes. `requireRole`/`requireStaffRole`/`requireScorer`/`isSuperAdminUser`/`requireApprovedUmpire`
(`middlewares/auth.js`) and every ground-scoped/match-scoped authorization gate were completely untouched —
Phase 3 only changed how a request *authenticates*, never how it's *authorized* once `req.user` is set.
Phase 4 (see `docs/ACCOUNT_CREATION.md`) added only the minimal authorization each new endpoint specifically
needs (`requireStaffRole('super_admin')` for request review, `requireGroundRole('GROUND_OWNER')` for staff
creation, both pre-existing primitives) — full RBAC is still not implemented and remains a future phase.
