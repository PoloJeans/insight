import { pool } from '../db';
import { handle, HttpError, isUuid, json, userId } from '../http';

// DELETE /incidents/{id}: the reporter removes their own incident. A soft delete: the row
// stays in the database, set inactive and stamped with removed_at so lists skip it.
export const handler = handle(async (event) => {
  const user = userId(event);
  const id = event.pathParameters?.id;
  if (!isUuid(id)) throw new HttpError(400, 'invalid incident id');

  const { rows } = await pool.query(
    `UPDATE incidents SET status = 'inactive', removed_at = now()
     WHERE id = $1 AND created_by = $2 AND source = 'user' AND removed_at IS NULL
     RETURNING id, status, removed_at`,
    [id, user],
  );
  // Same 404 for "doesn't exist" and "not yours", so ids can't be probed for ownership.
  if (rows.length === 0) throw new HttpError(404, 'incident not found');
  return json(200, rows[0]);
});
