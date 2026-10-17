#!/usr/bin/env bash
# Opens psql against the Aurora cluster using a fresh IAM token. Extra args pass through to psql.
#   ./scripts/psql.sh                          interactive shell
#   ./scripts/psql.sh -c 'SELECT * FROM incidents;'
#   ./scripts/psql.sh -f migrations/002_x.sql
set -euo pipefail
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
H=database-1.cluster-creccy06i6f3.us-east-2.rds.amazonaws.com
PGPASSWORD=$(aws rds generate-db-auth-token --region us-east-2 --hostname "$H" --port 5432 --username postgres) \
  exec psql "host=$H port=5432 dbname=postgres user=postgres sslmode=require" "$@"
