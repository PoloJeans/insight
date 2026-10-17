import { pool } from '../db';
import { body, coords, handle, HttpError, json, userId } from '../http';

export const handler = handle(async (event) => {
  const user = userId(event);
  const b = body(event);
  const { lat, lng } = coords(b.lat, b.lng);
  if (typeof b.pushToken !== 'string' || b.pushToken.length === 0 || b.pushToken.length > 200) {
    throw new HttpError(400, 'pushToken required');
  }

  await pool.query(
    `INSERT INTO devices (user_id, push_token, location)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography)
     ON CONFLICT (user_id) DO UPDATE
       SET push_token = $2, location = EXCLUDED.location, updated_at = now()`,
    [user, b.pushToken, lat, lng],
  );
  return json(200, { ok: true });
});
