# 05 — API → Database Mapping

Full detail: see [../LOC_COMPLETE_DATA_FLOW.md § F](../LOC_COMPLETE_DATA_FLOW.md#f-api--table--data-flow). All paths relative to `/api`. Auth column: `public` = no auth, `auth` = `requireAuth` only, a role name = additionally gated.

## Auth

| API | Method | Reads | Writes | External | Auth |
|---|---|---|---|---|---|
| `/auth/send-otp` | POST | `otp_codes` | `otp_codes` | SendGrid/Twilio | public |
| `/auth/verify-otp` | POST | `otp_codes`, `users` | `otp_codes`, `users` (if new), `sessions` | — | public |
| `/auth/login-password` | POST | `users` | `sessions` | — | public |
| `/auth/logout` | POST | `sessions` | `sessions.revoked_at` | — | auth |
| `/auth/register/player`, `/register/umpire` | POST | `otp_codes` | `otp_codes` (staged) | SendGrid/Twilio | public |
| `/auth/forgot-password`, `/reset-password` | POST | `otp_codes`, `users` | `users.password_hash`, `sessions` (revoke all) | SendGrid/Twilio | public |
| `/auth/signup/send-code`, `/verify-code`, `/create-account` | POST | `otp_codes` | `otp_codes`, `users` | SendGrid/Twilio | public |
| `/auth/me` | GET | `users` | — | — | auth |
| `/auth/role`, `/auth/player-type` | PATCH | `users` | `users.role`/`player_type`, may create `umpire_requests` | — | auth |
| `/auth/change-password` | POST | `users` | `users.password_hash`, `sessions` (revoke others) | — | auth |
| `/auth/mfa/*`, `/auth/step-up/*` | various | `webauthn_*`, `totp_credentials`, `mfa_recovery_codes`, `step_up_grants` | same tables | — | auth |

## Player & Team

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/me/player` | GET/PATCH | `players` | `players` | auth |
| `/me/player/photo` | POST | — | `players.photo_url` | auth (Cloudinary) |
| `/players`, `/players/:id` | GET | `players`, `teams` | — | public |
| `/teams`, `/teams/discover`, `/:id/profile` | GET | `teams`, `players` | — | public |
| `/teams/:id`, `/:id/players` | GET | `teams`, `players` | — | auth |
| `/teams` | POST | `players` | `teams` | auth + role `player` |
| `/teams/:id/players` | POST/DELETE | `teams` | `players.team_id` | auth + role `staff` |

## Matches & Scoring

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/matches`, `/discover`, `/home` | GET | `matches`, `teams` | — | public |
| `/matches` | POST | — | `matches`, `match_umpire_slots`, `umpire_earnings` | `requireStaffRole('super_admin')` |
| `/matches/:id`, `/summary`, `/live-state`, `/commentary` | GET | `matches`, `innings`, `commentary_entries` | — | public |
| `/matches/:id/toss`, `/checkin`, `/start`, `/finalize` | PATCH/POST | `matches` | `matches.*` | auth + scorer gate |
| `/matches/:id/match-players` | GET/POST | `match_players` | `match_players` | POST = scorer gate |
| `/matches/:id/innings` | GET/POST | `innings` | `innings` | POST = scorer gate |
| `/innings/:id/deliveries` | POST | — | `deliveries`, `wickets`, `wagon_wheel_shots`, `innings` | auth + scorer gate |
| `/innings/:id/events` | POST | — | `match_events` | auth + scorer gate |
| `/innings/:id/corrections`, `/undo` | POST | `deliveries`/`wickets` | `score_corrections`, corrected rows | auth + scorer gate |
| `/matches/:id/incidents` | GET/POST | `match_incidents` | `match_incidents` (+ `ground_notifications`) | auth + scorer gate |
| `/matches/:id/messages` | GET/POST | `match_messages` | `match_messages` (+ `ground_notifications`) | auth |
| `/matches/:id/availability` | GET/PATCH | `match_availability` | `match_availability` | auth |
| `/matches/:id/feedback` | GET/POST | `match_feedback` | `match_feedback`, `match_feedback_umpire_ratings` | auth |
| `/india-match/featured` | GET | — (external only) | — | public — `cricapi.service.js`, no DB |

## Tournaments

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/tournaments`, `/:id`, `/:id/teams`, `/squad`, `/fixtures`, `/standings`, `/statistics`, `/analytics` | GET | `tournaments`, `tournament_teams`, `tournament_squad_players`, `tournament_fixtures`, `matches`, `innings` | — | public |
| `/tournaments` | POST | — | `tournaments` | staff |
| `/:id/open-registration`, `/complete` | POST | `tournaments` | `tournaments.status` | staff |
| `/:id/teams`, `/squad` | POST/DELETE | `tournament_teams` | `tournament_teams`, `tournament_squad_players` | staff |
| `/:id/fixtures/generate` | POST | `tournament_teams` | `tournament_fixtures` | staff |
| `/:id/fixtures/:id/schedule`, `/resolve` | PATCH/POST | `tournament_fixtures` | `tournament_fixtures`, may create `matches`/`ground_bookings` | staff |

## Grounds & Booking

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/grounds/nearby`, `/search`, `/cities`, `/`, `/:id` | GET | `grounds`, `ground_photos` | — | public |
| `/grounds` (registerGround) | POST | — | `ground_owner_requests` (not `grounds` directly) | auth |
| `/bookings/availability` | GET | `ground_bookings` | — | public |
| `/bookings` | POST | — | `ground_bookings` (+ `ground_notifications`) | auth |
| `/bookings/my`, `/history` | GET | `ground_bookings` | — | auth/staff |
| `/bookings/:id/cancel` | POST | `ground_bookings` | `ground_bookings.status` | auth |
| `/bookings/staff/schedule`, `/block` | GET/POST/DELETE | `ground_bookings` | `ground_bookings` (BLOCK rows) | staff |
| `/grounds/:id/bookings` (team booking) | POST | — | `ground_bookings`, `booking_teams`, `booking_team_slots`, `booking_player_slots`, `booking_participants` | auth |
| `/grounds/:id/bookings/:id/cancel`, `/check-in`, `/no-show` | POST | `ground_bookings` | `ground_bookings.status`, `booking_participants` | auth/staff |
| `/grounds/:id/proposals` | GET/POST/accept/cancel | `match_proposals` | `match_proposals` (+ `ground_notifications`) | public GET, auth mutate |
| `/ground-owner/grounds`, `/:id` | GET/PATCH | `ground_users`, `grounds` | `grounds` | `requireGroundRole('GROUND_OWNER')` |
| `/ground-owner/grounds/:id/dashboard`, `/analytics*` | GET | `ground_bookings`, `menu_items`, `orders` | — | ground owner |
| `/ground-owner/grounds/:id/notifications` | GET/POST | `ground_notifications` | `ground_notifications.read_at` | ground role |
| `/ground-owner/grounds/:id/media*` | GET/POST/DELETE/PATCH | `ground_photos` | `ground_photos` | ground role (Cloudinary) |
| `/ground-owner/grounds/:id/amenities` | GET/POST/DELETE | `ground_amenities` | `ground_amenities` | ground role |
| `/ground-owner/grounds/:id/pricing-slots` | GET/POST/PATCH/DELETE | `ground_pricing_slots` | `ground_pricing_slots` | ground role |
| `/ground-owner/grounds/:id/staff` | GET/POST/DELETE/PATCH | `ground_users` | `ground_users` | ground owner only |
| `/ground-owner-requests` | POST/GET | `ground_owner_requests` | `ground_owner_requests`, `ground_registration_photos`, `ground_registration_amenities` | public submit, super_admin review |
| `/ground/notifications`, `/:id/read`, `/read-all` | GET/POST | `ground_notifications` | `ground_notifications.read_at` | auth |

## Umpire

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/umpire-requests/me`, `/umpire-requests` | GET | `umpire_requests` | — | auth/super_admin |
| `/umpire-requests/:id` | PATCH | `umpire_requests` | `umpire_requests.status` | super_admin |
| `/matches/:id/umpire-slots`, `/apply`, `/cancel` | GET/POST | `match_umpire_slots`, `umpire_weekly_availability`, `umpire_date_availability` | `match_umpire_slots`, `umpire_assignment_events` | auth |
| `/umpire/matches/available`, `/assignments` | GET | `matches`, `match_umpire_slots` | — | approved umpire |
| `/umpire/profile` | GET/PATCH | `umpire_profiles` | `umpire_profiles` | approved umpire |
| `/umpire/availability*` | GET/PATCH/DELETE | `umpire_weekly_availability`, `umpire_date_availability` | same | approved umpire |
| `/umpire/earnings` | GET | `umpire_earnings` | — | approved umpire |
| `/umpire/ai-insight`, `/regenerate` | GET/POST | `ai_insights` | `ai_insights` | approved umpire |
| `/umpire/proposals`, `/:id/respond` | GET/POST | `umpire_proposals` | `umpire_proposals` (+ `ground_notifications`) | approved umpire |
| Ground-Owner side: no-show/replace/history/recommend/incidents/propose, `PATCH .../payment-status` | various | `match_umpire_slots`, `umpire_assignment_events` | same + `umpire_earnings.status` (manual) | ground permission |
| `/stats/top-umpires` | GET | `match_umpire_slots`, `match_feedback_umpire_ratings` | — | public |

## Notifications, Follow, Stats

| API | Method | Reads | Writes | Auth |
|---|---|---|---|---|
| `/ground/notifications`, `/:id/read`, `/read-all` | GET/POST | `ground_notifications` | `ground_notifications.read_at` | auth |
| `/players/:id/follow`, `/teams/:id/follow`, `/grounds/:id/follow` | GET/POST/DELETE | `user_follows` | `user_follows` (ON CONFLICT DO NOTHING) | auth |
| `/me/following` | GET | `user_follows` joined with `players`/`teams`/`grounds` | — | auth |
| `/players` (search), `/:id/stats`, `/me/stats` | GET | `players`, `matches`, `innings`, `match_players`, `wickets` | — | public/auth |
| `/stats/leaderboards/:metric`, `/stats/records` | GET | aggregates over `innings`/`wickets`/`match_players`/`matches` | — | public |
| `/players/compare`, `/head-to-head`, `/:id/analytics` | GET | `innings`, `deliveries`, `wickets`, `match_players` | — | public |
| `/teams/compare`, `/:id/analytics` | GET | `tournament_teams`, `matches`, `innings` | — | public |
| `/matches/:id/analytics` | GET | `innings`, `deliveries`, `wickets` | — | public |

## Canteen

| API | Method | Reads | Writes | External |
|---|---|---|---|---|
| Menu item create/update (`imageFile`) | POST/PATCH | `menu_items` | `menu_items` | Cloudinary |
| Today's menu publish | POST | `menu_items` | `today_menu`, `today_menu_items` | — |
| Order placement | POST | `today_menu_items` | `orders`, `order_items` | — |
| Order status update | PATCH | `orders` | `orders.status` (+ `ground_notifications`) | — |

## Payments — `NOT IMPLEMENTED`

Confirmed by an explicit code comment in `server/src/domain/umpireCommerce/paymentStatus.js`: *"No payment gateway exists anywhere in this codebase (confirmed by audit)... FAILED is reachable only as a manual Ground Owner override."*

- No Stripe/Razorpay/PayU/Paytm SDK, no webhook route/handler anywhere in `server/src`.
- `umpire_earnings.status` is a manual enum (`PENDING/APPROVED/PAID/FAILED/CANCELLED`) set only by a Ground Owner via `PATCH .../payment-status` — not tied to any real transaction.
- `ground_bookings.amount` exists as a column but there is no charge/checkout step anywhere in the booking flow.
- Canteen `orders`/`order_items` imply cash/manual settlement — no gateway integration.
