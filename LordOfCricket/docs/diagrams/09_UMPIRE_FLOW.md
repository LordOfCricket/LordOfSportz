# 09 — Umpire Flow

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#umpire-module). API reference: [05_API_DATABASE_MAPPING.md](05_API_DATABASE_MAPPING.md#umpire).

## Registration → approval → assignment → earnings

```mermaid
flowchart TD
    A["Register as umpire\n(OTP purpose REGISTER_UMPIRE)"] --> B[("umpire_requests INSERT\nstatus='pending'")]
    B --> C["Super admin approves\nPATCH /umpire-requests/:id"]
    C --> D[("umpire_requests.status='approved'\nusers.player_type='umpire'")]
    D --> E["Set availability\nPATCH /umpire/availability/weekly|date"]
    E --> F[("umpire_weekly_availability,\numpire_date_availability")]
    F --> G["Apply for an open slot\nPOST /matches/:id/umpire-slots/apply"]
    G --> H[("match_umpire_slots.status='ASSIGNED'\n+ umpire_assignment_events INSERT")]
    H --> I["Check in on match day"]
    I --> J[("match_umpire_slots.checked_in_at,\ncheck_in_latitude/longitude")]
    J --> K["Officiate — checklist, incidents\numpire_match_checklist_items, match_incidents"]
    K --> L["Match finalized"]
    L --> M[("umpire_earnings INSERT\nstatus='PENDING' (manual)")]
```

## Ground Owner direct proposal (alternative to self-apply)

```mermaid
flowchart TD
    A["Ground Owner proposes a slot to a specific umpire\nPOST .../umpire-slots/:id/propose"] --> B[("umpire_proposals INSERT\nstatus='PENDING'")]
    B --> C["Umpire responds\nPOST /umpire/proposals/:id/respond"]
    C --> D{"Accepted?"}
    D -->|yes| E[("match_umpire_slots.status='ASSIGNED'\numpire_proposals.status='ACCEPTED'")]
    D -->|no| F[("umpire_proposals.status='DECLINED'")]
    E --> G[("ground_notifications INSERT")]
```

## No-show / replacement

```mermaid
flowchart TD
    A["Umpire fails to check in"] --> B["Ground Owner marks no-show\nPOST .../umpire-slots/:id/no-show"]
    B --> C[("match_umpire_slots.status='NO_SHOW'\numpire_assignment_events INSERT")]
    C --> D["Assign a replacement\nPOST .../replace"]
    D --> E[("match_umpire_slots.umpire_user_id UPDATE\numpire_assignment_events INSERT 'REPLACEMENT_ASSIGNED'")]
```

## Key facts

- `umpire_earnings.status` is a **manual** enum (`PENDING/APPROVED/PAID/FAILED/CANCELLED`) — no real payment gateway backs it; only a Ground Owner can move it via `PATCH .../payment-status`.
- `umpire_assignment_events` and `umpire_match_checklist_items` are append-only history/audit tables, never overwritten.
- Umpire reputation/leaderboard (`GET /stats/top-umpires`) is computed from aggregates over `match_umpire_slots` and `match_feedback_umpire_ratings` — there's no separate "reputation score" column stored anywhere.
