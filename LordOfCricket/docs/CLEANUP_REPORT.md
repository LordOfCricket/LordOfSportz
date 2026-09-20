# LOC Cleanup Audit Report

Audit only — nothing has been deleted, moved, or modified yet. This report covers Phase 1 of the requested cleanup. Phases 2–7 (actual deletion/dependency removal/k8s removal/validation) will only run after you review this and confirm.

---

## 🔴 Critical findings (read first)

These are more serious than ordinary cleanup and need an explicit decision from you, independent of the rest of this report.

### 1. A live API key is committed to git in `.mcp.json`
`.mcp.json` (repo root) is **tracked by git** and contains a plaintext `x-api-key` for the 21st.dev MCP server. This means the key is in your git history right now, not just the working tree — deleting the file going forward does not remove it from history.
**Recommendation:** rotate/revoke that API key at 21st.dev regardless of what we do with the file, then decide whether to keep `.mcp.json` git-ignored going forward (add to `.gitignore`, keep a `.mcp.json.example` with a placeholder instead).

### 2. A real password is committed to git in `server/login-test.json`
`server/login-test.json` is **tracked by git** and contains a plaintext identifier + password for an account (`...@loctest.local` — looks like a dedicated test-only domain, not a real user, but it's still a live credential in history). Not printed here per your instructions.
**Recommendation:** confirm this account is test-only and rotate its password if there's any chance it's a real reachable account, then decide whether to delete the file or move it to a proper test-fixtures location (see Phase 4 section below).

### 3. Three ~400MB `.tar` archives are committed to git (~1.2GB total)
```
server/loc-backend-20260826-latest.tar
server/loc-backend-20260826-v1.tar
server/loc-backend-20260826.tar
```
All three are **tracked by git**, not just sitting in the working tree. No code, script, `package.json`, or CI workflow references them (verified by search) — they're old packaged Docker/deployment backups.
**Important nuance:** deleting them from the working tree (`git rm`) stops the repo from growing further, but does **not** shrink the existing `.git` history — the ~1.2GB stays in every clone until history is rewritten (`git filter-repo`/BFG). History rewriting is a separate, higher-risk operation (rewrites commit hashes, requires a force-push, breaks other clones/PRs) — **I will not do this without you explicitly asking for it in a follow-up**, since it's a destructive action against shared history. This report only proposes removing them from the working tree going forward.

---

## Files safe to delete (Phase 2 targets)

All of these are either git-ignored already or clearly regenerable/generated, and none are referenced by any script, import, or config.

| Path | What it is | Tracked by git? |
|---|---|---|
| `client/dist/` | Vite build output | No |
| `mobile/dist/` | Expo web build output | No |
| `node_modules/` (root, client, server, mobile) | npm dependency trees | No |
| `server/loc-backend-20260826-latest.tar`, `-v1.tar`, `.tar` | Old packaged Docker backups (see 🔴 #3) | **Yes — needs `git rm`, not just delete** |

Not present in the repo (checked, nothing to remove): `.DS_Store`, `*.log`, `*.tmp`, `*.bak`, `coverage/`, `.cache/`, `.vite/`, `.next/`, root-level `build/`.

## Files that need your confirmation before touching

| Path | Why it's not a clean "safe delete" |
|---|---|
| `server/login-test.json` | Contains a real (test) credential already in git history — see 🔴 #2. Needs a decision, not a reflexive delete. |
| `server/backups/loc-postgres-backup-2026-08-17T09-15-58-214Z.json` (2.4MB) + `server/backups/mongo/` | This is a **real Postgres/Mongo data snapshot**, not a generated artifact — already git-ignored (not tracked), so it costs nothing to keep. Your Phase 2 list named `server/backups/` as a candidate, but deleting an actual database backup is a data-loss risk I won't do without you confirming you don't need it. |
| `client/README.md`, `mobile/README.md` | Both are still the unedited Vite/Expo scaffold boilerplate (never customized) — low value but not "generated," so I'm flagging rather than deleting. |
| `client/vercel.json` | A third deployment path (Vercel) alongside the Docker+nginx setup (`client/Dockerfile` + `client/nginx.conf`) and the Kubernetes setup being removed. Not Kubernetes-related, so out of scope for Phase 3, but worth knowing you have three coexisting deployment configs. Left untouched unless you say otherwise. |

## Files that must be preserved

`.env`, `.env.example`, `.env.production` (client), `server/.env`, `server/.env.example`, `mobile/.env.example`, `mobile/.env.local`, `server/uploads/` (currently empty of real files but is the live upload target — see below), `client/src/`, `server/src/`, `server/prisma/`, `mobile/` app code, `.claude/`, `.github/`, root `package.json`/`package-lock.json`, `Dockerfile`s, `nginx.conf`, `.mcp.json` (pending the key-rotation decision above — not deleting, just flagging).

None of the `.env*` files are tracked by git (verified — root `.gitignore`, `client/.gitignore`, `server/.gitignore`, `mobile/.gitignore` all correctly exclude them). No secret values are reproduced in this report.

`server/uploads/` currently contains only empty subfolders (`amenities/`, `canteen/`, `ground-photos/`, `partners/`) — 0 real uploaded files today. The folder itself is git-ignored already (`uploads` in `server/.gitignore`) and is the live target the app writes to at runtime, so it must stay.

## Duplicate files found

None found in the strict sense (identical content). The closest thing is the **three deployment strategies** coexisting (Docker+nginx, Vercel, Kubernetes) — not duplicate files, but overlapping deployment configs. Addressed above and in the Deployment section below.

## Unused dependencies found

Verified by searching every import/require across `client/src`, `server/src`, and all config files (not just a name grep).

**Client — confirmed unused, no import/CSS/config reference anywhere:**
- `@base-ui/react`, `class-variance-authority`, `clsx`, `react-hot-toast`, `tailwind-merge`

These five look like they were pre-installed together for a **shadcn/ui integration that hasn't started yet** (`client/components.json` has a shadcn config, but `client/src/components/shadcn/` doesn't exist, and `shadcn` itself is a devDependency with the same story). Recommend confirming with you before removing — if shadcn work is planned, these are needed; if not, all five (plus possibly the `shadcn` CLI devDependency) can go together.

**Client devDependencies — uncertain, not confirmed unused or used:**
- `@types/react`, `@types/react-dom` — type-only packages with no `tsconfig.json` in the project; likely still used passively by the editor. Recommend keeping.
- `shadcn` — see above, tied to the same not-yet-started integration.

**Server — nothing is cleanly unused.** One nuance:
- `mongoose` — no longer used by the live runtime request path, but still actively used by legacy Mongo→Postgres migration/rollback scripts (`server/src/scripts/migrate*ToPostgres.js`, `server/src/models/*MongoLegacy.model.js`, `connectMongo`/`isMongoReady` in `server/src/config/db.js`). Not dead code today — recommend keeping until that migration tooling is formally retired, which is a separate decision from this cleanup.
- `cookie-signature` — confirmed directly used (not just a transitive dependency of `cookie-parser`) by `server/src/realtime/socketAuth.js` for Socket.IO auth handshake. Keep.
- `jsonwebtoken` — the legacy JWT bearer-auth path is still wired into `middlewares/auth.js`/`auth.controller.js` even though session-cookie auth is primary. Keep — it's live code, not dead weight.
- `socket.io-client` in `server/devDependencies` — correctly used by integration tests as a socket client simulator, not a misplaced duplicate of the client's dependency. Keep.

Everything else in both `package.json` files was confirmed used with at least one real import site.

## Deployment files found

- **Kubernetes** (to be removed per Phase 3, pending your final go-ahead): `k8s/cloudflared-config.yaml`, `k8s/cloudflared-deployment.yaml`, `k8s/loc-backend-deployment.yaml`, `k8s/loc-backend-pdb.yaml`, `k8s/loc-backend-service.yaml`, `k8s/loc-frontend-deployment.yaml`, `k8s/loc-frontend-pdb.yaml`, `k8s/loc-frontend-service.yaml`, `k8s/loc-ingress.yaml`. No application code or CI workflow references this folder — confirmed by search. Two code comments (`server/src/server.js`, `server/src/services/otp.service.js`) mention Kubernetes only to explain *why* graceful-shutdown/rate-limit design decisions were made (SIGTERM handling, stateless rate-limiting) — these comments don't functionally depend on the `k8s/` folder and don't need to change; the code they describe (graceful shutdown, DB-backed rate limiting) is good practice regardless of Kubernetes and will keep working after `k8s/` is removed.
- **Docker** (keep): `client/Dockerfile`, `server/Dockerfile`, `client/.dockerignore`, `server/.dockerignore`, `client/nginx.conf` (nginx reverse-proxies `/api/` and `/socket.io/` to the backend — this is your actual "Frontend → Backend" runtime path in the Docker setup).
- **Vercel** (flagged above, not touched): `client/vercel.json`.
- **CI**: `.github/workflows/ci.yml` — lint/test/build only, builds (but doesn't push) both Docker images. No Kubernetes step exists, so removing `k8s/` doesn't affect CI.
- **`docs/DEPLOYMENT.md`** has a dedicated "Kubernetes / Cloudflare tunnel" section (~lines 129–150, including `kubectl` commands) that will need rewriting per your Phase 3 request, once you confirm.

## Risks discovered

1. The three `.tar` files and `login-test.json` being tracked in git (🔴 above) is the biggest risk in the repo — bigger than the structural cleanup itself.
2. `.mcp.json`'s committed API key (🔴 above).
3. Deleting the `.tar` files with `git rm` will show as a large diff/commit — worth doing as its own isolated commit, separate from any other cleanup, so it's easy to review and revert if needed.
4. `server/backups/` contains a real data snapshot — flagged above so it isn't accidentally swept up in "safe cleanup."
5. Root `package.json` and `client/package.json` don't currently declare a `test` script check for `mobile/` — not a cleanup risk, just noting mobile isn't part of the CI `ci.yml` today (out of scope for this cleanup, mentioned for awareness only).

---

## What I have NOT done yet
Nothing in Phases 2–7 has been executed. No files deleted, no `git rm`, no dependency removed, no `k8s/` removal, no `docs/DEPLOYMENT.md` edit. Awaiting your confirmation on:
1. The three 🔴 critical items (key rotation, login-test.json decision, tar file handling — working-tree removal only, or also a history rewrite?).
2. Whether to remove the 5 unused client dependencies + `shadcn`/`components.json`, or keep them for planned shadcn work.
3. Whether `server/backups/` should be kept, archived elsewhere, or removed.
4. Go-ahead to proceed with Phase 2 (safe deletes), Phase 3 (k8s removal + DEPLOYMENT.md rewrite), and Phase 6 (dependency removal) as scoped above.

See also `REVIEW_REQUIRED.md` for the condensed list of items awaiting your decision.
