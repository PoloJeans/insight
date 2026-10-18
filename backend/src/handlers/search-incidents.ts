import { pool } from '../db';
import { coords, handle, HttpError, json, userId } from '../http';
import { GROUP_BY_INCIDENT, isMunicipality, selectIncidents, SqlParams } from '../incident-query';

const MAX_RADIUS_M = 100_000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// GET /incidents/search: the Incidents tab. Every filter is optional; with no radius it
// covers the whole database. lat/lng (if given) set where distance is measured from.
//   ?lat&lng&radius&type=fire|crime&municipality=<slug>&since=<ISO date>&includeResolved=true&limit
export const handler = handle(async (event) => {
  const user = userId(event);
  const q = event.queryStringParameters ?? {};

  const point = q.lat !== undefined || q.lng !== undefined ? coords(Number(q.lat), Number(q.lng)) : undefined;
  const sql = new SqlParams();
  const { select, pointSql } = selectIncidents(sql, user, point);
  const where: string[] = [];

  if (q.includeResolved !== 'true') where.push(`i.status = 'active'`);

  if (q.type !== undefined) {
    if (q.type !== 'fire' && q.type !== 'crime') throw new HttpError(400, 'type must be fire or crime');
    where.push(`i.type = ${sql.add(q.type)}`);
  }

  if (q.municipality !== undefined) {
    if (!isMunicipality(q.municipality)) throw new HttpError(400, 'unknown municipality');
    where.push(`m.slug = ${sql.add(q.municipality)}`);
  }

  if (q.since !== undefined) {
    const since = new Date(q.since);
    if (Number.isNaN(since.getTime())) throw new HttpError(400, 'since must be an ISO date');
    where.push(`i.created_at >= ${sql.add(since.toISOString())}`);
  }

  if (q.radius !== undefined) {
    if (!pointSql) throw new HttpError(400, 'radius requires lat and lng');
    const radius = Number(q.radius);
    if (!(radius > 0 && radius <= MAX_RADIUS_M)) throw new HttpError(400, `radius must be 1-${MAX_RADIUS_M}`);
    where.push(`ST_DWithin(i.location, ${pointSql}, ${sql.add(radius)})`);
  }

  const limit = q.limit === undefined ? DEFAULT_LIMIT : Number(q.limit);
  if (!(Number.isInteger(limit) && limit > 0 && limit <= MAX_LIMIT)) {
    throw new HttpError(400, `limit must be 1-${MAX_LIMIT}`);
  }

  const { rows } = await pool.query(
    `${select}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ${GROUP_BY_INCIDENT}
     ORDER BY i.created_at DESC
     LIMIT ${sql.add(limit)}`,
    sql.values,
  );
  return json(200, { incidents: rows });
});
