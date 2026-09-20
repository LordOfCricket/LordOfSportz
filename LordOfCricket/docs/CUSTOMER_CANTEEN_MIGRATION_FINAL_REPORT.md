# Customer Canteen Ordering — Migration Final Report

## 1. Root cause

`client/src/services/canteenApi.js` was a fixed axios instance targeting the transitional,
platform-wide `/api/canteen/*` routes, which resolve "the" canteen via `findSingleCanteen()` —
correct only while exactly one canteen exists anywhere on the platform. Every customer-facing
canteen page depended on it. No page anywhere linked a customer to canteen ordering at all (the
account-menu "Canteen" link routed non-staff users to their own dashboard instead, a dead link
found during inspection).

## 2. Legacy flow removed/replaced

- `client/src/services/canteenApi.js` — **left completely untouched** (still serves the canteen
  staff dashboard, explicitly out of scope — see inspection §4).
- `client/src/models/canteenMenu.model.js` and `client/src/models/canteenOrderStatus.model.js` —
  now import from the new ground-scoped service instead of the legacy one; every downstream export
  name is unchanged, so no other file needed to change its imports.
- `client/src/hooks/useCanteenMenu.js` and `client/src/hooks/useCanteenOrderStatus.js` — now read
  `publicGroundId`/`publicCanteenId` from the route (`useParams()`) and pass them through every API
  call and every internal navigation. No cart/UX/state-machine logic changed.
- `client/src/routes/AppRoutes.jsx` — `/canteen/menu` and `/canteen/order-status` replaced with
  `/grounds/:publicGroundId/canteen/:publicCanteenId/menu` and `.../order-status`. `/canteen` and
  `/canteen/staff` (staff routing) untouched.

## 3. Existing APIs reused

Every backend call this migration makes was already built, already ground/canteen-scoped, and
already covered by this session's own earlier test suites (server-authoritative pricing, stock
validation, canteen/ground status enforcement, IDOR-safe tenancy): `GET .../menu`,
`GET .../orders/active/:userId`, `GET .../orders/history/:userId`, `POST .../orders`,
`GET .../orders/:id`. Order-creation payload shape is unchanged. Socket.IO room logic
(`join-user-room`/`join-order-room`) is unchanged — those rooms are keyed by `userId`/`orderId`
globally, not by canteen, so no realtime-layer change was needed.

## 4. Frontend changes

- **New** `client/src/services/customerCanteenApi.js` — five ground/canteen-scoped functions on the
  shared, credentialed `api` instance (this also means the customer canteen flow now gets the global
  401 → session-expiry redirect it never had before, a direct benefit of reusing the standard client).
- `useCanteenMenu.js`, `useCanteenOrderStatus.js` — migrated as described above.
- `client/src/pages/ground-homepage/GroundHomePage.jsx` — new "Canteen" section, rendered only when
  `ground.canteens.length > 0`; one button per active canteen, a disabled "Currently closed" pill for
  an inactive one. This section *is* the "Ground → Canteen" step — with a ground's canteens already a
  short list on an already-loaded page, a separate picker page would have been unnecessary.
- `client/src/models/navLinks.model.js` — the generic "Canteen" account-menu link is now staff-only
  (`/canteen/staff`); it was already a dead link for players (silently redirected to their own
  dashboard) and a ground-less link no longer makes sense once ordering is ground-contextual.

## 5. Security verification

- **IDOR**: re-verified via `groundCanteenContext.integration.test.js`'s full AUTH MATRIX/IDOR/DATA
  ISOLATION suite (8/8) and the new `customerCanteenJourney.integration.test.js` (cross-canteen order
  fetch returns 404; a well-formed but mismatched ground/canteen pair returns 404). No frontend
  change can bypass this — every guarantee is server-side, unaffected by which URL the client used to
  get there.
- **Server-authoritative pricing/stock**: re-verified via `canteenOrderPricingIntegrity.integration.test.js`
  (23/23, unchanged) and the new journey test (server-computed total confirmed independent of any
  client-supplied value).
- **One genuine, pre-existing authorization gap found and fixed while inspecting the actual customer
  journey end-to-end**: `GET /orders/:id` (`getOrder`) has *always* been staff-only, in both the old
  and new routers (they share the same controller) — meaning an order's own customer could never
  fetch their own order by id. This silently broke an already-shipped, already-visible feature ("View
  Details" on order history) for every real customer, independent of this migration. Confirmed no
  real staff UI depends on this specific endpoint (staff dashboards render from the list response).
  Fixed by resolving canteen context with no route-level role gate (matching the sibling
  `getActiveOrder`/`getOrderHistory` pattern already established) and adding a self-or-staff check
  inside the controller — the order's own customer is now always allowed; anyone else falls back to
  the exact same staff-membership check (`authorizeResolvedCanteen`, exported for reuse rather than
  re-derived) the route used to enforce, so Ground Owner/staff access is fully preserved. Verified via
  a real regression this specific fix caught: `groundOwnerCanteen.integration.test.js`'s "deactivating
  the canteen does not delete/corrupt existing menu items or existing orders" test (owner viewing an
  order post-deactivation) failed with 403 under a first, simpler version of this fix and passes
  (200) with the corrected one.
- **No client-supplied ground/canteen ownership is ever trusted** — `attachGroundCanteenContext`
  resolves both from the URL and verifies `canteen.ground_id === ground.id` server-side, unchanged.

## 6. Multi-canteen verification

The new `customerCanteenJourney.integration.test.js` drives the full journey (menu → place order →
active-order lookup → order fetch → mark completed → order history) across **two independent
grounds/canteens in the same test run**, with the same customer holding simultaneously-active orders
at both — proving the "one active order" guarantee is genuinely per-canteen, not a stale global
assumption, and that Ground A's data never leaks into Ground B's responses. A second test covers every
required edge case: inactive canteen (`CANTEEN_CLOSED`), suspended ground (`GROUND_CLOSED`), a real
empty menu (clean `[]`, not an error), a sold-out item (`INSUFFICIENT_STOCK`), an invalid ground/
canteen combination (404), and unauthenticated access (401).

## 7. Tests

New: `customerCanteenJourney.integration.test.js` — **2/2 passed** (both tests found and forced fixes
to two genuine, unrelated bugs surfaced only by actually driving the real end-to-end sequence: a test-
fixture `varchar(20)` overflow, and the `getOrder` authorization gap in Section 5 above — documented,
not glossed over).

Targeted regression, every file directly touched or adjacent to this change:
`groundOwnerCanteen.integration.test.js`, `canteenOrderPricingIntegrity.integration.test.js`,
`groundCanteenContext.integration.test.js`, `canteenOrderStatusIdempotency.integration.test.js`,
`customerCanteenJourney.integration.test.js` — **58/58 passed**. Plus
`groundOwnerNotifications.integration.test.js` (27/27), `canteenRealtime.integration.test.js` (9/9),
`canteenOrderConcurrency.integration.test.js` (2/2). **Combined: 96/96, 0 failed.**

Client-side model unit tests (`npm test --prefix client`): **126/126 passed** (confirms the
`navLinks.model.js` change didn't break its own test coverage).

Per this task's explicit batching instruction, the full ~973-test backend suite was **not** re-run —
the change surface (one new frontend API-parameterization pattern, one route/controller
authorization fix in a single shared function) is narrow and every directly-affected file above is
green.

## 8. Build result

`npm run build --prefix client`: **exit 0.** No new compile errors, no new chunk-size regressions
(unchanged pre-existing `HeroScene` warning, unrelated to this migration).

## 9. Regression result

Zero regressions in final state. One regression was introduced and caught mid-fix (the `getOrder`
authorization change initially used too narrow a staff check, breaking Ground Owner order access
after canteen deactivation) — investigated, root-caused, and corrected before this report, per this
project's standing "never ship a caught regression" discipline.

## 10. Remaining issues

- No browser-based click-through of the finished flow was performed — this session has no browser-
  automation tool available. Confidence instead comes from an integration test that drives the exact
  same HTTP sequence the migrated frontend code now makes, byte-for-byte, across multiple
  grounds/canteens and every required edge case (Section 6). Recommend a real manual click-through
  before the first live demo, as a final sanity check.
- The canteen **staff** dashboard (`/canteen/staff`) still depends on the same legacy platform-wide
  `canteenApi.js` and would break under the identical condition once it's not just customer ordering
  but this staff surface that meets a second real canteen — confirmed out of scope for this task
  (inspection §4), not fixed, flagged again here so it isn't lost.
- `lookupOrderByUser` (`canteenApi.js`) remains unused dead code — untouched, out of scope.

---

## Final verdict

🟢 **GO**

The customer canteen ordering flow is now reachable (a real "Order Food" entry point exists on every
ground page that has one), multi-canteen-correct (proven end-to-end across two independent grounds in
one test run), and closes the one remaining production condition from the final production-readiness
report. All existing security, pricing, and tenancy guarantees are unchanged and re-verified; the one
backend change made (the `getOrder` authorization fix) closes a real, independently-discovered gap
without weakening anything — Ground Owner/staff access to orders is fully preserved.
