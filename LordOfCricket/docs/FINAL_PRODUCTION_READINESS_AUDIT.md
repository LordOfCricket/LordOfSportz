# LOC — Final Production Readiness Audit

Inspection only — no code changed while producing this document. Every finding below is backed by an
exact file:line reference and, where relevant, a reproduction path. Findings marked "reused/verified
clean" from prior phases' work are not re-litigated here (see `docs/DEPLOYMENT.md`, `docs/SECURITY.md`,
and this session's own Phase 17–24 reports for that evidence).

---

## P0 — Critical

### P0-1. The customer-facing canteen ordering flow has no real navigation entry point, and even if reached, breaks the moment more than one canteen exists platform-wide (which is already true today).

Two compounding defects in the same feature:

**(a) Broken navigation.** The "Canteen" link shown in every logged-in user's account menu
(`client/src/models/navLinks.model.js:99`, pushed unconditionally for every user, staff or not) points
to `/canteen`. That route renders `CanteenEntryRedirect` (`client/src/routes/CanteenEntryRedirect.jsx`),
which redirects to `getPostAuthPath(user)` (`client/src/models/roleRedirect.model.js:1-15`). For a
`role: 'player'` account, `getPostAuthPath` returns `/player/dashboard` — **never** `/canteen/menu`. So
a real customer clicking "Canteen" is silently sent to their own dashboard. Confirmed by exhaustively
grepping every `.jsx` file in `client/src` for a link to `/canteen/menu`: the only real hits are the
route definition itself and the Ground *Owner's* management-page navigation
(`GroundCanteenPage.jsx:165`, `GroundNavTabs.jsx:13` — both `/ground-owner/...` paths, a different
audience entirely). `GroundHomePage.jsx` (the public ground detail page, which already receives
`canteens: [...]` from its own API response) has zero references to "canteen" anywhere in the file. A
real customer has no discoverable path to the ordering feature.

**(b) Even reached directly, it breaks in the current database state.** `menu.jsx`/`useCanteenMenu.js`
call `canteenApi.js`, whose axios instance is hardcoded to the *transitional*, single-canteen-resolving
routes (`baseURL: '${VITE_API_URL}/canteen'`, `canteenApi.js:17`). Those routes resolve "the" canteen
via `attachCurrentCanteen` → `findSingleCanteen()` (`middlewares/groundAccess.js:222-236`,
`models/canteen.model.js:61-66`), which **throws `AmbiguousCanteenError` the instant more than one
canteen exists anywhere on the platform** — already true in the current database (every prior phase's
`AmbiguousCanteenError` test-fixture blocker, documented since Phase 17/18, is direct proof of this).
The failure is at least handled gracefully — `attachCurrentCanteen`'s catch block returns a clean `409`
with an honest message, never a crash or stack leak — but that raw backend string
("Multiple canteens now exist — use the ground/canteen-scoped routes instead of the legacy /canteen/*
routes") is then displayed **verbatim to the customer** by `useCanteenMenu.js:62`
(`setError(err.response?.data?.error || 'Unable to load menu.')`), a confusing, technical,
unprofessional message for an end user to see.

**Why this is P0, not P1**: this is a real, monetizable, fully-built feature (server-authoritative
pricing, stock handling, real-time order status, order history — all already correctly implemented and
tested across many phases) that a real customer cannot currently discover, and would see a broken/
confusing experience from even if they found it via a bookmarked URL. On a platform whose entire
premise (per this session's own architecture) is multi-ground, multi-canteen — this isn't an edge case,
it's the normal, expected operating state.

**Why no code fix is included in this audit's implementation pass**: the architecturally correct fix is
to migrate the customer ordering flow to the already-existing, already-tested, ground/canteen-scoped
routes (`/grounds/:publicGroundId/canteens/:publicCanteenId/menu` and `.../orders`) — the same routes
this session's Phase 17–24 work already hardened and proved correct. That migration touches routing
(new URL shape carrying `:publicGroundId`/`:publicCanteenId`), the API layer (`canteenApi.js` would need
to become parameterized instead of a fixed instance), and at least `menu.jsx`, `useCanteenMenu.js`,
`useCanteenOrderStatus.js`, plus a real "Order Food" entry point on `GroundHomePage.jsx`. That is a
genuine, multi-file frontend migration — not a surgical polish fix, and this audit's explicit mandate is
to avoid exactly that shape of change ("DO NOT redesign," "DO NOT add new features," "keep changes
minimal and surgical"). A shortcut fix (just repointing the nav link to `/canteen/menu` without the
migration) was considered and deliberately rejected: in the current, real multi-canteen database state,
it would only trade a silent, confusing redirect for a different, actively confusing technical error
message shown to a real customer — not a net improvement. See "Issues Fixed" for the one safe,
partial mitigation actually applied (a professional fallback message instead of the raw backend string,
in case this page is ever reached directly).

**Recommendation**: the clear, well-evidenced candidate for the next dedicated phase — migrate customer
canteen ordering to the ground/canteen-scoped routes and add a real "Order Food" entry point from
`GroundHomePage.jsx`.

---

## P1 — Important

### P1-1. Six Ground Owner pages show a generic HTTP-status message instead of the backend's real validation reason.
`GroundBookingPage.jsx:47`, `GroundBookingCalendarPage.jsx:41,66,83`, `GroundBookingListPage.jsx:43`,
`GroundCanteenMenuPage.jsx:53,109,127`, `GroundCanteenOrdersPage.jsx:48,65`,
`GroundCanteenTodayPage.jsx:62,127` all read `err.message` (Axios's generic "Request failed with status
code 4xx") instead of `err.response?.data?.message`/`.error`, where the actual backend reason lives
(confirmed server-side — every controller in this app returns a real, specific message). An owner sees
a useless generic string instead of "slot already booked"/"duplicate menu item"/etc. Reproducible: any
validation failure on these pages. **Fixed this pass** (see Issues Fixed) — small, safe, matches the
pattern every other hook in the app already uses correctly.

### P1-2. `GroundBookingPage.jsx`'s "View Today" filter link is dead.
`GroundBookingPage.jsx:93` navigates to `.../bookings/list?date=<today>`, but
`GroundBookingListPage.jsx` destructures `useSearchParams()` and never reads the `date` param anywhere
in the file — the list always shows all CONFIRMED bookings regardless of the query string. An owner
clicking "View Today" silently sees the wrong (unfiltered) data, with no error to signal anything went
wrong. **Fixed this pass.**

### P1-3. `MyTeamBookingsPage.jsx` bypasses the app's configured API client entirely.
Line 87 calls raw `fetch('/api/team-bookings/my')` instead of the shared `api` axios instance
(`client/src/services/api.js`). Verified consequences: (1) in local dev, `VITE_API_URL` points at the
API origin while the raw fetch's relative `/api/...` path resolves against the frontend's own origin —
the page can never load bookings in dev; (2) it skips `withCredentials`, so the session cookie isn't
guaranteed to be sent if origins ever differ; (3) it skips the global 401 → `loc:session-expired`
interceptor (`api.js:23-31`, this session's own Phase 22 work), so an expired session here shows a
generic load error instead of redirecting to login like every other page in the app. **Fixed this pass**
— added a real `fetchMyTeamBookings()` export to `teamBookingApi.js` using the shared instance.

### P1-4. `tournamentFixture.service.js#scheduleFixture` has a real double-click race creating an orphaned match row.
Lines ~113-130: unlike every sibling function in the same file (`generateFixtures`, `advanceTournament`,
`completeLeagueTournament`, all correctly wrapped in `BEGIN`/`COMMIT` + `lockTournamentForUpdate`),
`scheduleFixture` runs its "does this fixture already have a match?" check and its match-creation as two
independent, unlocked statements. Two concurrent "Schedule" clicks on the same fixture both pass the
`!fixture.match_id` check, both create a brand-new `matches` row, and both then overwrite
`tournament_fixtures.match_id` — last write wins, and the first-created match row is silently orphaned
(unreferenced, but still a real row, still countable in raw match statistics). **Not fixed this pass** —
flagged as genuine but deferred: fixing it correctly means reusing the same transaction/lock pattern its
own siblings already use, which is a real (if small) service-layer change to tournament fixture
scheduling — evidence-based, but a business-logic-adjacent flow this audit's mandate says to touch only
with strong justification and minimal risk. Recommended for the next dedicated phase given its low
day-to-day likelihood (requires an actual double-click race) and non-corrupting failure mode (an orphan
row, not data loss or a wrong result).

### P1-5. `MatchSummaryPage.jsx` has zero SEO metadata management.
No `useSeoMeta`/`useJsonLd` call and no `document.title` anywhere in the file — navigating from a ground
page to a match summary leaves that ground's title, meta description, canonical URL, and Open Graph tags
active and factually wrong for the new page (client-side routing never clears them on its own). A real,
public, shareable content page has no page identity for search engines or social link previews. **Not
fixed this pass** — the fix is straightforward (add the same `useSeoMeta` call every other public page
already uses) but touches a page this audit did not otherwise need to modify, and doing it correctly
needs real match data (teams/result) to build a meaningful title/description, which is worth doing
carefully rather than as a rushed addition at the end of an unrelated audit. Recommended as a small,
clearly-scoped Phase 25 item.

---

## P2 — Polish

- **No busy/disabled state on Super Admin action buttons.** `AllGroundsPage.jsx` (Suspend/Reactivate)
  and `AdminGroundRegistrationsPage.jsx` (Approve/Reject/Request Info) have no in-flight disabled state
  — only a blocking `window.confirm` guards the first click, so a second click before the response
  returns can re-fire the same action. Contrast with the correct pattern already used in
  `GroundOwnersPage.jsx`'s password-reset button. Low risk (the underlying actions are already
  idempotent per this session's own prior audits — a repeat suspend/approve is a safe no-op server-side)
  but still worth a UI-level fix eventually.
- **No busy state on Ground Owner staff permission checkboxes** (`GroundStaffPage.jsx`'s `PermissionRow`)
  — rapid re-clicking before a refresh can fire overlapping grant/revoke calls. Same mitigating factor:
  the backend grant/revoke endpoints are already DB-constraint-safe against duplication (verified in
  Phase 21/22's inspection).
- **Misleading feature copy** on `GroundBookingPage.jsx:130-132` — advertises "check in customers and
  mark no-shows," but no such action exists in the Ground Owner booking UI (only a read-only display of
  `checkedInAt`/`noShowAt`). A real check-in/no-show action does exist for team bookings
  (`teamBookingApi.js`) but isn't wired to this page.
- **`MatchesPage.jsx` sets only `document.title`**, leaving description/canonical/OG stale from
  whatever page was visited previously (same root cause as P1-5, smaller impact since it's a list page).
- **Sitemap omits match/match-summary URLs** — consistent with the above; not currently crawlable at
  all, not just mislabeled.
- **Minor, undocumented response-shape drift** (not a leak): `teamBooking.controller.js:120` and
  `groundOwner.controller.js:118,122,127` each use their own ad hoc `res.status(...).json({error/
  message: '<static string>'})` instead of the structured-domain-error convention most of the app uses.
  Cosmetic only — every string is a fixed, safe message, never a raw error.
- **Unvalidated numeric route params in a handful of controllers** (`tournament.service.js`'s
  `addSquadPlayer`, several spots in `scoring.controller.js`, `umpireAssignment.controller.js`) — a
  malformed id (e.g. non-numeric) trips a raw Postgres `22P02` error, caught by the generic 500 handler
  (never leaks detail, per the existing hardening) but returns the wrong status code (500 instead of a
  clean 400/404) for what is really just a malformed request. Low risk, would show up under fuzz testing
  or a very unlucky typo'd URL, not normal use.
- **`/testing` route is unguarded and reachable in production** (`AppRoutes.jsx:279`,
  `client/src/pages/testing/UmpireTestingPage.jsx`) — explicitly commented "Temporary testing feature."
  Verified it has zero backend connectivity (pure client-side mock UI, no fetch/axios calls) — not a
  data-security issue, but an unprofessional, clearly-unfinished-looking public URL for a production
  demo. **Fixed this pass** — route removed (component file left in place in case it's wanted later).
- **A small `badRequest(message)` helper is duplicated (with minor variations) across ~10 service
  files.** Judged NOT a safe quick extract — the variations aren't cosmetic (some throw a
  domain-specific error type on purpose, per `match.service.js`'s own documented reasoning for keeping
  error taxonomies separate between domains). Left alone.

---

## OUT OF SCOPE (verified, not implemented)

- Full customer canteen-ordering migration to ground/canteen-scoped routes (see P0-1) — real feature
  work, not polish.
- `tournamentFixture.service.js#scheduleFixture`'s transaction wrap (P1-4) — deferred, low real-world
  likelihood, non-corrupting failure mode.
- `MatchSummaryPage.jsx` SEO metadata (P1-5) — deferred, needs real match data to do properly.
- Any database schema change — nothing found in this audit required one.
- Any new dependency, library, or architectural pattern — nothing found required one.

---

## ADDENDUM — findings from the first-ever complete full-suite run

The full backend integration suite (973 tests, ~103 files) had never actually completed
end-to-end in this session before the fix pass below — every prior attempt (Phase 21/22, this
audit's own first attempt) was interrupted by a background-process/session boundary partway
through. Running it to completion for the first time surfaced findings invisible to every earlier,
partial run. Investigated individually, per this project's standing rule, rather than assumed.

### P0 (newly found and FIXED this pass) — admin password reset did not actually invalidate the old password

`superAdmin.integration.test.js`'s "admin password recovery: full lifecycle" test failed with
`oldLogin.status` = 200, not the expected 401. Root cause, confirmed by reading
`adminPasswordRecovery.service.js#generateTemporaryCredential`: it revokes every existing session
and sets a separate `temp_password_hash`, but never touches the original `password_hash` — so an
account's original password kept working for a **brand-new** login the entire time a temp
credential was pending. This directly contradicted the claim already written in this session's own
`PRODUCTION_RECOVERY_RUNBOOK.md` §6.1 ("the account cannot be used again until the new temporary
credential is exercised") — a real, demonstrated gap in the primary security-incident remediation
this project documents for a compromised account.

**Fixed**: `otpAuth.service.js#loginWithPassword` now rejects a correct OLD password specifically
while a real, unexpired temp credential is outstanding (checking `temp_password_hash` +
`temp_password_expires_at` directly, not the broader `force_password_change` flag — that flag is
also set at bootstrap-superadmin creation, where there is no "old" password to distinguish from and
blocking login there would have been a real regression). The temp-credential login path itself was
already correct and unchanged. Verified: `superAdmin.integration.test.js` (18/18),
`passwordAuth.integration.test.js` + `productionHardening.integration.test.js` (27/27 combined),
`mfa.integration.test.js` + `otpAuth.integration.test.js` (22/22) — all pass with no regressions.

A second, independent staleness in the same test was found investigating the first: its own audit-
log assertion checked for a `TEMPORARY_CREDENTIAL_USED` event that only a real temp-credential
*login* would ever produce — which the test's own comment says is deliberately out of scope (would
need email mocking). The assertion had silently never been reachable; fixed to check
`force_password_change = true` instead, matching what the test's own comment already said it should
verify.

### Test-contract updates (FIXED, not pre-existing — caused by this session's own Phase 21.2 work)

Three tests asserted an exact, strict response-body shape that predates this session's Phase 21.2
request-id addition (`requestId` on every error response). Not a code defect — the
`errorHandler`/response-shape contract changed deliberately and correctly; these tests simply never
got updated because the full suite never completed to surface the mismatch:
- `productionHardening.integration.test.js` (2 tests) — updated to expect `requestId` as a real
  field alongside the existing `message` assertion.
- `passwordAuth.integration.test.js`'s user-enumeration test — updated to compare every field
  *except* `requestId` for exact equality (a per-request-unique correlation id is expected to differ
  between any two distinct requests by design, and reveals nothing about account existence), while
  still asserting both responses carry one.

### P1 (newly found, NOT fixed — same class as the already-documented canteen issue, genuinely pre-existing/environmental)

`groundMedia.integration.test.js` (4 tests, `ground_photos`/`amenities` upload) fail with 409, not
because of missing Cloudinary credentials as this audit first assumed from the test names alone —
the actual cause, confirmed by reading `middlewares/groundAccess.js#attachSingleGroundContext`, is a
direct sibling of the already-documented `AmbiguousCanteenError`/`findSingleCanteen` issue: a
`findSingleGround()`/`AmbiguousGroundError` pair with the exact same "assumes exactly one row exists
platform-wide" design, now broken because the shared dev database has accumulated far more than one
ground across this project's history. Same root-cause class, same reasoning for not attempting a fix
in this surgical pass, same recommendation (a real multi-ground migration of these legacy routes,
not a polish fix).

`galleryImage.integration.test.js` (5 tests) fail with 403, not a Cloudinary issue either — the
route (`galleryImage.routes.js`) is gated with `requireStaffRole('admin')` only, and does not admit
`super_admin` (no bypass, unlike every ground-scoped middleware in this app). The route file's own
comment says this is intentional: "Phase 12 — DEPRECATED DEVELOPMENT ROUTES... Super Admin no longer
has operational CRUD access to gallery images... should not be called from production frontend." The
test fixture (`createSuperAdminUser`) is the stale side — written for an access model the code's own
comment says was deliberately retired. Not fixed this pass: correctly classifying this needed the
route's own comment as evidence, and updating the test only makes sense once someone with real
product context confirms gallery management is not meant to work this way going forward
(deprecated-but-still-referenced code is a product question, not a polish fix).

Both are added to this document's environmental-limitations list, not silently absorbed into the
existing Cloudinary explanation — the actual root causes are different from what was assumed before
the full suite ever completed.

## Areas verified clean (no action needed)

- **Production configuration**: env var fail-fast validation (including MFA/WebAuthn vars beyond what
  `docs/DEPLOYMENT.md`'s summary table mentions — a documentation gap only, not a code issue), CORS
  fail-closed on unset `CLIENT_ORIGIN`, session cookie flags (`httpOnly`, `secure` gated on
  `NODE_ENV=production`, `sameSite: 'lax'`), Postgres pool bounds (`max`, `connectionTimeoutMillis`),
  frontend production API URL (real domain, not localhost), no secret values logged anywhere in the boot
  path (only two standalone, production-refusing CLI scripts print a seeded *test* account's
  credentials — not reachable at runtime).
- **Zero TODO/FIXME/HACK/XXX markers** anywhere in `server/src` or `client/src` — genuinely no
  outstanding unfinished-work comments.
- **No sensitive-data exposure** found in any sampled controller — every raw-row spread traces back to
  an explicit `PUBLIC_COLUMNS`-style allowlist at the query layer; no password hash, session token, or
  MFA secret reaches a JSON response anywhere checked.
- **No unused imports** found in a representative 12-file sample across match/scoring/tournament/umpire/
  player/team modules.
- **HTTP status code / API response consistency** is solid platform-wide — the canteen module's own
  documented `{error}`-shape exception (already known, already justified) remains the only real outlier
  beyond the two P2 cosmetic-drift spots noted above.
- **JSON-LD structured data is entirely honest** — `aggregateRating` is included only when a ground has
  real reviews, using real values; no fabricated rating, review count, or address found anywhere.
- **Sitemap correctly excludes DRAFT/SUSPENDED grounds**, and `robots.txt` correctly disallows every
  private/portal route.
- **Homepage, `/grounds`, and ground-profile pages** all have real, page-specific SEO metadata.
- **Booking conflict UX, canteen customer-ordering error mapping, notification resilience, accessibility
  basics, mobile responsiveness** — all already verified clean in this session's own Phase 21/22 work,
  re-confirmed not to have regressed.
