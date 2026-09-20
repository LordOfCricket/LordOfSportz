# 08 — Ground & Booking Flow

Table reference: [02_DATABASE_RELATIONSHIPS.md](02_DATABASE_RELATIONSHIPS.md#booking-engine). API reference: [05_API_DATABASE_MAPPING.md](05_API_DATABASE_MAPPING.md#grounds--booking).

## Search → book → check-in

```mermaid
flowchart TD
    A["Search ground\nGET /grounds/search"] --> B["View profile\nGET /grounds/:id"]
    B --> C["Create booking\nPOST /grounds/:id/bookings"]
    C --> D[("ground_bookings + booking_teams +\nbooking_team_slots + booking_player_slots +\nbooking_participants")]
    D --> E["GIST exclusion constraints\nreject any overlapping booking\nfor the same ground/team/player"]
    E --> F["Check-in / cancel / no-show\nPOST .../check-in, /cancel, /no-show"]
    F --> G[("ground_bookings.status UPDATE\n+ ground_notifications INSERT")]
    G --> H["Ground Owner dashboard\n(analytics over ground_bookings)"]
```

## Ground registration (new ground onboarding)

```mermaid
flowchart TD
    A["Applicant submits form\nPOST /grounds (registerGround)"] --> B[("ground_owner_requests INSERT\nstatus='PENDING'")]
    B --> C["Upload photos\nPOST /ground-owner-requests/photos"]
    C --> D[("ground_registration_photos INSERT\n+ Cloudinary")]
    B --> E["Select amenities"]
    E --> F[("ground_registration_amenities junction")]
    D --> G["Super admin reviews queue\nGET /ground-owner-requests"]
    G --> H["Approve\nPATCH .../decide"]
    H --> I[("grounds INSERT\n(ground_owner_requests.created_ground_id set)")]
```

## Match proposal ("looking for opponent")

```mermaid
flowchart TD
    A["Team books a ground slot"] --> B["Propose an open match\nPOST /grounds/:id/proposals"]
    B --> C[("match_proposals INSERT\nstatus='OPEN', booking_id linked")]
    C --> D["Another team accepts\nPOST .../proposals/:id/accept"]
    D --> E[("match_proposals.status='ACCEPTED'\n+ ground_notifications INSERT")]
```

## Key facts

- Double-booking is prevented at the **database layer**, not just application logic: `ground_bookings_no_overlap`, `booking_team_slots_no_overlap`, `booking_player_slots_no_overlap` are PostgreSQL GIST exclusion constraints (visible only via `pg_constraint`, not `information_schema`).
- `ground_bookings.booking_type` distinguishes `CUSTOMER` bookings from `STAFF_BLOCK` (ground maintenance/closure blocks).
- `ground_bookings.match_format` has no CHECK constraint documenting its allowed values — `UNKNOWN — REQUIRES VERIFICATION`.
- Registering a ground does **not** create a `grounds` row directly — it creates a `ground_owner_requests` row that must be approved first.
- No payment/checkout step exists in the booking flow — see [05_API_DATABASE_MAPPING.md § Payments](05_API_DATABASE_MAPPING.md#payments--not-implemented).
