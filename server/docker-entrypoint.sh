#!/bin/sh
set -eu

if [ "${NODE_ENV:-production}" = "production" ] && [ "${SEED_ON_START:-false}" != "false" ]; then
  echo "SEED_ON_START must be false in production"
  exit 1
fi

if [ "${RUN_MIGRATIONS_ON_START:-false}" = "true" ]; then
  MAX_RETRIES="${PRISMA_MIGRATE_RETRIES:-10}"
  SLEEP_SECONDS="${PRISMA_MIGRATE_SLEEP_SECONDS:-5}"
  i=1
  while [ "$i" -le "$MAX_RETRIES" ]; do
    if npm run prisma:migrate:deploy; then
      break
    fi

    echo "prisma migrate deploy failed (attempt $i/$MAX_RETRIES), retrying in ${SLEEP_SECONDS}s..."
    i=$((i + 1))
    sleep "$SLEEP_SECONDS"
  done

  if [ "$i" -gt "$MAX_RETRIES" ]; then
    echo "database migration failed after ${MAX_RETRIES} attempts"
    exit 1
  fi
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  node dist/seed/run-seed.js
fi

exec node dist/main.js
