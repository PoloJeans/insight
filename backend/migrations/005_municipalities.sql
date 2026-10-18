-- Toronto's six former municipalities, used to tag and filter incidents by area.
-- Rows are loaded from the City of Toronto open data by scripts/load-municipalities.ts.
CREATE TABLE municipalities (
  slug     text PRIMARY KEY,
  name     text NOT NULL,
  boundary geography(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX municipalities_boundary_idx ON municipalities USING GIST (boundary);

-- The Incidents tab filters and sorts by date.
CREATE INDEX incidents_created_at_idx ON incidents (created_at);
