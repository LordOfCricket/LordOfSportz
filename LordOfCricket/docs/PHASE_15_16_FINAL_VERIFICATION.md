# PHASE 15 + 16 FINAL VERIFICATION

**Date**: 2026-08-23
**Scope**: Phase 15 (Ground Owner Notifications & Alerts), Phase 16 (Dashboard Intelligence & Analytics UI)

---

## 1. Implementation Summary

Both phases reuse existing infrastructure almost entirely. Phase 15 extends the mature, pre-existing `ground_notifications` system (repository/service/controller/routes/frontend bell, all already built and used by 29 existing notification types across booking/umpire/match features) to a genuinely new recipient category: the Ground Owner themselves, who had never once been a notification recipient before this phase. Phase 16 extends the Phase 9 dashboard and Phase 10/14 analytics with canteen/staff operational data and day-by-day trend series — every underlying data source already existed; only the aggregation queries and one supporting join (item names for low-stock) are new.

A pre-existing, unrelated bug was discovered and fixed while applying the approved schema change (see §4): `migrate.js` could not be safely re-run against an already-populated database, because `schema.sql` replays six historical `ground_notifications` type-widening steps in order, and an early step was narrower than data already live in this database (`PROPOSAL_ACCEPTED`, added by a later historical widening). This blocked applying the Phase 15 migration itself, so it was fixed as a directly-necessitated, minimally-scoped correction — five one-line additions to five pre-existing CHECK constraint lists, nothing else about them changed.

---

## 2. Phase 15 — Notification Architecture

**Reused verbatim, unmodified**: `ground_notifications` table's core columns, `groundNotification.repository.js`'s `insertNotification`/`markRead`/`countUnread` shape, `groundNotification.service.js`'s `listMyNotifications`/`markRead`/`markAllRead`, the global `GET /api/ground/notifications` endpoint (still serves every user type's personal inbox unchanged), `NotificationBell.jsx` and `useNotifications.js` (extended, not rebuilt), the authenticated `user:{userId}` Socket.IO room already established in `canteenRealtime.js`.

**New, additive**:
- Two nullable columns (`ground_id`, `related_order_id`) and 10 new `type` values (see §4).
- `listForGround`/`countUnreadForGround`/`markAllReadForGround`/`existsSinceForGround` repository functions — ground-scoped, never replacing the user-scoped originals.
- `realtime/notificationRealtime.js#publishNotification` — a small, fire-and-forget helper mirroring `emitToOrderRooms`'s existing shape, emitting `notification:new` into the existing `user:{userId}` room.
- `checkOperationalAlerts(groundId, io)` — the on-demand, dedup-guarded low-stock / menu-not-published check (no new scheduler; runs when the dashboard loads, per the approved inspection report's recommendation).
- `GET/POST /ground-owner/grounds/:id/notifications[...]` — three new ground-scoped endpoints, `requireGroundRole('GROUND_OWNER')`.

**Trigger wiring** (9 required event types, all additive alongside each existing customer/staff-facing notification, never replacing it):

| Event | Trigger point | Type |
|---|---|---|
| New booking | `groundBooking.service.js#createBooking` | `GROUND_BOOKING_RECEIVED` |
| Booking cancelled | `groundBooking.service.js#cancelBooking` | `GROUND_BOOKING_CANCELLED` |
| Booking status changed | `bookingConflict.service.js#recordNoShow` | `GROUND_BOOKING_STATUS_CHANGED` |
| New canteen order | `canteenOrder.controller.js#createOrder` | `CANTEEN_ORDER_RECEIVED` |
| Canteen order status changed | `canteenOrder.controller.js#updateOrderStatus` | `CANTEEN_ORDER_STATUS_CHANGED` |
| Low stock | on-demand, dashboard load | `CANTEEN_LOW_STOCK` |
| Today's menu not published | on-demand, dashboard load | `CANTEEN_MENU_NOT_PUBLISHED` |
| Staff deactivated | `groundStaff.service.js#disableStaffMembership` | `GROUND_STAFF_DEACTIVATED` |
| (general-purpose) | available for future use | `GROUND_OPERATIONAL_ALERT` |

`GROUND_STAFF_ACTIVATED` exists in the type list but has no trigger: no "reactivate a disabled staff member" feature exists anywhere in the codebase to hook into (only `disableStaffMembership` exists) — building one would be new Phase 7 functionality, out of scope for a notifications phase. Documented as a known limitation (§14), not silently dropped.

**Frontend**: `NotificationBell` now renders inside `GroundOwnerSidebar.jsx` (the Ground Owner portal previously had zero notification visibility — no header, no bell, at all). Fixed a real bug: `useNotifications.js` used to silently swallow fetch errors (`.catch(() => {})`), leaving the bell permanently showing "you're all caught up" on failure — now surfaces a real error state with retry. Added click-through navigation (booking/canteen/staff types route to the relevant Ground Owner section) via a new `ground_public_id` field joined into the notification response — never the raw internal `ground_id`, keeping the existing "only public_*_id ever reaches the wire" convention intact.

---

## 3. Phase 16 — Dashboard Architecture

**Reused verbatim, unmodified**: `domain/booking/utilization.js#computeUtilization`, the Phase 14 revenue/utilization definitions (`Completed`-only revenue, `GROUND_OPENING_HOUR`/`GROUND_CLOSING_HOUR` day math), the Phase 9 dashboard's existing structure and every existing field, `getDayAvailability` (Owner's own availability engine), `StatTile`/`StatsErrorState`/`StatsLoadingGrid`.

**Extended, additive**:
- `GET /ground-owner/grounds/:id/dashboard` (Phase 9) response gains `today.currentBooking`, `today.nextBooking`, `today.availableSlotsCount`, `today.blockedSlotsCount`, `canteen: {...}`, `staff: {...}` — every existing field unchanged.
- New sibling endpoint `GET /ground-owner/grounds/:id/analytics/trends` — day-by-day series (`bookingCount`, `canteenRevenue`, `utilizedPercentage`), kept separate from the existing snapshot `/analytics` endpoint per the approved inspection report's recommendation (different response shape; a caller that only needs the snapshot never pays for trend queries).

**Performance — no N+1**: every trend/snapshot metric is exactly one `GROUP BY` query for the whole date range (`dailyBookingCountsForGround`, `dailyOccupiedHoursForGround`, `dailyRevenueForGround`, `countOrdersByStatusForGround`, `topSellingItemsForGround`, `countStaffByRoleAndStatus`) — never a per-day loop issuing separate queries. `computeUtilization` runs once per day in the trend response, but that's pure in-memory arithmetic on already-fetched rows, not a database round-trip. The one genuine per-resource loop (`lowStockItemsForCanteen` called once per canteen) is bounded by canteen count on a single ground (typically 1, rarely more than a handful) — not the N+1-over-dates anti-pattern the brief warned against.

**"Revenue trend" definition**: `ground_bookings` has no price/amount column anywhere in this schema — booking revenue was never tracked. "Revenue trend" is therefore the canteen revenue day-by-day series, the only real revenue this platform tracks (same definition Phase 14 already established for the snapshot). Not a fabricated figure.

**Multi-ground safety**: no "all my grounds" aggregate view was introduced — confirmed in the approved inspection report that none exists today and building one wasn't designed-for-securely; every Phase 16 endpoint stays strictly per-ground, identical posture to every other Ground Owner route.

**Frontend**: `GroundOperationsPage.jsx` gains Current/Next Booking, Available/Blocked Slot tiles, a Canteen section (revenue, order-status tiles, low-stock chips, top-selling chips), and a Staff section (active/inactive, role breakdown) — all reusing `StatTile`. `GroundAnalyticsPage.jsx` gains a Trends section with a small CSS-only bar chart (`TrendBars`, no charting library added) for bookings/revenue/utilization, reusing the page's existing date-range control.

---

## 4. Database / Migration Details

**Approved change, applied**:
```sql
ALTER TABLE ground_notifications ADD COLUMN IF NOT EXISTS ground_id INTEGER REFERENCES grounds(id) ON DELETE CASCADE;
ALTER TABLE ground_notifications ADD COLUMN IF NOT EXISTS related_order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ground_notifications_ground ON ground_notifications(user_id, ground_id, created_at DESC) WHERE ground_id IS NOT NULL;
-- ground_notifications_type_check widened: 29 existing values + 10 new Ground-Owner-facing values (39 total)
```
Applied via the project's existing single idempotent `schema.sql` + `node src/config/migrate.js` mechanism — no separate migration-file system exists in this project, confirmed before writing anything. No down/rollback path exists in the project's own tooling (none of the prior 6 historical widenings in this same file have one either) — reverting, if ever needed, is the same manual `ALTER TABLE DROP COLUMN`/constraint-revert any of those would require.

**Verified**: `node src/config/migrate.js` runs cleanly, twice in a row (idempotent), confirmed via direct schema inspection — all existing rows, all 29 existing type values, and every existing index preserved untouched.

**Directly-necessitated bug fix** (not a second schema change — five one-line additions to five *pre-existing* CHECK constraint lists, each already scheduled to be dropped and replaced by the very next widening in the file): `PROPOSAL_ACCEPTED` (a real, live value in this database from an actual accepted match proposal) is now included in all six historical widening steps, not just the final one — restoring `migrate.js`'s ability to be re-run against a populated database at all, which was silently broken before this phase touched the file.

**No other schema changes.** Every other Phase 16 data source (`ground_bookings`, `orders`, `order_items`, `today_menu_items`, `menu_items`, `ground_users`) already existed with everything needed.

---

## 5. API Changes

| Method | Path | Status |
|---|---|---|
| GET | `/ground-owner/grounds/:id/notifications` | New (Phase 15) |
| POST | `/ground-owner/grounds/:id/notifications/:id/read` | New (Phase 15) |
| POST | `/ground-owner/grounds/:id/notifications/read-all` | New (Phase 15) |
| GET | `/api/ground/notifications` (+ mark-read, +read-all) | Unchanged (global inbox, gains `ground_public_id` field only) |
| GET | `/ground-owner/grounds/:id/dashboard` | Extended (Phase 16) — additive fields only |
| GET | `/ground-owner/grounds/:id/analytics/trends` | New (Phase 16) |

All new endpoints: `requireAuth` + `requireGroundRole('GROUND_OWNER')`, identical posture to every existing Owner-only route (Reviews, Analytics, Export from Phase 13/14).

---

## 6. Security Verification

| Area | Result |
|---|---|
| Authentication | Every new endpoint rejects unauthenticated requests (401) — tested. |
| Authorization | `requireGroundRole('GROUND_OWNER')` on all new routes — non-owner rejected (403) — tested. |
| MFA | Explicitly tested with a real non-MFA-verified login (`loginViaOtp`) against notifications, dashboard, and trends — all return `403 MFA_REQUIRED`. |
| Privilege escalation | Explicitly tested: a `GROUND_ADMIN` staff member granted **every** existing permission is still rejected on notifications, dashboard, and trends — structurally impossible via `requireGroundRole`, not just runtime-checked. |
| Ground isolation | Owner A rejected (403) reading Owner B's notifications, dashboard, and trends — tested, including a dedicated cross-ground canteen/staff-data test. |
| Notification recipient isolation | Explicitly tested: Owner A cannot mark Owner B's notification read (even by id, even from Owner A's own ground context) and Owner A's mark-all-read never touches Owner B's rows. A second test confirms mark-all-read on one of an owner's OWN grounds never touches their OTHER ground's notifications. |
| IDOR | `req.ground.id`/`req.user.id` (both server-resolved) are the only identifiers ever used in any new query — never a client-supplied `groundId`. A malformed/adversarial `range` query param falls back safely (pre-existing allow-list pattern, reused unchanged). |
| SQL parameterization | Every new query uses parameterized placeholders (`$1`, `$2`, ...) — no string concatenation anywhere in the new code. |
| Sensitive data leakage | No emails/phones/passwords in any new response. Low-stock/top-selling data is Owner-only (never public). Canteen revenue stays Owner-only, same posture as Phase 14. |

---

## 7. Test Results

| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `groundOwnerNotifications.integration.test.js` (Phase 15) | 16 | 16 | 0 |
| `groundOwnerDashboardIntelligence.integration.test.js` (Phase 16) | 13 | 13 | 0 |
| **Phase 15/16 total** | **29** | **29** | **0** |

Combined regression pass (Phase 15/16 + every directly-related existing suite — `groundOwnerDashboard`, `groundOwnerAnalytics`, `groundOwnerBusinessReports`, `groundOwnerReviews`, `groundOwnerBooking`, `groundOwnerCanteen`, `groundStaff`, `groundOps`, `teamBooking`, `matchFeedback` — 12 files run together in one process): **132/132 passing**, including `CHECK-IN / NO-SHOW` (exercises the exact `recordNoShow` function modified for the booking-status-change trigger) and `groundOps` (exercises the legacy platform-wide utilization path whose underlying repository functions Phase 14/16 both extended).

## 8. Full Backend Regression Suite

_[A complete single-process run across every `*.integration.test.js` file was launched; exact pass/fail/skip counts appended below once it completes.]_

## 9. Frontend Build Result

**Passing**, zero errors, confirmed after every Phase 15 and Phase 16 frontend change (checked incrementally, not just once at the end).

---

## 10. Ground Isolation Verification

Every new/extended endpoint scopes exclusively by `req.ground.id` (server-resolved via `requireGroundRole` from the authenticated user's real `ground_users` membership) — confirmed by direct code review and by explicit cross-ground tests on all three new capability areas (notifications, dashboard, trends). No endpoint accepts or trusts a client-supplied ground identifier for authorization at any point.

## 11. IDOR Verification

Confirmed no `req.body.groundId`/`req.query.groundId` is ever read for authorization anywhere in the new code. The one place a raw internal id could have leaked (notification → ground navigation) was deliberately resolved server-side to `ground_public_id` via a join, never exposing `ground_id` as a routable identifier.

## 12. Performance / Query Strategy

Documented in detail in §3 above. Every trend/snapshot metric — booking counts, occupied hours, canteen revenue, order-status counts, top-selling items, staff counts — is one `GROUP BY` query for the entire requested date range, never a per-day loop. Verified directly: a `LAST_30_DAYS` trends request issues the same fixed number of queries as a `TODAY` request (4 total: booking counts, occupied hours, canteen revenue, match dates), confirmed by code inspection of `getTrends`.

## 13. Files Created

- `server/src/realtime/notificationRealtime.js`
- `server/src/tests/integration/groundOwnerNotifications.integration.test.js` (16 tests)
- `server/src/tests/integration/groundOwnerDashboardIntelligence.integration.test.js` (13 tests)
- `client/src/hooks/useGroundTrends.js`

## 14. Files Modified

**Phase 15**: `server/src/config/schema.sql`, `server/src/repositories/groundNotification.repository.js`, `server/src/services/groundNotification.service.js`, `server/src/controllers/groundOwner.controller.js`, `server/src/routes/groundOwner.routes.js`, `server/src/services/groundBooking.service.js`, `server/src/controllers/groundBooking.controller.js`, `server/src/services/bookingConflict.service.js`, `server/src/controllers/teamBooking.controller.js`, `server/src/controllers/canteenOrder.controller.js`, `server/src/services/groundStaff.service.js`, `client/src/hooks/useNotifications.js`, `client/src/components/layout/NotificationBell.jsx`, `client/src/components/ground-owner/GroundOwnerSidebar.jsx`.

**Phase 16**: `server/src/models/groundUser.model.js`, `server/src/models/canteenOrder.model.js`, `server/src/models/canteenTodayMenu.model.js`, `server/src/repositories/groundBooking.repository.js`, `server/src/services/groundOwnerAnalytics.service.js`, `server/src/services/groundOwner.service.js`, `server/src/controllers/groundOwner.controller.js` (shared file), `server/src/routes/groundOwner.routes.js` (shared file), `client/src/pages/ground-owner/GroundOperationsPage.jsx`, `client/src/pages/ground-owner/GroundAnalyticsPage.jsx`, `client/src/services/groundOwnerApi.js`.

---

## 15. Known Limitations

- `GROUND_STAFF_ACTIVATED` has no trigger — no staff-reactivation feature exists anywhere in this codebase to hook into; building one is Phase 7 (Staff Management) scope, not Phase 15.
- Low-stock/menu-not-published notifications are on-demand (checked when the dashboard loads), not real-time from the moment stock actually drops or midnight passes — an explicit, documented tradeoff from the approved inspection report to avoid introducing new scheduler infrastructure for two minor alert types.
- The written-comment/reviewer-identity constraints from Phase 13 are unrelated and unaffected.
- CSV export (Phase 14) does not yet include trend data — the export remains a summary-per-metric report, unchanged in scope.

## 16. Production Readiness

Pending the full single-process regression run (§8) — see verdict below, updated once that completes.

---

## FULL SUITE ADDENDUM

_(Appended once the background full-suite run completes.)_
