# 07 — Match & Scoring Flow

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#matches--scoring). API reference: [05_API_DATABASE_MAPPING.md](05_API_DATABASE_MAPPING.md#matches--scoring).

## Match lifecycle

```mermaid
flowchart TD
    A["Create match\nPOST /matches (super_admin)"] --> B[("matches, match_umpire_slots,\numpire_earnings")]
    B --> C["Set toss / check-in\nPATCH .../toss, POST .../checkin"]
    C --> D["Start match\nPOST .../start"]
    D --> E["Record deliveries live\nPOST /innings/:id/deliveries"]
    E --> F[("deliveries, wickets,\nwagon_wheel_shots, innings totals")]
    F --> G["Finalize match\nPOST .../finalize"]
    G --> H[("matches.status='finalized',\nmatch_umpire_slots completed,\numpire_earnings")]
    H --> I["View scorecard/commentary\n(public GETs)"]
```

## Recording one delivery (ball-by-ball)

```mermaid
flowchart TD
    A["Scorer taps a delivery outcome"] --> B["POST /innings/:inningsId/deliveries"]
    B --> C["requireMatchScorerByInnings gate"]
    C --> D[("deliveries INSERT\nbat_runs, illegal_type, extra_type,\nbowler_match_player_id")]
    D --> E{"Wicket?"}
    E -->|yes| F[("wickets INSERT\n(1:1 with delivery)")]
    E -->|shot data present| G[("wagon_wheel_shots INSERT\n(1:1 with delivery)")]
    D --> H[("innings UPDATE\nruns, wickets, legal_balls\n(running totals cache)")]
    H --> I["commentary_entries projected\n(deterministic, from deliveries/events)"]
```

## Corrections (undo)

```mermaid
flowchart TD
    A["Scorer flags a mistake"] --> B["POST /innings/:id/corrections"]
    B --> C[("score_corrections INSERT\nbefore_data/after_data JSONB,\nreason_code")]
    C --> D["Corrects the target delivery/event row"]
    D --> E["Undo (if needed)\nPOST .../corrections with\nundoes_correction_id"]
```

## Key facts

- `deliveries` is **append-only** and the single source of truth; `innings.runs`/`.wickets`/`.legal_balls` are derived caches recomputed from it.
- `matches.status` has **no DB-level CHECK constraint** (unlike `innings.status`) — valid values (`upcoming`/`live`/`completed`/`finalized`/`cancelled`) are inferred from application code only. `UNKNOWN — REQUIRES VERIFICATION` for a complete enum guarantee.
- `score_corrections` is an immutable audit trail — corrections never delete history, they append a new row and reference `undoes_correction_id` for undo-of-undo chains.
- Live scoring is also broadcast over Socket.IO (`server/src/realtime/`) but that only mirrors state already written via these REST endpoints — no separate persisted data path.
