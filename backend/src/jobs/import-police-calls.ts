import { pool } from '../db';
import { formatStreet } from '../sources/street-names';
import { classifyCall } from '../sources/tps-call-types';

// Toronto Police's public calls-for-service layer. It holds a rolling window of roughly the
// last 4 hours, already geocoded to the nearest intersection.
const FEED_URL =
  'https://services.arcgis.com/S9th0jAJ7bqgIRjw/arcgis/rest/services/C4S_Public_NoGO/FeatureServer/0/query';

// Matches the feed's own window; older calls are marked inactive.
const ACTIVE_HOURS = 4;

// Rough box around the GTA, to drop obviously bad coordinates.
const BOUNDS = { minLat: 43.4, maxLat: 44.1, minLng: -80.0, maxLng: -78.9 };

interface CallAttributes {
  OCCURRENCE_TIME: number; // epoch ms, UTC
  DIVISION: string | null;
  CALL_TYPE_CODE: string;
  CALL_TYPE: string;
  CROSS_STREETS: string | null;
  LATITUDE: number | null;
  LONGITUDE: number | null;
}

interface FeedResponse {
  features?: { attributes: CallAttributes }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

// "ASSAULT IN PROGRESS" -> "Assault in progress"
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// "KEELE ST - FREEMAN RD" -> "Keele St & Freeman Rd"
const formatCrossStreets = (s: string) => s.split(' - ').map(formatStreet).join(' & ');

async function fetchCalls(): Promise<FeedResponse> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'OCCURRENCE_TIME,DIVISION,CALL_TYPE_CODE,CALL_TYPE,CROSS_STREETS,LATITUDE,LONGITUDE',
    returnGeometry: 'false',
    resultRecordCount: '2000',
    f: 'json',
  });
  const response = await fetch(`${FEED_URL}?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`police feed returned HTTP ${response.status}`);
  const data = (await response.json()) as FeedResponse;
  // ArcGIS reports query errors with HTTP 200 and an "error" object.
  if (data.error) throw new Error(`police feed error: ${data.error.message ?? 'unknown'}`);
  return data;
}

export const handler = async () => {
  const data = await fetchCalls();
  const features = data.features ?? [];
  if (data.exceededTransferLimit) console.warn('police feed returned a partial page; some calls were not imported');

  const cutoff = Date.now() - ACTIVE_HOURS * 60 * 60 * 1000;
  const rows: { externalId: string; title: string; description: string; locationText: string | null;
    lat: number; lng: number; occurredAt: string }[] = [];
  const unknownTypes = new Set<string>();
  let excluded = 0;
  let skippedLocationOrAge = 0;

  for (const { attributes: a } of features) {
    const decision = classifyCall(a.CALL_TYPE_CODE, a.CALL_TYPE);
    if (decision === 'unknown') unknownTypes.add(`${a.CALL_TYPE_CODE} ${a.CALL_TYPE}`);
    if (decision !== 'include') {
      excluded++;
      continue;
    }
    const { LATITUDE: lat, LONGITUDE: lng } = a;
    if (
      lat == null || lng == null ||
      lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng ||
      a.OCCURRENCE_TIME < cutoff
    ) {
      skippedLocationOrAge++;
      continue;
    }
    rows.push({
      // The layer has no call number, and its OBJECTIDs can be reissued when it is
      // republished, so a call is identified by what, when and where.
      externalId: `${a.OCCURRENCE_TIME}|${a.CALL_TYPE_CODE}|${a.CROSS_STREETS ?? ''}`,
      title: sentenceCase(a.CALL_TYPE),
      description: `Reported to Toronto Police${a.DIVISION ? ` (${a.DIVISION})` : ''}`,
      locationText: a.CROSS_STREETS ? formatCrossStreets(a.CROSS_STREETS) : null,
      lat,
      lng,
      occurredAt: new Date(a.OCCURRENCE_TIME).toISOString(),
    });
  }

  // DO NOTHING on conflict: a call is never changed by the feed once imported, and
  // re-inserting would undo a user's "Not there" vote.
  const inserted = rows.length
    ? await pool.query(
        `INSERT INTO incidents
           (source, external_id, type, title, description, location_text, location_precision, location, created_at)
         SELECT 'tps', r.external_id, 'crime', r.title, r.description, r.location_text, 'intersection',
                ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, r.occurred_at
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[], $7::timestamptz[])
           AS r(external_id, title, description, location_text, lat, lng, occurred_at)
         ON CONFLICT (source, external_id) DO NOTHING`,
        [
          rows.map((r) => r.externalId),
          rows.map((r) => r.title),
          rows.map((r) => r.description),
          rows.map((r) => r.locationText),
          rows.map((r) => r.lat),
          rows.map((r) => r.lng),
          rows.map((r) => r.occurredAt),
        ],
      )
    : { rowCount: 0 };

  const expired = await pool.query(
    `UPDATE incidents SET status = 'inactive'
     WHERE source = 'tps' AND status = 'active' AND created_at < now() - make_interval(hours => $1)`,
    [ACTIVE_HOURS],
  );

  const summary = {
    fetched: features.length,
    relevant: rows.length,
    inserted: inserted.rowCount,
    expired: expired.rowCount,
    excluded,
    skippedLocationOrAge,
    // New call types the rules don't cover yet; add them to tps-call-types.ts.
    unknownTypes: [...unknownTypes],
  };
  console.log(JSON.stringify(summary));
  return summary;
};
