import { pool } from '../db';
import { coords, handle, json, userId } from '../http';
import { GROUP_BY_INCIDENT, selectIncidents, SqlParams } from '../incident-query';

const LIMIT = 100;

// GET /me/incidents: the Profile tab. Incidents the caller reported and incidents they
// voted on, active or resolved (but not deleted), newest first. Optional lat/lng adds distances.
export const handler = handle(async (event) => {
  const user = userId(event);
  const q = event.queryStringParameters ?? {};
  const point = q.lat !== undefined || q.lng !== undefined ? coords(Number(q.lat), Number(q.lng)) : undefined;

  const created = new SqlParams();
  const createdQuery = selectIncidents(created, user, point);
  const voted = new SqlParams();
  const votedQuery = selectIncidents(voted, user, point);

  // Sequential: the pool holds a single connection.
  const createdRows = await pool.query(
    `${createdQuery.select}
     WHERE i.created_by = ${createdQuery.userSql} AND i.removed_at IS NULL
     ${GROUP_BY_INCIDENT}
     ORDER BY i.created_at DESC
     LIMIT ${LIMIT}`,
    created.values,
  );
  const votedRows = await pool.query(
    `${votedQuery.select}
     WHERE mv.user_id IS NOT NULL AND i.removed_at IS NULL
     ${GROUP_BY_INCIDENT}
     ORDER BY mv.created_at DESC
     LIMIT ${LIMIT}`,
    voted.values,
  );

  return json(200, { created: createdRows.rows, voted: votedRows.rows });
});
