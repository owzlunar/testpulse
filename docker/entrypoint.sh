#!/bin/sh
# Builds the database indexes (production runs with autoIndex off), then hands over to supervisor.
# Set RUN_DB_INDEXES=false when another step of the deploy does it.
set -e

if [ "${RUN_DB_INDEXES:-true}" = "true" ]; then
  echo "[entrypoint] building database indexes"
  (cd /app/backend && node dist/cli/db-indexes.js)
fi

exec supervisord -n -c /etc/supervisord.conf
