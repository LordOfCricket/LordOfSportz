# Database Architecture

PostgreSQL + Prisma. Schema files live under `packages/database/prisma/schema/*.prisma` (Prisma's
`prismaSchemaFolder` preview feature), one file per business domain, merged into a single logical
schema at generate/migrate time. This is the file-level answer to "domain-oriented, not one giant
schema" — see [ADR-0003](../decisions/0003-prisma-schema-folder.md).

| File                                                   | Domain                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `identity.prisma`                                      | `User`, `UserRoleAssignment`                                                                    |
| `sessions.prisma`                                      | `RefreshSession` (opaque, hashed, rotating refresh tokens — see security strategy doc)          |
| `academies.prisma`                                     | `Academy`, `AcademyAdministrator`                                                               |
| `styles.prisma`                                        | `KarateStyle`                                                                                   |
| `belts.prisma`                                         | `BeltSystem`, `BeltGrade`, `GradingEvent`, `PlayerBeltHistory`, `Certificate`                   |
| `players.prisma` / `coaches.prisma` / `scorers.prisma` | Role-specific profiles                                                                          |
| `memberships.prisma`                                   | `AcademyMembershipRequest`, `AcademyPlayerMembership`, `AcademyCoachAffiliation`                |
| `tournaments.prisma`                                   | `TournamentOrganizer`, `Tournament`, `TournamentStatusHistory`, `Category`, `Competition`       |
| `registrations.prisma`                                 | `Registration`, `EligibilityCheck`, `MedicalClearance`, `WeighIn`                               |
| `officials.prisma`                                     | `Tatami`, `OfficialAssignment`                                                                  |
| `draws.prisma`                                         | `Draw`, `Round`, `Bout`                                                                         |
| `scoring.prisma`                                       | `RuleSet`, `RuleSetVersion`, `ScoreEvent`, `BoutResult`                                         |
| `stats.prisma`                                         | `Season`, `PlayerStats`, `CoachStats`, `AcademyStats`, `TournamentStats`, `StatsComputationLog` |
| `rankings.prisma`                                      | `RankingSystem`, `RankingSeason`, `RankingCategory`, `RankingEntry`, `RankingPointsEvent`       |
| `platform.prisma`                                      | `Notification`, `Protest`, `Incident`, `AuditLog`                                               |

Full entity relationship diagrams: [docs/database/erd.md](../database/erd.md).

## Conventions applied throughout

- **UUID primary keys** (`@default(uuid())`, `@db.Uuid`) everywhere — no auto-increment integer IDs,
  so IDs are safe to expose in URLs and never leak row counts.
- **Soft delete where a record can be "removed" without invalidating history**: `User`, `Academy`,
  `PlayerProfile`, `CoachProfile`, `ScorerProfile` carry `deletedAt`. Competition history
  (`Tournament`, `Bout`, `BoutResult`, `Registration`, `PlayerBeltHistory`, memberships) is never
  deleted — it moves through status enums instead (`LEFT`, `WITHDRAWN`, `CANCELLED`, ...).
- **Cascade behavior is deliberate, not default**: child records that only make sense with their
  parent (`UserRoleAssignment`, `AcademyAdministrator`, `Registration`'s eligibility/medical/weigh-in)
  cascade-delete. Records that are historical facts referencing another entity
  (`BoutResult.winnerPlayerId`, `Bout.redPlayerId`) use `onDelete: SetNull` or `Restrict` so deleting
  a player profile can't silently rewrite a competition's history.
- **Append-only ledgers, not mutable counters**: `ScoreEvent`, `TournamentStatusHistory`,
  `RankingPointsEvent`, `AuditLog` are never updated after insert. Corrections are new rows.
- **Stats are rebuildable projections**: `PlayerStats`/`CoachStats`/`AcademyStats`/`TournamentStats`/
  `RankingEntry` are derived from the append-only tables above via `StatsComputationLog`-tracked
  jobs (not yet implemented — Phase 1 only has the schema and the principle documented). See
  `08-stats-architecture.md`.
- **Composite unique constraints over synthetic ones** where the natural key is the real constraint:
  e.g. `@@unique([competitionId, playerId])` on `Registration`, `@@unique([beltSystemId, rankOrder])`
  on `BeltGrade`.

## Local database workflow

```bash
docker compose -f infrastructure/docker-compose.yml up -d postgres   # Postgres on localhost:5433
cp .env.example .env                                                 # then edit secrets
pnpm --filter @karate/database run migrate:dev                       # apply migrations
pnpm --filter @karate/database run seed                               # load [SEED]-labeled demo data
```

`packages/database/prisma/seed.ts` only ever creates records prefixed `[SEED]` / `seed-*@example.com`
so seed data is never mistaken for production data.
