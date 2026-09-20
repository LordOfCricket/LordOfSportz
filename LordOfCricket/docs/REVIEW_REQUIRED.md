# Items Requiring Your Decision

Condensed from `CLEANUP_REPORT.md`. Nothing listed here has been touched. Full context/evidence is in the main report.

## 1. Security — needs a decision independent of cleanup
- [ ] Rotate/revoke the 21st.dev API key currently committed in `.mcp.json` (tracked by git).
- [ ] Confirm whether the credential in `server/login-test.json` (tracked by git) is a throwaway test-only account; rotate its password if there's any doubt.
- [ ] Decide: after rotation, should `.mcp.json` move to git-ignored with a `.mcp.json.example` placeholder committed instead?

## 2. The three `server/loc-backend-*.tar` files (~1.2GB, tracked by git)
- [ ] Confirm OK to `git rm` them from the working tree (stops future growth; no code references them).
- [ ] Separate decision: do you also want git **history** rewritten to shrink the repo (`git filter-repo`)? This is higher-risk (force-push, breaks other clones/PRs) and will only be done if you explicitly ask for it in a follow-up — not assumed as part of this cleanup.

## 3. `server/login-test.json` disposition
- [ ] Delete outright, or move to a proper test-fixtures location (e.g. `server/src/tests/fixtures/`)? Report notes it looks like a temporary local credential, not a reusable documented test case, so default recommendation is delete-after-rotation — but confirming with you first.

## 4. `server/backups/` (real DB snapshot, already git-ignored)
- [ ] Keep as-is (safest — costs nothing since it's not tracked), archive elsewhere, or delete? Your Phase 2 list named `server/backups/` as a cleanup candidate, but this is real backup data, not a generated artifact, so I did not treat it as a default "safe delete."

## 5. Five unused client dependencies (likely pre-installed for a not-yet-started shadcn/ui integration)
- `@base-ui/react`, `class-variance-authority`, `clsx`, `react-hot-toast`, `tailwind-merge` (+ devDependency `shadcn`, + `client/components.json`)
- [ ] Remove all five now (recommended if shadcn work isn't imminently planned), or keep them (if it is)?

## 6. Low-priority, optional
- [ ] `client/README.md` and `mobile/README.md` are unedited framework scaffold boilerplate — replace with a short pointer to the root `README.md`, or leave as-is?
- [ ] `client/vercel.json` — a third deployment path alongside Docker+nginx. Not Kubernetes-related so out of scope for Phase 3, but flagging that it exists in case it's stale.
