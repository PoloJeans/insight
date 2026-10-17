import { pool } from '../db';
import { coords, handle, HttpError, json } from '../http';

const DEFAULT_RADIUS_M = 5_000;
const MAX_RADIUS_M = 25_000;

export const handler = handle(async (event) => {
  const q = event.queryStringParameters ?? {};
  const { lat, lng } = coords(Number(q.lat), Number(q.lng));
  const radius = q.radius === undefined ? DEFAULT_RADIUS_M : Number(q.radius);
  if (!(radius > 0 && radius <= MAX_RADIUS_M)) throw new HttpError(400, `radius must be 1-${MAX_RADIUS_M}`);

  const { rows } = await pool.query(
    `SELECT i.id, i.type, i.title, i.description, i.status, i.created_at,
            ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng,
            ST_Distance(i.location, p.pt) AS distance_m,
            COUNT(*) FILTER (WHERE v.still_there) AS confirms,
            COUNT(*) FILTER (WHERE NOT v.still_there) AS denies
     FROM incidents i
     CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography AS pt) p
     LEFT JOIN votes v ON v.incident_id = i.id
     WHERE i.status = 'active' AND ST_DWithin(i.location, p.pt, $3)
     GROUP BY i.id, p.pt
     ORDER BY distance_m
     LIMIT 200`,
    [lat, lng, radius],
  );
  return json(200, { incidents: rows });
});
