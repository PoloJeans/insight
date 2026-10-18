@AGENTS.md

# Project context

Summarizes decisions, current state, and gotchas from earlier sessions. If something here conflicts with the code, trust the code and point out the mismatch.

## What this project is

A mobile app (React Native + Expo, run through **Expo Go**) that shows a Google-Maps-style map and lets a user report **incidents** (`crime` or `fire`) by long-pressing the map. Incidents are stored in **Amazon Aurora PostgreSQL** (with PostGIS) behind an API and shown as pins.

## Stack and constraints

- Expo SDK 57 (`expo ~57.0.30`), TypeScript, Expo Router. Path alias `@/` = `src/`.
- Theming helpers from the template: `ThemedText`, `ThemedView`, `useTheme()` (colors such as `background`, `backgroundElement`, `text`, `textSecondary`), `Spacing` (`one` to `six`), `BottomTabInset`.
- Tabs live in `src/components/app-tabs.tsx` (`NativeTabs` from `expo-router/unstable-native-tabs`; web version in `app-tabs.web.tsx`), in order: `profile`, `index` (**Map**, the default tab), `incidents`. The app opens on `index`, and `(tabs)/_layout.tsx` also sets `anchor: 'index'`.
- Map libraries: `react-native-maps` (in Expo Go, no API key needed there) and `expo-location`.
- **Must keep working in Expo Go.** Don't add libraries that need a development build without asking first. Known limits: no background location in Expo Go; MapLibre/Mapbox need a dev build; check current docs before suggesting `expo-maps`.
- `react-native-maps` is native-only; `src/app/(tabs)/index.web.tsx` is the web placeholder for the map.

## Current layout

```
src/
  app/_layout.tsx    Root Stack: Stack.Protected shows (tabs) when signed in, sign-in otherwise
  app/sign-in.tsx    Cognito sign in / sign up / email-code confirm
  app/(tabs)/index.tsx      Map screen (+ index.web.tsx placeholder)
  app/(tabs)/incidents.tsx  List of all incidents with type/date/municipality/vicinity/resolved filters
  app/(tabs)/profile.tsx    Incidents you reported and voted on; Sign out
  components/incidents/     incident-card (list row), filter-chips (single-select chip row)
  constants/municipalities.ts  The six former municipalities (slug + label), matching the DB
  utils/location.ts  getCurrentCoords(): phone position or null
  hooks/use-session.tsx  SessionProvider/useSession: signedIn state over api/auth.ts
  api/client.ts      fetch wrapper; reads EXPO_PUBLIC_API_URL, sends the Cognito access token
  api/auth.ts        Cognito via plain fetch (USER_PASSWORD_AUTH), token refresh; api/storage.ts persists it
  api/incidents.ts   listIncidents (map) / searchIncidents (Incidents tab) / getMyIncidents (Profile) / createIncident / voteIncident
  api/devices.ts     registerDevice (push token + location)
backend/             AWS CDK app: API Gateway HTTP API + Lambda handlers -> Aurora
  lib/insight-stack.ts, bin/insight.ts
  src/handlers/      create-incident, list-incidents, search-incidents, my-incidents, vote-incident, register-device
  src/incident-query.ts  Shared SELECT for list views (municipality, vote counts, caller's vote)
  migrations/        001_init … 005_municipalities.sql (004 = Dylan's external sources)
  scripts/psql.sh    psql with a fresh IAM token
  scripts/load-municipalities.ts  Loads municipality boundaries from Toronto open data (npx tsx)
```

### How the map screen works today

1. On load it requests foreground location permission. Granted: centers on the user and shows the blue dot. Denied: stays on downtown Toronto and shows a notice.
2. Long-press stores the coordinate as a pending coordinate, which opens the "Report an incident" modal.
3. The form collects **type** (required), **title** (required, max 100 chars), and **description** (optional, max 500 chars).
4. "Add to map" calls `createIncident`; the pin is added only after the API confirms. On failure the form stays open with an error.
5. Active incidents within 25 km of the map center are fetched on focus, after each pan/zoom, and every 30 s while the tab is focused (fire pins orange, crime pins blue). A 401 signs the user out.

## Gotchas already hit (don't reintroduce)

- **Read event data synchronously.** In `onLongPress`, copy `e.nativeEvent.coordinate` into a variable immediately. Reading `e` in a `setState` updater or async code crashes ("cannot read property 'coordinate' of null").
- **`StyleSheet.absoluteFillObject` is gone from the types.** Use `position: 'absolute', top: 0, left: 0, right: 0, bottom: 0`.
- **Files in `src/app/` are routes.** Never put components, backups, or helpers there. Backups use a `.bak` extension and live outside `src/app`.
- **PostGIS takes longitude first.** App coordinates are `{ latitude, longitude }` (API uses `lat`/`lng`), so the order flips at the SQL boundary: `ST_MakePoint(lng, lat)`. Test with Toronto (lat ~43.65, lng ~-79.38) to catch swaps.

## Backend and database

- **Architecture:** `Expo app -> HTTPS -> API Gateway HTTP API -> Lambda (NodejsFunction) -> Aurora PostgreSQL`. The app never connects to the database or holds DB credentials. Lambdas authenticate with IAM tokens (`@aws-sdk/rds-signer`) as DB user `postgres`.
- **Routes:** `POST /incidents`, `GET /incidents?lat&lng&radius` (active incidents nearby, default 5 km, max 25 km, nearest first), `GET /incidents/search?lat&lng&radius&type&municipality&since&includeResolved&limit` (all optional; no radius = whole DB; newest first, max 500), `GET /me/incidents` (`{ created, voted }`), `POST /incidents/{id}/votes` (`{ stillThere }`), `PUT /devices`. List rows include `municipality`, `confirms`/`denies`, `my_vote` and `mine`. The API URL is the `ApiUrl` CDK output; set it as `EXPO_PUBLIC_API_URL`.
- Deploy from `backend/` with `npm run deploy` (`cdk deploy`); `npm run typecheck` there.
- Aurora Serverless can take 10–15 s to resume from pause, so the first request after idle is slow. The DB connect timeout is 20 s and the Lambda timeout is 29 s (just under API Gateway's 30 s limit).
- **Aurora:** region `us-east-2`, port 5432, database `postgres`, cluster `database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com`, PostGIS enabled.
- **Connecting by hand:** `backend/scripts/psql.sh`, or DBeaver with IAM auth: `aws rds generate-db-auth-token --region us-east-2 --port 5432 --username postgres --hostname <cluster endpoint>` as the password, SSL mode `require`. Tokens expire after 15 minutes (an open connection stays alive). `002_friend_readonly.sql` creates a read-only `friend_readonly` IAM login (no access to `devices`).
- **Never commit credentials, access keys, auth tokens, or passwords.** Keep `.env` files out of git.

### Schema (`backend/migrations/001`–`005`)

- `incidents`: `id uuid`, `type text` (`'fire' | 'crime'`, lowercase only), `title text NOT NULL` (API truncates to 100 chars), `description text NULL`, `location geography(Point, 4326)`, `status text NOT NULL DEFAULT 'active'` (`'active' | 'inactive'`), `created_by uuid NOT NULL`, `created_at`. GiST index on `location`, plus a partial GiST index on active rows.
- **No time-based expiry.** `expires_at` was dropped in `003_status_and_title.sql`. `active` = shown on the map, `inactive` = resolved. If expiry is wanted later, it needs a scheduled job or a query-time rule on `created_at`.
- `title` was added with `DEFAULT ''`, and `create-incident` currently accepts a missing or blank title. The app form requires one, but the API doesn't validate it yet.
- `votes`: `(incident_id, user_id)` PK, `still_there boolean`. A single "not there" vote sets the incident `inactive` (its pin disappears on the next 30 s poll); "still there" is recorded but changes nothing. Voting on an inactive incident returns 404. Tapping a pin opens a card with both buttons.
- `devices`: `user_id` PK, `push_token`, `location`, for proximity alerts.
- `municipalities`: `slug` PK (`east-york`, `etobicoke`, `north-york`, `old-toronto`, `scarborough`, `york`), `name`, `boundary geography(MultiPolygon)`. Filled from the City of Toronto "Former Municipality Boundaries" dataset (old Toronto is `TORONTO` there). An incident's municipality is computed at query time with `ST_Covers`, so nothing is stored on `incidents`.
- **Auth:** every API route requires a Cognito access token (HTTP API JWT authorizer, user pool `us-east-2_wikWCurHA`). `created_by` / `user_id` are the token's `sub`; there's no users table or FK yet. The app needs `EXPO_PUBLIC_COGNITO_CLIENT_ID` (the `UserPoolClientId` stack output) in `.env`; see `.env.example`.
- Insert with `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`; read with `ST_X(location::geometry)` (lng) / `ST_Y(location::geometry)` (lat); "nearby" with `ST_DWithin(location, point, meters)`.

## Next steps (roughly in order)

1. Validate input in `create-incident` (non-blank title, coordinates in range).
2. Add a users table if needed, then make `created_by` a real foreign key.

## How I like to work

- I'm new to AWS and backend work, so explain AWS steps and non-obvious decisions briefly and plainly.
- Keep code comments **light**: short comments on purpose and non-obvious logic, not basic syntax.
- Keep components modular without splitting into many tiny files. Extract a piece when it has its own state or logic, or is reused.
- **Before refactoring or replacing a file, keep a backup** so nothing is lost for good.
- When I ask for an explanation without code changes, don't edit files.
- Show a plan first for larger changes, and say what you couldn't test. Nothing has been verified on a physical device unless I say so.
