# Tournament Lifecycle

## States

```
DRAFT -> PUBLISHED -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> VERIFICATION -> WEIGH_IN
      -> DRAW_GENERATED -> SCHEDULED -> LIVE -> COMPLETED -> RESULTS_FINALIZED -> ARCHIVED
```

Strictly linear in Phase 1 (each state has exactly one allowed next state — see
`packages/types/src/tournament.ts#TOURNAMENT_STATUS_TRANSITIONS`). No skipping ahead, no going
backward. If a real tournament needs to reopen registration after closing it, that is a deliberate
future extension to the transition table, not a client-side status overwrite.

## Enforcement

Status is **never** settable directly from client input. The one place a transition is allowed to
happen is `assertValidTournamentTransition()` (`apps/api/src/domain/tournamentLifecycle.ts`), which:

1. Looks up the allowed next-states for the current status from the shared transition table.
2. Throws `ConflictError` (409) if the requested transition isn't in that list.
3. (Intended call-site pattern, not yet wired into a route in Phase 1): on success, the caller writes
   the new status **and** inserts a `TournamentStatusHistory` row in the same DB transaction, so the
   full history of who changed what and when is reconstructable without re-deriving it from
   application logs.

Postgres itself does not enforce the state machine — a `CHECK` constraint can't cleanly express "valid
next value depends on current value" — so this is an application-layer guarantee, verified by
`assertValidTournamentTransition` being the only path that writes `Tournament.status`.

## What Phase 1 implements vs. scaffolds

- **IMPLEMENTED**: the transition table (shared between client and server via `@karate/types`), the
  server-side guard function, and the `TournamentStatusHistory` table.
- **NOT IMPLEMENTED**: no route yet calls `assertValidTournamentTransition` (there is no
  "advance tournament status" endpoint in Phase 1) — this is scaffolding for the tournament-management
  module that comes in a later phase.
