# ADR-0003: Domain-organized Prisma schema via `prismaSchemaFolder`

## Status

Accepted (Phase 1).

## Context

The product spec explicitly forbids one enormous schema file for ~20 unrelated business domains
(section 15/16) and asks for domain-oriented file organization "if the current Prisma setup supports
it cleanly" — this is a greenfield repository, so nothing constrains the choice.

## Decision

Enable Prisma's `prismaSchemaFolder` preview feature (Prisma 5.15+) and split the schema into one
`.prisma` file per business domain under `packages/database/prisma/schema/` (identity, academies,
belts, tournaments, scoring, stats, rankings, platform, ...). All files are merged into a single
logical schema at `generate`/`migrate` time — cross-file relations work exactly like same-file
relations.

## Alternatives considered

- **One monolithic `schema.prisma`.** Rejected: explicitly disallowed by the product brief, and in
  practice becomes unreadable past ~15 models.
- **Separate Prisma schemas/clients per domain (true schema-per-service).** Rejected for Phase 1: one
  Postgres database is intentional (see `01-system-architecture.md` on the single-service decision);
  running N independent Prisma Client generators against the same DB adds migration-ordering
  complexity with no present benefit.

## Consequence

Pinned to `prisma@^5.22.0` (the feature is preview in v5, not yet GA) with
`previewFeatures = ["prismaSchemaFolder"]` in `schema.prisma`'s generator block. Upgrading to a
Prisma major version where this is GA should drop the preview flag as a follow-up, not block it.
