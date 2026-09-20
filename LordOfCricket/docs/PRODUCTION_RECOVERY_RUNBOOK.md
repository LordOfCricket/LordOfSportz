# LOC Production Recovery Runbook

Phase 21.6/21.7. This is an **incident playbook** — what to do, in what order, during an actual
production incident. It is deliberately action-first and does not re-explain *why* each mechanism
works; for the full technical reference (backup internals, env vars, deployment architecture) see
`docs/DEPLOYMENT.md`, and for the threat model and security architecture see `docs/SECURITY.md`. Every
procedure below uses mechanisms that already exist and were verified in this codebase — nothing here
requires code not already shipped.

## How to use this document

Each incident type below follows the same shape: **Detect → Contain → Recover → Verify → Record.**
Work top-to-bottom under time pressure; don't skip "Record" even when the incident feels resolved —
the audit trail is what makes the next incident faster to diagnose.

---

## 1. The service is down / not responding

**Detect**: `GET /api/health` (liveness) times out or returns non-200. This endpoint checks nothing
external — if it fails, the Node process itself is not answering.

**Contain / Recover**:
1. Check the process is actually running (`pm2 status` / `systemctl status` / your platform's process
   list, whichever supervises `node src/server.js` — see `docs/DEPLOYMENT.md` §"Process management").
2. If it crashed: `server.js` exits the process on an uncaught exception or a failed Postgres
   connection at startup — these are deliberate, not silent hangs. Check the last log lines
   (`utils/logger.js` writes a structured `error`-level line for both cases) to see which one it was.
3. If Postgres was the cause, go to **Section 2** first — restarting the app without Postgres being
   reachable will just crash-loop again.
4. Otherwise, let the process supervisor restart it (it should already be configured to do so
   automatically — this is why the app deliberately exits rather than trying to limp on in a corrupted
   state).

**Verify**: `GET /api/health` returns `200`, then `GET /api/health/ready` returns `200` with
`"postgres":"connected"`.

**Record**: note the crash timestamp and the logged error message/stack in the incident log (see
Section 8). If this is a recurring crash (not a one-off), that log line is the starting point for a
real root-cause fix, not another restart.

---

## 2. PostgreSQL is unreachable

**Detect**: `GET /api/health/ready` returns `503`. The server also refuses to *start* at all if
Postgres is unreachable at boot — a crash-loop on startup is this same symptom, not a separate one.

**Contain / Recover**:
1. Confirm the database host is actually up (managed provider status page, or direct `psql` connection
   test from the same network the app runs in).
2. Confirm `PG_*` env vars are correct and unchanged — a rotated credential or an expired network
   allow-list entry is the most common real-world cause here, not the database itself being down.
3. Once Postgres is reachable again, the app's own connection pool (`config/db.js`) reconnects on its
   own — no restart needed unless the process already crash-looped past its supervisor's retry budget,
   in which case restart it once Postgres is confirmed reachable.

**Verify**: `GET /api/health/ready` → `200`, `"postgres":"connected"`.

**Record**: duration of the outage, root cause (network/credential/provider outage), and whether any
writes were lost (see Section 4 if a restore is needed).

---

## 3. A bad deploy needs rolling back

**Contain**: stop routing traffic to the bad build if your platform supports it (maintenance page /
previous-revision traffic shift), rather than leaving broken responses live while you investigate.

**Recover**:
1. Redeploy the previous known-good build/image — this app has no in-place schema-downgrade tooling
   (`schema.sql` migrations are additive/idempotent, never destructive), so a schema applied by the bad
   deploy is safe to leave in place; the previous code version simply won't reference whatever new
   column/table it added.
2. If the bad deploy included a genuinely destructive manual DB change (dropped/renamed a column
   outside the normal `schema.sql` pattern) — that is the one case this project's migration strategy
   does **not** cover automatically. Go to Section 4 (restore from backup) instead of trying to
   hand-repair it live.

**Verify**: `GET /api/health/ready` → `200` on the rolled-back build; smoke-test login + one core page
per `docs/DEPLOYMENT.md`'s release checklist.

**Record**: what shipped, what broke, and the rollback timestamp.

---

## 4. Data loss — restore from backup

Full technical detail (exact commands, what was actually tested, RPO/RTO numbers, known limitations)
is in `docs/DEPLOYMENT.md` §"Backup & restore" — read that section before running a real restore if
there's time to. The condensed procedure for an actual incident:

1. **Do not restore into `public` on a live database that still has good data in it.** Always restore
   into a disposable named schema first:
   `npm run restore:postgres <backup.json> incident_recovery_check --prefix server`
2. Query the restored `incident_recovery_check` schema and confirm it has what you expect (row counts,
   a specific record you know should exist) before touching production data.
3. Only once confident: for a genuine total-loss disaster recovery into a **fresh, empty** database,
   restore directly into `public`. For a partial-data-loss scenario on a database that already has
   *some* current data, a targeted `INSERT`/`UPDATE` from the disposable-schema copy is safer than a
   full-schema restore — script this deliberately per-incident rather than following a generic step
   here, since the right approach depends entirely on what was actually lost.
4. If restoring into an **already-populated** database from scratch (replaying `schema.sql` against
   existing data), be aware of the documented migration-replay limitation in `docs/DEPLOYMENT.md`
   (narrow-then-widened CHECK constraints can reject already-existing data on replay) — this does not
   affect restoring into a fresh, empty database.

**Verify**: row counts match the backup manifest; a known real record round-trips correctly; the app
boots against the restored database and `/api/health/ready` is `200`.

**Record**: what was lost, what backup was used (its timestamp — this defines your actual RPO for this
incident), and how much data (if any) between the backup and the incident is permanently gone.

---

## 5. An optional service is degraded (MongoDB / Google Calendar / AI / CricAPI)

**This is not an incident requiring action.** Every one of these is designed to fail without
affecting any core feature (scoring, booking, canteen ordering, auth) — see `docs/DEPLOYMENT.md`'s env
table and `docs/ARCHITECTURE.md` for the per-service reasoning. `GET /api/health/ready`'s `optional`
block shows each one's live state for visibility only; it never affects the readiness status code.

If you want to confirm nothing core is actually affected: check `/api/health/ready` shows `postgres:
"connected"` (the only dependency that matters for readiness) and spot-check one booking/canteen flow
in the browser. Fix the optional service on its own timeline — it is not a page-someone-at-2am event.

---

## 6. Security Incident Response

All procedures below use existing, already-tested mechanisms — no new endpoint or capability was built
to support this section. Every action taken during a security incident is itself written to
`account_audit_log` by the same mechanisms listed here, so the incident is self-documenting as you work
through it (see Section 6.4).

### 6.1 A single user account is compromised (player/umpire/staff/ground owner)

1. **Revoke every active session for that account immediately.** The fastest path that also forces a
   credential reset in one atomic step: as a SUPER_ADMIN, call
   `POST /api/admin/users/:userId/reset-password` (`adminUsers.controller.js` →
   `adminPasswordRecovery.service.js#generateTemporaryCredential`). This generates a new temporary
   credential **and** calls `revokeAllSessionsForUser(targetUserId)` in the same operation
   (`adminPasswordRecovery.service.js:89`) — every existing session, on every device, dies immediately;
   the account cannot be used again until the new temporary credential is exercised.
   - This route is itself step-up-gated (`ADMIN_PASSWORD_RESET` scope) and rate-limited
     (`adminPasswordResetLimiter`) — it cannot be triggered casually or by a compromised low-privilege
     session.
2. If the compromised account is **staff or a ground owner** for a specific ground and the credential
   reset above isn't sufficient on its own (e.g. you also need to immediately cut their *ground* access
   while investigating, independent of their login credential): a GROUND_OWNER can call
   `PATCH /api/ground-owner/grounds/:publicGroundId/staff/:membershipId/disable`
   (`groundStaff.service.js#disableStaffMembership`) to deactivate that specific ground membership.
3. Communicate the credential reset to the real account owner through a channel you already trust is
   them (not the compromised login) before considering this closed.

### 6.2 A ground/canteen needs to be taken offline immediately (suspected fraud, abuse, or compromise)

`POST /api/admin/grounds/:publicGroundId/suspend` (SUPER_ADMIN only, `adminGrounds.controller.js`).
This is the same enforcement path Phase 17.2 wired into every booking/canteen-order creation point —
a suspended ground immediately stops accepting new bookings and new canteen orders
(`GROUND_CLOSED`/`CANTEEN_CLOSED`, see `groundBooking.service.js`/`canteenOrder.controller.js`).
Existing, already-placed bookings/orders are unaffected (legitimate wind-down, not further exposure).
Reverse with `POST /api/admin/grounds/:publicGroundId/reactivate` once resolved.

### 6.3 Suspected broader compromise (more than one account, or unclear scope)

1. Do not attempt to individually reset every potentially-affected account by guesswork — start with
   **Section 6.4** (forensic review) to actually establish scope before acting further.
2. For each account confirmed affected, follow **6.1**.
3. If the scope is genuinely platform-wide (a leaked secret, not an individual account compromise):
   rotate `JWT_SECRET` and/or `SESSION_COOKIE_SECRET` (`docs/DEPLOYMENT.md`'s env table) — this
   invalidates every legacy JWT and every session cookie signature platform-wide in one step. This is
   the single most disruptive action in this runbook (every logged-in user, everywhere, is signed out)
   — use it only when the incident scope genuinely justifies it, not as a first response to a single
   compromised account (use 6.1 for that).

### 6.4 Forensic review — what actually happened

`GET /api/admin/audit-log` (SUPER_ADMIN only, `auditLog.controller.js`) reads `account_audit_log`,
populated by `accountAudit.service.js#recordEvent` at every security-relevant action across the app.
The full event catalog (`ACCOUNT_AUDIT_EVENTS`, `services/accountAudit.service.js`) includes exactly
the events an incident review needs: `SESSION_REVOKED_FOR_SECURITY_REASON`,
`TEMPORARY_CREDENTIAL_GENERATED`, `TEMPORARY_CREDENTIAL_USED`, `PASSWORD_RESET_INITIATED_BY_ADMIN`,
`ACCOUNT_STATUS_CHANGED`, `GROUND_SUSPENDED`/`GROUND_REACTIVATED`, `STAFF_DISABLED`,
`PERMISSION_GRANTED`/`PERMISSION_REVOKED`, `PASSKEY_AUTHENTICATION_FAILURE`,
`TOTP_VERIFICATION_FAILURE`, `ADMIN_LOGIN`. Filter by `targetUserId`/`actorUserId` and a time window
around the suspected incident to reconstruct exactly what happened and who (or what session) did it.

Rate-limit trips (`middlewares/rateLimit.js`) are logged separately via `utils/logger.js` (structured
`warn`-level lines, not `account_audit_log`) — check application logs for the same time window for a
brute-force/credential-stuffing signal that predates the account-level events above.

### 6.5 Post-incident

- Confirm the affected account(s) can log in again normally with a fresh credential.
- Review `GET /api/admin/audit-log` once more for the affected account/time window to confirm no
  further suspicious activity after containment.
- Record the incident per Section 8.

---

## 7. Known limitations of this runbook

- **RTO for a large-scale restore will grow with data volume.** `restore:postgres` inserts row-by-row
  inside per-table transactions, not via `COPY` — fine at this project's current data volume (~3.6k
  rows, ~3s restore, tested 2026-08-17 per `docs/DEPLOYMENT.md`), but a production-scale dataset would
  need a `COPY`-based rewrite for an acceptable RTO. Not needed today; flagged here so it isn't
  rediscovered mid-incident.
- **Uploaded files under `server/uploads/`** are not covered by `backup:postgres`/`restore:postgres` —
  they're local disk, not the database. See `docs/DEPLOYMENT.md`'s note on this (most container
  platforms' filesystems are ephemeral; Cloudinary is the intended path for images that need to survive
  a redeploy).
- **No automated paging/on-call rotation exists in this codebase** — this runbook assumes a human is
  already watching (health-check monitoring, log aggregation alerting) and has the credentials/access
  described above. Wiring an actual alerting pipeline (PagerDuty, Slack webhook on `/health/ready`
  failure, etc.) is an operational decision for whoever deploys this, not something the application
  code prescribes.

---

## 8. Incident log

Keep a running record of real incidents (timestamp, detection method, root cause, actions taken,
resolution time) outside this file (this is a procedure document, not a log). What matters here is
that Section 6.4 above gives you the exact query surface to reconstruct a security incident after the
fact even if a separate incident log wasn't kept in real time.
