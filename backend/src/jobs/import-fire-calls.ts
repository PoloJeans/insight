import { pool } from '../db';
import { resolveFireLocation, type Candidate, type FindIntersections } from '../sources/fire-locations';

// Toronto Fire's live active-incidents feed (City of Toronto only), refreshed about every
// 5 minutes. An event stays in it while the call is active.
const FEED_URL = 'https://www.toronto.ca/data/fire/livecad.xml';

// Older than this and the feed is treated as stuck: nothing is deactivated.
const STALE_MINUTES = 30;

interface FireEvent {
  eventNum: string;
  type: string;
  primeStreet: string;
  crossStreets: string;
  dispatchTime: string; // Toronto local time, no offset: "2026-10-17T21:19:56"
  alarmLevel: number;
}

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// The feed is flat XML with no attributes, so a tag lookup is enough. Self-closing
// tags (<cross_streets/>) have no match and read as ''.
const tag = (name: string, xml: string) =>
  decodeXml(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '').trim();

async function fetchFeed() {
  const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`fire feed returned HTTP ${response.status}`);
  return parseFeed(await response.text());
}

export function parseFeed(xml: string): { updatedAt: string; events: FireEvent[] } {
  if (!xml.includes('<tfs_active_incidents')) throw new Error('fire feed is not the expected XML');
  const events = [...xml.matchAll(/<event>([\s\S]*?)<\/event>/g)].map(([, e]) => ({
    eventNum: tag('event_num', e),
    type: tag('event_type', e),
    primeStreet: tag('prime_street', e),
    crossStreets: tag('cross_streets', e),
    dispatchTime: tag('dispatch_time', e),
    alarmLevel: Number(tag('alarm_lev', e)) || 0,
  }));
  return { updatedAt: tag('update_from_db_time', xml), events: events.filter((e) => e.eventNum) };
}

// "Fire - Commercial/Industrial" -> "Commercial/industrial fire"
export const fireTitle = (type: string) => {
  const kind = type.replace(/^Fire\s*-\s*/i, '').trim().toLowerCase();
  return kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)} fire` : 'Fire';
};

async function intersectionFinder(): Promise<FindIntersections> {
  // Without the municipalities table (migration 004 not loaded), area preference is skipped.
  const { rows } = await pool.query(`SELECT to_regclass('municipalities') IS NOT NULL AS ok`);
  const hasAreas: boolean = rows[0].ok;
  return async (streetA, streetB, area) => {
    const result = await pool.query<Candidate>(
      hasAreas
        ? `SELECT ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng,
                  COALESCE(ST_Covers(m.boundary, i.location), false) AS "inArea"
           FROM intersections i
           LEFT JOIN municipalities m ON m.slug = $3
           WHERE i.streets && $1::text[] AND i.streets && $2::text[]`
        : `SELECT ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng,
                  false AS "inArea"
           FROM intersections i
           WHERE i.streets && $1::text[] AND i.streets && $2::text[]`,
      hasAreas ? [streetA, streetB, area] : [streetA, streetB],
    );
    return result.rows;
  };
}

export const handler = async () => {
  const { updatedAt, events } = await fetchFeed();

  const fires = events.filter((e) => /^Fire\s*-/i.test(e.type));
  const { rows: existing } = await pool.query<{ external_id: string }>(
    `SELECT external_id FROM incidents WHERE source = 'tfs' AND external_id = ANY($1)`,
    [fires.map((e) => e.eventNum)],
  );
  const alreadyImported = new Set(existing.map((r) => r.external_id));
  const find = await intersectionFinder();

  let inserted = 0;
  const unmatched: string[] = [];
  for (const event of fires) {
    if (alreadyImported.has(event.eventNum)) continue;
    const location = await resolveFireLocation(event.primeStreet, event.crossStreets, find);
    if (!location) {
      // No pin rather than a guess; logged so the matcher can be improved. Retried next run.
      unmatched.push(`${event.eventNum} ${event.primeStreet} | ${event.crossStreets}`);
      continue;
    }
    // DO NOTHING on conflict: once imported, an event is never overwritten, so a user's
    // "Not there" vote sticks.
    const result = await pool.query(
      `INSERT INTO incidents
         (source, external_id, type, title, description, location_text, location_precision, location, created_at)
       VALUES ('tfs', $1, 'fire', $2, $3, $4, 'intersection',
               ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
               COALESCE(NULLIF($7, '')::timestamp AT TIME ZONE 'America/Toronto', now()))
       ON CONFLICT (source, external_id) DO NOTHING`,
      [
        event.eventNum,
        fireTitle(event.type),
        `Reported to Toronto Fire${event.alarmLevel > 0 ? ` · alarm level ${event.alarmLevel}` : ''}`,
        location.text,
        location.lng,
        location.lat,
        event.dispatchTime,
      ],
    );
    inserted += result.rowCount ?? 0;
  }

  // Events that left the feed are over. Only trust that when the feed itself is current;
  // a stuck or broken feed must not wipe every fire pin.
  const { rows: freshness } = await pool.query<{ fresh: boolean }>(
    `SELECT $1::timestamp AT TIME ZONE 'America/Toronto' > now() - make_interval(mins => $2) AS fresh`,
    [updatedAt || '1970-01-01', STALE_MINUTES],
  );
  const fresh = Boolean(updatedAt) && freshness[0].fresh;
  const deactivated = fresh
    ? (
        await pool.query(
          `UPDATE incidents SET status = 'inactive'
           WHERE source = 'tfs' AND status = 'active' AND NOT (external_id = ANY($1))`,
          [events.map((e) => e.eventNum)],
        )
      ).rowCount
    : 0;
  if (!fresh) console.warn(`fire feed looks stale (updated ${updatedAt || 'unknown'}); nothing deactivated`);

  const summary = {
    feedUpdatedAt: updatedAt,
    events: events.length,
    fires: fires.length,
    alreadyImported: alreadyImported.size,
    inserted,
    deactivated,
    unmatched,
  };
  console.log(JSON.stringify(summary));
  return summary;
};
