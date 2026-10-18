// Shared SELECT for the list views: incidents with their municipality, vote counts and
// the caller's own vote. Handlers add WHERE clauses that may use the aliases
// i (incidents), m (municipality) and mv (caller's vote).

export const MUNICIPALITIES = [
  'east-york',
  'etobicoke',
  'north-york',
  'old-toronto',
  'scarborough',
  'york',
] as const;

export type Municipality = (typeof MUNICIPALITIES)[number];

export const isMunicipality = (v: unknown): v is Municipality =>
  MUNICIPALITIES.includes(v as Municipality);

/** Collects query parameters and hands back their $n placeholders. */
export class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export function selectIncidents(
  sql: SqlParams,
  user: string,
  point?: { lat: number; lng: number },
): { select: string; userSql: string; pointSql: string | null } {
  const userSql = sql.add(user);
  // PostGIS takes longitude first.
  const pointSql = point
    ? `ST_SetSRID(ST_MakePoint(${sql.add(point.lng)}, ${sql.add(point.lat)}), 4326)::geography`
    : null;

  const select = `
    SELECT i.id, i.type, i.title, i.description, i.status, i.created_at,
           i.source, i.location_text, i.location_precision,
           ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng,
           ${pointSql ? `ST_Distance(i.location, ${pointSql})` : 'NULL::float8'} AS distance_m,
           m.slug AS municipality,
           COUNT(v.user_id) FILTER (WHERE v.still_there) AS confirms,
           COUNT(v.user_id) FILTER (WHERE NOT v.still_there) AS denies,
           mv.still_there AS my_vote,
           mv.created_at AS my_vote_at,
           -- Imported police/fire calls have no created_by.
           COALESCE(i.created_by = ${userSql}, false) AS mine
    FROM incidents i
    LEFT JOIN LATERAL (
      SELECT slug FROM municipalities WHERE ST_Covers(boundary, i.location) LIMIT 1
    ) m ON true
    LEFT JOIN votes v ON v.incident_id = i.id
    LEFT JOIN votes mv ON mv.incident_id = i.id AND mv.user_id = ${userSql}`;

  return { select, userSql, pointSql };
}

export const GROUP_BY_INCIDENT = 'GROUP BY i.id, m.slug, mv.still_there, mv.created_at';
