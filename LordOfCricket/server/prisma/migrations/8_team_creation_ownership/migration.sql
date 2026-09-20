-- PHASE 5D.4 — Team Creation & Ownership
-- Add owner_id to teams table to track team creator/owner for authorization.
-- Allows players to create teams and become the owner.

ALTER TABLE teams ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Existing teams have no assigned owner (backfill NULL).
-- Future teams created via POST /teams will have owner_id set to authenticated player's user_id.

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
