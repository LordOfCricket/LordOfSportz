# Phase 21 + Phase 22 — Architecture Inspection Report

**Scope**: Phase 21 (Production Operations & Incident Readiness) + Phase 22 (Real-World UX Hardening).
**Status**: Inspection only. No implementation has occurred yet — this report is the gate the user
required before any code changes begin.

## 0. How this inspection was conducted

This session's own prior work (Phases 9–18, plus the `FINAL_LOC_PRODUCTION_GAP_AUDIT.md`) already
established deep, verified knowledge of logging, error handling, health checks, notification
best-effort behavior, and canteen/booking idempotency. That existing knowledge was **re-verified
against the current repository state** (not assumed current) and extended with fresh, targeted
inspection in the areas never previously audited: request traceability, non-booking idempotency,
and frontend UX outside the Ground Owner portal (auth, canteen customer-ordering, public site,
accessibility, mobile).

A significant, unexpected finding surfaced during this pass: **this repository already contains a
separate, more advanced hardening track — "Phase 19" and "Phase 20" — that is not part of this
session's own Phase-9-through-18 lineage** (confirmed via `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`,
`docs/TECHNICAL_DEBT.md`, and git history, all dated before and independent of this session). That
track already delivered: security headers (helmet), standardized error handling with no stack-trace
leakage, rate limiting across auth/AI/booking/analytics, health/readiness endpoints, response
compression, tuned Postgres pool settings, fail-fast env validation, code-split frontend bundle, and
— critically for Phase 21 — **a real, tested backup/restore mechanism and a Disaster Recovery section
in `docs/DEPLOYMENT.md`** (backed up 60 tables/3,647 rows, restored, and verified row-for-row on
2026-08-17).

Per the user's explicit direction ("treat this as the direct continuation of 17/18"), this inspection
does **not** re-litigate or re-verify that separate track's claims from scratch — it takes them as
existing repository fact (the same way this session already treats its own Phase 17/18 work as fact),
and focuses Phase 21/22's actual implementation effort on the **genuine gaps that remain** after that
existing work is accounted for. Duplicating already-solid infrastructure would violate the "don't
replace working things" rule as much as skipping real gaps would violate the audit's honesty rule.

---

## 1. What already exists (verified, not to be duplicated)

| Area | Status | Evidence |
|---|---|---|
| Structured JSON logging | Mature | `utils/logger.js`; used consistently across controllers/services/middlewares |
| Centralized error handling, no stack-trace leakage | Mature | `middlewares/errorHandler.js`; covered by `healthAndErrorHandling.integration.test.js` (Phase 18, this session) |
| Liveness/readiness health checks | Mature | `controllers/health.controller.js`; `/api/health`, `/api/health/ready` |
| Security headers, rate limiting | Mature | `helmet()`, `middlewares/rateLimit.js` (Phase 19 track) |
| Backup/restore, disaster recovery documentation | Mature, tested | `docs/DEPLOYMENT.md` §"Backup & restore", §"Disaster recovery" (Phase 8 + Phase 20 track) |
| Graceful degradation of optional services (Mongo, AI, Google Calendar) | Mature | `docs/DEPLOYMENT.md` env table; verified via `checkOperationalAlerts`/`createNotification` try/catch patterns |
| Notification/audit-log writes never block the primary action | Mature | `groundNotification.service.js` (read directly this pass) — `createNotification` always try/catches, returns `null` on failure, logs `error` level, never throws |
| Booking idempotency (double-submit) | Mature | Postgres `EXCLUDE` constraints + `clientActionId` dedup (verified in earlier phases this session) |
| Canteen order creation idempotency | Mature | Partial unique index `idx_orders_one_active_per_canteen_user` (verified in Phase 17.1 this session) |
| Staff creation / permission grant idempotency | Mature | DB-enforced unique constraints (`ground_users_user_id_ground_id_role_key`, `idx_staff_permissions_active_unique`) — freshly verified this pass |
| Menu publishing idempotency | Mature | Naturally idempotent transactional replace — freshly verified this pass |
| Ground suspension idempotency | Mature | Conditional `UPDATE ... WHERE status = ...` — freshly verified this pass |
| Session revocation (compromised-account response primitive) | Exists, unused for incident docs | `services/session.service.js`: `revokeSession`, `revokeAllSessionsForUser`, `revokeAllSessionsForUserExceptCurrent` |
| Auth UX (login, MFA verify, forced password change, security settings) | Mature | Real `submitting`/error-banner states throughout — freshly verified this pass |
| Notification UX resilience (missing/stale referenced entity) | Mature | `NotificationBell.jsx` never dereferences a nested booking/order object, degrades to a generic icon — freshly verified this pass |
| Public ground discovery/detail UX, suspended-ground non-leakage | Mature | `useGround.js`, `ground.controller.js` — a suspended ground 404s exactly like an unknown one — freshly verified this pass |
| Customer booking-conflict UX | Mature | `useBookingFlow.js` — real `submitting` state, explicit 409→alternatives handling, distinct error path — freshly verified this pass |
| Accessibility basics (labels, aria-labels, alt text, focus rings, dialog roles) | Mature | Sampled across `Input.jsx`, `NotificationBell.jsx`, `GroundCard.jsx`, `StepUpModal.jsx` — freshly verified this pass |
| Mobile/responsive layout in Ground Owner pages | Mature | No raw `<table>`/fixed-width overflow risk found — freshly verified this pass |
| Ground Owner UX (dashboard, analytics, reviews, notifications) | Mature | Built directly in this session's Phase 9–16 |

**Conclusion**: the large majority of both phases' surface area is already solid. Real work is
concentrated in a small number of genuine, verified gaps — listed below.

---

## 2. What is incomplete (genuine gaps — these get implemented)

### Phase 21

**21.2 — Request traceability: does not exist at all.**
Exhaustively confirmed (grepped `app.js`, `server.js`, `package.json`, `logger.js`, `errorHandler.js`,
`client/src/services/api.js`): no request-id/correlation-id mechanism anywhere in the stack. No
`morgan`/`pino`/`express-request-id`/`cls-hooked` dependency exists. Every log line only carries
whatever fields each call site manually passes — there is no way today to correlate every log line
belonging to one HTTP request, which is the core capability Phase 21.1's "incident visibility" needs
once more than a handful of requests are in flight.

**21.4 — Idempotency: one genuine duplicate-side-effect bug found.**
`canteenOrder.model.js#updateOrderStatusByPublicId` (line 227) has no guard against re-applying the
*same* status. `canteenOrder.controller.js#updateOrderStatus` unconditionally re-emits
`order-status-updated`/`order-completed` Socket.IO events and creates a **second**
`CANTEEN_ORDER_STATUS_CHANGED` Ground-Owner notification for the same logical transition on every
repeat call (e.g. a staff member double-clicking "Mark Completed" before the UI updates). Not a
security or data-integrity issue — a real, user-visible duplicate-notification annoyance.

**21.6 — Backup/recovery documentation exists but not in the requested runbook shape.**
`docs/DEPLOYMENT.md` already has real, tested backup/restore and disaster-recovery content, but it's
written as **reference documentation** (what exists, how it works), not as an **incident runbook**
(what to do, in what order, under time pressure, during an actual outage). The user's spec explicitly
asks for `PRODUCTION_RECOVERY_RUNBOOK.md`. This will be a genuinely new, playbook-shaped document that
cross-references `docs/DEPLOYMENT.md` for full technical detail rather than duplicating it.

**21.7 — Security incident readiness documentation: does not exist.**
No `docs/SECURITY.md` section, no standalone doc, covers "what do we do when an account/staff
member/ground owner is compromised." This is a genuine, real gap. It requires **zero new code** —
every primitive needed already exists and was confirmed this pass (`session.service.js`'s three
revoke functions, `adminPasswordRecovery.service.js`'s forced reset, `groundStaff.service.js`'s staff
disable, `adminGrounds.controller.js`'s ground suspension, `accountAudit.service.js`'s forensic
audit trail). This is purely a documentation deliverable assembling existing mechanisms into a
step-by-step response procedure.

### Phase 22

**22.1 — Auth UX: no global session-expiry handling.**
`client/src/services/api.js` has no response interceptor (the file's own comment confirms the old
one was deliberately removed in Phase 8 and never replaced). A session that expires mid-use (cookie
expired, or revoked by an admin/security action) is never centrally detected — each page's own hook
independently treats the resulting 401 as a generic load error, so the user sees a stale or broken
screen instead of being routed back to `/login`. Confirmed as a real, broadly-impacting gap by direct
inspection (also independently confirmed by the UX audit subagent).

**22.4 — Canteen customer-ordering UX: two genuine gaps.**
1. `client/src/hooks/useCanteenMenu.js` (`handlePlaceOrder`, ~line 200) treats **every** 409 response
   as "you already have an active order," including the Phase 17.2 `CANTEEN_CLOSED`/`GROUND_CLOSED`
   cases and the Phase 17.1 `ITEM_UNAVAILABLE`/`INSUFFICIENT_STOCK` cases — all of which carry a
   distinct `code` field the backend already returns but the frontend never reads. A customer ordering
   from a closed canteen sees a misleading "already have an active order" message instead of the real
   reason.
2. `handlePlaceOrder` has no `submitting`/in-flight state, and the "Place Order" button has no
   `disabled` binding to it — a double-click can fire duplicate order requests (the backend's unique
   index absorbs the *data* duplication safely, but the user still gets a confusing second response).

Both confirmed independently by direct inspection of `canteenOrder.controller.js`'s actual `code`
values and the UX audit subagent's review of `useCanteenMenu.js`.

---

## 3. What is duplicated

Nothing found. No two implementations of the same concern were discovered in either phase's scope —
the "Phase 19/20" track and this session's Phase 17/18 work are complementary (different files,
different concerns), not overlapping.

## 4. What can be reused

- The existing `try/catch`-returns-`null`, `logger.error`-and-continue pattern already established in
  `groundNotification.service.js` and `groundAuditLog.service.js` is the template for any new
  best-effort write path — no new pattern needs inventing for Phase 21.5 (which is otherwise already
  satisfied).
- `AsyncLocalStorage` (Node builtin, zero new dependency) is the correct mechanism for request-id
  propagation into `logger.js` without touching every one of its ~40+ call sites.
- `crypto.randomUUID()` (Node builtin) is sufficient for request-id generation — no `uuid` package
  needed.
- `RequireAuth.jsx`'s existing `status === 'unauthenticated' → <Navigate to="/login" />` gate is the
  correct target for the new session-expiry handling — the fix should reset `AuthContext`'s state and
  let this existing guard do the actual redirect, rather than building a second, parallel redirect
  mechanism.
- `session.service.js`, `adminPasswordRecovery.service.js`, `groundStaff.service.js`,
  `adminGrounds.controller.js`, `accountAudit.service.js` are reused as-is (read-only, as
  documentation subjects) for the Phase 21.7 security incident runbook — no code changes to any of
  them.

## 5. What genuinely needs implementation

1. `server/src/middlewares/requestId.js` (new) — generates or accepts `X-Request-Id`, sets `req.id`,
   echoes it as a response header.
2. `server/src/utils/logger.js` — `AsyncLocalStorage`-backed context so every log line automatically
   includes the current request's id with no per-call-site changes.
3. `server/src/app.js` — register the request-id middleware first, before `helmet`.
4. `server/src/middlewares/errorHandler.js` — include `requestId` in all three JSON error-response
   branches.
5. `server/src/models/canteenOrder.model.js` — `updateOrderStatusByPublicId`: add
   `AND status IS DISTINCT FROM $1` to the `UPDATE ... WHERE` clause.
6. `server/src/controllers/canteenOrder.controller.js` — `updateOrderStatus`: when the model returns
   `null`, distinguish "truly not found" (404) from "already in that status" (idempotent 200, no
   socket re-emit, no duplicate notification) via a lookup on the existing `findOrderById`.
7. `PRODUCTION_RECOVERY_RUNBOOK.md` (new) — incident-playbook document, cross-referencing
   `docs/DEPLOYMENT.md` rather than duplicating it.
8. Security incident readiness documentation (new section, in the runbook or `docs/SECURITY.md`) —
   pure documentation, zero code.
9. `client/src/services/api.js` — response interceptor: on a 401 from any request other than
   `/auth/me`, dispatch a `window` event.
10. `client/src/context/AuthContext.jsx` — listen for that event, reset auth state to
    `'unauthenticated'` (same fields `logout()` already resets, minus the redundant server call).
11. `client/src/hooks/useCanteenMenu.js` — branch the 409 handler on `err.response.data.code` instead
    of assuming "already have an active order" for every 409; add a `placing`/submitting state.
12. `client/src/pages/canteen/menu/menu.jsx` — bind the new submitting state to the "Place Order"
    button's `disabled`.

Everything else audited across both phases (booking UX, Ground Owner UX, notification UX, analytics/
report UX, public website UX, accessibility, mobile, most of idempotency, all of graceful failure) is
already correct and will **not** be touched, per the "don't rewrite working things" rule.

## 6. Security implications

- The request-id addition touches `app.js`'s middleware chain and `errorHandler.js` — both
  security-sensitive files. The new middleware must run **before** `helmet` (confirmed placement) and
  must never itself become a new trust boundary: an inbound `X-Request-Id` header is accepted and
  echoed back for correlation convenience only, never used for any authorization or business-logic
  decision.
- The canteen order-status idempotency fix touches no authorization logic — `updateOrderStatusByPublicId`
  keeps its existing `canteen_id`-scoped `WHERE` clause unchanged; only the status-transition guard is
  added.
- The auth-UX session-expiry fix must not weaken anything: it only reacts to a 401 the server has
  already, independently decided to return. It grants no new access and revokes none beyond what the
  server already revoked.
- The security incident runbook documents **only already-existing, already-tested mechanisms** — MFA,
  RBAC, ground isolation, and every Phase 17/18 integrity control remain completely untouched.

## 7. Performance implications

- `AsyncLocalStorage` has a small, well-understood per-request overhead (context propagation through
  async boundaries) — negligible at LOC's current scale and already the standard Node.js pattern for
  this exact problem; no alternative was seriously considered.
- The idempotency fix adds at most one extra indexed lookup (`findOrderById`, already used elsewhere
  in the same file) only on the already-rare "no-op transition" path — no change to the common-case
  cost.
- No other implementation item has a measurable performance surface.

## 8. UX implications

Both Phase 22 fixes directly improve real user-facing confusion (a customer told they have an active
order when the real problem is a closed canteen or a sold-out item; any user whose session dies mid-use
seeing a broken page instead of a clean sign-in prompt). No other UX change is planned — deliberately,
since the rest of the surface audited clean.

## 9. Database implications

**No schema migration is required for either phase.** The one behavior change
(`updateOrderStatusByPublicId`) is a `WHERE`-clause refinement on an existing query, not a schema
change. Confirmed per the user's own "prefer no migration" rule — nothing in this inspection surfaced
a need for a new column, table, or constraint.

## 10. Exact files likely to change

Backend: `server/src/middlewares/requestId.js` (new), `server/src/utils/logger.js`,
`server/src/app.js`, `server/src/middlewares/errorHandler.js`, `server/src/models/canteenOrder.model.js`,
`server/src/controllers/canteenOrder.controller.js`.

Frontend: `client/src/services/api.js`, `client/src/context/AuthContext.jsx`,
`client/src/hooks/useCanteenMenu.js`, `client/src/pages/canteen/menu/menu.jsx`.

Docs: `PRODUCTION_RECOVERY_RUNBOOK.md` (new), possibly a new section appended to `docs/SECURITY.md`.

Tests: new integration test files for request-id propagation and canteen order-status idempotency;
possibly a new/extended frontend behavioral note for the 401 interceptor (this project has no frontend
test runner — per `docs/TECHNICAL_DEBT.md`'s own documented, deliberate P2 item — so this will be
verified via real build + manual/logical verification, consistent with how every prior phase in this
session has handled frontend-only changes).

## 11. Exact tests required

1. Request-id: absent inbound header → server generates one, present in the response header.
2. Request-id: inbound `X-Request-Id` header → server honors and echoes the same value.
3. Request-id: appears in a domain-error JSON response body.
4. Request-id: appears in a generic 500 JSON response body.
5. Request-id: two concurrent requests never see each other's id (AsyncLocalStorage isolation).
6. Canteen order status: repeating the same status transition returns 200 idempotently, does not
   re-emit `order-status-updated`.
7. Canteen order status: repeating the same status transition does not create a second
   `CANTEEN_ORDER_STATUS_CHANGED` notification.
8. Canteen order status: a genuinely unknown order id still returns 404 (regression — the new `WHERE`
   clause must not turn a true 404 into a false idempotent-200).
9. Canteen order status: a genuinely different transition (e.g. Preparing → Completed) still updates
   normally and still emits/notifies once (regression).
10. Canteen order status: cross-canteen id still 404s (IDOR regression, existing guarantee).
11–15+: existing regression coverage for booking idempotency, canteen order creation idempotency,
   staff/permission idempotency, notification best-effort behavior, and health/error-handling
   (Phase 18's own suite) re-run as part of the full-suite regression pass rather than rewritten —
   these already exist and already pass; Phase 21's job is to confirm they still do after the new
   changes, not duplicate them.

Full regression suite (auth/MFA, Ground Owner, booking, canteen, notification, analytics/report,
security/IDOR, full backend integration, frontend production build) will be run and reported with
exact numbers per the user's explicit requirement, after the above are implemented and passing in
isolation.

---

## Authorization to proceed

This inspection is complete. Per the user's explicit rule ("DO NOT implement anything until this
inspection is complete"), implementation begins now that this document exists and the gaps above are
evidence-based, not assumed.
