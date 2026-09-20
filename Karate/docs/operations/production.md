# Production Operations

## Services

Run the API, Next.js Web app, and Expo release builds as separate services. PostgreSQL is the system of record. Redis is required before running more than one API instance for coordinated rate limits and Socket.IO pub/sub; the current single-process rate limiter is intentionally not multi-instance safe.

## Required configuration

API: `NODE_ENV=production`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS`, `CORS_ALLOWED_ORIGINS`, and `LOG_LEVEL`. Production secrets must be random and at least 32 characters. `CORS_ALLOWED_ORIGINS` is mandatory in production.

Web: `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, and the matching `JWT_ACCESS_SECRET`. Mobile: `EXPO_PUBLIC_API_BASE_URL`. Never commit `.env` files or put secrets in `EXPO_PUBLIC_*` variables.

## Release procedure

1. Build and test the exact commit in CI.
2. Take a PostgreSQL backup.
3. Deploy API and Web artifacts.
4. Run `pnpm --filter @karate/database run migrate:deploy` with the production `DATABASE_URL`.
5. Check `GET /health/live` and `GET /health/ready` before routing traffic.
6. Deploy the mobile bundle through the normal Expo/EAS release process.

Migrations are forward-only in production. Do not run `migrate:dev` against production.

## Rollback and recovery

Application rollback: redeploy the previous immutable API/Web artifacts, then investigate whether the migration is backward-compatible. Database rollback is restore-based, not destructive down-migrations: stop writes, restore the approved PostgreSQL backup to a new instance, validate `/health/ready`, and switch the connection endpoint.

Example backup: `pg_dump --format=custom --file=karate-$(Get-Date -Format yyyyMMddHHmm).dump $env:DATABASE_URL`. Restore with `pg_restore --clean --if-exists --dbname $env:RESTORE_DATABASE karate.dump` after validating the target.

## Observability

Logs are structured JSON in staging/production, include request IDs, and redact credentials, cookies, medical notes, and document URLs. Use the request ID returned in `X-Request-Id` when investigating failures. Readiness failures indicate database connectivity or timeout problems; liveness does not require the database.

## Realtime and scaling

Socket authentication is JWT-based and room authorization is database-backed. Before horizontal scaling, configure a Redis Socket.IO adapter and shared rate-limit counter, then verify sticky-session or websocket routing behavior. Single-instance deployment is the supported mode without that adapter.

## Security checklist

Use TLS at the edge, restrict `CORS_ALLOWED_ORIGINS` to exact Web origins, keep API cookies httpOnly/secure in production, rotate secrets through the deployment secret manager, restrict database network access, and do not expose PostgreSQL or Redis publicly. No upload endpoint currently exists; if introduced, require allowlisted MIME types, size limits, malware scanning, and private object storage.
