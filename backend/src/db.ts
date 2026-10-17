import { Signer } from '@aws-sdk/rds-signer';
import { Pool } from 'pg';

const host = process.env.DB_HOST!;
const user = process.env.DB_USER!;

const signer = new Signer({
  hostname: host,
  port: 5432,
  username: user,
  region: process.env.DB_REGION!,
});

// Reused across warm invocations. Auth tokens last 15 minutes, so one is signed per new connection.
export const pool = new Pool({
  host,
  port: 5432,
  user,
  database: process.env.DB_NAME!,
  password: () => signer.getAuthToken(),
  ssl: true,
  max: 1,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 20_000, // Aurora Serverless can take 10-15s to resume from pause
});
