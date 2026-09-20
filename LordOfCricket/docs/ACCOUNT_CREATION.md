# Account Creation & Onboarding (Phase 4)

## Overview

Phase 3 gave LOC one unified OTP login/find-or-create entry point. Phase 4 answers a narrower question:
**who is allowed to create which account, under what conditions**, for all 5 target roles — without
implementing full RBAC (Phase 5) or MFA (Phase 6).

| Role | How the account is created |
|---|---|
| PLAYER | Self-registers: `POST /auth/register/player` + `POST /auth/verify-otp` |
| UMPIRE | Self-registers: `POST /auth/register/umpire` + `POST /auth/verify-otp` (also auto-creates a pending `umpire_requests` row) |
| GROUND_OWNER | Submits a request (`POST /grounds`, or directly `POST /ground-owner-requests`); a Super Admin approves it |
| STAFF (ground-scoped) | Created by the Ground Owner of a specific ground: `POST /ground-owner/grounds/:id/staff` |
| SUPER_ADMIN | Never publicly creatable — no endpoint accepts or honors a client-supplied role/staff_role_id |

## The bug this phase fixes

Before Phase 4, `POST /grounds` created an ACTIVE-bound `grounds` row **and** granted the submitter
`GROUND_OWNER` membership immediately, before any Super Admin review — a self-serve registration was
functionally equivalent to self-approval. `GET/PATCH /ground-review` (the old admin queue) has been retired;
`POST /grounds` is now a thin, requireAuth-preserving repoint into the new request/approval flow below, and
no ground or membership exists until a Super Admin actually approves.

## Player / Umpire registration

Both reuse Phase 3's OTP infrastructure end-to-end — there is no second verification endpoint:

```
POST /auth/register/player   { name, identifier }   (public)
POST /auth/register/umpire   { name, identifier }   (public)
  -> otpAuthService.requestRegistrationOtp(name, identifier, purpose)
     - 409 IDENTIFIER_ALREADY_REGISTERED if a real user already exists for this identifier
       (points them to /auth/send-otp instead — unlike send-otp, this DOES reveal registration
       status, which the brief requires for a dedicated registration endpoint)
     - otherwise requests an OTP with purpose=REGISTER_PLAYER/REGISTER_UMPIRE, staging { name }
       in otp_codes.metadata (read back once the code is verified)

POST /auth/verify-otp   { identifier, code }   (existing endpoint, unchanged path/shape)
  -> otpAuthService.verifyLoginOtp branches on the verified OTP row's `purpose`:
     LOGIN            -> unchanged Phase 3 find-or-create bare user
     REGISTER_PLAYER  -> create user (role='player', player_type='team_player', name=<staged>).
                         Re-checks for a race-created duplicate first; if one exists, logs in
                         instead of erroring — this is the SAME identifier only a moment later.
     REGISTER_UMPIRE  -> create user (role='player', player_type='umpire', name=<staged>), PLUS
                         auto-create a pending umpire_requests row — the exact existing
                         selectPlayerType('umpire') behavior (auth.controller.js), reused rather
                         than reimplemented, so match_umpire_slots/umpire_proposals/live
                         assignment logic is completely untouched.
  Session creation, cookie, response shape: identical to a normal OTP login.
```

`PLAYER_REGISTERED`/`UMPIRE_REGISTERED` audit events fire only when a new account is actually created (not
on the race-duplicate branch, to avoid misrepresenting a login as a registration).

## Ground Owner request + approval

New table `ground_owner_requests` (raw SQL, not Prisma — see below), status
`PENDING → UNDER_REVIEW → APPROVED | REJECTED | MORE_INFORMATION_REQUIRED`:

```
POST /grounds                                              (requireAuth) -> repoints into submitRequest,
                                                             using the session user as applicant
POST /ground-owner-requests                                 (public, no login) -> submitRequest directly
GET  /ground-owner-requests/status/:publicRequestId         (public) -> { status, rejectionReason (if
                                                             REJECTED), moreInfoNotes (if
                                                             MORE_INFORMATION_REQUIRED) } — never reviewed_by
GET  /ground-owner-requests                                 (super_admin) -> list, ?status= filter
GET  /ground-owner-requests/:publicRequestId                (super_admin) -> full detail; auto-transitions
                                                             PENDING -> UNDER_REVIEW on first view
POST /ground-owner-requests/:publicRequestId/approve        (super_admin) -> the transactional core, below
POST /ground-owner-requests/:publicRequestId/reject         (super_admin) -> { reason } required
POST /ground-owner-requests/:publicRequestId/request-information (super_admin) -> { notes } required
```

**Approval transaction** (`groundOwnerRequest.service.js#approveRequest`, one `pg` `client` from
`BEGIN` to `COMMIT`):

1. `markApprovedIfEligible` — a single `UPDATE ... WHERE status IN ('PENDING','UNDER_REVIEW',
   'MORE_INFORMATION_REQUIRED')` guard. Zero rows updated means the request was already decided
   (or never existed) — this is the entire concurrency guard: two simultaneous approve calls can never both
   win, by construction, with no separate locking needed.
2. Find-or-create the applicant's user account (`models/user.model.js#findUserByIdentifier`/
   `createUserFromOtp` — the exact same functions Phase 3 built for OTP login).
3. Create the `grounds` row (status `ACTIVE`) via the existing `ground.model.js#createGround`, unchanged.
4. `createMembership({ role: 'GROUND_OWNER' })` via the existing `groundUser.model.js`, unchanged.
5. Re-`UPDATE` the request with `created_ground_id`.
6. Record `GROUND_OWNER_APPROVED` in `account_audit_log`.

If step 2, 3, or 4 throws, the whole transaction rolls back — the request is left exactly as it was before
step 1 ran (verified directly: a forced failure injected between steps 1 and 3 leaves the request back at
`PENDING`, `created_ground_id`/`reviewed_by` both `null`, no orphan `grounds` row).

**Why `ground_owner_requests`/`account_audit_log` are raw SQL, not Prisma** (a deliberate deviation from
Phase 2A/3's "new table → Prisma" default, documented in both models' file headers): the approval
transaction must atomically touch `users`/`grounds`/`ground_users` (raw `pg` Pool) **and** these two tables
in one transaction. Prisma and the raw `pg` Pool are separate connections — true cross-table atomicity
requires using one access pattern consistently for every write in the transaction, not mixing. Consistency
won out over the general convention.

## Ground-scoped Staff

Distinct from the pre-existing **global platform staff** (`users.staff_role_id → staff_roles`:
`super_admin | admin | canteen_staff`, created via `POST /staff`, completely untouched by this phase).
Ground-scoped staff activates a part of the schema that already existed but was dormant:
`ground_users.role` already allowed `GROUND_ADMIN`/`CANTEEN_STAFF` as valid values before Phase 4 — no new
table, no new column.

```
POST /ground-owner/grounds/:publicGroundId/staff   (requireAuth, requireGroundRole('GROUND_OWNER'))
GET  /ground-owner/grounds/:publicGroundId/staff   (requireAuth, requireGroundRole('GROUND_OWNER'))
```

`requireGroundRole('GROUND_OWNER')` (pre-existing, `middlewares/groundAccess.js`) resolves `:publicGroundId`
and verifies a real `ground_users` row — a Staff member, another owner's ground, or a plain Player are all
rejected with 403 before the controller ever runs; `ownerId`/`groundId` are never trusted from the client.

Find-or-create by identifier: if an account already exists for the given email/phone, its `users.role` is
**never changed** (a Player's identity is never silently overwritten to `staff`) — only a new `ground_users`
membership is added. A genuinely new identifier creates a fresh user with `role='staff'`,
`staff_role_id=NULL` (so the *platform* `requireStaffRole` gate never matches a ground-scoped staff member —
their access comes entirely from `requireGroundRole`, an unrelated, pre-existing primitive). Creating the
same person with the same role at the same ground twice is rejected (`23505` unique-violation mapped to
`IDENTIFIER_ALREADY_REGISTERED`), not silently duplicated.

**No invitation token was built.** A newly-created staff member's very first OTP login
(`/auth/send-otp` + `/auth/verify-otp`, unchanged) finds their pre-created account through Phase 3's existing
find-or-create-by-identifier path and logs them straight into their pre-configured identity — the
"invited, then onboards" outcome falls out of existing infrastructure for free.

## Super Admin

No endpoint — public or authenticated — accepts a `role`/`staffRoleId`/`staff_role_id` field from the
client anywhere in this phase's surface. `POST /auth/register/player` and `/register/umpire` only ever
read `{ name, identifier }`; extra body fields are silently ignored, not honored (verified directly: sending
`role: 'staff', staffRoleId: 1` alongside a registration produces an ordinary Player account). The existing
super-admin-only `POST /staff` (platform staff) is the only account-creation path with elevated roles, and it
was not touched by this phase.

## Audit events

`services/accountAudit.service.js` (thin wrapper over `models/accountAuditLog.model.js`, raw SQL for the
same cross-table-transaction reason as above) fires exactly 8 named events, each carrying only
already-public-shape data (name, identifier type, ground name, request id) — never an OTP value, password
hash, session token, or provider credential:

`PLAYER_REGISTERED`, `UMPIRE_REGISTERED`, `GROUND_OWNER_REQUEST_SUBMITTED`,
`GROUND_OWNER_REQUEST_REVIEW_STARTED`, `GROUND_OWNER_APPROVED`, `GROUND_OWNER_REJECTED`,
`GROUND_OWNER_MORE_INFO_REQUESTED`, `STAFF_CREATED`.

## Minimal authorization added (not full RBAC)

- `/ground-owner-requests` approve/reject/request-information: `requireAuth`, `requireStaffRole('super_admin')`
  (pre-existing primitive).
- `/ground-owner/grounds/:id/staff` (both methods): `requireAuth`, `requireGroundRole('GROUND_OWNER')`
  (pre-existing primitive).
- `/auth/register/player`, `/auth/register/umpire`, `POST /ground-owner-requests`: public, no auth — the
  applicant is never required to be logged in to apply.

No new authorization primitive, permission matrix, or role hierarchy was introduced — everything above
composes primitives Phase 9 (`requireGroundRole`) and the pre-existing `requireStaffRole` already provided.

## Deliberately deferred

- **Full RBAC / granular staff permissions / permission-assignment UI** — Phase 5.
- **MFA / Passkeys / WebAuthn / TOTP** — Phase 6.
- **Legacy JWT removal** — still not started; see `docs/AUTH.md`'s deprecation checklist, unaffected by
  this phase.

## Known limitation

`requestRegistrationOtp`'s pre-check (409 if the identifier already belongs to a real user) and the actual
account creation at verify-time are not atomic with each other — a second registration attempt for the same
identifier in the few-hundred-millisecond gap between them will not see the first attempt's account yet
(it doesn't exist until OTP verification succeeds). `verifyLoginOtp` re-checks for this race directly before
creating an account and falls back to an ordinary login for the now-real account rather than erroring or
double-creating — verified directly via automated test. This is intentionally the same class of
best-effort-early-check-plus-authoritative-late-check pattern the identifier-uniqueness constraint on
`users.email`/`users.phone` ultimately backstops.
