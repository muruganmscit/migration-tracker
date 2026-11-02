#!/bin/sh
# Runs the tests with coverage in a throwaway container on the Docker network, against a separate
# "_test" database, with mail going to Mailpit. Writes coverage/lcov.info for SonarQube.
# Usage, from the repo root: sh server/test-coverage.sh
set -e
cd "$(dirname "$0")/.."
docker compose up -d postgres mailpit >/dev/null
docker compose exec -T postgres sh -c "psql -U portal -d postgres -tAc \"select 1 from pg_database where datname='harness_migration_portal_test'\" | grep -q 1 || psql -U portal -d postgres -qc 'CREATE DATABASE harness_migration_portal_test'"
NET=$(docker inspect "$(docker compose ps -q postgres)" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run --rm --network "$NET" -v "$PWD/server:/app" -v /app/node_modules -v /dev/null:/app/.env -w /app \
  -e DATABASE_URL=postgresql://portal:portal@postgres:5432/harness_migration_portal_test \
  -e SMTP_HOST=mailpit -e SMTP_PORT=1025 -e SMTP_USER= -e SMTP_PASS= -e EMAIL_REDIRECT_TO= \
  -e EMAIL_FROM="Portal Tests <tests@example.com>" -e APP_BASE_URL=http://localhost:4000 \
  node:20 sh -c "npm ci --silent && npx prisma generate >/dev/null && npx prisma migrate deploy >/dev/null && npm run test:coverage"
