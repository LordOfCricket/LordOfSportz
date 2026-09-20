# 06 — User / Player / Team Profile Flow

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#player--team). API reference: [05_API_DATABASE_MAPPING.md](05_API_DATABASE_MAPPING.md#player--team).

## Create profile → upload photo → update

```mermaid
flowchart TD
    A["Frontend"] --> B["PATCH /me/player\n(create/claim profile)"]
    B --> C[("players\nINSERT/UPDATE: name, role, city, bio,\nbatting_style, bowling_style")]
    C --> D["Upload photo\nPOST /me/player/photo"]
    D --> E["Cloudinary (LOC/player-photos)"]
    E --> F[("players.photo_url UPDATE")]
    F --> G["Further edits\nPATCH /me/player"]
    G --> H["View public profile\nGET /players/:publicPlayerId (public)"]
```

## Create a team → add players

```mermaid
flowchart TD
    A["Player creates a team\nPOST /teams (role: player)"] --> B[("teams INSERT\nowner_id = current user")]
    B --> C["Staff adds players to roster\nPOST /teams/:id/players (role: staff)"]
    C --> D[("players.team_id UPDATE")]
    D --> E["View team\nGET /teams/:id/players"]
```

## Key facts

- One optional 1:1 link exists between `users` and `players` via `players.user_id` (unique partial index — only enforced when non-null). A player profile can exist without ever being claimed by a `users` account (e.g. added to a roster by a scorer).
- `teams.owner_id → users.id` — ownership was added later (Phase 5D.4); teams created before that have `owner_id = NULL`.
- `players.photo_url` stores a plain URL string with **no Cloudinary `public_id` tracked** — see [04_CLOUDINARY_UPLOAD_FLOW.md](04_CLOUDINARY_UPLOAD_FLOW.md) for why the old photo is never deleted on replace.
- `teams.logo_url` is **not** a Cloudinary upload — the client supplies an arbitrary URL string directly in the request body.
