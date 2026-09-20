# ADR-0002: SportsHub identity as a nullable boundary column, not a coupled dependency

## Status

Accepted (Phase 1).

## Context

Karate is meant to eventually integrate with a parent SportsHub platform where one person can have
profiles across multiple sports. There is no SportsHub API available to integrate against yet, and
building against a system that doesn't exist risks guessing its contract wrong.

## Decision

`User.sportsHubIdentityId` is a nullable, unique string column. Until SportsHub integration exists,
it stays null and `User` behaves as a fully self-contained local account (email + password). When
SportsHub integration is built, this column becomes the join key — the Karate `User` row becomes "the
Karate profile" for that external identity — without altering any other table's shape.

## Alternatives considered

- **Wait to model identity until SportsHub's API is defined.** Rejected: would mean either blocking
  Phase 1 entirely on an external dependency, or a breaking migration later when the column is
  retrofitted onto a table with real rows.
- **Duplicate a `SportsHubUser` table locally and sync it.** Rejected: premature — there is nothing
  to sync yet, and this is the kind of cache/sync layer that should be designed against the real
  SportsHub API shape, not guessed.

## Consequence

No code in Phase 1 depends on `sportsHubIdentityId` being populated. Local auth
(`apps/api/src/modules/auth/`) works entirely without it. This is a pure extension point.
