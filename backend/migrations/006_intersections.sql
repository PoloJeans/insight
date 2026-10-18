-- The City of Toronto's named intersections, used to place Toronto Fire calls (which have
-- street names but no coordinates). Filled by scripts/load-intersections.ts.
CREATE TABLE intersections (
  id          bigint PRIMARY KEY,           -- the city's INTERSECTION_ID
  description text NOT NULL,                -- e.g. 'Mill Rd / Markland Dr'
  streets     text[] NOT NULL,              -- normalized names, e.g. {MILL RD, MARKLAND DR}
  location    geography(Point, 4326) NOT NULL
);
-- "Which intersections include street X and street Y" (the && overlap operator).
CREATE INDEX intersections_streets_idx ON intersections USING GIN (streets);
