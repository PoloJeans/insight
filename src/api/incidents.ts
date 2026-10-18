import { request } from '@/api/client';
import type { MunicipalitySlug } from '@/constants/municipalities';

export type IncidentType = 'fire' | 'crime';

export type IncidentStatus = 'active' | 'inactive';

/** Who reported it: a user, or an imported Toronto Police / Toronto Fire call. */
export type IncidentSource = 'user' | 'tps' | 'tfs';

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  description: string | null;
  status: IncidentStatus;
  lat: number;
  lng: number;
  createdAt: string;
  /** Meters from the queried point, when one was sent. */
  distanceM?: number;
  confirms?: number;
  denies?: number;
  /** Set by searchIncidents and getMyIncidents. null = outside Toronto's former municipalities. */
  municipality?: MunicipalitySlug | null;
  /** The signed-in user's vote: true = still there, false = not there, null = hasn't voted. */
  myVote?: boolean | null;
  myVoteAt?: string | null;
  /** Reported by the signed-in user. */
  mine?: boolean;
  source?: IncidentSource;
  /** Street description for imported calls, e.g. "Bloor St W & Dufferin St". */
  locationText?: string | null;
}

interface IncidentRow {
  id: string;
  type: IncidentType;
  title: string;
  description: string | null;
  status: IncidentStatus;
  lat: number;
  lng: number;
  created_at: string;
  distance_m?: number | null;
  // Postgres COUNT() comes back as a string.
  confirms?: string | number;
  denies?: string | number;
  municipality?: MunicipalitySlug | null;
  my_vote?: boolean | null;
  my_vote_at?: string | null;
  mine?: boolean;
  source?: IncidentSource;
  location_text?: string | null;
}

const toIncident = (row: IncidentRow): Incident => ({
  id: row.id,
  type: row.type,
  title: row.title,
  description: row.description,
  status: row.status,
  lat: row.lat,
  lng: row.lng,
  createdAt: row.created_at,
  distanceM: row.distance_m ?? undefined,
  confirms: row.confirms === undefined ? undefined : Number(row.confirms),
  denies: row.denies === undefined ? undefined : Number(row.denies),
  municipality: row.municipality,
  myVote: row.my_vote,
  myVoteAt: row.my_vote_at,
  mine: row.mine,
  source: row.source,
  locationText: row.location_text,
});

/** Active incidents within `radiusM` meters (default 5 km, max 25 km), nearest first. */
export async function listIncidents(params: {
  lat: number;
  lng: number;
  radiusM?: number;
}): Promise<Incident[]> {
  const { incidents } = await request<{ incidents: IncidentRow[] }>('GET', '/incidents', {
    query: { lat: params.lat, lng: params.lng, ...(params.radiusM && { radius: params.radiusM }) },
  });
  return incidents.map(toIncident);
}

export async function createIncident(input: {
  type: IncidentType;
  lat: number;
  lng: number;
  title?: string;
  description?: string;
}): Promise<Incident> {
  return toIncident(await request<IncidentRow>('POST', '/incidents', { body: input }));
}

/** `stillThere: true` confirms the incident; `false` reports it gone, which deactivates it. */
export async function voteIncident(
  id: string,
  stillThere: boolean,
): Promise<{ id: string; status: IncidentStatus }> {
  return request('POST', `/incidents/${id}/votes`, { body: { stillThere } });
}

export interface IncidentSearch {
  /** Where distances (and `radiusM`) are measured from. */
  lat?: number;
  lng?: number;
  /** Omit for the whole database. Needs lat/lng. */
  radiusM?: number;
  type?: IncidentType;
  municipality?: MunicipalitySlug;
  /** Only incidents reported at or after this time. */
  since?: Date;
  includeResolved?: boolean;
}

/** Incidents matching every given filter, newest first (at most 200). */
export async function searchIncidents(params: IncidentSearch): Promise<Incident[]> {
  const query: Record<string, string | number> = {};
  if (params.lat !== undefined && params.lng !== undefined) {
    query.lat = params.lat;
    query.lng = params.lng;
  }
  if (params.radiusM !== undefined) query.radius = params.radiusM;
  if (params.type) query.type = params.type;
  if (params.municipality) query.municipality = params.municipality;
  if (params.since) query.since = params.since.toISOString();
  if (params.includeResolved) query.includeResolved = 'true';

  const { incidents } = await request<{ incidents: IncidentRow[] }>('GET', '/incidents/search', {
    query,
  });
  return incidents.map(toIncident);
}

/** Incidents the signed-in user reported, and ones they voted on (newest vote first). */
export async function getMyIncidents(
  point?: { lat: number; lng: number },
): Promise<{ created: Incident[]; voted: Incident[] }> {
  const { created, voted } = await request<{ created: IncidentRow[]; voted: IncidentRow[] }>(
    'GET',
    '/me/incidents',
    { query: point ? { lat: point.lat, lng: point.lng } : {} },
  );
  return { created: created.map(toIncident), voted: voted.map(toIncident) };
}
