@AGENTS.md

# Project context

Summarizes decisions, current state, and gotchas from earlier sessions. If something here conflicts with the code, trust the code and point out the mismatch.

## What this project is

A mobile app (React Native + Expo, run through **Expo Go**) that shows a Google-Maps-style map and lets a user report **incidents** (`crime` or `fire`) by long-pressing the map. Incidents are stored in **Amazon Aurora PostgreSQL** (with PostGIS) behind an API and shown as pins.

## Stack and constraints

- Expo SDK 57 (`expo ~57.0.30`), TypeScript, Expo Router. Path alias `@/` = `src/`.
- Theming helpers from the template: `ThemedText`, `ThemedView`, `useTheme()` (colors such as `background`, `backgroundElement`, `text`, `textSecondary`), `Spacing` (`one` to `six`), `BottomTabInset`.
- Tabs live in `src/components/app-tabs.tsx` using `NativeTabs` from `expo-router/unstable-native-tabs`: `index` (Home), `explore` (Explore), `map` (Map, `sf="map" md="map"` icons).
- Map libraries: `react-native-maps` (in Expo Go, no API key needed there) and `expo-location`.
- **Must keep working in Expo Go.** Don't add libraries that need a development build without asking first. Known limits: no background location in Expo Go; MapLibre/Mapbox need a dev build; check current docs before suggesting `expo-maps`.
- `react-native-maps` is native-only; `src/app/map.web.tsx` is the web placeholder.

## Current layout

```
src/
  app/map.tsx        Map screen: markers, report-incident form modal, location permission (all in one file)
  app/map.web.tsx    Web placeholder for the map
  api/client.ts      fetch wrapper; reads EXPO_PUBLIC_API_URL, sends x-user-id header
  api/incidents.ts   listIncidents / createIncident / voteIncident
  api/devices.ts     registerDevice (push token + location)
  api/user-id.ts     Placeholder identity: random UUID per install (SecureStore; localStorage on web)
backend/             AWS CDK app: API Gateway HTTP API + Lambda handlers -> Aurora
  lib/insight-stack.ts, bin/insight.ts
  src/handlers/      create-incident, list-incidents, vote-incident, register-device
  migrations/        001_init.sql, 002_friend_readonly.sql
  scripts/psql.sh    psql with a fresh IAM token
```

### How the map screen works today

1. On load it requests foreground location permission. Granted: centers on the user and shows the blue dot. Denied: stays on downtown Toronto and shows a notice.
2. Long-press stores the coordinate as a pending coordinate, which opens the "Report an incident" modal.
3. The form collects **type** (required), **title** (required, max 100 chars), and **description** (optional, max 500 chars).
4. "Add to map" appends the incident to **in-memory state** (fire pins orange, crime pins blue); "Clear pins" empties it. The `id` is temporary and nothing is saved yet. `map.tsx` does not call `src/api/` yet.

## Gotchas already hit (don't reintroduce)

- **Read event data synchronously.** In `onLongPress`, copy `e.nativeEvent.coordinate` into a variable immediately. Reading `e` in a `setState` updater or async code crashes ("cannot read property 'coordinate' of null").
- **`StyleSheet.absoluteFillObject` is gone from the types.** Use `position: 'absolute', top: 0, left: 0, right: 0, bottom: 0`.
- **Files in `src/app/` are routes.** Never put components, backups, or helpers there. Backups use a `.bak` extension and live outside `src/app`.
- **PostGIS takes longitude first.** App coordinates are `{ latitude, longitude }` (API uses `lat`/`lng`), so the order flips at the SQL boundary: `ST_MakePoint(lng, lat)`. Test with Toronto (lat ~43.65, lng ~-79.38) to catch swaps.

## Backend and database

- **Architecture:** `Expo app -> HTTPS -> API Gateway HTTP API -> Lambda (NodejsFunction) -> Aurora PostgreSQL`. The app never connects to the database or holds DB credentials. Lambdas authenticate with IAM tokens (`@aws-sdk/rds-signer`) as DB user `postgres`.
- **Routes:** `POST /incidents`, `GET /incidents?lat&lng&radius` (active incidents nearby, default 5 km, max 25 km, nearest first), `POST /incidents/{id}/votes` (`{ stillThere }`), `PUT /devices`. The API URL is the `ApiUrl` CDK output; set it as `EXPO_PUBLIC_API_URL`.
- Deploy from `backend/` with `npm run deploy` (`cdk deploy`); `npm run typecheck` there.
- Aurora Serverless can take 10–15 s to resume from pause, so the first request after idle is slow. The DB connect timeout is 20 s and the Lambda timeout is 29 s (just under API Gateway's 30 s limit).
- **Aurora:** region `us-east-2`, port 5432, database `postgres`, cluster `database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com`, PostGIS enabled.
- **Connecting by hand:** `backend/scripts/psql.sh`, or DBeaver with IAM auth: `aws rds generate-db-auth-token --region us-east-2 --port 5432 --username postgres --hostname <cluster endpoint>` as the password, SSL mode `require`. Tokens expire after 15 minutes (an open connection stays alive). `002_friend_readonly.sql` creates a read-only `friend_readonly` IAM login (no access to `devices`).
- **Never commit credentials, access keys, auth tokens, or passwords.** Keep `.env` files out of git.

### Schema (`backend/migrations/001`–`003`)

- `incidents`: `id uuid`, `type text` (`'fire' | 'crime'`, lowercase only), `title text NOT NULL` (API truncates to 100 chars), `description text NULL`, `location geography(Point, 4326)`, `status text NOT NULL DEFAULT 'active'` (`'active' | 'inactive'`), `created_by uuid NOT NULL`, `created_at`. GiST index on `location`, plus a partial GiST index on active rows.
- **No time-based expiry.** `expires_at` was dropped in `003_status_and_title.sql`. `active` = shown on the map, `inactive` = resolved. If expiry is wanted later, it needs a scheduled job or a query-time rule on `created_at`.
- `title` was added with `DEFAULT ''`, and `create-incident` currently accepts a missing or blank title. The app form requires one, but the API doesn't validate it yet.
- `votes`: `(incident_id, user_id)` PK, `still_there boolean`. Enough "gone" votes, net of confirmations, set the incident `inactive`; voting on an inactive incident returns 404.
- `devices`: `user_id` PK, `push_token`, `location`, for proximity alerts.
- `created_by` / `user_id` have **no users table or FK yet**; they come from the per-install UUID in the `x-user-id` header until real auth (Cognito planned).
- Insert with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`; read with `ST_X(location::geometry)` (lng) / `ST_Y(location::geometry)` (lat); "nearby" with `ST_DWithin(location, point, meters)`.

## Next steps (roughly in order)

1. Wire `map.tsx` to `src/api/incidents.ts`: load nearby incidents on mount, and handle submitting, error, and retry states (a failed save must not show a pin as saved).
2. Expose voting / resolving incidents in the UI.
3. Validate input in `create-incident` (non-blank title, coordinates in range).
4. Decide on auth (Cognito) and a users table, then make `created_by` a real foreign key.

## How I like to work

- I'm new to AWS and backend work, so explain AWS steps and non-obvious decisions briefly and plainly.
- Keep code comments **light**: short comments on purpose and non-obvious logic, not basic syntax.
- Keep components modular without splitting into many tiny files. Extract a piece when it has its own state or logic, or is reused.
- **Before refactoring or replacing a file, keep a backup** so nothing is lost for good.
- When I ask for an explanation without code changes, don't edit files.
- Show a plan first for larger changes, and say what you couldn't test. Nothing has been verified on a physical device unless I say so.
