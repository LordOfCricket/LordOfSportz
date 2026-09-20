# PHASE 15 + 16 INSPECTION REPORT
## Ground Owner Notifications & Alerts + Dashboard Intelligence

**Status: INSPECTION ONLY — no code changed.**

---

## 1. What Already Exists

### 1.1 Notifications — a mature, general-purpose system already exists

`ground_notifications` (table, `server/src/config/schema.sql:687`) is **not** a Phase 15 greenfield feature — it is an established, heavily-used, cross-feature notification system, already carrying 29 distinct `type` values (booking, umpire assignment, umpire proposals, match lifecycle, reminders) added incrementally across at least 6 prior phases, each via the same safe, idempotent `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` widening pattern.

**Current live columns**: `id, user_id, type, title, body, related_booking_id, is_read, created_at, related_match_id`.

**Full existing stack, all reusable as-is**:
- `server/src/repositories/groundNotification.repository.js` — `insertNotification`, `listForUser`, `countUnread`, `markRead`, `markAllRead`.
- `server/src/services/groundNotification.service.js` — `createNotification` (best-effort, never throws/blocks the caller — same posture as audit logging), `listMyNotifications`, `markRead`, `markAllRead`.
- `server/src/controllers/groundOps.controller.js` — `getMyNotifications`, `markNotificationRead`, `markAllNotificationsRead`.
- `server/src/routes/groundOps.routes.js` — `GET /api/ground/notifications`, `POST /api/ground/notifications/:id/read`, `POST /api/ground/notifications/read-all`, all `requireAuth` only (safe by construction: every query is scoped to `req.user.id`, no ground/user id ever accepted from the client).
- **Frontend**: `client/src/components/layout/NotificationBell.jsx` + `client/src/hooks/useNotifications.js` — a complete, polished bell with unread badge, dropdown, mark-read/mark-all-read, loading/empty states, and a type→icon map that **falls back to a plain Bell icon for any unrecognized type** — meaning new notification types render correctly with zero frontend change.

**Critical finding**: every existing usage notifies a **customer** (`BOOKING_APPROVED`/`BOOKING_CANCELLED`) or an **umpire** (`UMPIRE_*`). Grepped every `createNotification(...)` call site — **a Ground Owner has never once been the recipient of a notification in this codebase.** Phase 15 is the first time `user_id` would be an owner's own id.

**Critical finding**: `NotificationBell` is rendered only in `components/home/Navbar.jsx` (the public/general site header). `GroundOwnerLayout.jsx` (`components/ground-owner/GroundOwnerLayout.jsx`) has **no Navbar, no bell, no header at all** — just a sidebar + content area. A Ground Owner inside `/ground-owner/*` currently sees zero notifications, even the generic ones that already exist.

### 1.2 Socket.IO — a real-time architecture already exists, including a reusable per-user room

`server/src/realtime/` has four modules: `bookingRealtime.js` (public date-room broadcast, refresh-signal only), `canteenRealtime.js`, `cricketRealtime.js`, `matchChatRealtime.js`.

**Directly reusable primitive**: `canteenRealtime.js` already implements an **authenticated per-user room**:
```js
socket.on('join-user-room', async (userId) => {
  // authorization check: "You can only join your own user room."
  socket.join(`user:${userId}`)
})
```
This is exactly the primitive Phase 15 needs for live notification push — no new socket architecture required. `groundNotification.service.js#createNotification` can `io.to(\`user:${userId}\`).emit('notification:new', notification)` immediately after a successful insert, reusing the existing room, existing auth check, existing connection lifecycle.

### 1.3 Dashboard (Phase 9) — operational-only, no financial/canteen/staff data

`getGroundOwnerDashboard(groundId)` (`server/src/services/groundOwner.service.js:511`) returns: `date`, `groundStatus`, today's booking/block/match counts+lists+timeline, and a 7-day upcoming preview of blocks/matches. **No revenue, no canteen data, no staff data, no utilization/trend data** — confirming Phase 16 is a genuine extension, not a rebuild.

### 1.4 Analytics (Phase 10/14) — booking, utilization, canteen revenue; no trends

`getFullAnalytics(groundId, dateRange)` (`server/src/services/groundOwnerAnalytics.service.js`) already returns booking metrics, utilization (via `computeUtilization`), and canteen revenue for a single date range snapshot. **No day-by-day trend series** (Phase 16 asks for "booking trend," "revenue trend," "utilization trend," "canteen sales trend" — none of these exist; the current service returns one aggregate number per range, not a series).

### 1.5 CSV export (Phase 14) — already exists, already reusable

`GET /ground-owner/grounds/:id/analytics/export` — already built, already tested, already Owner-only. Phase 16's "Reports: date range, CSV export, loading/empty/error states" is **already fully satisfied** by the Phase 14 frontend (`GroundAnalyticsPage.jsx`'s Export CSV button) — nothing new needed here beyond surfacing the same control on the dashboard if desired.

### 1.6 Canteen stock — per-day stock exists; low-stock detection does not

`today_menu_items.stock` (per-item, per-day quantity, `models/canteenTodayMenu.model.js`) is real, already written on menu publish. **No existing query reads it back for a "low stock" check** — this is a new read, not new storage.

### 1.7 Staff active/inactive/role breakdown — data exists, no aggregation

`listStaffForGround(ground)` (`services/groundStaff.service.js:95`) already returns every staff row with `role` and (confirmed via `disableStaffMembershipHandler`'s existing use of `is_active`) an active/inactive flag. **Counting/grouping this into a dashboard tile requires zero new backend code** — pure client-side (or one-line server-side) reduction of data already fetched by the existing Staff page.

### 1.8 Top-selling canteen items — does not exist

Grepped for any `GROUP BY item_name`/`top-selling` aggregation — **none exists**. Would be a new, small read query over `order_items → orders → canteens`, mirroring the exact pattern already established for `sumCompletedRevenueForGround` (Phase 14).

### 1.9 Multi-ground architecture — confirmed per-ground only, no "all grounds" aggregate exists

`listMyGrounds(userId)` (`services/groundOwner.service.js:83`) returns each owned ground as its own card (name, status, upcoming-match/umpire-slot counts) — the Owner picks **one** ground to manage, and every downstream page (Dashboard, Analytics, Reviews, Bookings, Staff, Canteen) is scoped by `:publicGroundId` in the URL. **There is no existing "aggregate across all my grounds" view anywhere in the codebase.** Per the brief's own instruction ("only use it if already designed securely" — it isn't designed at all), Phase 16 should **not** introduce one; the per-ground pattern every other phase already established is what's safe and consistent.

---

## 2. What Is Missing (genuine gaps)

**Phase 15**:
1. No Owner-facing notification `type` values in the CHECK constraint (new booking, cancellation *for the owner*, new canteen order, order status change, low-stock, menu-not-published, staff activation/deactivation).
2. No way to reference a canteen order or a staff membership from a notification row (`related_booking_id`/`related_match_id` only — nothing for `orders` or `ground_users`).
3. No `ground_id` on the table at all — every notification is `user_id`-scoped only. For a multi-ground owner, there's no server-side way to answer "show me only Ground X's notifications" without joining through `related_booking_id`/`related_match_id`, which don't exist for canteen/staff-related types.
4. `NotificationBell` is not rendered anywhere inside `GroundOwnerLayout`.
5. `useNotifications.js` swallows fetch errors silently (`.catch(() => {})`) — no error state ever reaches the UI, contradicting the brief's "error state" requirement.
6. No polling/live-update wiring on the frontend despite the reusable `user:{userId}` socket room existing.
7. No click-through navigation from a notification to its related resource (booking/order/staff page).
8. No triggers wired up yet at any of the 9 required event points (booking created/cancelled/status-changed, canteen order created/status-changed, low-stock, menu-not-published, staff activated/deactivated) — the infrastructure to fire a notification exists, but nothing calls it with a Ground Owner as recipient today.

**Phase 16**:
1. No trend/time-series data (day-by-day booking/revenue/utilization/canteen-sales) — only single-range snapshots.
2. No canteen order status breakdown (pending/preparing/ready/completed counts) surfaced to the Owner dashboard.
3. No low-stock widget.
4. No top-selling items query.
5. No staff summary tile on the dashboard (data exists via Staff page, just not composed into the dashboard response).
6. Current dashboard (Phase 9) and analytics (Phase 10/14) are two separate API calls/pages — Phase 16 asks for one cohesive dashboard; needs a decision on whether to compose them server-side into one response or keep them as parallel frontend fetches (see §11 Risks).

---

## 3. Exact Files Requiring Modification

**Phase 15**:
- `server/src/config/schema.sql` — widen `ground_notifications_type_check` (new types); add `ground_id`, `related_order_id` nullable columns (see §5).
- `server/src/repositories/groundNotification.repository.js` — accept/return the new columns; add a ground-scoped list function.
- `server/src/services/groundNotification.service.js` — accept `groundId`/`relatedOrderId` in `createNotification`; emit the Socket.IO event after insert.
- `server/src/services/groundBooking.service.js` — fire an Owner-facing notification on booking create/cancel (alongside the existing customer one).
- `server/src/controllers/canteenOrder.controller.js` / relevant canteen service — fire Owner-facing notification on new order + status change.
- A menu-not-published check and a low-stock check need a home — likely a small new function called from the existing daily-timeline/dashboard read path (best-effort, on-demand — not a cron job, since no scheduler infrastructure was found for this kind of proactive check beyond `reminderScheduler.service.js`, which is match-specific).
- `server/src/services/groundStaff.service.js` — fire notification on activate/deactivate.
- `server/src/realtime/` — new small module (or extend `canteenRealtime.js`) to emit `notification:new` into the existing `user:{userId}` room.
- `client/src/components/ground-owner/GroundOwnerLayout.jsx` — render the bell (or a Ground-Owner-styled wrapper around it).
- `client/src/components/layout/NotificationBell.jsx` — add navigation-on-click; extend `TYPE_ICON` map for new types (fallback already safe, but real icons are better UX).
- `client/src/hooks/useNotifications.js` — surface errors; add either polling or a socket subscription for live updates.

**Phase 16**:
- `server/src/services/groundOwnerAnalytics.service.js` — add trend-series functions (extend, not replace — same pattern as Phase 14's additive `getFullAnalytics`).
- `server/src/services/groundOwner.service.js` — either extend `getGroundOwnerDashboard` to compose in analytics/canteen/staff summaries, or leave it as-is and have the frontend compose multiple existing calls (see §11).
- `server/src/models/canteenOrder.model.js` — new read functions: order-status breakdown for today, low-stock items, top-selling items (all new SELECT-only queries, same file Phase 14 already extended).
- `client/src/pages/ground-owner/GroundOperationsPage.jsx` (route: `/ground-owner/grounds/:publicGroundId/operations`) — this, not `GroundOwnerDashboardPage.jsx`, is the actual per-ground Phase 9 dashboard (confirmed: uses `useGroundDashboard`) and is Phase 16's real target. `GroundOwnerDashboardPage.jsx` (route: `/ground-owner/dashboard`) is the separate "my grounds" picker/list page and is out of scope for per-ground intelligence widgets.
- `client/src/hooks/useGroundDashboard.js`, `useGroundAnalytics.js` — extend or compose.

## 4. Exact Files Requiring Creation

- `server/src/tests/integration/groundOwnerNotifications.integration.test.js`
- `server/src/tests/integration/groundOwnerDashboardIntelligence.integration.test.js`
- Possibly `client/src/pages/ground-owner/GroundOperationsPage.jsx` extensions or a new dashboard-specific component set (widgets for canteen/staff/trends) — exact scope to be finalized against the live `GroundOwnerDashboardPage.jsx`/`GroundOperationsPage.jsx` split at implementation time.

---

## 5. Database Changes — minimal, additive, precedented; NOT yet applied

**Reuse verdict: substantial reuse (table, indexes, repo, service, controller, route, and the entire frontend bell all reused as-is). A small, additive schema change is genuinely required — not invented, not avoidable by clever querying — for two specific reasons:**

1. **`ground_id INTEGER REFERENCES grounds(id) ON DELETE CASCADE`** (nullable). Required because: (a) low-stock/menu-not-published/staff-activation notification types have **no** existing FK to derive a ground from (`related_booking_id`/`related_match_id` are both null for these), so there is no way to ground-scope or ground-isolate them without this column; (b) it lets a ground-scoped read (`GET /ground-owner/grounds/:id/notifications`) be a direct, provably-correct `WHERE user_id = $1 AND ground_id = $2` — exactly the kind of query the brief's own IDOR warning ("GET /notifications?groundId=someone-elses-ground must never expose another owner's data") demands be trivially safe. Without it, ground-scoping would depend on joining through relations that don't exist for half the new types.
2. **`related_order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE`** (nullable). Required because canteen-order notification types (new order, order status changed) have nothing to reference otherwise — `orders` has no existing FK slot on this table, mirroring exactly why `related_match_id` was added by ALTER TABLE in Phase 21 for match-related types.
3. **Widen `ground_notifications_type_check`** to add the new Owner-facing type values — zero risk, uses the exact same idempotent `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` pattern already used 6 times in this schema file.

All three are pure `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / constraint-widen statements — additive, backward compatible, no data migration, no existing row touched, no existing query broken (confirmed: every existing caller of `insertNotification`/`listForUser`/etc. keeps working unchanged since the new columns are nullable with no default-behavior change). This is the same category of change as the six prior type-widenings and the `related_match_id` addition already living in this exact file — not a new pattern, a continuation of an established one.

**No new table.** **No change to any existing column.** **No index needed beyond one new `(user_id, ground_id, created_at DESC)` for the ground-scoped read, mirroring the existing `idx_ground_notifications_user`.**

Phase 16 requires **zero** database changes — every field needed already exists across `ground_bookings`, `orders`, `today_menu_items`, `ground_users`, `canteens`.

---

## 6. API Changes Required

**Phase 15**:
- Extend `POST` (internal, service-level) `createNotification` signature — additive params, backward compatible.
- New: `GET /ground-owner/grounds/:publicGroundId/notifications` (ground-scoped, `requireGroundRole('GROUND_OWNER')`, mirrors the exact Reviews/Analytics pattern from Phase 13/14) — for the Owner portal's own view.
- Existing `GET /api/ground/notifications` (global, `requireAuth` only) is **left untouched** and continues serving the site-wide bell for every user type (players, umpires, owners) exactly as today — the new ground-scoped endpoint is additive, not a replacement.
- New Socket.IO event `notification:new`, emitted into the existing `user:{userId}` room.

**Phase 16**:
- Extend `GET /ground-owner/grounds/:id/analytics` response (or add a sibling `/analytics/trends` endpoint) with day-by-day series — decision needed on additive-field-on-existing-endpoint vs. new endpoint (recommend: new `?series=true` param or a separate `/trends` endpoint, since a trend series is a different shape than the existing snapshot and forcing both into one response risks an awkward, harder-to-cache contract).
- Extend `getGroundOwnerDashboard`'s response, or add sibling read endpoints for canteen-status-breakdown/low-stock/top-selling/staff-summary — decision needed (see §11).

---

## 7. Security Considerations

- Every new/extended endpoint must follow the exact `requireAuth` + `requireGroundRole('GROUND_OWNER')` pattern already used for Reviews/Analytics/Export (Phase 13/14) — `req.ground.id`, never a client-supplied `groundId`.
- The ground-scoped notifications read must filter `WHERE user_id = req.user.id AND ground_id = req.ground.id` — **both** conditions matter: `ground_id` alone isn't enough (a notification's `ground_id` could theoretically match while `user_id` belongs to someone else if a future bug ever wrote it wrong) — matching this table's existing invariant that every read is `user_id`-scoped first.
- Socket.IO's `join-user-room` already has its own auth check ("you can only join your own room") — reuse verbatim, do not weaken it to accept a ground id.
- MFA: `requireGroundRole('GROUND_OWNER')` already enforces MFA for the Owner role automatically (confirmed in Phase 13/14's audit) — any new ground-scoped Owner route inherits this for free, no new MFA logic needed.
- The **existing global** `GET /api/ground/notifications` must **not** be modified to filter by ground — it's intentionally a cross-context personal inbox (a user who is both a player and, separately, a ground owner should still see all their notifications there); changing its behavior would be an unrelated, out-of-scope regression risk.
- Canteen/staff/low-stock notification triggers must derive `ground_id` server-side from the resource being acted on (e.g., `canteen.ground_id`, `membership.ground_id`) — never accept it from the request that triggered the event.

---

## 8. Test Strategy

Follow the exact pattern established in `groundOwnerReviews.integration.test.js` / `groundOwnerBusinessReports.integration.test.js` (real HTTP, real Postgres, MFA-verified cookies via `mintMfaVerifiedSessionCookie`, plus explicit `loginViaOtp`-based MFA-required and fully-permissioned-staff-escalation checks — both should be repeated for every new Phase 15/16 endpoint, not assumed).

**Phase 15 tests**: owner receives a notification on booking-created/cancelled/canteen-order/low-stock/staff-activation; unread count correct; mark-one-read; mark-all-read; ground-scoped list excludes another ground's notifications; owner A cannot read owner B's ground-scoped notifications (403, not just empty); unauthenticated rejected; non-owner rejected; MFA-required rejected; a fully-permissioned staff member still rejected (owner-only, same posture as Reviews); the **existing** global notification tests in `groundOps.integration.test.js` must still pass unchanged (regression).

**Phase 16 tests**: dashboard/trend endpoints reject unauthenticated/non-owner/non-MFA/escalated-staff; ground isolation on every new aggregation; correct counts for a known booking/order/staff fixture; empty-data case (brand-new ground) renders zero-state without error, never NaN; date-range filtering on trend series.

**Regression**: full targeted run across `groundOps`, `groundOwnerDashboard`, `groundOwnerAnalytics`, `groundOwnerBusinessReports`, `groundOwnerCanteen`, `groundOwnerBooking`, `groundStaff` — the same set already used as the regression gate for Phase 13/14.

---

## 9. Risks

1. **Dashboard composition decision** (Phase 16): composing everything into one giant `getGroundOwnerDashboard` response risks it becoming a slow, over-fetching endpoint (N+1 across bookings/canteen/staff/analytics) if not done as parallel `Promise.all` reads exactly like the existing function already does. Recommend keeping Dashboard (Phase 9, operational/today-focused) and Analytics (Phase 10/14, financial/trend-focused) as **separate** endpoints/pages as they are today, with Phase 16 adding new small widgets/sections to each rather than merging them into one mega-endpoint — lower risk, less coupling, matches the brief's own "DO NOT introduce unnecessary coupling between them" instruction for Phase 15/16 generally.
2. **Trigger placement for "menu not published" / "low stock"**: these are *absence*/*threshold* conditions, not discrete events — there's no natural write-path hook to fire them from (unlike "booking created"). They need either an on-demand check (computed when the dashboard/notifications is loaded — cheap, no new infra) or a scheduled job (heavier, and no generic cron infrastructure exists here beyond the match-specific `reminderScheduler.service.js`). **Recommend on-demand computation**, not a new scheduler, to avoid introducing new infrastructure for two minor alert types.
3. **Schema change approval**: this report identifies a genuine, minimal, precedented need for 2 nullable columns + 1 constraint widen. Per the task's explicit instruction, this must not be applied without your sign-off first.
4. **Trend series performance**: a naive day-by-day loop (30 separate queries for LAST_30_DAYS) would be a real N+1 risk. Must be a single `GROUP BY date_trunc('day', ...)` query per metric, not a loop calling the existing snapshot function N times.

---

## 10. Recommended Implementation Order

1. **Get sign-off on the 3-part schema change** (§5) — blocking for Phase 15's canteen/staff/low-stock notification types and ground-scoping; Phase 15's booking-notification types alone could technically proceed without it (they have `related_booking_id` already), but that would mean shipping half a feature now and a schema change later for the rest — cleaner to decide once.
2. **Phase 15 backend**: schema widen → repository/service extension → wire triggers at each of the 9 event points → ground-scoped route → Socket.IO emit.
3. **Phase 15 frontend**: render bell in `GroundOwnerLayout`, fix the swallowed-error bug, add click-through navigation, wire live updates.
4. **Phase 15 tests + regression.**
5. **Phase 16 backend**: trend-series functions, canteen-status/low-stock/top-selling reads, staff-summary composition — all additive, no schema needed.
6. **Phase 16 frontend**: new dashboard widgets/sections, reusing `StatTile` and the existing loading/error/empty patterns from Phase 13/14.
7. **Phase 16 tests + full regression across Phases 1–14.**

---

## Summary

| | Phase 15 (Notifications) | Phase 16 (Dashboard Intelligence) |
|---|---|---|
| Reuse level | Very high — full stack exists, wrong recipient only | Very high — every data source exists, only trend series is new |
| Schema change | **Yes, minimal** — 2 nullable columns + 1 constraint widen (see §5) | **None** |
| New backend files | 0 (extend existing) | 0 (extend existing) |
| New frontend files | 0 (extend existing bell/hook) | Likely 0-2 (new widget components, TBD against current `GroundOwnerDashboardPage.jsx`) |
| Primary risk | Trigger placement for absence-based alerts (§9.2) | Dashboard-composition coupling / trend-query performance (§9.1, §9.4) |

**No code has been changed. Awaiting authorization to proceed with implementation, including explicit sign-off on the schema change described in §5.**
