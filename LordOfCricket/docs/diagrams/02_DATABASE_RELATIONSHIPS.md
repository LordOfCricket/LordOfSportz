# 02 — Database Relationships (70 tables, 10 modules)

Full column-level dictionary: see [../LOC_COMPLETE_DATA_FLOW.md § B & C](../LOC_COMPLETE_DATA_FLOW.md#b-postgresql-database-map). Source of truth is `server/src/config/schema.sql` (not the stale `server/prisma/schema.prisma`).

## Auth / Users / Sessions / MFA

```mermaid
flowchart TD
    U["users\nid PK, email, phone, password_hash,\nrole, player_type, status,\nstaff_role_id FK, username,\nforce_password_change"]
    SR["staff_roles\nid PK, name"]
    S["sessions\nid PK, user_id FK, token_hash,\nexpires_at, revoked_at, mfa_verified_at"]
    OTP["otp_codes\nid PK, identifier, purpose,\notp_hash, status, user_id FK"]
    WC["webauthn_credentials\nid PK, user_id FK, credential_id,\npublic_key, counter"]
    WCH["webauthn_challenges\nid PK, user_id FK, challenge, purpose"]
    TOTP["totp_credentials\nuser_id PK/FK, encrypted_secret"]
    MRC["mfa_recovery_codes\nid PK, user_id FK, code_hash"]
    SUG["step_up_grants\nid PK, session_id FK, user_id FK, action_scope"]
    PERM["permissions\nid PK, key"]
    SP["staff_permissions\nid PK, ground_user_id FK, permission_id FK"]

    U -->|staff_role_id| SR
    U -->|1→many| S
    U -->|1→many| OTP
    U -->|1→many| WC
    U -->|1→many| WCH
    U -->|1→1| TOTP
    U -->|1→many| MRC
    S -->|1→many| SUG
    PERM -->|1→many| SP
```

`users` is the hub table — referenced by nearly every other module as an actor/owner FK.

## Player & Team

```mermaid
flowchart TD
    U["users"]
    T["teams\nid PK, name, short_name,\nlogo_url, owner_id FK→users"]
    P["players\nid PK, team_id FK→teams,\nuser_id FK→users, public_player_id,\nphoto_url, role, city, bio"]

    U -->|owner_id, 1→many| T
    T -->|team_id, 1→many| P
    U -->|user_id, 1→1| P
```

## Matches & Scoring

```mermaid
flowchart TD
    T["teams"]
    G["grounds"]
    M["matches\nid PK, team_a_id/team_b_id FK→teams,\nground_id FK→grounds, status,\ntoss_winner_id, winner_team_id"]
    MP["match_players\nid PK, match_id FK, team_id FK, player_id FK"]
    I["innings\nid PK, match_id FK, innings_number,\nbatting_team_id/bowling_team_id FK, status"]
    D["deliveries\nid PK, innings_id FK, log_sequence,\nbat_runs, bowler_match_player_id FK"]
    W["wickets\nid PK, delivery_id FK (unique),\ndismissal_type, dismissed_match_player_id FK"]
    WW["wagon_wheel_shots\nid PK, delivery_id FK (unique)"]
    ME["match_events\nid PK, innings_id FK, event_type, payload"]
    SC["score_corrections\nid PK, innings_id FK, target_type/target_id"]
    CE["commentary_entries\nid PK, match_id FK, innings_id FK, entry_key"]

    T --> M
    G -->|ground_id| M
    M --> MP
    M --> I
    I --> D
    D -->|1→1| W
    D -->|1→1| WW
    I --> ME
    I --> SC
    M --> CE
    I --> CE
```

`deliveries` is the append-only single source of truth for scoring; `innings` caches running totals derived from it.

## Tournaments

```mermaid
flowchart TD
    T["teams"]
    P["players"]
    M["matches"]
    TR["tournaments\nid PK, public_tournament_id,\nformat, status, champion_team_id FK"]
    TT["tournament_teams\nid PK, tournament_id FK, team_id FK, group_name"]
    TSP["tournament_squad_players\nid PK, tournament_team_id FK, player_id FK"]
    TF["tournament_fixtures\nid PK, tournament_id FK, team_a_id/team_b_id FK,\nmatch_id FK (unique, nullable)"]

    TR --> TT
    TT --> TSP
    P --> TSP
    TR --> TF
    T --> TT
    T -->|team_a/team_b| TF
    TF -->|match_id| M
```

## Grounds & Ground Ops

```mermaid
flowchart TD
    U["users"]
    G["grounds\nid PK, public_ground_id, slug,\nstatus, rating_avg"]
    GU["ground_users\nid PK, ground_id FK, user_id FK, role"]
    GP["ground_photos\nid PK, ground_id FK, image_url,\ncloudinary_public_id"]
    AM["amenities (legacy)\nid PK, ground_id FK, image_url"]
    AC["amenity_catalog\nkey PK, name, icon"]
    GA["ground_amenities (junction)\nground_id FK, amenity_key FK"]
    GOR["ground_owner_requests\nid PK, status, created_ground_id FK→grounds"]
    GN["ground_notifications\nid PK, user_id FK, type, related_booking_id FK"]
    GPS["ground_pricing_slots\nid PK, ground_id FK, start_time/end_time, price"]
    C["canteens\nid PK, ground_id FK, public_canteen_id"]

    U --> GU --> G
    G --> GP
    G --> AM
    AC --> GA
    G --> GA
    GOR -->|created_ground_id| G
    U --> GN
    G --> GN
    G --> GPS
    G --> C
```

## Booking Engine

```mermaid
flowchart TD
    G["grounds"]
    T["teams"]
    P["players"]
    U["users"]
    GB["ground_bookings\nid PK, public_booking_id, ground_id FK,\nuser_id FK, status, booking_purpose,\nblock_type, pricing_slot_id FK"]
    MPR["match_proposals\nid PK, booking_id FK (unique),\nproposing_team_id FK, status"]
    BT["booking_teams (junction)\nbooking_id FK, team_id FK, role"]
    BTS["booking_team_slots\nbooking_id FK, team_id FK, time_range\n(GIST no-overlap)"]
    BPS["booking_player_slots\nbooking_id FK, player_id FK, time_range\n(GIST no-overlap)"]
    BP["booking_participants\nbooking_id FK, player_id FK, added_at/removed_at"]

    G --> GB
    U --> GB
    GB --> MPR
    T --> MPR
    GB --> BT
    T --> BT
    GB --> BTS
    T --> BTS
    GB --> BPS
    P --> BPS
    GB --> BP
    P --> BP
```

Double-booking is prevented at the **database layer** by three PostgreSQL GIST exclusion constraints: `ground_bookings_no_overlap`, `booking_team_slots_no_overlap`, `booking_player_slots_no_overlap`.

## Umpire Module

```mermaid
flowchart TD
    U["users"]
    M["matches"]
    MUS["match_umpire_slots\nid PK, match_id FK, slot_number,\numpire_user_id FK, status"]
    UP["umpire_profiles\nuser_id PK/FK, is_available,\nmatches_officiated, rating_avg"]
    UWA["umpire_weekly_availability\nid PK, umpire_user_id FK, day_of_week"]
    UDA["umpire_date_availability\nid PK, umpire_user_id FK, specific_date"]
    UAE["umpire_assignment_events\nid PK, match_umpire_slot_id FK, event_type"]
    UE["umpire_earnings\nid PK, match_umpire_slot_id FK (unique),\numpire_user_id FK, amount, status"]
    UPR["umpire_proposals\nid PK, match_umpire_slot_id FK, umpire_user_id FK"]
    UR["umpire_requests\nid PK, user_id FK, status"]

    U --> UR
    M --> MUS
    U --> MUS
    U -->|1→1| UP
    U --> UWA
    U --> UDA
    MUS --> UAE
    MUS -->|1→1| UE
    MUS --> UPR
```

## Canteen / Orders

```mermaid
flowchart TD
    C["canteens"]
    MI["menu_items\nid PK, canteen_id FK, name, price,\nimage_url, cloudinary_public_id"]
    TM["today_menu\nid PK, canteen_id FK (unique)"]
    TMI["today_menu_items\nid PK, today_menu_id FK, menu_item_id FK,\navailable, stock, daily_price"]
    O["orders\nid PK, public_order_id, canteen_id FK,\nuser_id FK, status, total"]
    OI["order_items\nid PK, order_id FK, menu_item_id FK,\nunit_price, quantity"]

    C --> MI
    C --> TM
    TM --> TMI
    MI --> TMI
    C --> O
    O --> OI
    MI -.->|nullable FK, SET NULL| OI
```

## Content / CMS

```mermaid
flowchart TD
    AD["advertisements\nid PK, image_url, link_url"]
    PT["partners (sponsors)\nid PK, name, logo_url,\ncloudinary_public_id, is_active"]
    GAL["gallery_images\nid PK, category, image_url,\ncloudinary_public_id (no ground_id, intentionally global)"]
    AI["ai_insights\nid PK, source_type, source_id (polymorphic),\npayload JSONB — cache"]
```

## Social / Follow

```mermaid
flowchart TD
    U["users"]
    P["players"]
    T["teams"]
    G["grounds"]
    UF["user_follows\nid PK, user_id FK,\nplayer_id / team_id / ground_id (exactly one non-null)"]

    U --> UF
    P -.-> UF
    T -.-> UF
    G -.-> UF
```

One table backs all three follow types. `CHECK (num_nonnulls(player_id, team_id, ground_id) = 1)` guarantees exactly one target per row.
