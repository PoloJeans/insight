import { request } from '@/api/client';

export type IncidentType = 'fire' | 'crime';

export type IncidentStatus = 'active' | 'inactive';

/** Who reported it: an app user, Toronto Police (tps) or Toronto Fire (tfs). */
export type IncidentSource = 'user' | 'tps' | 'tfs';

/** 'intersection': the point is the nearest intersection, not the exact spot. */
export type LocationPrecision = 'exact' | 'intersection' | 'area';

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  description: string | null;
  status: IncidentStatus;
  source: IncidentSource;
  /** The feed's own description of the place, e.g. "Keele St & Freeman Rd". Null for user reports. */
  locationText: string | null;
  locationPrecision: LocationPrecision;
  lat: number;
  lng: number;
  createdAt: string;
  /** Meters from the queried point. Only set by listIncidents. */
  distanceM?: number;
  confirms?: number;
  denies?: number;
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
  // Only returned by the list endpoint.
  source?: IncidentSource;
  location_text?: string | null;
  location_precision?: LocationPrecision;
  distance_m?: number;
  // Postgres COUNT() comes back as a string.
  confirms?: string | number;
  denies?: string | number;
}

const toIncident = (row: IncidentRow): Incident => ({
  id: row.id,
  type: row.type,
  title: row.title,
  description: row.description,
  status: row.status,
  source: row.source ?? 'user',
  locationText: row.location_text ?? null,
  locationPrecision: row.location_precision ?? 'exact',
  lat: row.lat,
  lng: row.lng,
  createdAt: row.created_at,
  distanceM: row.distance_m,
  confirms: row.confirms === undefined ? undefined : Number(row.confirms),
  denies: row.denies === undefined ? undefined : Number(row.denies),
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
