import { request } from '@/api/client';

export type IncidentType = 'fire' | 'crime';

export interface Incident {
  id: string;
  type: IncidentType;
  description: string | null;
  lat: number;
  lng: number;
  createdAt: string;
  expiresAt: string;
  /** Meters from the queried point. Only set by listIncidents. */
  distanceM?: number;
  confirms?: number;
  denies?: number;
}

interface IncidentRow {
  id: string;
  type: IncidentType;
  description: string | null;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string;
  distance_m?: number;
  // Postgres COUNT() comes back as a string.
  confirms?: string | number;
  denies?: string | number;
}

const toIncident = (row: IncidentRow): Incident => ({
  id: row.id,
  type: row.type,
  description: row.description,
  lat: row.lat,
  lng: row.lng,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
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
  description?: string;
}): Promise<Incident> {
  return toIncident(await request<IncidentRow>('POST', '/incidents', { body: input }));
}

/** `stillThere: true` confirms the incident (extends it); `false` reports it gone. */
export async function voteIncident(
  id: string,
  stillThere: boolean,
): Promise<{ id: string; expiresAt: string }> {
  const row = await request<{ id: string; expires_at: string }>(
    'POST',
    `/incidents/${id}/votes`,
    { body: { stillThere } },
  );
  return { id: row.id, expiresAt: row.expires_at };
}
