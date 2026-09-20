# 10 — Tournament Flow

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#matches--scoring) (tournaments section). API reference: [05_API_DATABASE_MAPPING.md](05_API_DATABASE_MAPPING.md#tournaments).

## Create → register → play → standings

```mermaid
flowchart TD
    A["Create tournament\nPOST /tournaments (staff)"] --> B[("tournaments INSERT\nstatus='DRAFT'")]
    B --> C["Open registration\nPOST .../open-registration"]
    C --> D["Register teams\nPOST .../teams"]
    D --> E[("tournament_teams INSERT")]
    E --> F["Add squads\nPOST .../squad"]
    F --> G[("tournament_squad_players INSERT")]
    G --> H["Generate fixtures\nPOST .../fixtures/generate"]
    H --> I[("tournament_fixtures INSERT\n(bracket/league structure)")]
    I --> J["Fixture is played as a real match\n(tournament_fixtures.match_id links to matches)"]
    J --> K["Resolve fixture\nPOST .../fixtures/:id/resolve"]
    K --> L[("tournament_fixtures.manual_result_winner_team_id\nor derived from matches.winner_team_id")]
    L --> M["View standings/analytics\nGET .../standings, /analytics (public)"]
```

## Key facts

- A `tournament_fixtures` row can exist **without** a linked `matches` row yet (`match_id` is nullable) — it becomes linked once the actual match is created/scheduled.
- `tournament_fixtures.stage` distinguishes `LEAGUE`/`GROUP`/`QUARTER_FINAL`/`SEMI_FINAL`/`FINAL`; `tournaments.format` distinguishes `LEAGUE`/`GROUPS_KNOCKOUT`/`KNOCKOUT`.
- Tournament analytics/statistics (`GET .../statistics`, `.../analytics`) are computed on the fly from `matches`, `innings`, `match_players`, `wickets` — no separate pre-aggregated stats table exists for tournaments.
- `tournament_squad_players` is a **historical snapshot** — removing a player from a team later doesn't retroactively change who was in a completed tournament's squad.
