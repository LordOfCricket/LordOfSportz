# Authorization (Phase 5 — RBAC & Granular Staff Permissions)

> **Phase 6** (`docs/MFA.md`) added mandatory MFA for SUPER_ADMIN/GROUND_OWNER, checked *after* every
> decision this document describes, never instead of it. `requireGroundRole`/`requireGroundPermission`'s
> Super-Admin-bypass and GROUND_OWNER branches gained an `req.mfaVerified` check; the Staff
> (permission-grant) branch below is untouched — MFA is not mandatory for Staff. MFA verification is
> per-session, not per-ground (see `docs/MFA.md`), and never grants any additional role or permission — an
> MFA-verified Staff member (if such a thing existed) would still be denied by every check in this document
> exactly as before.
>
> **Phase 7** ran a targeted IDOR audit against every nested ground-scoped resource (staff membership ids,
> match/slot/proposal ids, canteen ids) described in this document, confirming the ownership
> re-verification pattern below holds under adversarial testing — see `docs/SECURITY.md`. Two real gaps
> were found in the older, pre-multi-ground `ground_photos`/`amenities` admin routes (not covered by this
> document's ground_users model) and fixed there.

## Overview

Authentication (Phase 3, `docs/AUTH.md`) answers "who are you." Authorization answers "what are you allowed
to do" — a deliberately separate concern, never merged into `otp.service.js`/`otpAuth.service.js`/
`session.service.js`. This phase gives ground-scoped Staff (`GROUND_ADMIN`/`CANTEEN_STAFF`, created in
Phase 4) something to actually **do**: a Ground Owner can grant specific staff members specific capabilities
on their own ground, enforced server-side, with no cross-ground/cross-owner leakage and no
privilege-escalation path.

```
Authenticated user (Phase 3)
      ↓
Role (users.role / staff_role_id / ground_users.role)
      ↓
Permission (staff_permissions, ground-scoped, staff only — Owner/Super Admin bypass)
      ↓
Resource ownership (ground_users membership, re-verified per action — never trusted from a client id)
      ↓
ALLOW / DENY
```

## Final role model

| Role | Where it lives | Scope |
|---|---|---|
| SUPER_ADMIN | `users.role='staff'`, `staff_role_id → 'super_admin'` | Platform-wide. Bypasses every ground-scoped check unconditionally (see "Super Admin" below). |
| GROUND_OWNER | `ground_users.role='GROUND_OWNER'` | Full implicit access to their own ground(s) only. Never a granted permission — ownership itself is the grant. |
| STAFF (ground-scoped) | `ground_users.role IN ('GROUND_ADMIN','CANTEEN_STAFF')` | Only what's explicitly granted via `staff_permissions`, only on the ground(s) they're a member of. |
| UMPIRE | `users.role='player'`, `player_type='umpire'`, approval via `umpire_requests` | Unrelated to `ground_users` entirely — see "Umpire" below. |
| PLAYER | `users.role='player'`, `player_type='team_player'` | Their own resources + public reads. Never reaches an admin/staff/owner controller. |

Platform staff (`users.staff_role_id → staff_roles`) and ground-scoped staff (`ground_users.role`) are two
separate, pre-existing systems (Phase 1 audit) — this phase does not merge them. `ground_users.role` also
allows `'UMPIRE'`/`'SCORER'` values in its CHECK constraint, but both are **confirmed dead**: no code path
in this phase (or any prior phase) creates a row with either value. Real umpire/match association lives
entirely in `match_umpire_slots`/`umpire_proposals`, untouched.

## Permission catalog

Four permissions, chosen from `groundOwner.routes.js`'s actual surface — not the larger illustrative catalog
a generic RBAC brief might suggest. Default-deny throughout: a `ground_users` row alone grants nothing to a
Staff member, not even read access — an explicit grant is always required.

| Key | Covers |
|---|---|
| `MATCH_VIEW` | List matches; view umpire-slots detail, umpire-history, recommended-umpires, umpire-operations-summary, incidents, proposals list |
| `MATCH_MANAGE` | Create a match; start; complete; set umpire fee; set payment status |
| `UMPIRE_MANAGE` | Mark no-show; view eligible-replacements; assign replacement; propose umpire; cancel proposal |
| `STAFF_VIEW` | List staff for the ground |

**Staff creation, and every permission grant/revoke/disable action, are hardcoded `GROUND_OWNER`-only and
never delegable** — not part of the assignable catalog at all. A generic RBAC brief's example catalog often
includes something like `STAFF_PERMISSIONS_MANAGE` as an assignable permission; this is deliberately
excluded here, because delegating it would reopen the exact "a staff member modifies another staff member's
permissions" escalation path that must stay closed unconditionally, not "unless granted." This also means
most privilege-escalation scenarios are closed **structurally** (staff can never reach those routes at all,
regardless of what they hold) rather than by a runtime role check that could have a bug.

## Ground ownership & staff isolation

Reuses the existing `ground_users` architecture (Phase 9) rather than inventing a parallel one, per the
audit's own recommendation. A permission grant (`staff_permissions.ground_user_id`) is a foreign key
directly to a `ground_users` row — a grant is structurally impossible without an existing membership, and a
membership is always scoped to exactly one ground. There is no way to hold a permission "in general"; every
grant is inherently ground-scoped.

```
Owner A
 ├── Ground A
 │     ├── Staff Rahul  (MATCH_VIEW, MATCH_MANAGE)
 │     └── Staff Amit   (STAFF_VIEW only)
 └── Ground A2
       └── Staff Suresh (MATCH_VIEW)

Owner B
 └── Ground B
```

- Owner A: Ground A → ALLOW, Ground A2 → ALLOW, Ground B → DENY (403).
- Staff Rahul: Ground A → ALLOW for MATCH_VIEW/MATCH_MANAGE, DENY for UMPIRE_MANAGE/STAFF_VIEW (never
  granted); Ground A2 → DENY entirely (no membership there at all, regardless of grants on Ground A).
- Owner B can never touch Ground A/A2's staff, permissions, or resources — enforced by
  `requireGroundRole`/`requireGroundPermission` resolving membership from `req.user.id` + the URL's ground,
  never a client-supplied id.

## Middleware architecture

```
Route
 ↓
requireAuth              (Phase 3 — session cookie or legacy JWT, unchanged)
 ↓
requireGroundPermission(key)   OR   requireGroundRole('GROUND_OWNER')   (this phase / Phase 9)
 ↓
Controller (thin)
 ↓
Service (business rules, transactions)
 ↓
Model (raw SQL)
 ↓
PostgreSQL
```

`server/src/middlewares/groundAccess.js#requireGroundPermission(permissionKey)` — new this phase, additive
alongside the existing `requireGroundRole` (untouched):

1. Resolve `:publicGroundId` → 404 if it doesn't exist (never reveals whether the id format is even valid vs.
   real-but-not-owned — a 404 either way).
2. Super Admin → bypass entirely, `next()`.
3. Resolve the caller's own `ground_users` membership for this ground (`GROUND_OWNER`/`GROUND_ADMIN`/
   `CANTEEN_STAFF` only — the dead `'UMPIRE'`/`'SCORER'` roles are never matched). No membership → 403.
4. `GROUND_OWNER` → full implicit access, `next()`.
5. Otherwise (Staff) → check `staff_permissions` for an ACTIVE grant of `permissionKey` on this specific
   membership row. No grant → 403 (same generic message as step 3 — never reveals *which* reason applied).

Sets `req.ground`/`req.groundMembership` identically to `requireGroundRole`, so every existing
controller/service downstream (`groundOwner.service.js`, `groundStaff.service.js`,
`umpireProposal.controller.js` — none of which read `req.groundMembership`, only `req.ground`) is unaffected
by the swap. Query cost: 0 queries for Super Admin, 1 for an Owner, 2 for Staff (membership lookup + one
indexed partial-unique lookup) — no N+1, since this runs once per request, not once per row.

`requireGroundRole('GROUND_OWNER')` (unchanged) still gates staff creation and every
grant/revoke/disable/staff-list-mutation endpoint — these are never permission-gated, by design (see
"Permission catalog" above).

## Authorization services (models)

`server/src/models/permission.model.js` (raw SQL, not Prisma — see "Database changes" below):
`findPermissionByKey`, `listAllPermissions`, `hasActivePermission(groundUserId, permissionKey)` (the hot
path `requireGroundPermission` calls), `findActivePermissionsForGroundUserIds` (batched — the staff list
renders every row's grants in one query, not N+1), `grantPermission`, `revokePermission`.

`server/src/models/groundUser.model.js#findMembershipById` (new) — resolves a `ground_users` row by id with
**no authorization implied**; callers must independently verify `membership.ground_id === ground.id`
(the IDOR guard below). `setMembershipActive` (existing, previously unused by any controller) now accepts an
optional transaction `client`, reused for staff disable.

`server/src/services/groundStaff.service.js#resolveOwnedStaffMembership(ground, membershipId)` (new) — the
IDOR guard every grant/revoke/disable endpoint needs. `requireGroundRole('GROUND_OWNER')` only proves the
caller owns `:publicGroundId`; it says nothing about whether a client-supplied `:membershipId` belongs to
that ground. This function re-verifies `membership.ground_id === ground.id` (mirroring
`groundOwner.service.js`'s own `resolveOwnedMatch` pattern for matches) and additionally refuses to ever
target a `GROUND_OWNER` membership row, as defense-in-depth on top of the routing-level restriction.

## API authorization matrix

`server/src/routes/groundOwner.routes.js` (mounted at `/ground-owner`):

| Method & Path | Required |
|---|---|
| `GET /grounds` | `requireAuth` only (lists the caller's own owned grounds; filtered in the controller, no `:publicGroundId` yet to gate on) |
| `GET .../matches` | `MATCH_VIEW` |
| `POST .../matches` | `MATCH_MANAGE` |
| `GET .../matches/:id/umpire-slots` | `MATCH_VIEW` |
| `POST .../matches/:id/start` \| `/complete` | `MATCH_MANAGE` |
| `POST .../umpire-slots/:id/no-show` \| `/replace` \| `/propose`, `GET .../eligible-replacements`, `POST .../proposals/:id/cancel` | `UMPIRE_MANAGE` |
| `GET .../umpire-history` \| `/recommended-umpires` \| `/umpire-operations-summary` \| `/incidents` \| `/proposals` | `MATCH_VIEW` |
| `PATCH .../umpire-fee` \| `/payment-status` | `MATCH_MANAGE` |
| `GET .../staff` | `STAFF_VIEW` |
| `POST .../staff` | `GROUND_OWNER` (hardcoded, never delegable) |
| `GET /permissions/catalog` | `requireAuth` only (static reference data, not ground-scoped, not sensitive) |
| `POST .../staff/:membershipId/permissions` | `GROUND_OWNER` (hardcoded) |
| `DELETE .../staff/:membershipId/permissions/:key` | `GROUND_OWNER` (hardcoded) |
| `PATCH .../staff/:membershipId/disable` | `GROUND_OWNER` (hardcoded) |

Every non-`groundOwner.routes.js` route was reviewed and found either already correctly scoped or explicitly
out of scope — see "What this phase deliberately leaves unchanged" below.

## Database changes (additive only, raw SQL not Prisma)

Same reasoning as Phase 4's `ground_owner_requests`/`account_audit_log` (`docs/DATABASE.md`): granting or
revoking a permission must transact atomically with an `account_audit_log` insert, and Prisma + the raw
`pg` Pool are separate connections — one access pattern per transaction.

- **`permissions`** — the catalog (`id, key, description, is_active, created_at`), seeded with the 4 keys
  above via `INSERT ... ON CONFLICT (key) DO NOTHING`.
- **`staff_permissions`** — grants (`id, ground_user_id → ground_users, permission_id → permissions,
  granted_by, granted_at, revoked_at, revoked_by`). A partial unique index on `(ground_user_id,
  permission_id) WHERE revoked_at IS NULL` is both the "no duplicate active grant" guarantee and the index
  the hot authorization-check path uses — one indexed row lookup, never a scan. A revoked row is kept (not
  deleted), doubling as its own audit trail.
- **`account_audit_log.event_type`** widened (existing table, additive `ALTER`) with `PERMISSION_GRANTED`,
  `PERMISSION_REVOKED`, `STAFF_DISABLED`.

No destructive statement anywhere; row counts for `users`/`ground_users`/`account_audit_log` were snapshotted
before and after and are identical.

## Audit events

`PERMISSION_GRANTED`, `PERMISSION_REVOKED`, `STAFF_DISABLED` — `targetUserId` is the affected staff member,
`metadata: { groundPublicId, membershipId, permissionKey }` (omitted for `STAFF_DISABLED`), matching Phase
4's `STAFF_CREATED` shape exactly. Each write is one transaction (permission/membership row + audit row
together) — never a state where the permission changed but the audit entry didn't.

## Privilege escalation — how each scenario is closed

- **Staff → Owner / Super Admin, forged role**: `req.user` is always server-derived via `requireAuth` →
  `findUserById`; no route ever reads a role from the request body.
- **Staff self-grant / modifies another staff's permissions**: structurally impossible — grant/revoke/
  disable require `requireGroundRole('GROUND_OWNER')`, which only an Owner's own membership satisfies. Staff
  can never reach these routes regardless of any permission they hold.
- **Forged `membershipId` (cross-ground/cross-owner)**: closed by `resolveOwnedStaffMembership` — new code
  written this phase, not automatically provided by `requireGroundRole`.
- **Forged `permissionKey`**: closed by an explicit `findPermissionByKey` catalog lookup before any write —
  `"GROUND_OWNER"`/`"SUPER_ADMIN"` simply never resolves to a row (only the 4 catalog entries exist), 400s
  before touching `staff_permissions`.
- **Owner A → Owner B's ground**: both `requireGroundPermission` and `requireGroundRole` resolve membership
  from `req.user.id` + the URL's ground, never a body-supplied id.
- **Stale access after revoke/disable**: `hasActivePermission`/`findActiveMembershipForAnyRole` filter
  `revoked_at IS NULL`/`is_active = true` fresh on every request — nothing about role or permission is
  cached in the session or JWT, so a revoke/disable takes effect on the very next request, no re-login
  needed (verified directly, not just asserted — see Testing).

## Super Admin

Unconditional bypass of every ground-scoped check (`isSuperAdmin()` in `groundAccess.js`), exactly as it
already did before this phase for `requireGroundRole`. Still goes through the same transactions, validation,
and audit logging as every other actor — there is no separate "admin override" code path that skips
business rules; a Super Admin performing a Ground Owner action is indistinguishable, downstream of the
authorization check, from the Owner performing it themselves.

## Umpire

Entirely untouched by this phase. `match_umpire_slots`/`umpire_proposals`/`requireMatchScorerByParam`/
`requireMatchScorerByInnings` (`middlewares/matchScorerAccess.js`) govern umpire/scoring authorization, and
none of it depends on `ground_users` at all. The dead `'UMPIRE'`/`'SCORER'` `ground_users.role` CHECK values
are not reactivated anywhere in this phase's code — verified by grep, `createMembership`'s allowed-roles list
(`CREATABLE_GROUND_STAFF_ROLES` in `groundStaff.service.js`) only ever accepts `GROUND_ADMIN`/`CANTEEN_STAFF`.

## Player

Untouched. Players never reach `groundOwner.routes.js` or any staff/admin controller — verified in the
enforcement test matrix (a plain player with no `ground_users` membership at all is denied every
permission-gated route with 403, the same as an unpermissioned staff member).

## What this phase deliberately leaves unchanged (reviewed, not overlooked)

- **Canteen** (`canteenMenu.routes.js`/`canteenOrder.routes.js`) already correctly enforces ground-scoped,
  role-based staff access via `requireGroundCanteenRole`/`requireCanteenStaffAccess({groundRoles: [...]})`,
  which already lists `GROUND_ADMIN`/`CANTEEN_STAFF`. Not folded into the new permission system — it's
  already correctly scoped by role alone, and doing so would be scope creep for zero benefit.
- **`groundOps.routes.js`** (dashboard/reports/utilization/audit-log) and **`groundBooking.routes.js`**
  staff routes stay on the pre-existing coarse `requireRole('staff')` (any platform staff). Verified via
  direct read of `groundOps.controller.js` that its dashboard/report functions operate on `ground_bookings`,
  which has **no `ground_id` column at all** — ground-scoping either surface requires a schema migration
  (add + backfill `ground_id`), a resource-modeling change, not an authorization change. Documented in
  `docs/TECHNICAL_DEBT.md` as a known limitation, not fixed this phase.
- **`tournament.routes.js`, `team.routes.js` roster writes, `aiInsight.routes.js` regenerate** — coarse
  `requireRole('staff')`, predate ground-ownership as a concept, left untouched.
- **`requireScorer`** (`auth.js`) and **`requireCanteenRole`** (`groundAccess.js`) are intentionally-kept
  exports used only by disposable test-only routes (`umpireScorerAuthorization.integration.test.js`,
  `groundMembership.integration.test.js`) — not touched, not removed.

## Testing

- `server/src/tests/integration/groundStaffPermission.integration.test.js` — grant/revoke/disable CRUD
  correctness, duplicate-grant 409, revoke-nothing-active 404, forged permission keys (400), IDOR
  (cross-ground `membershipId` → 404; `GROUND_OWNER` membership as target → 400), audit events, and that
  Staff/strangers can never reach these routes regardless of grants.
- `server/src/tests/integration/groundPermissionEnforcement.integration.test.js` — the full route ×
  permission matrix (every gated route × with/without its permission), Owner/Super-Admin bypass, real
  cross-ground isolation (a fully-permissioned staff member on their own ground is still denied on a
  different one), and revoke-takes-effect-immediately on the same session token.
- Full regression run against the Phase 4 baseline (386/386 unit, 664/681 integration) — see the Phase 5
  final report for exact results.
