-- Already applied by hand to the live database; recorded here so a fresh database matches it.
-- Replaces time-based expiry with an explicit status, and adds a title.
ALTER TABLE incidents DROP COLUMN expires_at;
ALTER TABLE incidents ADD COLUMN status text NOT NULL DEFAULT 'active'
  CONSTRAINT incidents_status_check CHECK (status IN ('active', 'inactive'));
ALTER TABLE incidents ADD COLUMN title text NOT NULL DEFAULT '';
CREATE INDEX incidents_active_location_idx ON incidents USING GIST (location) WHERE status = 'active';
