# Realtime Architecture (prepared, not implemented)

## Intended flow

```
Scorer device --(ScoreEvent, clientOperationId)--> Scoring API
                                                        |
                                                        v
                                          Competition State (Postgres, source of truth)
                                                        |
                                                        v
                                          Realtime broadcast (WebSocket / Socket.IO)
                                                   /            \
                                              Web clients    Mobile clients
                                        (subscribed to tournament/tatami/bout channels)
```

## Why this is deferred past Phase 1

Realtime infra (a WebSocket gateway, pub/sub fan-out, presence tracking) is real operational surface
area that isn't worth standing up before there's a scoring engine to broadcast events from. Building
it now would mean guessing at the event shape before the domain logic that produces those events
exists.

## What Phase 1 does to avoid blocking it later

- `ScoreEvent.clientOperationId` (unique) and `recordedAt` give every scoring action a stable identity
  and ordering key — exactly what a realtime fan-out needs to dedupe and sequence.
- `Bout.status`, `Tatami.status`, and `OfficialAssignment.status` are already modeled as explicit
  enums (not derived/computed), so a future realtime layer can broadcast "this row changed to this
  status" without inventing new state.
- `packages/config` already exposes `REDIS_URL` — the natural pub/sub backbone for fan-out across
  multiple API instances — unused in Phase 1 but present so adding it isn't a new environment-variable
  rollout.
- `infrastructure/docker-compose.yml` already runs Redis locally alongside Postgres.

## Explicitly not started

No WebSocket server, no Socket.IO dependency, no client-side subscription code in web or mobile, no
Redis pub/sub usage. This document exists so the _next_ phase's realtime work has a stated contract
to build against instead of re-deriving it.
