// Loads (or refreshes) the intersections table from the City of Toronto's "Intersection File"
// open data (updated daily; re-run every few months to pick up new streets). Run after
// migration 006:
//   npx tsx scripts/load-intersections.ts
import { Signer } from '@aws-sdk/rds-signer';
import { Client } from 'pg';

import { normalizeStreet } from '../src/sources/street-names';

const SOURCE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/2c83f641-7808-49ba-b80f-7011851d4e27/resource/8e825e33-d7e1-4e59-b247-5868bf7d66a9/download/centreline-intersection-4326.geojson';
const HOST = 'database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com';
const BATCH_SIZE = 2_000;

interface Feature {
  properties: { INTERSECTION_ID: number; INTERSECTION_DESC: string };
  geometry: { coordinates: [number, number][] }; // MultiPoint, lng/lat
}

async function main() {
  console.log('downloading (~35 MB)...');
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const { features } = (await response.json()) as { features: Feature[] };

  // The file repeats an intersection once per elevation level; single-street points
  // (dead ends, trail nodes) can't match a "street & street" lookup.
  const rows = new Map<number, { description: string; streets: string[]; lng: number; lat: number }>();
  for (const { properties, geometry } of features) {
    const streets = properties.INTERSECTION_DESC.split(' / ').map(normalizeStreet).filter(Boolean);
    const point = geometry.coordinates[0];
    if (streets.length < 2 || !point || rows.has(properties.INTERSECTION_ID)) continue;
    rows.set(properties.INTERSECTION_ID, {
      description: properties.INTERSECTION_DESC,
      streets,
      lng: point[0],
      lat: point[1],
    });
  }
  console.log(`${rows.size} intersections to load`);

  const signer = new Signer({ hostname: HOST, port: 5432, username: 'postgres', region: 'us-east-2' });
  const client = new Client({
    host: HOST,
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password: await signer.getAuthToken(),
    ssl: true,
    connectionTimeoutMillis: 30_000,
  });
  await client.connect();
  try {
    // Replace everything in one transaction, so the importer never sees a half-loaded table.
    await client.query('BEGIN');
    await client.query('TRUNCATE intersections');
    const entries = [...rows.entries()];
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await client.query(
        `INSERT INTO intersections (id, description, streets, location)
         SELECT r.id, r.description, string_to_array(r.streets, '|'),
                ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography
         FROM unnest($1::bigint[], $2::text[], $3::text[], $4::float8[], $5::float8[])
           AS r(id, description, streets, lng, lat)`,
        [
          batch.map(([id]) => id),
          batch.map(([, r]) => r.description),
          // Postgres can't unnest a 2-D text array of uneven rows, so streets travel joined.
          batch.map(([, r]) => r.streets.join('|')),
          batch.map(([, r]) => r.lng),
          batch.map(([, r]) => r.lat),
        ],
      );
      console.log(`loaded ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
