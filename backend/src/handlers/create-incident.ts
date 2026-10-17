import { pool } from '../db';
import { body, coords, handle, HttpError, json, userId } from '../http';

export const handler = handle(async (event) => {
  const user = userId(event);
  const b = body(event);
  const { lat, lng } = coords(b.lat, b.lng);
  if (b.type !== 'fire' && b.type !== 'crime') throw new HttpError(400, 'type must be fire or crime');
  const title = typeof b.title === 'string' ? b.title.slice(0, 100) : '';
  const description = typeof b.description === 'string' ? b.description.slice(0, 500) : null;

  const { rows } = await pool.query(
    `INSERT INTO incidents (type, title, description, location, created_by)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6)
     RETURNING id, type, title, description, status, created_at`,
    [b.type, title, description, lat, lng, user],
  );
  return json(201, { ...rows[0], lat, lng });
});
