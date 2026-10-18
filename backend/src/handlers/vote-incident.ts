import { pool } from '../db';
import { body, handle, HttpError, isUuid, json, userId } from '../http';

export const handler = handle(async (event) => {
  const user = userId(event);
  const id = event.pathParameters?.id;
  if (!isUuid(id)) throw new HttpError(400, 'invalid incident id');
  const { stillThere } = body(event);
  if (typeof stillThere !== 'boolean') throw new HttpError(400, 'stillThere must be boolean');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query("SELECT 1 FROM incidents WHERE id = $1 AND status = 'active' FOR UPDATE", [id]);
    if (exists.rowCount === 0) throw new HttpError(404, 'incident not found or no longer active');

    await client.query(
      `INSERT INTO votes (incident_id, user_id, still_there) VALUES ($1, $2, $3)
       ON CONFLICT (incident_id, user_id) DO UPDATE SET still_there = $3, created_at = now()`,
      [id, user, stillThere],
    );

    // A single "not there" vote resolves the incident; "still there" leaves it as is.
    const { rows } = await client.query(
      `UPDATE incidents SET status = CASE WHEN $2::boolean THEN status ELSE 'inactive' END
       WHERE id = $1
       RETURNING id, status`,
      [id, stillThere],
    );
    await client.query('COMMIT');
    return json(200, rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
