CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('fire', 'crime')),
  description text,
  location    geography(Point, 4326) NOT NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX incidents_location_idx ON incidents USING GIST (location);
CREATE INDEX incidents_expires_at_idx ON incidents (expires_at);

CREATE TABLE votes (
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  still_there boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, user_id)
);

CREATE TABLE devices (
  user_id    uuid PRIMARY KEY,
  push_token text NOT NULL,
  location   geography(Point, 4326),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_location_idx ON devices USING GIST (location);
