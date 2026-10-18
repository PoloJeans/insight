-- Incidents imported from official feeds (Toronto Police, later Toronto Fire) alongside user reports.
-- Imported rows have no creating user, keep the feed's own location text, and record how
-- precise their point is so the app can say "near X & Y" instead of implying an exact address.
ALTER TABLE incidents ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE incidents ADD COLUMN source text NOT NULL DEFAULT 'user'
  CONSTRAINT incidents_source_check CHECK (source IN ('user', 'tps', 'tfs'));
ALTER TABLE incidents ADD CONSTRAINT incidents_user_creator_check
  CHECK (source <> 'user' OR created_by IS NOT NULL);

-- The feed's identifier, so re-importing the same call is a no-op. NULL for user reports.
ALTER TABLE incidents ADD COLUMN external_id text;
ALTER TABLE incidents ADD CONSTRAINT incidents_source_external_id_key UNIQUE (source, external_id);

ALTER TABLE incidents ADD COLUMN location_text text;
ALTER TABLE incidents ADD COLUMN location_precision text NOT NULL DEFAULT 'exact'
  CONSTRAINT incidents_location_precision_check
  CHECK (location_precision IN ('exact', 'intersection', 'area'));
