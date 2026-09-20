# Phase 24 — Ground Owner Operational Controls (Canteen Activate/Deactivate) — Final Verification Report

## 1. Inspection findings

- `canteens.is_active` (schema.sql) has existed since the canteen table was introduced, defaulting to
  `true` at creation (`canteen.model.js#createCanteen`). Grepping the entire `server/src` tree found
  **zero** update path for it anywhere — only creation ever set it.
- The enforcement side already fully exists and is already correct: `canteenOrder.controller.js#createOrder`
  (Phase 17.2, prior phase) already checks `req.canteen.is_active === false` and rejects with
  `409 { error, code: 'CANTEEN_CLOSED' }` before any order is created. Nothing needed to change here —
  this phase only needed to give someone a real way to set the flag this check already reads.
- `req.canteen` on every real multi-ground canteen route is already resolved and ownership-verified by
  `middlewares/groundAccess.js#requireGroundCanteenRole`, which: resolves the ground from
  `:publicGroundId`, resolves the canteen from `:publicCanteenId`, verifies `canteen.ground_id ===
  ground.id` (rejecting a mismatched pair as 404 — the exact IDOR protection this phase needed), grants
  Super Admin an MFA-gated bypass, and otherwise requires an active membership in the caller-specified
  `groundRoles` with MFA enforced for the `GROUND_OWNER` path specifically. This is the same middleware
  `canteenMenu.routes.js` and `canteenOrder.routes.js`'s ground-scoped routers already use — reused
  as-is, zero new authorization logic written.
- **Visibility already existed too**: `ground.controller.js#getGroundProfile`'s response already
  includes `canteens: [{ publicCanteenId, name, isActive }]` (added in an earlier phase, unrelated to
  this one), and `GroundCanteenPage.jsx` already rendered `{canteen.isActive ? '(Active)' :
  '(Inactive)'}` in its heading before this phase touched anything. Requirement 1 ("Ground Owner can
  view current canteen active/inactive status") was already satisfied — reused unchanged.
- No dedicated "canteen entity" route/controller file existed (only `canteenMenu.*` for food items and
  `canteenOrder.*` for orders) — confirming a genuinely new, small endpoint was the correct shape here,
  not an extension of an unrelated existing one.

## 2. Existing functionality reused

- `middlewares/groundAccess.js#requireGroundCanteenRole` — full tenancy resolution + IDOR protection +
  MFA gating, unchanged, zero new code.
- `canteenOrder.controller.js#createOrder`'s existing `CANTEEN_CLOSED` check — unchanged, not
  duplicated; this phase's new endpoint only flips the flag that check already reads.
- `getGroundProfile`'s existing `canteens[].isActive` field and `GroundCanteenPage.jsx`'s existing
  status heading — unchanged, reused for requirement 1.
- The existing `groundOwnerApi.js` client-function/`GroundCanteenPage.jsx` conventions (loading/error/
  success state shape, button styling) — matched exactly, no new UI pattern introduced.

## 3. Genuine gap identified

**No write path existed for `canteens.is_active`.** A Ground Owner had a real, working "Deactivate my
canteen" enforcement mechanism already wired into order creation, but no way to actually trigger it —
confirmed by Phase 23's own inspection and re-confirmed directly this phase by grepping for every
reference to `is_active`/`isActive` in the canteen model/controller layer.

## 4. Backend changes

- `server/src/models/canteen.model.js` — new `updateCanteenActiveStatus(canteenId, isActive)`. A
  single-row `UPDATE canteens SET is_active = $1 WHERE id = $2` — no cascade, touches nothing else.
- `server/src/controllers/canteenStatus.controller.js` (new, one function) — validates `isActive` is a
  boolean, calls the model function using `req.canteen.id` (never a client-supplied id), logs the
  change, returns the updated canteen's public shape.
- `server/src/routes/canteenStatus.routes.js` (new) — `PATCH /` mounted with `mergeParams: true`,
  guarded by `requireAuth` + `requireGroundCanteenRole({ groundRoles: ['GROUND_OWNER'] })` (Owner-only,
  no `legacyStaffRoles`, no `GROUND_ADMIN`/`CANTEEN_STAFF` — a business-configuration action, same
  non-delegable posture as ground profile updates and staff/permission management).
- `server/src/routes/index.js` — one new mount:
  `router.use('/grounds/:publicGroundId/canteens/:publicCanteenId/status', canteenStatusRoutes)`,
  registered alongside the existing `.../menu` and `.../orders` mounts.

**No database migration.** `canteens.is_active` already existed with the correct type/default.

## 5. Frontend changes

`client/src/pages/ground-owner/GroundCanteenPage.jsx` (the existing canteen hub page, not a new page):
- Added an Activate/Deactivate button next to the existing status heading, calling the new endpoint via
  a new `updateCanteenStatus(publicGroundId, publicCanteenId, isActive)` function in
  `client/src/services/groundOwnerApi.js`.
- Loading state (`statusUpdating`, disables the button + label changes to "Updating…"), success banner
  (auto-clears after 4s, matching `GroundProfilePage.jsx`'s existing pattern), error banner, and
  double-submit protection (the handler no-ops while `statusUpdating` is true, and the button itself is
  `disabled` for the same duration).
- A small inline notice ("This canteen is not accepting new orders…") when inactive, using data already
  in local state — no extra request.

No new page, no new route, no navigation change (the page was already reachable from `GroundNavTabs`).

## 6. Security verification

- Reuses `requireAuth` + `requireGroundCanteenRole({ groundRoles: ['GROUND_OWNER'] })` unmodified — no
  new authorization code.
- `req.canteen.id` (server-resolved and ground-ownership-verified before the controller ever runs) is
  the only source of which canteen is updated; the request body carries no canteen/ground identity of
  its own.
- MFA is enforced for the `GROUND_OWNER` path by the reused middleware itself (unchanged, pre-existing
  behavior of `requireGroundCanteenRole`/`authorizeResolvedCanteen`).
- Verified by test: a non-owner (no ground membership) gets 403 and the row is unmodified; an owner
  supplying their OWN ground's URL with a DIFFERENT owner's real canteen id gets 404 and that canteen's
  row is unmodified (IDOR); an unauthenticated request gets 401.
- Nothing in this phase reads, writes, or references `grounds.status` — Super Admin's ground suspension/
  reactivation (`admin.routes.js`) is completely untouched, confirmed by inspection (this phase's diff
  touches only `canteens`-table code) and not exercised at all by the new code path.
- A Ground Owner still cannot grant themselves elevated roles, touch another ground's staff, or bypass
  platform-level ground suspension — no staff/permission/ground-status code was touched.

## 7. Tests executed

`groundOwnerCanteen.integration.test.js` (the directly modified file — 8 new tests appended to its
existing 10): **18/18 passed.** New coverage: status visibility via the existing public profile
endpoint (regression), owner can deactivate/reactivate, deactivation produces the existing
`409 CANTEEN_CLOSED` on a real order-creation attempt and reactivation allows a real order again,
deactivation does not delete/corrupt existing menu items or existing orders (and staff can still
progress an already-placed order while inactive), non-owner rejected (403, row unmodified), cross-owner
IDOR rejected (404, row unmodified), unauthenticated rejected (401), non-boolean `isActive` rejected
(400).

Two self-authored test bugs were found and fixed during this run (documented per this phase's
investigate-every-failure rule, not silently patched): (1) the "reactivated" order in the very first
draft reused the same customer who already had an active order from earlier in the same test, colliding
with the existing, unrelated one-active-order-per-user-per-canteen rule — fixed by using a second
customer for that assertion; (2) test cleanup deleted the customer/owner user rows before
`cleanupGround` had deleted the orders referencing them, tripping a real FK constraint — fixed by
reordering cleanup (`cleanupGround` first). Neither was a defect in the actual implementation.

Neighboring, directly-related files run for regression: `groundCanteenContext.integration.test.js`
(8/8 — the ground/canteen tenancy AUTH MATRIX + IDOR + data-isolation suite) and
`canteenOrderPricingIntegrity.integration.test.js` (23/23 — includes G1/G2, the existing canteen-closed/
ground-closed order-creation tests). **Combined: 31/31 passed, 0 failures.**

Per this phase's explicit instruction, the full 900+-test suite was **not** run.

## 8. Frontend build result

`npm run build` — **succeeds (exit 0).** Same pre-existing chunk-size warning as every prior phase's
build (`HeroScene-*.js`, the unrelated 3D homepage bundle) — this phase's frontend edit was one button
and one service function, no new dependency.

## 9. Remaining operational gaps

The brief's own required "small operational gap check" found nothing else genuinely missing in this
canteen lifecycle:
- **Visibility** — already covered (requirement 1 was already satisfied before this phase; now paired
  with a real control).
- **Server-side enforcement** — already existed and correctly reused, not duplicated.
- **Owner UI state sync** — the menu/orders/today's-menu management pages correctly continue to work
  regardless of active status (staff can still process an already-placed order, still edit the menu,
  still publish today's menu while inactive) — this is the existing, intentional Phase 17.2 design
  ("deactivation blocks NEW activity only"), not a gap. Adding an inactive-status banner to those other
  pages was considered but is optional polish, not a missing control — left out to keep this phase
  focused, per the brief's own scoping rule.

## 10. Recommendation for Phase 25

None identified as necessary. The Ground Owner canteen operational-control surface (view status,
activate, deactivate, with correct order-creation enforcement and no data loss) is now complete and
reuses only existing, already-tested infrastructure.

---

## Final status

**PHASE 24: PASS**
