# Privileged Account MFA & Step-Up Security (Phase 6)

> **STATUS (2026-08-24): Enforcement disabled at the project owner's explicit request.**
> `mfaState.service.js#computeMfaVerified` now unconditionally returns `true`, and
> `stepUp.service.js#consumeStepUpGrant` now unconditionally returns a truthy grant — every
> `403 MFA_REQUIRED`/`403 STEP_UP_REQUIRED` gate described below is currently a no-op, in
> production as well as locally. The enrollment/verification UI, TOTP/WebAuthn services, and
> schema below are all still intact and functionally correct — only the two enforcement decision
> points were changed, so re-enabling is a two-line revert of those two functions if this is ever
> reversed. Everything else in this document describes the *designed* behavior, not the current
> runtime behavior.

## Overview

Phase 3 (`docs/AUTH.md`) gave every role the same single-factor OTP login. Phase 5 (`docs/AUTHORIZATION.md`)
made sure a request is authorized correctly once authenticated. Neither addresses what happens if a
privileged account's session or identifier is compromised: today, a stolen `loc_session` cookie (or a
compromised email/phone) for a SUPER_ADMIN or GROUND_OWNER is enough to do everything that role can do.

Phase 6 adds a second factor — mandatory for SUPER_ADMIN and GROUND_OWNER only — plus short-lived, single-use
step-up re-authentication for a small, evidence-based list of especially high-leverage mutations. MFA is
**authentication-hardening only**. It never changes what Phase 5 already decides about roles, permissions, or
ground isolation:

```
Authenticated (Phase 3)
      ↓
Role / Permission / Ground ownership (Phase 5, unchanged, runs FIRST)
      ↓
MFA required for this role? (SUPER_ADMIN / GROUND_OWNER only)
      ↓
Not verified in this session -> 403 MFA_REQUIRED
      ↓
Verified -> does this specific action ALSO require step-up?
      ↓
No fresh step-up grant -> 403 STEP_UP_REQUIRED
      ↓
ALLOW
```

MFA success never grants any additional role or permission — it only unblocks an action Phase 5 had already
decided this user's role/permission/ownership entitles them to attempt.

## Policy

| Role | MFA required? |
|---|---|
| SUPER_ADMIN (`users.staff_role_id → 'super_admin'`) | **Mandatory** |
| GROUND_OWNER (`ground_users.role='GROUND_OWNER'`, any ground) | **Mandatory** |
| STAFF (`GROUND_ADMIN`/`CANTEEN_STAFF`/platform `admin`/`canteen_staff`) | Never |
| UMPIRE / PLAYER | Never |

- **MFA never blocks login.** OTP login (`docs/AUTH.md`, unchanged) always succeeds and creates a session
  exactly as before. MFA is enforced only at the point a *privileged action* is attempted, matching the
  decision flow above — an unverified Super Admin/Ground Owner can still sign in, see `/auth/me`, and reach
  the Security Settings page to enroll a factor.
- **Per-session, not per-ground.** A Ground Owner of 3 grounds verifies once per session, not once per
  ground — `mfa_verified_at` lives on the `sessions` row (one human presence check), not scoped to whichever
  ground triggered the check. Deliberate choice, documented here since it's the kind of thing a stricter
  design could reasonably have gone the other way on.
- **Bootstrap exception.** Enrolling a user's *first* MFA factor requires only a normal authenticated
  session — there is nothing to step up from yet. The single source of truth for "does this user already
  have a working factor" is `mfaState.service.js#hasAnyActiveFactor(userId)` (an active, non-revoked
  passkey OR a verified, non-disabled TOTP secret). Every factor-management mutation *after* the first one
  requires step-up.

## The legacy JWT gap, and why it stays permanently unverified

`POST /auth/login` (password) issues a bare JWT via `signToken` with **no `sessions` table row** — the two
`requireAuth` branches (session cookie vs. legacy JWT bearer) both resolve `req.user` identically, but only
the session-cookie branch has a row to read/write `mfa_verified_at` on.

**Decision**: `mfa_verified_at` only ever attaches to a real session. `requireAuth` tags
`req.authMethod = 'session' | 'jwt'`; the JWT branch is *permanently* `req.mfaVerified = false`, with no code
path that could ever set it true. A privileged account authenticated via the legacy JWT bearer must re-login
via OTP (which does create a real session) before it can pass any MFA gate. This is a zero-cost forcing
function, not a new burden — OTP login was already the primary path before this phase, and the legacy JWT
branch is already documented (`docs/AUTH.md`) as transitional.

## Gate placement — inside 3 existing shared functions, zero new middleware call sites

Rather than adding a new middleware to ~20 route files, the MFA check is added inside the exact functions
that already grant privileged access, so it applies automatically to every current and future route that
uses them:

- **`middlewares/auth.js#requireAuth`** — sets `req.session` (the already-fetched row, `mfa_verified_at`
  comes back for free — zero extra queries), `req.authMethod`, and `req.mfaVerified` via
  `mfaState.service.js#computeMfaVerified(session)` on the session-cookie branch; `req.mfaVerified = false`
  unconditionally on the JWT branch.
- **`middlewares/auth.js#requireStaffRole`** — when the resolved user's `staff_role === 'super_admin'`
  (regardless of which other staff roles the specific route also allows), additionally requires
  `req.mfaVerified` — `403 MFA_REQUIRED` if not. A plain `admin`/`canteen_staff` caller passing through the
  same route is unaffected.
- **`middlewares/groundAccess.js#requireGroundRole` / `#requireGroundPermission`** — in the existing
  Super-Admin-bypass branch, and in the `GROUND_OWNER`-membership branch, requires `req.mfaVerified` the same
  way. The Staff (permission-grant) branch is never touched — MFA is not mandatory for Staff.
- **`middlewares/groundAccess.js#authorizeResolvedCanteen`** (used by `requireCanteenStaffAccess` /
  `requireGroundCanteenRole`, the real canteen menu/order routes) — same two branches (Super-Admin bypass,
  GROUND_OWNER membership), returning `{ allowed, mfaRequired }` so its two callers can answer `403
  MFA_REQUIRED` instead of the generic permission-denied message. This was a real gap found while implementing
  this phase — the canteen routes are reached via a parallel authorization helper
  (`authorizeResolvedCanteen`), not `requireGroundRole`/`requireGroundPermission`, and had been missed by a
  narrower "add the check to the ground-access functions" reading of the brief. Fixed in the same file, same
  phase, since a Super Admin/Ground Owner managing canteen menus/orders is exactly as privileged an action as
  managing matches.

`requireCanteenRole` (Phase 9, a test-only export with no production route using it — see
`docs/AUTHORIZATION.md`'s own note) was deliberately left untouched, consistent with that existing
documented decision.

## Factors

### WebAuthn / Passkeys (primary)

`@simplewebauthn/server` + `@simplewebauthn/browser` (v13) — zero manual cryptography; the library owns every
challenge/signature/origin/RP-ID check.

- **RP ID / RP name / allowed origins** are resolved server-side only (`config/webauthn.js`, from
  `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_NAME`/`WEBAUTHN_ORIGIN`) — never trusted from the browser or request body.
- **Registration**: `generateRegistrationChallenge` excludes the user's already-registered credentials
  (`excludeCredentials`) so the same authenticator can't be registered twice; the challenge is stored
  server-side (`webauthn_challenges`, purpose `REGISTRATION`, TTL-bound) and consumed exactly once
  (`consumeChallenge`). `verifyRegistration` re-checks the stored challenge, delegates the actual
  cryptographic verification to `verifyRegistrationResponse`, and stores only the public key + counter
  (`webauthn_credentials`) — **no private key ever exists server-side**, by construction of the WebAuthn
  protocol itself.
- **Authentication**: same challenge-consume-once pattern (purpose `AUTHENTICATION`). The credential is
  looked up by the id the browser presents and its ownership is re-checked (`credentialRow.user_id ===
  user.id`) before verification — a stranger's credential id can never authenticate a different account.
- **Counter-rollback rejection**: a stored counter that doesn't strictly increase (except the documented
  both-zero case some platform authenticators use) is treated as a possible cloned credential and rejected —
  `domain/mfa/counterRollback.js#isCounterRollback` (pure, unit-tested: `counterRollback.test.js`), wired into
  `webauthn.service.js#verifyAuthentication`.
- **Multiple credentials / revocation**: a user can hold any number of active passkeys
  (`webauthn_credentials`, one row each); `revokeCredentialForUser` re-verifies ownership before revoking.

### TOTP (fallback)

Justified because WebAuthn requires a browser/platform capable of it; TOTP is the universally-supported
fallback every real-world MFA system offers alongside passkeys. `otplib` v13's functional API owns every
cryptographic operation (secret generation, code generation, constant-time verification) — nothing here
reimplements HOTP/TOTP math.

- **Secret storage**: AES-256-GCM (`domain/mfa/totpCrypto.js`, pure/unit-tested — encrypt/decrypt round-trip,
  tamper detection on a flipped ciphertext or auth-tag byte, wrong-key rejection), keyed by
  `MFA_ENCRYPTION_KEY` (32 bytes, base64; validated at boot in `validateEnv.js`) — never Base64-only "at
  rest," and never the same key class as a password hash (this is reversible-by-design, since the
  application must present a live 6-digit challenge, unlike a password).
- **Enrollment is two-phase**: `enrollTotp` stores a *pending* (unverified) secret and returns a QR code;
  `verifyAndActivateTotp` requires one correct code before the row is marked `verified_at` and counts as an
  active factor. An abandoned QR scan never becomes an active factor.
- **Replay guard**: `last_verified_step` records the TOTP time-step the most recently accepted code
  consumed; `domain/mfa/replayGuard.js#isReplayedStep` (pure, unit-tested) rejects a second use of the exact
  same step, on top of otplib's own clock-drift window tolerance (which alone only handles drift, not
  intentional reuse).
- **Rate limiting**: `mfaVerifyLimiter` (10/15min, keyed by `user.id`) on every verification endpoint.
- **Never logged**: TOTP secrets, codes, or recovery codes never appear in any log line.

### Recovery codes

10 cryptographically random codes (`crypto.randomInt`, same CSPRNG already used for OTP generation —
`domain/otpAuth/otp.js`), SHA-256 hashed at rest (`mfa_recovery_codes.code_hash`), shown to the user exactly
once at generation time, each single-use (`consumeMatchingCode` marks `used_at`). Regenerating invalidates
every previously issued code (a full `replaceCodesForUser`, not an append). Never logged.

## Privileged session state

`sessions.mfa_verified_at` (a column on the existing table, not a separate table) — this gives session
binding "for free": it's read as part of the same row `requireAuth` already fetches to authenticate the
request, so there is no second query and no way for MFA-verified state to apply to any session other than
the one that actually completed the ceremony.

- **Freshness TTL**: `MFA_VERIFIED_TTL_MINUTES`, default 15 minutes
  (`mfaState.service.js#getMfaVerifiedTtlMs`) — long enough that a Ground Owner doing a batch of related
  actions doesn't re-verify every request, short enough that a session left open on a shared machine doesn't
  stay privileged indefinitely. The exact boundary is a half-open interval (`now - verifiedAt < ttl`,
  strictly less-than) — unit-tested at exactly-the-boundary, one second before, and one second after
  (`domain/mfa/verificationFreshness.test.js`).
- **Baseline verification** (`POST /auth/mfa/verify`) re-proves an already-enrolled factor (WebAuthn, TOTP,
  or a recovery code) and sets `mfa_verified_at = NOW()` on the current session. It never enrolls a new
  factor.

## Step-up — short-lived, single-use, action-scoped

A second, independent layer on top of the standing MFA-verified session, for mutations judged high-leverage
enough to warrant proving presence again, right before the action, not just "sometime in the last 15
minutes."

**Evidence-based list** — not "every action.” Built by inspecting the actual codebase for what is genuinely a
privilege-granting or hard-to-reverse mutation, not a hypothetical worst case:

| Scope | Action | Why |
|---|---|---|
| `WEBAUTHN_ADD` | Add a 2nd+ passkey | Universal factor-management (bootstrap enrollment is the sole exception) |
| `WEBAUTHN_REMOVE` | Remove any passkey | ″ |
| `TOTP_ENABLE` | Enable TOTP | ″ |
| `TOTP_DISABLE` | Disable TOTP | ″ |
| `RECOVERY_CODES_REGENERATE` | Regenerate recovery codes | ″ |
| `MFA_DISABLE` | Disable MFA entirely (Ground Owner only, see below) | ″ |
| `STAFF_CREATE` | `POST /staff` (Super Admin) | Creates a brand-new privileged platform account |
| `PERMISSION_GRANT` | Grant a staff permission (Ground Owner) | Escalates a staff member's capability |
| `STAFF_DISABLE` | Disable a staff membership (Ground Owner) | Locks a person out |

**Deliberately NOT gated** (negative space, verified by dedicated regression tests): permission *revoke*,
`createGroundStaff` (creating a brand-new, zero-permission staff account), `reject`/`request-information` on
ground-owner-requests — every one of these reduces or stalls privilege rather than granting it.

**`GROUND_OWNER_REQUEST_APPROVE` (2026-08-24, project owner's explicit request)** — `POST
/ground-owner-requests/:id/approve` (`groundOwnerRequest.service.js#approveRequest`) is intentionally exempt
from step-up, permanently, independent of the global enforcement bypass above. `requireStaffRole('super_admin')`
on the route (`groundOwnerRequest.routes.js`) remains the authorization boundary. `'GROUND_OWNER_REQUEST_APPROVE'`
is still a recognized value in `domain/mfa/actionScopes.js#STEP_UP_ACTION_SCOPES` (harmless — nothing requests a
grant for it anymore); the enforcement was removed at its one call site, not from the scope registry.

### Mechanics

```
POST /auth/step-up/options   { actionScope }
  -> already has a fresh, unused grant for this (session, actionScope)? return { alreadyGranted: true }
  -> otherwise: a real WebAuthn/TOTP challenge, same mechanics as baseline verify

POST /auth/step-up/verify    { actionScope, method, response|code }
  -> re-verifies against an EXISTING enrolled factor (never enrolls a new one)
  -> inserts a step_up_grants row, TTL = STEP_UP_TTL_MINUTES (default 5 min)

Gated mutation's own service function, as the FIRST statement inside its
own existing BEGIN/COMMIT transaction:
  UPDATE step_up_grants SET used_at = NOW()
  WHERE session_id = $1 AND action_scope = $2 AND used_at IS NULL AND expires_at > NOW()
  RETURNING *
  -> zero rows: throw StepUpRequiredError, existing ROLLBACK path runs,
     controller maps to 403 { code: 'STEP_UP_REQUIRED' }
```

This exact WHERE-guarded-`UPDATE` pattern already existed in this codebase
(`groundOwnerRequest.model.js#markApprovedIfEligible`, Phase 4) and is reused, not invented, here
(`models/stepUpGrant.model.js#consumeGrant`).

**Consumption happens inside the mutation's own transaction, never a separate middleware pass.** A
middleware-based "consume-then-call-next()" design would create a TOCTOU gap: the grant could be consumed
successfully but the mutation itself could still fail or never run, silently burning a step-up grant for
nothing, or (worse) succeeding out of sync with what was actually authorized. Consuming as the transaction's
first statement means a rollback of the mutation also rolls back the consumption — one atomic unit.

`step_up_grants` has a partial unique index on `(session_id, action_scope) WHERE used_at IS NULL` — at most
one *active* grant per session per scope at a time, which is also the index the consuming `UPDATE` and the
`hasFreshStepUpGrant` check use.

## Factor removal / MFA disable

- **Last-factor-removal protection**: before revoking a passkey or disabling TOTP,
  `mfaEnrollment.service.js#assertNotRemovingLastFactor` checks whether doing so would leave the user with
  zero active factors and blocks with `409 LAST_FACTOR_REMOVAL_BLOCKED` if so. (This function had a real bug
  during development — see "Known limitations" below for how it was found and fixed.)
- **Super Admin MFA cannot be self-disabled.** `POST /auth/mfa/disable` unconditionally rejects a Super
  Admin caller with `403 MFA_DISABLE_NOT_ALLOWED` — a hard controller-level check, not merely a stronger
  step-up requirement. **This is the deliberately chosen safer architecture**: Super Admin is the platform's
  single highest-privilege role, and a self-service disable path (even step-up-gated) means a compromised,
  already-MFA-verified session could permanently strip the account's own MFA. Recovery for a Super Admin who
  has genuinely lost every factor is an out-of-band operation (direct database intervention by another
  operator) — not exposed as an API endpoint, consistent with Super Admin having no public signup or
  self-service creation path either.
- **Ground Owner CAN disable MFA entirely** (step-up-gated, `MFA_DISABLE` scope) — wipes every WebAuthn
  credential, disables TOTP, and regenerates-then-discards recovery codes (invalidating all of them). Forces
  re-enrollment the next time a privileged action is attempted. Also revokes every other session for that
  user (see below) — a plausible reason to disable MFA is "I lost my phone/key," and an attacker holding a
  different still-open session must not benefit from the legitimate owner's own cleanup action.

## Session revocation after security-sensitive changes

`revokeAllSessionsForUserExceptCurrent(userId, currentSessionId)` — a new function, distinct from the
pre-existing `revokeAllSessionsForUser` (which would revoke the *acting* session too, self-locking the user
mid-action). Triggered after: passkey removal, TOTP disable, MFA disable entirely. **Not** triggered by
routine Phase 5 permission grants/revokes, which are unrelated to authentication factors and already take
effect immediately without needing a session reset (`docs/AUTHORIZATION.md`).

## Rate limiting

Reuses the existing `middlewares/rateLimit.js#makeLimiter` factory — no new abstraction, no premature Redis.
Three new limiters, all keyed by `user.id` (via `express-rate-limit`'s `ipKeyGenerator` helper as the
IP-based fallback, avoiding an IPv6-validation error the library raises against a naive custom key
generator): `mfaVerifyLimiter` (10/15min — ceremony/verification attempts, the tightest, since this is what
an attacker guessing codes or replaying a response would hit), `mfaManageLimiter` (20/15min — enrollment/
options/disable/regenerate), `stepUpLimiter` (15/15min).

## Audit events

18 new `account_audit_log.event_type` values (widened via the existing idempotent
drop-and-recreate-constraint pattern, `schema.sql`): `PASSKEY_REGISTERED`, `PASSKEY_REVOKED`,
`PASSKEY_AUTHENTICATION_SUCCESS`, `PASSKEY_AUTHENTICATION_FAILURE`, `TOTP_ENABLED`, `TOTP_DISABLED`,
`TOTP_VERIFICATION_SUCCESS`, `TOTP_VERIFICATION_FAILURE`, `MFA_ENROLLMENT_STARTED`,
`MFA_ENROLLMENT_COMPLETED`, `MFA_DISABLED`, `MFA_RECOVERY_STARTED`, `MFA_RECOVERY_COMPLETED`,
`STEP_UP_REQUESTED`, `STEP_UP_SUCCEEDED`, `STEP_UP_FAILED`, `SESSION_REVOKED_FOR_SECURITY_REASON`. Never
logs a secret, code, or recovery code value — only structured metadata (method, action scope, credential id,
reason).

## Database changes (additive only)

- `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ` (also hand-added to
  `prisma/schema.prisma`'s `model sessions`, per the existing Phase 2A "raw-SQL-table, Prisma stays aware of
  columns other code reads via Prisma" convention).
- Five new raw-SQL tables (deliberately not Prisma-modeled, consistent with every other Phase 4/5 table that
  needs cross-table transactional atomicity with a raw `pg` client): `webauthn_credentials`,
  `webauthn_challenges`, `totp_credentials`, `mfa_recovery_codes`, `step_up_grants`.
- `account_audit_log.event_type` CHECK widened (idempotent constraint drop/recreate, existing pattern).

No destructive statement anywhere. `users`/`sessions`/`account_audit_log` row counts were snapshotted before
and after migration and were identical.

## API endpoints (mounted at `/api/auth`, all `requireAuth`-gated)

| Method & Path | Notes |
|---|---|
| `GET /mfa/status` | `{ mfa: {enrolled, required, verified}, passkeys, totpEnabled, recoveryCodesRemaining }` |
| `POST /mfa/webauthn/register/options` | Generates a registration challenge |
| `POST /mfa/webauthn/register/verify` | Bootstrap-or-step-up-gated (`WEBAUTHN_ADD`) |
| `DELETE /mfa/webauthn/:credentialId` | Step-up-gated (`WEBAUTHN_REMOVE`), last-factor-protected |
| `POST /mfa/totp/enroll` | Returns a QR code; not yet an active factor |
| `POST /mfa/totp/verify` | Activates a pending enrollment (bootstrap-or-step-up-gated, `TOTP_ENABLE`) |
| `POST /mfa/totp/disable` | Step-up-gated (`TOTP_DISABLE`), last-factor-protected |
| `POST /mfa/recovery-codes/regenerate` | Step-up-gated (`RECOVERY_CODES_REGENERATE`) |
| `POST /mfa/disable` | Ground Owner only (403 for Super Admin), step-up-gated (`MFA_DISABLE`) |
| `POST /mfa/verify/options` | Baseline MFA challenge |
| `POST /mfa/verify` | Baseline MFA verification — sets `sessions.mfa_verified_at` |
| `POST /step-up/options` | `{ actionScope }` — short-circuits if a fresh grant already exists |
| `POST /step-up/verify` | `{ actionScope, method, response\|code }` — issues the grant |

`GET /auth/me` gained a new top-level `mfa: {enrolled, required, verified}` key alongside the **unchanged**
`user` key.

## Testing

- **Unit** (`domain/mfa/*.test.js`, pure functions, `node --test`): `verificationFreshness.test.js` (TTL
  boundary — one second before/at/after expiry), `replayGuard.test.js` (TOTP step replay), `totpCrypto.test.js`
  (AES-256-GCM round-trip, tamper detection on ciphertext/auth-tag, wrong-key rejection),
  `counterRollback.test.js` (WebAuthn counter-rollback predicate).
- **Integration** (`tests/integration/mfa.integration.test.js`, `stepUp.integration.test.js`, real HTTP + real
  Postgres, real TOTP ceremonies via `otplib`'s `generate()` against the real decrypted secret — genuinely
  waiting out real 30-second time-steps to avoid the application's own replay guard, not mocking around it):
  bootstrap enrollment succeeds with no step-up; a second factor-management mutation without step-up is
  rejected; last-factor removal is blocked even with a valid step-up grant; baseline verify sets/rejects
  correctly; legacy-JWT Super Admin hitting an MFA-gated route gets a clean `403 MFA_REQUIRED`, never a crash;
  each of the non-universal step-up scopes (`STAFF_CREATE`, `PERMISSION_GRANT`, `STAFF_DISABLE`) is gated
  independently of the others (`GROUND_OWNER_REQUEST_APPROVE` was removed from this set 2026-08-24 — see above);
  concurrent double-consumption of
  one step-up grant resolves to exactly one success; the negative-space guarantees (revoke, plain staff
  creation) genuinely require no step-up.
- **Regression fixture note**: every pre-existing (pre-Phase-6) integration test that authenticates as a
  Super Admin/Ground Owner to set up preconditions for *unrelated* functionality now uses
  `tests/integration/helpers/mfaFixtures.js#mintMfaVerifiedSessionCookie` — a real session row
  (`session.service.js#createSessionForUser`), a real signed cookie (the same `cookie-signature` library +
  secret `express`'s own `res.cookie(..., {signed:true})` uses), with `mfa_verified_at` set directly rather
  than run through a real ~30-second TOTP ceremony. This is the same class of shortcut those tests already
  take by inserting a `staff_role_id=1` row directly via SQL instead of running a real promotion ceremony —
  the ceremony itself is exercised for real only in `mfa.integration.test.js`/`stepUp.integration.test.js`.
  `mintStepUpGrant` is the equivalent direct shortcut for tests whose gated action also needs a step-up
  grant.

## Known limitations

- **Full WebAuthn ceremony testing ceiling.** A real WebAuthn registration/authentication ceremony needs
  browser-native asymmetric cryptography and platform authenticator APIs that a plain HTTP integration test
  cannot produce. The server-side verification *logic* is fully exercised (challenge lifecycle, ownership
  checks, counter-rollback rejection — unit-tested directly), but an end-to-end "browser creates a real
  passkey, server accepts it" ceremony was not run in this environment. The intended path for that is
  Playwright's Chrome DevTools Protocol virtual-authenticator support
  (`context.newCDPSession(page)` → `WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator`) once the Security
  Settings frontend exists — see the Phase 6 final report for exactly what was and wasn't verified this way.
- **Hardware factor loss / physical device testing** (a real lost phone, a real hardware key) cannot be
  simulated in this environment at all — only the software-observable consequences (last-factor blocking,
  recovery-code consumption) are tested.

## Residual risks (explicitly not "solved," carried forward deliberately)

- A compromised, already-privileged, already-MFA-verified session within its 15-minute freshness window can
  still perform any non-step-up-gated action — this is the deliberate cost of not re-verifying on every
  single request; the step-up list exists specifically to shrink the blast radius for the highest-leverage
  actions.
- Recovery-code-based baseline verification is intentionally as strong as the codes' own generation/storage
  (CSPRNG, hashed, single-use) but is a lower-friction factor than WebAuthn/TOTP by nature — a leaked
  unused recovery code is a real MFA bypass for whoever holds it, same as any recovery-code system.
- Super Admin's non-disableable-MFA design trades self-service recovery convenience for the stronger
  guarantee that a compromised Super Admin session alone cannot permanently strip the account's own MFA —
  explicitly chosen as the safer trade-off, not a gap.
