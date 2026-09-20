# Karate Platform

Production-oriented foundation for a Karate competition management platform — web, mobile, and a
shared backend, built for real academies, coaches, players, and scorers.

**Phase 1 status: foundation.** See [docs/architecture/](docs/architecture/01-system-architecture.md)
for what's implemented vs. scaffolded vs. not started, domain by domain.

## Stack

- **Backend**: Express + TypeScript, one service with domain-organized modules (`apps/api`)
- **Database**: PostgreSQL + Prisma, domain-organized multi-file schema (`packages/database`)
- **Web**: Next.js 14 (App Router) + Tailwind (`apps/web`)
- **Mobile**: Expo (React Native) + Expo Router (`apps/mobile`)
- **Shared**: `packages/types`, `packages/validation`, `packages/constants`, `packages/config`,
  `packages/logger`, `packages/shared` — one source of truth for contracts, validation, and error
  types across every app.

## Getting started

```bash
pnpm install
cp .env.example .env                 # then fill in real secrets (see comments in the file)
docker compose -f infrastructure/docker-compose.yml up -d postgres redis

pnpm --filter @karate/database run migrate:dev
pnpm --filter @karate/database run seed

pnpm dev:api     # http://localhost:4000
pnpm dev:web     # http://localhost:3000
pnpm dev:mobile  # Expo dev server (scan QR / press a for Android, i for iOS)
```

Postgres runs on host port **5433** (not 5432) in `infrastructure/docker-compose.yml`, to avoid
colliding with other local Postgres instances. Update `DATABASE_URL` accordingly if you change this.

## Quality gate

```bash
pnpm format:check
pnpm typecheck        # all packages + apps
pnpm --filter @karate/database run validate
pnpm --filter @karate/web run lint
pnpm --filter @karate/api run lint
pnpm build            # builds every package + app that has a build script
```

## Documentation

- [Production operations](docs/operations/production.md)

- [System architecture](docs/architecture/01-system-architecture.md)
- [Database architecture](docs/architecture/02-database-architecture.md) · [ERD](docs/database/erd.md)
- [Role & permission model](docs/architecture/03-role-permission-model.md)
- [Membership flow](docs/architecture/04-membership-flow.md)
- [Belt & grading architecture](docs/architecture/05-belt-grading-architecture.md)
- [Tournament lifecycle](docs/architecture/06-tournament-lifecycle.md)
- [Competition architecture](docs/architecture/07-competition-architecture.md)
- [Stats & rankings architecture](docs/architecture/08-stats-architecture.md)
- [Error handling strategy](docs/architecture/09-error-handling-strategy.md)
- [Security strategy](docs/architecture/10-security-strategy.md)
- [Web architecture](docs/architecture/11-web-architecture.md)
- [Mobile architecture](docs/architecture/12-mobile-architecture.md)
- [Realtime architecture (prepared, not implemented)](docs/architecture/13-realtime-architecture.md)
- [Architecture decision records](docs/decisions/)
