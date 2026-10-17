import { pool } from '../db';
import { body, coords, handle, HttpError, json, userId } from '../http';

export const handler = handle(async (event) => {
  const user = userId(event);
  const b = body(event);
  const { lat, lng } = coords(b.lat, b.lng);
  if (b.type !== 'fire' && b.type !== 'crime') throw new HttpError(400, 'type must be fire or crime');
  const description = typeof b.description === 'string' ? b.description.slice(0, 500) : null;

  const { rows } = await pool.query(
    `INSERT INTO incidents (type, description, location, created_by)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5)
     RETURNING id, type, description, created_at, expires_at`,
    [b.type, description, lat, lng, user],
  );
  return json(201, { ...rows[0], lat, lng });
});
