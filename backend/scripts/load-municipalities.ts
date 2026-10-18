// Loads (or refreshes) the municipalities table from the City of Toronto's
// "Former Municipality Boundaries" open data. Run after migration 005:
//   npx tsx scripts/load-municipalities.ts
import { Signer } from '@aws-sdk/rds-signer';
import { Client } from 'pg';

import { MUNICIPALITIES } from '../src/incident-query';

const SOURCE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/833937f6-e190-49a2-9835-80137cf88c41/resource/4eadc3a3-bafa-44cf-a43f-f99a7fa98eb4/download/former-municipality-boundaries-data-4326.geojson';
const HOST = 'database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com';

// The dataset's AREA_NAME for each slug. Old Toronto is just "TORONTO" there.
const AREA_NAMES: Record<(typeof MUNICIPALITIES)[number], string> = {
  'east-york': 'EAST YORK',
  etobicoke: 'ETOBICOKE',
  'north-york': 'NORTH YORK',
  'old-toronto': 'TORONTO',
  scarborough: 'SCARBOROUGH',
  york: 'YORK',
};
const DISPLAY_NAMES: Record<(typeof MUNICIPALITIES)[number], string> = {
  'east-york': 'East York',
  etobicoke: 'Etobicoke',
  'north-york': 'North York',
  'old-toronto': 'Old Toronto',
  scarborough: 'Scarborough',
  york: 'York',
};

interface Feature {
  properties: { AREA_NAME: string };
  geometry: { type: string };
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const { features } = (await response.json()) as { features: Feature[] };

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
    await client.query('BEGIN');
    for (const slug of MUNICIPALITIES) {
      const feature = features.find((f) => f.properties.AREA_NAME === AREA_NAMES[slug]);
      if (!feature) throw new Error(`${AREA_NAMES[slug]} missing from the dataset`);
      // GeoJSON is lng/lat (CRS84), matching PostGIS order.
      await client.query(
        `INSERT INTO municipalities (slug, name, boundary)
         VALUES ($1, $2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))::geography)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, boundary = EXCLUDED.boundary`,
        [slug, DISPLAY_NAMES[slug], JSON.stringify(feature.geometry)],
      );
      console.log(`loaded ${slug}`);
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
