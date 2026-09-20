# Role & Permission Model

## The four fixed application roles

`PLAYER`, `COACH`, `ACADEMY`, `SCORER` — and nothing else. There is no `SPECTATOR`,
no generic `ADMIN` role for Karate users, and `REFEREE`/`JUDGE`/`KANSA` are **never** login roles.

A `User` can hold more than one role (`UserRoleAssignment` is a join table, not a single column) —
e.g. a coach who is also a certified scorer authenticates once and sees both contexts. Each role
unlocks creating exactly one matching profile: `PLAYER` → `PlayerProfile`, `COACH` → `CoachProfile`,
`SCORER` → `ScorerProfile`. `ACADEMY` does not create a personal profile — it authorizes the user to
create/administer an `Academy` organization (`AcademyAdministrator`).

## Official function ≠ application role

A `SCORER` receives **event-level assignments** (`OfficialAssignment`) scoped to a tournament and
optionally a tatami, carrying a `function`: `REFEREE`, `JUDGE`, `KANSA`, `SCORE_SUPERVISOR`,
`TIMEKEEPER`, `VIDEO_REVIEW_JUDGE`, or `TATAMI_MANAGER`. The same scorer can be `JUDGE` at one
tournament and `TATAMI_MANAGER` at the next. This is never stored on `User` or `ScorerProfile` —
only on `OfficialAssignment`, scoped per tournament.

```
User (role: SCORER)
  -> ScorerProfile
      -> OfficialAssignment (tournamentId, tatamiId?, function: JUDGE)
      -> OfficialAssignment (different tournament, function: TATAMI_MANAGER)
```

## No spectator role

There is no spectator account type. Anyone who wants to see competition state either has one of the
four roles already, or is not an authenticated user of this system in Phase 1 — public/unauthenticated
tournament viewing is out of scope here and would be a distinct future feature (a read-only public
route), not a fifth account role.

## Authorization layers (server-side only — never trust client-sent role/org claims)

1. **Authentication** (`apps/api/src/middleware/auth.ts`) — verifies the JWT, attaches
   `req.user = { id, roles }`. Roles come only from the signed token, never from a request body/header.
2. **Role check** (`requireRole(...roles)`) — global, coarse: "does this user hold role X at all."
3. **Organization-level check** (`requireAcademyAdministrator()`) — per-resource: "does this
   specific user administer _this specific_ academy." This runs a DB lookup keyed on the route's
   `:academyId` param + the authenticated user id. Skipping this and trusting a global `ACADEMY` role
   claim alone would let any academy admin modify any other academy — a textbook IDOR/BOLA hole.
4. **Event-level check** (not yet implemented as middleware, but the data model supports it):
   a scoring action should verify the acting user has an `ACTIVE`/`CONFIRMED` `OfficialAssignment`
   for the specific bout's tournament+tatami before accepting a `ScoreEvent`.

## Dashboard content is role-scoped, not a separate spectator surface

Each role's dashboard home only ever queries data that role is authorized to see (own bouts for
`PLAYER`, own students for `COACH`, own organization for `ACADEMY`, own assignment for `SCORER`).
"Live competition visibility" is achieved by giving each authenticated role a live-relevant view of
their own scope — not by adding a public/spectator viewer role.
