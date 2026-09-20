# Mobile Architecture

Expo (React Native) + TypeScript + Expo Router, mirroring the web app's four role dashboards and
design tokens (`apps/mobile/src/theme/tokens.ts` mirrors `apps/web/src/app/globals.css` — kept in
sync by hand until a shared design-token package is worth the overhead; see
`docs/decisions/0004-mobile-design-tokens-duplication.md`).

## Navigation depth is intentionally shallower than web

Each role gets a bottom tab bar with **3–4 tabs max**, not a 1:1 mirror of every web sidebar item —
mobile navigation-depth budget is tighter, and this matters most for `SCORER`, which product spec
section 30 calls out explicitly (fast interaction, minimal navigation depth, no accidental double
actions). The scorer shell has exactly 3 tabs: Overview, Live Scoring, History.

```
app/
  index.tsx           dev-only role switcher (stands in for login — no auth flow yet)
  player/  _layout.tsx (Tabs) + index.tsx (real overview) + tournaments/results/profile (placeholders)
  coach/   same pattern (Overview, Students, Tournaments, Profile)
  academy/ same pattern (Overview, Players, Tournaments, Profile)
  scorer/  Overview, Live Scoring, History — connection state always visible on Overview
```

`ConnectionIndicator` (`src/components/ConnectionIndicator.tsx`) is a first-class, always-visible
component on the scorer overview — a scorer mid-bout must never have to wonder whether their device is
talking to the server (product spec sections 30/33).

## What's NOT implemented / NOT verified

- **Not run in this phase**: no Android/iOS emulator or physical device was available in this
  environment to launch the app. The code typechecks against `expo/tsconfig.base`, but "the screens
  render correctly on-device" is unverified — flagged rather than claimed.
- No authentication flow — `app/index.tsx` is an explicit placeholder for it.
- No real data fetching, no push notifications, no offline queue (schema-level idempotency support
  exists via `ScoreEvent.clientOperationId`, but no client-side queue/retry implementation).
