# ADR-0001: Tournament organizer as a typed relationship, not a hardcoded field

## Status

Accepted (Phase 1).

## Context

MVP only needs academies to be able to host tournaments. The product spec explicitly requires the
architecture to support federations/associations/other organizers later without a destructive
rewrite (section 11).

## Decision

Introduce `TournamentOrganizer` as its own table with `organizerType: ACADEMY | FEDERATION |
ASSOCIATION | OTHER` and a nullable `academyId` FK, populated only when `organizerType = ACADEMY`.
`Tournament.organizerId` points at `TournamentOrganizer`, never directly at `Academy`.

## Alternatives considered

- **`Tournament.organizerType` + `Tournament.academyId` directly on Tournament.** Rejected: adding
  `FEDERATION` later means adding `federationId` directly to `Tournament`, growing the table with
  every new organizer type and leaving old rows' unused FK columns permanently null.
- **True polymorphic FK (`organizerType` + `organizerId` pointing at different tables).** Rejected:
  Prisma/Postgres have no native polymorphic FK with referential integrity; would require giving up
  a real foreign key constraint entirely.

## Consequence

Adding `FEDERATION` support later is: add a `federationId` nullable FK column to
`TournamentOrganizer` (one new column, one new branch), not a change to `Tournament` or any existing
query that joins through `TournamentOrganizer`.
