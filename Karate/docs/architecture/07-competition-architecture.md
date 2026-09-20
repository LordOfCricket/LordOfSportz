# Competition Architecture

## Kumite and Kata share infrastructure, not scoring logic

`Tournament` → `Category` → `Competition(discipline: KUMITE | KATA)` is shared structure. Everything
below `Competition` that is discipline-specific is modeled so the two disciplines never have to agree
on a shared shape:

- `ScoreEvent.eventType` is a free-form string interpreted per-discipline by application code
  (e.g. Kumite: `YUKO` / `WAZA_ARI` / `IPPON` / `PENALTY_CHUI`; Kata: `JUDGE_SCORE`). The database
  does not enforce a fixed vocabulary here on purpose — the vocabulary is owned by the versioned rule
  set (see below), not by a migration.
- `BoutResult.method` (`POINTS | IPPON | DECISION | DISQUALIFICATION | WITHDRAWAL | WALKOVER | DRAW`)
  covers outcomes for both disciplines without implying how the outcome was computed.
- Discipline-specific scoring **logic** (Phase 2+) belongs in
  `apps/api/src/domain/scoring/kumite/` and `apps/api/src/domain/scoring/kata/` — two separate domain
  services behind a common `ScoringEngine` interface, never one function with a discipline `switch`
  spanning hundreds of lines.

## Rule versioning

```
RuleSet (name, discipline, organizationName e.g. "WKF")
  -> RuleSetVersion (version, effectiveFrom, sourceUrl, sourceDate, changeNotes)
      -> Competition.ruleSetVersionId
```

Every `Competition` optionally points at the exact `RuleSetVersion` it was run under. This exists so
that a bout scored in 2026 under one WKF rule revision stays reproducible even after the rules change
in 2028 — historical competitions are never silently reinterpreted under new rules.

**Before implementing real Kumite/Kata point rules**, populate `RuleSetVersion.sourceUrl` /
`sourceDate` from the actual current WKF competition rules publication (or the relevant federation's
rules if not WKF) — do not hardcode point values from memory or an unofficial summary. This is
flagged rather than done in Phase 1 because rule text changes over time and must be sourced at
implementation time, not guessed now.

## Idempotent scoring events (offline/reconnect foundation)

`ScoreEvent.clientOperationId` is a unique, client-generated key. A scorer's device can safely retry
a submission after a dropped connection: the server treats a repeat `clientOperationId` as the same
event, not a duplicate score. This is schema-level preparation for the reconnect/offline requirement
(product spec section 33) — the retry/queue logic on the client is not implemented in Phase 1.

## What Phase 1 implements vs. scaffolds

- **IMPLEMENTED**: full schema for `RuleSet`/`RuleSetVersion`/`ScoreEvent`/`BoutResult`, migrated.
- **NOT IMPLEMENTED**: any actual scoring rule, the `ScoringEngine` interface/services, draw/bracket
  generation, and the live-scoring UI (both web and mobile scoring screens are placeholders).
