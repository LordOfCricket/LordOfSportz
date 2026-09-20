-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "advertisements" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150),
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" SERIAL NOT NULL,
    "source_type" VARCHAR(10) NOT NULL,
    "source_id" VARCHAR(30) NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "model" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_mongo_id" TEXT,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "image_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloudinary_public_id" TEXT,
    "ground_id" INTEGER NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canteens" (
    "id" SERIAL NOT NULL,
    "ground_id" INTEGER NOT NULL,
    "public_canteen_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL DEFAULT 'Main Canteen',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canteens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commentary_entries" (
    "id" BIGSERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "innings_id" INTEGER NOT NULL,
    "entry_key" VARCHAR(80) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "source_delivery_id" BIGINT,
    "source_event_id" BIGINT,
    "over_number" SMALLINT,
    "ball_in_over" SMALLINT,
    "ball_label" VARCHAR(10),
    "text" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "score_runs" INTEGER,
    "score_wickets" SMALLINT,
    "innings_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commentary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" BIGSERIAL NOT NULL,
    "innings_id" INTEGER NOT NULL,
    "log_sequence" INTEGER NOT NULL,
    "recorded_by_user_id" INTEGER,
    "client_action_id" UUID,
    "is_dead_ball" BOOLEAN NOT NULL DEFAULT false,
    "bat_runs" SMALLINT NOT NULL DEFAULT 0,
    "illegal_type" VARCHAR(10),
    "illegal_runs" SMALLINT,
    "extra_type" VARCHAR(10),
    "extra_runs" SMALLINT,
    "swap_striker_non_striker" BOOLEAN NOT NULL DEFAULT false,
    "bowler_match_player_id" INTEGER NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "over_number" SMALLINT,
    "ball_in_over" SMALLINT,
    "striker_match_player_id" INTEGER,
    "non_striker_match_player_id" INTEGER,
    "is_legal_delivery" BOOLEAN,
    "is_free_hit" BOOLEAN,
    "total_runs" SMALLINT,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_images" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "category" VARCHAR(20) NOT NULL DEFAULT 'ground',
    "image_url" TEXT NOT NULL,
    "cloudinary_public_id" TEXT NOT NULL,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_format" VARCHAR(10),
    "image_bytes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_mongo_id" TEXT,

    CONSTRAINT "gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_audit_log" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "actor_user_id" INTEGER,
    "previous_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ground_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_bookings" (
    "id" SERIAL NOT NULL,
    "public_booking_id" VARCHAR(20) NOT NULL,
    "booking_type" VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    "user_id" INTEGER,
    "customer_name" VARCHAR(150) NOT NULL,
    "contact_phone" VARCHAR(30),
    "contact_email" VARCHAR(150),
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    "purpose" VARCHAR(200),
    "expected_players" SMALLINT,
    "notes" VARCHAR(500),
    "client_action_id" UUID,
    "google_calendar_event_id" VARCHAR(200),
    "google_sync_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_by_staff_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),
    "block_type" VARCHAR(30),

    CONSTRAINT "ground_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" VARCHAR(500),
    "related_booking_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "related_match_id" INTEGER,

    CONSTRAINT "ground_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_photos" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150),
    "image_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloudinary_public_id" TEXT,
    "ground_id" INTEGER NOT NULL,

    CONSTRAINT "ground_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ground_users" (
    "id" SERIAL NOT NULL,
    "ground_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ground_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grounds" (
    "id" SERIAL NOT NULL,
    "public_ground_id" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "address_line" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(100) NOT NULL DEFAULT 'India',
    "postal_code" VARCHAR(20),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phone" VARCHAR(30),
    "email" VARCHAR(150),
    "website" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "grounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "innings" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "innings_number" SMALLINT NOT NULL,
    "batting_team_id" INTEGER NOT NULL,
    "bowling_team_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'not_started',
    "next_log_sequence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "wickets" SMALLINT NOT NULL DEFAULT 0,
    "legal_balls" INTEGER NOT NULL DEFAULT 0,
    "striker_match_player_id" INTEGER,
    "non_striker_match_player_id" INTEGER,
    "bowler_match_player_id" INTEGER,
    "is_free_hit_next" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "innings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_availability" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" BIGSERIAL NOT NULL,
    "innings_id" INTEGER NOT NULL,
    "delivery_id" BIGINT,
    "log_sequence" INTEGER NOT NULL,
    "client_action_id" UUID,
    "event_type" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_feedback" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "submitted_by" INTEGER NOT NULL,
    "ground_rating" SMALLINT,
    "ground_comment_liked" VARCHAR(500),
    "ground_comment_improve" VARCHAR(500),
    "app_rating" SMALLINT,
    "app_comment_liked" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app_comment_improve" VARCHAR(500),
    "app_feature_liked" VARCHAR(50),

    CONSTRAINT "match_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_feedback_umpire_ratings" (
    "id" SERIAL NOT NULL,
    "match_feedback_id" INTEGER NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment_liked" VARCHAR(500),
    "comment_improve" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_feedback_umpire_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_incidents" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "reported_by" INTEGER NOT NULL,
    "incident_type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_messages" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "sender_user_id" INTEGER NOT NULL,
    "sender_role" VARCHAR(20) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "is_playing_xi" BOOLEAN NOT NULL DEFAULT true,
    "is_captain" BOOLEAN NOT NULL DEFAULT false,
    "is_wicketkeeper" BOOLEAN NOT NULL DEFAULT false,
    "batting_order" SMALLINT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_umpire_slots" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "slot_number" SMALLINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "umpire_user_id" INTEGER,
    "assigned_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" VARCHAR(280),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMPTZ(6),
    "check_in_latitude" DECIMAL(9,6),
    "check_in_longitude" DECIMAL(9,6),
    "incentive_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "match_umpire_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "team_a_id" INTEGER NOT NULL,
    "team_b_id" INTEGER NOT NULL,
    "venue" VARCHAR(150),
    "match_date" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    "toss_winner_id" INTEGER,
    "result" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team_a_runs" INTEGER,
    "team_a_wickets" INTEGER,
    "team_a_overs" DECIMAL(4,1),
    "team_b_runs" INTEGER,
    "team_b_wickets" INTEGER,
    "team_b_overs" DECIMAL(4,1),
    "overs_per_innings" SMALLINT,
    "balls_per_over" SMALLINT NOT NULL DEFAULT 6,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "toss_decision" VARCHAR(4),
    "winner_team_id" INTEGER,
    "result_type" VARCHAR(10),
    "result_margin" INTEGER,
    "completed_at" TIMESTAMP(6),
    "finalized_at" TIMESTAMP(6),
    "ground_id" INTEGER,
    "required_umpires" SMALLINT NOT NULL DEFAULT 0,
    "umpire_fee_amount" DECIMAL(10,2),
    "umpire_fee_currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "umpire_fee_set_by" INTEGER,
    "umpire_fee_updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "price" DECIMAL(8,2) NOT NULL,
    "image_url" TEXT NOT NULL DEFAULT '',
    "cloudinary_public_id" TEXT NOT NULL DEFAULT '',
    "default_stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_mongo_id" TEXT,
    "canteen_id" INTEGER NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER,
    "raw_item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "unit_price" DECIMAL(8,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "public_order_id" VARCHAR(20) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL DEFAULT '',
    "seat_id" VARCHAR(50) NOT NULL DEFAULT 'unknown',
    "total" DECIMAL(10,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "has_active_order_flag" BOOLEAN,
    "ordered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_mongo_id" TEXT,
    "canteen_id" INTEGER NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "logo_url" TEXT NOT NULL,
    "website_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloudinary_public_id" TEXT,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(30),
    "batting_style" VARCHAR(30),
    "bowling_style" VARCHAR(30),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "public_player_id" VARCHAR(20),
    "jersey_number" SMALLINT,
    "photo_url" TEXT,
    "city" VARCHAR(100),
    "bio" VARCHAR(280),

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_corrections" (
    "id" SERIAL NOT NULL,
    "innings_id" INTEGER NOT NULL,
    "target_type" VARCHAR(10) NOT NULL,
    "target_id" BIGINT NOT NULL,
    "reason_code" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "before_data" JSONB NOT NULL,
    "after_data" JSONB NOT NULL,
    "source_version" INTEGER NOT NULL,
    "result_version" INTEGER NOT NULL,
    "corrected_by_user_id" INTEGER NOT NULL,
    "client_action_id" UUID,
    "undoes_correction_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(20) NOT NULL,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "short_name" VARCHAR(10) NOT NULL,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "today_menu" (
    "id" SERIAL NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_mongo_id" TEXT,
    "canteen_id" INTEGER NOT NULL,

    CONSTRAINT "today_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "today_menu_items" (
    "id" SERIAL NOT NULL,
    "today_menu_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "daily_price" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "today_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_fixtures" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "stage" VARCHAR(20) NOT NULL,
    "group_name" VARCHAR(1),
    "round" SMALLINT NOT NULL DEFAULT 1,
    "bracket_slot" SMALLINT,
    "fixture_number" SMALLINT NOT NULL,
    "team_a_id" INTEGER NOT NULL,
    "team_b_id" INTEGER NOT NULL,
    "match_id" INTEGER,
    "manual_result_winner_team_id" INTEGER,
    "manual_result_by" INTEGER,
    "manual_result_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_squad_players" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "tournament_team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_squad_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_teams" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "group_name" VARCHAR(1),
    "registered_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "public_tournament_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "format" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "overs_per_innings" SMALLINT NOT NULL,
    "balls_per_over" SMALLINT NOT NULL DEFAULT 6,
    "max_teams" SMALLINT NOT NULL,
    "max_squad_size" SMALLINT NOT NULL DEFAULT 15,
    "champion_team_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_assignment_events" (
    "id" SERIAL NOT NULL,
    "match_umpire_slot_id" INTEGER NOT NULL,
    "match_id" INTEGER NOT NULL,
    "umpire_user_id" INTEGER,
    "event_type" VARCHAR(24) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" INTEGER,

    CONSTRAINT "umpire_assignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_date_availability" (
    "id" SERIAL NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "specific_date" DATE NOT NULL,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "umpire_date_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_earnings" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "match_umpire_slot_id" INTEGER NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "umpire_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_match_checklist_items" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "item_key" VARCHAR(40) NOT NULL,
    "is_checked" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMPTZ(6),

    CONSTRAINT "umpire_match_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_profiles" (
    "user_id" INTEGER NOT NULL,
    "bio" VARCHAR(500),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "matches_officiated" INTEGER NOT NULL DEFAULT 0,
    "matches_cancelled" INTEGER NOT NULL DEFAULT 0,
    "matches_no_show" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "umpire_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "umpire_proposals" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "match_umpire_slot_id" INTEGER NOT NULL,
    "proposed_by" INTEGER NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "incentive_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "message" VARCHAR(280),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "umpire_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(6),
    "decided_by" INTEGER,

    CONSTRAINT "umpire_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umpire_weekly_availability" (
    "id" SERIAL NOT NULL,
    "umpire_user_id" INTEGER NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "umpire_weekly_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "player_type" VARCHAR(20),
    "staff_role_id" INTEGER,
    "staff_id" VARCHAR(50),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wagon_wheel_shots" (
    "id" SERIAL NOT NULL,
    "delivery_id" BIGINT NOT NULL,
    "normalized_x" DECIMAL(5,4) NOT NULL,
    "normalized_y" DECIMAL(5,4) NOT NULL,
    "angle_degrees" DECIMAL(6,2) NOT NULL,
    "region_id" VARCHAR(20) NOT NULL,
    "shot_type" VARCHAR(30),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wagon_wheel_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wickets" (
    "id" SERIAL NOT NULL,
    "delivery_id" BIGINT NOT NULL,
    "dismissal_type" VARCHAR(20) NOT NULL,
    "dismissed_match_player_id" INTEGER NOT NULL,
    "fielder_match_player_id" INTEGER,
    "secondary_fielder_match_player_id" INTEGER,
    "is_direct_hit" BOOLEAN,
    "runs_completed" SMALLINT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_insights_source_type_source_id_key" ON "ai_insights"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "idx_amenities_ground_id" ON "amenities"("ground_id");

-- CreateIndex
CREATE UNIQUE INDEX "canteens_public_canteen_id_key" ON "canteens"("public_canteen_id");

-- CreateIndex
CREATE INDEX "idx_canteens_ground_id" ON "canteens"("ground_id");

-- CreateIndex
CREATE INDEX "idx_commentary_entries_innings_seq" ON "commentary_entries"("innings_id", "sequence");

-- CreateIndex
CREATE INDEX "idx_commentary_entries_match" ON "commentary_entries"("match_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "commentary_entries_innings_id_entry_key_key" ON "commentary_entries"("innings_id", "entry_key");

-- CreateIndex
CREATE INDEX "idx_deliveries_bowler" ON "deliveries"("bowler_match_player_id");

-- CreateIndex
CREATE INDEX "idx_deliveries_striker" ON "deliveries"("striker_match_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_innings_id_log_sequence_key" ON "deliveries"("innings_id", "log_sequence");

-- CreateIndex
CREATE INDEX "idx_gallery_images_category_active_order" ON "gallery_images"("category", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "idx_ground_audit_log_entity" ON "ground_audit_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ground_bookings_public_booking_id_key" ON "ground_bookings"("public_booking_id");

-- CreateIndex
CREATE INDEX "idx_ground_bookings_start_time" ON "ground_bookings"("start_time");

-- CreateIndex
CREATE INDEX "idx_ground_bookings_user_id" ON "ground_bookings"("user_id");

-- CreateIndex
CREATE INDEX "idx_ground_notifications_user" ON "ground_notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_ground_photos_ground_id" ON "ground_photos"("ground_id");

-- CreateIndex
CREATE INDEX "idx_ground_users_ground_id" ON "ground_users"("ground_id");

-- CreateIndex
CREATE UNIQUE INDEX "ground_users_user_id_ground_id_role_key" ON "ground_users"("user_id", "ground_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "grounds_public_ground_id_key" ON "grounds"("public_ground_id");

-- CreateIndex
CREATE UNIQUE INDEX "grounds_slug_key" ON "grounds"("slug");

-- CreateIndex
CREATE INDEX "idx_grounds_status" ON "grounds"("status");

-- CreateIndex
CREATE INDEX "idx_innings_match_id" ON "innings"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "innings_match_id_innings_number_key" ON "innings"("match_id", "innings_number");

-- CreateIndex
CREATE INDEX "idx_match_availability_match_id" ON "match_availability"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_availability_match_id_player_id_key" ON "match_availability"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "idx_match_events_delivery_id" ON "match_events"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_innings_id_log_sequence_key" ON "match_events"("innings_id", "log_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "match_feedback_match_id_submitted_by_key" ON "match_feedback"("match_id", "submitted_by");

-- CreateIndex
CREATE INDEX "idx_match_feedback_umpire_ratings_umpire" ON "match_feedback_umpire_ratings"("umpire_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_feedback_umpire_ratings_match_feedback_id_umpire_user_key" ON "match_feedback_umpire_ratings"("match_feedback_id", "umpire_user_id");

-- CreateIndex
CREATE INDEX "idx_match_incidents_match" ON "match_incidents"("match_id");

-- CreateIndex
CREATE INDEX "idx_match_messages_match" ON "match_messages"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_match_players_match_id" ON "match_players"("match_id");

-- CreateIndex
CREATE INDEX "idx_match_players_player_id" ON "match_players"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_match_id_player_id_key" ON "match_players"("match_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_umpire_slots_match_id_slot_number_key" ON "match_umpire_slots"("match_id", "slot_number");

-- CreateIndex
CREATE INDEX "idx_menu_items_canteen_id" ON "menu_items"("canteen_id");

-- CreateIndex
CREATE INDEX "idx_order_items_order_id" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_public_order_id_key" ON "orders"("public_order_id");

-- CreateIndex
CREATE INDEX "idx_orders_canteen_user" ON "orders"("canteen_id", "user_id", "ordered_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "players_public_player_id_key" ON "players"("public_player_id");

-- CreateIndex
CREATE INDEX "idx_players_team_id" ON "players"("team_id");

-- CreateIndex
CREATE INDEX "idx_score_corrections_innings" ON "score_corrections"("innings_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "idx_today_menu_canteen_id" ON "today_menu"("canteen_id");

-- CreateIndex
CREATE INDEX "idx_today_menu_items_menu_item_id" ON "today_menu_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "idx_today_menu_items_today_menu_id" ON "today_menu_items"("today_menu_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "today_menu_items_today_menu_id_menu_item_id_key" ON "today_menu_items"("today_menu_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_fixtures_match_id_key" ON "tournament_fixtures"("match_id");

-- CreateIndex
CREATE INDEX "idx_tournament_fixtures_match" ON "tournament_fixtures"("match_id");

-- CreateIndex
CREATE INDEX "idx_tournament_fixtures_tournament" ON "tournament_fixtures"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_fixtures_tournament_id_fixture_number_key" ON "tournament_fixtures"("tournament_id", "fixture_number");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_fixtures_tournament_id_stage_bracket_slot_key" ON "tournament_fixtures"("tournament_id", "stage", "bracket_slot");

-- CreateIndex
CREATE INDEX "idx_tournament_squad_players_team" ON "tournament_squad_players"("tournament_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_squad_players_tournament_id_player_id_key" ON "tournament_squad_players"("tournament_id", "player_id");

-- CreateIndex
CREATE INDEX "idx_tournament_teams_tournament" ON "tournament_teams"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_teams_tournament_id_team_id_key" ON "tournament_teams"("tournament_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_public_tournament_id_key" ON "tournaments"("public_tournament_id");

-- CreateIndex
CREATE INDEX "idx_umpire_assignment_events_match" ON "umpire_assignment_events"("match_id");

-- CreateIndex
CREATE INDEX "idx_umpire_assignment_events_umpire" ON "umpire_assignment_events"("umpire_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "umpire_date_availability_umpire_user_id_specific_date_key" ON "umpire_date_availability"("umpire_user_id", "specific_date");

-- CreateIndex
CREATE UNIQUE INDEX "umpire_earnings_match_umpire_slot_id_key" ON "umpire_earnings"("match_umpire_slot_id");

-- CreateIndex
CREATE INDEX "idx_umpire_earnings_match" ON "umpire_earnings"("match_id");

-- CreateIndex
CREATE INDEX "idx_umpire_earnings_umpire" ON "umpire_earnings"("umpire_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "umpire_match_checklist_items_match_id_umpire_user_id_item_k_key" ON "umpire_match_checklist_items"("match_id", "umpire_user_id", "item_key");

-- CreateIndex
CREATE INDEX "idx_umpire_proposals_slot" ON "umpire_proposals"("match_umpire_slot_id", "status");

-- CreateIndex
CREATE INDEX "idx_umpire_proposals_umpire" ON "umpire_proposals"("umpire_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "umpire_weekly_availability_umpire_user_id_day_of_week_key" ON "umpire_weekly_availability"("umpire_user_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_staff_id_key" ON "users"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "wagon_wheel_shots_delivery_id_key" ON "wagon_wheel_shots"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "wickets_delivery_id_key" ON "wickets"("delivery_id");

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "grounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "canteens" ADD CONSTRAINT "canteens_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "grounds"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commentary_entries" ADD CONSTRAINT "commentary_entries_innings_id_fkey" FOREIGN KEY ("innings_id") REFERENCES "innings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commentary_entries" ADD CONSTRAINT "commentary_entries_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commentary_entries" ADD CONSTRAINT "commentary_entries_source_delivery_id_fkey" FOREIGN KEY ("source_delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "commentary_entries" ADD CONSTRAINT "commentary_entries_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "match_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_bowler_match_player_id_fkey" FOREIGN KEY ("bowler_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_innings_id_fkey" FOREIGN KEY ("innings_id") REFERENCES "innings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_non_striker_match_player_id_fkey" FOREIGN KEY ("non_striker_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_striker_match_player_id_fkey" FOREIGN KEY ("striker_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_audit_log" ADD CONSTRAINT "ground_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_bookings" ADD CONSTRAINT "ground_bookings_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_bookings" ADD CONSTRAINT "ground_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_notifications" ADD CONSTRAINT "ground_notifications_related_booking_id_fkey" FOREIGN KEY ("related_booking_id") REFERENCES "ground_bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_notifications" ADD CONSTRAINT "ground_notifications_related_match_id_fkey" FOREIGN KEY ("related_match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_notifications" ADD CONSTRAINT "ground_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_photos" ADD CONSTRAINT "ground_photos_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "grounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_users" ADD CONSTRAINT "ground_users_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "grounds"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ground_users" ADD CONSTRAINT "ground_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_batting_team_id_fkey" FOREIGN KEY ("batting_team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_bowler_match_player_id_fkey" FOREIGN KEY ("bowler_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_bowling_team_id_fkey" FOREIGN KEY ("bowling_team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_non_striker_match_player_id_fkey" FOREIGN KEY ("non_striker_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "innings" ADD CONSTRAINT "innings_striker_match_player_id_fkey" FOREIGN KEY ("striker_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_availability" ADD CONSTRAINT "match_availability_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_availability" ADD CONSTRAINT "match_availability_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_innings_id_fkey" FOREIGN KEY ("innings_id") REFERENCES "innings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_feedback_umpire_ratings" ADD CONSTRAINT "match_feedback_umpire_ratings_match_feedback_id_fkey" FOREIGN KEY ("match_feedback_id") REFERENCES "match_feedback"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_feedback_umpire_ratings" ADD CONSTRAINT "match_feedback_umpire_ratings_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_incidents" ADD CONSTRAINT "match_incidents_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_incidents" ADD CONSTRAINT "match_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_umpire_slots" ADD CONSTRAINT "match_umpire_slots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_umpire_slots" ADD CONSTRAINT "match_umpire_slots_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_ground_id_fkey" FOREIGN KEY ("ground_id") REFERENCES "grounds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_a_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_b_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_toss_winner_id_fkey" FOREIGN KEY ("toss_winner_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_umpire_fee_set_by_fkey" FOREIGN KEY ("umpire_fee_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_canteen_id_fkey" FOREIGN KEY ("canteen_id") REFERENCES "canteens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_canteen_id_fkey" FOREIGN KEY ("canteen_id") REFERENCES "canteens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_corrected_by_user_id_fkey" FOREIGN KEY ("corrected_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_innings_id_fkey" FOREIGN KEY ("innings_id") REFERENCES "innings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "score_corrections" ADD CONSTRAINT "score_corrections_undoes_correction_id_fkey" FOREIGN KEY ("undoes_correction_id") REFERENCES "score_corrections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "today_menu" ADD CONSTRAINT "today_menu_canteen_id_fkey" FOREIGN KEY ("canteen_id") REFERENCES "canteens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "today_menu_items" ADD CONSTRAINT "today_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "today_menu_items" ADD CONSTRAINT "today_menu_items_today_menu_id_fkey" FOREIGN KEY ("today_menu_id") REFERENCES "today_menu"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_manual_result_by_fkey" FOREIGN KEY ("manual_result_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_manual_result_winner_team_id_fkey" FOREIGN KEY ("manual_result_winner_team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_team_a_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_team_b_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_fixtures" ADD CONSTRAINT "tournament_fixtures_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_squad_players" ADD CONSTRAINT "tournament_squad_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_squad_players" ADD CONSTRAINT "tournament_squad_players_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_squad_players" ADD CONSTRAINT "tournament_squad_players_tournament_team_id_fkey" FOREIGN KEY ("tournament_team_id") REFERENCES "tournament_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_champion_team_id_fkey" FOREIGN KEY ("champion_team_id") REFERENCES "teams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_assignment_events" ADD CONSTRAINT "umpire_assignment_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_assignment_events" ADD CONSTRAINT "umpire_assignment_events_match_umpire_slot_id_fkey" FOREIGN KEY ("match_umpire_slot_id") REFERENCES "match_umpire_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_assignment_events" ADD CONSTRAINT "umpire_assignment_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_assignment_events" ADD CONSTRAINT "umpire_assignment_events_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_date_availability" ADD CONSTRAINT "umpire_date_availability_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_earnings" ADD CONSTRAINT "umpire_earnings_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_earnings" ADD CONSTRAINT "umpire_earnings_match_umpire_slot_id_fkey" FOREIGN KEY ("match_umpire_slot_id") REFERENCES "match_umpire_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_earnings" ADD CONSTRAINT "umpire_earnings_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_match_checklist_items" ADD CONSTRAINT "umpire_match_checklist_items_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_match_checklist_items" ADD CONSTRAINT "umpire_match_checklist_items_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_profiles" ADD CONSTRAINT "umpire_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_proposals" ADD CONSTRAINT "umpire_proposals_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_proposals" ADD CONSTRAINT "umpire_proposals_match_umpire_slot_id_fkey" FOREIGN KEY ("match_umpire_slot_id") REFERENCES "match_umpire_slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_proposals" ADD CONSTRAINT "umpire_proposals_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_proposals" ADD CONSTRAINT "umpire_proposals_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_requests" ADD CONSTRAINT "umpire_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_requests" ADD CONSTRAINT "umpire_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "umpire_weekly_availability" ADD CONSTRAINT "umpire_weekly_availability_umpire_user_id_fkey" FOREIGN KEY ("umpire_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wagon_wheel_shots" ADD CONSTRAINT "wagon_wheel_shots_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wickets" ADD CONSTRAINT "wickets_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wickets" ADD CONSTRAINT "wickets_dismissed_match_player_id_fkey" FOREIGN KEY ("dismissed_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wickets" ADD CONSTRAINT "wickets_fielder_match_player_id_fkey" FOREIGN KEY ("fielder_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wickets" ADD CONSTRAINT "wickets_secondary_fielder_match_player_id_fkey" FOREIGN KEY ("secondary_fielder_match_player_id") REFERENCES "match_players"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

