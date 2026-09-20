# Security

Threat model, security architecture summary, and audit history for LOC. This document is the
persistent reference; the full Phase 7 audit report (findings, reproduction steps, fix details) is a
one-time artifact, not duplicated here — this file captures what stays true going forward.

## Threat model

LOC is a multi-tenant (multi-ground) cricket platform. The attacker classes that matter:

1. **Unauthenticated internet attacker** — no account at all. Can hit any public route, brute-force
   login/OTP endpoints, probe for IDOR/enumeration, attempt injection.
2. **Authenticated low-privilege user** (PLAYER/UMPIRE) — a real account, no elevated role. The
   question for every ground-scoped or staff-scoped route is whether this actor can act outside their
   own data.
3. **Ground-scoped STAFF** (GROUND_ADMIN/CANTEEN_STAFF) — holds explicit, owner-granted permissions for
   ONE ground. Must never reach another ground's data, another staff member's permissions, or their own
   permission grants.
4. **GROUND_OWNER** — full implicit access to their own ground(s) only. Must never reach another
   owner's ground. MFA-mandatory (see `docs/MFA.md`).
5. **SUPER_ADMIN** — platform-wide access by design. MFA-mandatory, non-disableable (see `docs/MFA.md`).
   The threat here is account compromise (phishing/credential theft), not the role's own scope.
6. **A user with a stolen/leaked session cookie or legacy JWT** — session hijack, not a fresh login.
   Mitigated for privileged roles by the MFA-verified-session TTL (`docs/MFA.md`) and step-up
   re-authentication for high-leverage mutations.
7. **A malicious or compromised dependency / build tool** — supply-chain risk, addressed via dependency
   auditing (below), not a runtime control.

Out of scope for this document (and for Phase 7's testing): attacking real production users, third-party
infrastructure, or anything outside LOC's own dev/test environment.

## Security architecture (summary — see the linked docs for full detail)

- **Authentication**: unified OTP login (`docs/AUTH.md`) creates a real `sessions` row, read via an
  httpOnly, signed, `SameSite=Lax` cookie. A legacy password+JWT path is kept alive for pre-existing
  accounts but has no session row and can never satisfy an MFA gate (`docs/MFA.md`) — a privileged
  account authenticated this way must re-login via OTP before it can perform a gated action.
- **MFA & step-up**: mandatory WebAuthn/TOTP for SUPER_ADMIN and GROUND_OWNER only, short-lived
  session-scoped verification, single-use scoped step-up grants for a specific evidence-based list of
  high-leverage mutations. Full detail in `docs/MFA.md`.
- **Authorization**: role/permission/ground-isolation resolved server-side from a real `ground_users`
  membership row keyed off the authenticated user's id — never from a client-supplied ground/resource
  id. Full detail in `docs/AUTHORIZATION.md`.
- **Rate limiting**: per-IP for unauthenticated endpoints (login/OTP/search), per-user-id for
  authenticated MFA/step-up endpoints (so a shared office NAT can't rate-limit unrelated staff). OTP
  requests are additionally rate-limited at the identifier level in Postgres (shared across replicas),
  layered under the IP-based limiter. In-memory store — correct for the current single-instance
  deployment; a multi-instance deployment would need a shared store (Redis) instead — not introduced
  speculatively, since nothing today requires it.
- **Secrets**: every security-critical secret (`JWT_SECRET`, `SESSION_COOKIE_SECRET`, `MFA_ENCRYPTION_KEY`,
  `WEBAUTHN_*`, `PG_*`, `CLIENT_ORIGIN`) is required at boot in production (`config/validateEnv.js`) —
  the process refuses to start rather than silently running with a missing or dev-fallback value.
  `MFA_ENCRYPTION_KEY` is additionally checked for correct length (32 bytes) at boot, not lazily on
  first use. No secret is ever logged; the one `console.log` of a real code (the OTP console provider)
  is a dev-only fallback that never fires when a real SMS/email provider is configured.
- **Fail-closed conventions**: missing MFA config never disables the MFA gate — it's a required env var
  the process won't boot without. An invalid/ambiguous ground context (`attachSingleGroundContext`)
  returns 409, never guesses. An unresolvable membership/permission returns 403/404, never falls
  through to "allow."

## Phase 7 audit (2026-08-16)

A full read-only adversarial security audit was performed across authentication, session management,
MFA/step-up, RBAC, ground isolation/IDOR (every resource-identifier-accepting route, not just canteen),
file uploads, injection surfaces, CORS/CSRF/security headers, secrets exposure, dependency
vulnerabilities, Docker/Kubernetes/Cloudflare configuration, business-logic/race conditions, and
frontend security (XSS sinks, token storage, open redirect, SSRF applicability).

**Result: 0 Critical, 0 High.** The privileged-account MFA, step-up, session, and ground-isolation
patterns built in Phases 3–6 held up under adversarial review, including targeted IDOR attempts against
nested resource ownership (e.g., a staff membership id from Ground A used against Ground B's URL).

**Findings fixed this phase:**

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `GET /api/ground-photos` and `GET /api/amenities` required no authentication and returned every ground's internal photo/amenity rows (`id`, `cloudinary_public_id`) with no `ground_id` filter | Medium | Both routes now require `requireAuth` + `requireStaffRole('super_admin')`, matching their sibling POST/upload/DELETE routes in the same files. The only real consumer (the super-admin panel) is unaffected; the public site already used a separately ground-scoped, internal-field-free endpoint. |
| 2 | Canteen menu image upload (`POST/PATCH /canteen/menu/master`) was the one upload route in the app with no file-size limit or MIME allow-list | Medium | Added the same 10MB limit + JPEG/PNG/WEBP allow-list every sibling upload route already had. |
| 3 | Kubernetes backend/frontend `Service`s were `NodePort`, exposing them directly on every node's IP, bypassing the Cloudflare tunnel → nginx-ingress-controller path entirely | Medium | Changed both to `ClusterIP`. Confirmed via `cloudflared-config.yaml` that the real traffic path routes through the ingress controller's ClusterIP, never the NodePort — this fix removes an unintended bypass without changing the working path. |
| 4 | Cloudinary `public_id` was built from unsanitized `file.originalname`, allowing `/`-based folder-nesting outside the intended upload folder | Low | Sanitized to `[A-Za-z0-9_-]` before use (`utils/cloudinaryUpload.js#safePublicIdSegment`). |
| 5 | "Add image by URL" endpoints (ground photos, amenities) accepted `imageUrl` with only a truthiness check, no scheme validation | Low | Added an `http(s)`-only scheme check (`domain/accountCreation/validation.js#isValidHttpUrl`). No SSRF existed (the URL is never fetched server-side); this closes a defense-in-depth gap against a persisted `javascript:`/`data:` URI. |
| 6 | Concurrent requests granting the same staff permission could crash with an uncaught `23505` instead of a clean `409` (the DB unique index already prevented a duplicate *row*, but the losing request wasn't handled) | Low | Catch `23505` in `groundStaff.service.js#grantStaffPermission` and translate to the existing "already granted" error, matching the same pattern already used by `createStaffForGround` and `applyForSlot`. |
| 7 | Backend Docker container ran as root (no `USER` instruction) | Low | Added `USER node` (the base image's built-in non-root user) to `server/Dockerfile`. |
| 8 | Transitive `nanoid` advisory in the client's dev/build dependency graph (GHSA-2v37-7h3g-55p8) | Low | `npm audit fix` — one package updated, no breaking change. |

**Findings documented and deliberately deferred (not fixed this phase):**

- **Legacy JWT stored in `localStorage`** (`client/src/utils/authToken.js`) — XSS-exfiltratable, unlike
  the primary session's httpOnly cookie. No XSS sink exists in the app today (confirmed: no
  `dangerouslySetInnerHTML`, no manual `innerHTML` writes anywhere in `client/src`), so this is a
  defense-in-depth gap, not a currently-exploitable path. The real fix is removing the legacy JWT login
  path entirely (already documented as deprecated/transitional in `docs/AUTH.md`) — a migration, not a
  patch, and out of scope for a minimal-change security phase.
- **`DELETE /api/ground-photos/:id` and `DELETE /api/amenities/:id` use a raw integer id with no
  `ground_id` check at the query layer.** Not exploitable today: both routes are `requireStaffRole(
  'super_admin')`-only, and Super Admin already bypasses ground checks everywhere else in the app by
  design. No delegation path to Ground Owners exists for these two resources (unlike staff/match
  management, which are already correctly ground-scoped). Fixing this properly means deciding a real
  multi-ground ownership model for photos/amenities (public ids, ground-scoped routes) — an
  architectural change, not a targeted patch.
- **Frontend Nginx container runs as root.** Making it non-root requires switching to a non-privileged
  port (nginx binding :80 needs root) plus corresponding Service/Ingress port changes — a larger,
  multi-file change for a container that only serves static files with no secrets or write access.
  Deferred as disproportionate to the risk.
- **No CSRF token beyond `SameSite=Lax`.** Reviewed, not treated as a gap: the session cookie is
  httpOnly + signed + `SameSite=Lax`, no state-changing route uses `GET`, and modern browser support for
  `SameSite` is the currently-accepted baseline defense for cookie-authenticated APIs. Documented here
  as an accepted, reviewed posture rather than left silently unaddressed.
- **`TRUST_PROXY` correctness depends on the operator setting it to match the real proxy hop count** for
  the deployed topology (Cloudflare tunnel → nginx-ingress-controller → this Service). It is correctly
  *off* by default (`app.js` only sets `trust proxy` when `TRUST_PROXY=1` is explicitly set) — fail-safe
  by default, but still an operational assumption worth stating plainly. See the Deployment checklist in
  `docs/DEPLOYMENT.md`.

## Regression baseline

Phase 6 baseline: 408 unit tests / 408 passing; 710 integration tests / 694 passing / 16 known
pre-existing failures (a stale `scorerUser` test fixture predating Phase 6, and a multi-ground dev-DB
assumption in a handful of `ground_photos`/`amenities`/canteen tests — both root-caused and confirmed
unrelated to any Phase 6 or Phase 7 change).

Phase 7 added 6 new unit tests (URL-scheme validation, Cloudinary filename sanitization) and 4 new/
extended integration tests (unauthenticated-listing fix, upload-limit fix, concurrent-permission-grant
race). See the Phase 7 report for the exact final counts and a line-by-line diff against the Phase 6
failure list confirming zero new, unexplained failures.

## Security incident response

Phase 21.7 — step-by-step response procedures (compromised account, compromised staff/ground-owner,
suspected data breach, forensic audit-trail review) live in `PRODUCTION_RECOVERY_RUNBOOK.md`'s
"Security Incident Response" section, not duplicated here — that document is the operational
playbook; this document stays the persistent architectural reference. Every procedure there uses only
mechanisms already covered above (session revocation, MFA/step-up, `account_audit_log`) — no new
security surface was introduced to support it.

## Known limitations / residual risk (carried forward)

- The 16 pre-existing integration failures (stale scorer fixture, multi-ground dev-DB assumption) remain
  present by design — fixing the multi-ground assumption is a real feature (multi-ground photo/amenity
  management), not a security fix, and is out of scope here.
- WebAuthn ceremony verification cannot be driven end-to-end by a headless browser in this environment
  (no virtual authenticator support reachable) — the server-side WebAuthn verification logic has full
  integration-test coverage; only the literal browser ceremony is untested live. Documented, not
  fabricated, in the Phase 6 and Phase 7 reports.
- Legacy JWT authentication remains a lower-assurance path for non-privileged roles by design (see
  `docs/AUTH.md`'s deprecation plan). It can never satisfy an MFA gate, so this does not weaken the
  privileged-account protections MFA exists for.
