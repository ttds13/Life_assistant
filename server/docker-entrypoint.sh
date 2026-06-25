#!/bin/sh
set -eu

MAX_RETRIES="${PRISMA_MIGRATE_RETRIES:-10}"
SLEEP_SECONDS="${PRISMA_MIGRATE_SLEEP_SECONDS:-5}"

i=1
while [ "$i" -le "$MAX_RETRIES" ]; do
  if npm run prisma:migrate:deploy; then
    if [ "${SEED_ON_START:-true}" = "true" ]; then
      node dist/seed/run-seed.js
    fi
    exec node dist/main.js
  fi

  echo "prisma migrate deploy failed (attempt $i/$MAX_RETRIES), retrying in ${SLEEP_SECONDS}s..."
  i=$((i + 1))
  sleep "$SLEEP_SECONDS"
done

echo "database migration failed after ${MAX_RETRIES} attempts"
exit 1
