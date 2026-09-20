# 12 — Other Feature Flows (Follow, Canteen, Content/CMS)

## Follow (players / teams / grounds)

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#social--follow).

```mermaid
flowchart TD
    A["View player/team/ground profile (public)"] --> B["Tap Follow\nPOST /players|teams|grounds/:id/follow"]
    B --> C[("user_follows INSERT,\nON CONFLICT DO NOTHING")]
    C --> D["GET /me/following\n(joined with players/teams/grounds)"]
    D --> E["Unfollow\nDELETE .../follow"]
    E --> F[("user_follows DELETE")]
```

One table, `user_follows`, backs all three follow types (`CHECK num_nonnulls(player_id, team_id, ground_id) = 1`).

## Canteen ordering

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#canteen--orders).

```mermaid
flowchart TD
    A["Ground Owner/Canteen Staff publishes today's menu"] --> B[("today_menu, today_menu_items\n(available, stock, daily_price)")]
    B --> C["Customer places order"]
    C --> D[("orders INSERT\n+ order_items INSERT\n(unit_price snapshotted at order time)")]
    D --> E["Staff updates order status\nPending→Accepted→Preparing→Ready→Completed"]
    E --> F[("orders.status UPDATE\n+ ground_notifications INSERT")]
```

`order_items.unit_price` is a permanent snapshot — later menu price changes never retroactively affect a past order.

## Content / CMS (Advertisements, Partners, Gallery, AI Insights)

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#content--cms).

```mermaid
flowchart TD
    A["Home screen"] --> B[("advertisements — banner images")]
    A --> C[("partners — sponsor logos")]
    D["Gallery page"] --> E[("gallery_images — global, not ground-scoped")]
    F["Match/Player/Team/Umpire AI Insight section"] --> G["AI insight service"]
    G --> H[("ai_insights — cached by source_type+source_id,\nsource_fingerprint invalidates stale cache")]
```

`gallery_images` deliberately has **no `ground_id`** — the schema comment confirms this is intentional, the gallery stays global rather than per-ground.

## Payments — `NOT IMPLEMENTED`

No flow diagram is provided here because none exists in the codebase. See [05_API_DATABASE_MAPPING.md § Payments](05_API_DATABASE_MAPPING.md#payments--not-implemented) for the full confirmation (no gateway SDK, no webhook route, only manual payment-status enums on umpire earnings).
