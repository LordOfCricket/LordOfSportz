# Stats & Rankings Architecture

## Stats are projections, never the source of truth

```
Competition Events (BoutResult, ScoreEvent, Registration, ...)   <- source of truth, append-only
        |
        v
Stats Aggregator (Phase 2+, not implemented)                     <- reads events, writes projections
        |
        v
PlayerStats / CoachStats / AcademyStats / TournamentStats         <- materialized, rebuildable
        |
        v
Dashboards
```

Every stats table carries `lastComputedAt`, and `StatsComputationLog` records every (re)computation
run (`statsType`, `entityId`, `status`, timestamps). This is the "no fragile increment-a-number-
everywhere logic with no recovery path" requirement made concrete: if a stats row is ever suspected
wrong, the fix is "recompute it from the event tables," not "manually patch the number," because the
row is defined as a function of the event tables, not as independently-maintained state.

`seasonId = null` on a stats row means career totals; a non-null `seasonId` scopes it to that
`Season`. The same row shape serves both — no separate "career stats" table.

## Rankings follow the same pattern

`RankingPointsEvent` is the append-only ledger (source of truth: every point award/adjustment, with
`reason` and optional `sourceTournamentId`). `RankingEntry` is the current-standing snapshot per
`RankingCategory` — safe to truncate and rebuild by replaying `RankingPointsEvent`. `RankingSystem` /
`RankingSeason` make the points formula and season boundaries configurable per system rather than one
permanent global ranking formula.

## What Phase 1 implements vs. scaffolds

- **IMPLEMENTED**: full schema for both stats and rankings domains, migrated; `Season` seeded with a
  demo 2026 season.
- **NOT IMPLEMENTED**: the aggregator/recompute job itself, and any API endpoint or dashboard widget
  reading real (non-mock) stats. Dashboard stat tiles in Phase 1 render clearly-labeled demo data.
