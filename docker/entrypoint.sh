#!/bin/sh
# Container start:
#   1. (as root) give the mounted folders (uploads, logs) to the app user
#   2. serve the web app under BASE_URL's path (e.g. /testpulse): <base href> and nginx rewrites
#   3. preflight: MongoDB, storage, SMTP and the log folder must work, otherwise the container stops
#   4. build the database indexes, then run the pending migrations (the first Admin from
#      INITIAL_ADMIN_*, the built-in templates, the default roles; RUN_DB_INDEXES / RUN_MIGRATIONS=false
#      to skip)
#   5. supervisor runs nginx and the API (as the app user), and the backup agent when
#      BACKUP_AGENT=embedded (as "backup")
# `agent` as the container's command runs only the backup agent (BACKUP_AGENT=separate, PRD 5.15).
set -e

APP_USER=testpulse
# fixed by the image, whatever the env files say: nginx proxies to 127.0.0.1:8081, the volumes are here
export NODE_ENV=production HOST=127.0.0.1 PORT=8081 \
  STORAGE_LOCAL_ROOT=/app/backend/storage/uploads LOG_DIR=/app/backend/logs
as_app() { if [ "$(id -u)" = "0" ]; then su-exec "$APP_USER" "$@"; else "$@"; fi; }

# --- the backup agent (PRD 5.15) --------------------------------------------------------------------
# Its settings: the backup.env mounted at BACKUP_ENV_FILE (the scripts' file, with BACKUP_AGENT_TOKEN and
# BACKUP_AGENT_SECRET), copied where only the "backup" user reads it, plus what the agent needs here.
AGENT_HOME=/var/lib/testpulse-backup
AGENT_ENV=/run/testpulse-backup/backup.env
# the agent gets a clean environment, never the app's (.env.prod's secrets)
AGENT_CMD="env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=$AGENT_HOME BACKUP_ENV=$AGENT_ENV node /app/backend/dist/agent/index.js"
prepare_agent() { # $1: the address it listens on, $2: the API it reports to (unless backup.env names one)
  src=${BACKUP_ENV_FILE:-/etc/testpulse-backup/backup.env}
  if [ ! -f "$src" ]; then
    echo "[entrypoint] BACKUP_AGENT=$BACKUP_AGENT but there is no $src: mount backup.env there" >&2
    exit 1
  fi
  mkdir -p /run/testpulse-backup "$AGENT_HOME"
  {
    cat "$src"
    echo
    # later lines win (the scripts and the agent read the file top to bottom)
    echo "BACKUP_TOOLS=local"
    echo "BACKUP_WORK_DIR=$AGENT_HOME/work"
    echo "BACKUP_VERIFY_DB=/app/backend/dist/agent/verify-db.js"
    echo "AGENT_SCRIPTS_DIR=/app/scripts"
    echo "AGENT_DATA_DIR=$AGENT_HOME"
    echo "AGENT_HOST=$1"
    echo "BACKUP_AGENT=$BACKUP_AGENT"
    grep -q '^AGENT_API_URL=' "$src" || echo "AGENT_API_URL=$2"
    grep -q '^AGENT_APP_URL=' "$src" || [ -z "${BASE_URL:-}" ] || echo "AGENT_APP_URL=$BASE_URL"
    grep -q '^CRON_TIMEZONE=' "$src" || echo "CRON_TIMEZONE=${CRON_TIMEZONE:-Asia/Bangkok}"
  } >"$AGENT_ENV"
  chown -R backup:backup /run/testpulse-backup "$AGENT_HOME"
  chmod 700 /run/testpulse-backup "$AGENT_HOME"
  chmod 400 "$AGENT_ENV"
}

if [ "${1:-}" = "agent" ]; then
  BACKUP_AGENT=separate
  prepare_agent 0.0.0.0 "http://testpulse:8080/api/v1"
  echo "[entrypoint] backup agent only (separate)"
  cd /app/backend
  # shellcheck disable=SC2086 # AGENT_CMD is a word list
  exec su-exec backup $AGENT_CMD
fi

# --- 1. writable folders --------------------------------------------------------------------------
for dir in "$STORAGE_LOCAL_ROOT" "$LOG_DIR"; do
  [ -n "$dir" ] || continue
  mkdir -p "$dir"
  if [ "$(id -u)" = "0" ]; then chown -R "$APP_USER:$APP_USER" "$dir"; fi
done

# --- 2. public path -------------------------------------------------------------------------------
if [ -z "$BASE_URL" ]; then
  echo "[entrypoint] BASE_URL is not set (the web app's public URL, e.g. https://mydomain/testpulse)" >&2
  exit 1
fi
PUBLIC_PATH=$(node -e 'console.log(new URL(process.env.BASE_URL).pathname.replace(/\/+$/, ""))')
case "$PUBLIC_PATH" in
  *[!A-Za-z0-9/_.-]*) echo "[entrypoint] unsupported characters in BASE_URL's path: $PUBLIC_PATH" >&2; exit 1 ;;
esac

sed "s#<base href=\"/\" />#<base href=\"$PUBLIC_PATH/\" />#" /app/frontend/index.template.html > /app/frontend/index.html

mkdir -p /tmp/nginx
if [ -n "$PUBLIC_PATH" ]; then
  # accept both forms a reverse proxy may send: with the sub path (/testpulse/api/...) or stripped (/api/...)
  cat > /tmp/nginx/base-path.conf <<CONF
location = $PUBLIC_PATH { return 301 $PUBLIC_PATH/; }
location ^~ $PUBLIC_PATH/ { rewrite ^$PUBLIC_PATH/(.*)\$ /\$1 last; }
CONF
else
  : > /tmp/nginx/base-path.conf
fi
if [ "$(id -u)" = "0" ]; then chown -R "$APP_USER:$APP_USER" /tmp/nginx; fi
echo "[entrypoint] serving ${BASE_URL} (public path '${PUBLIC_PATH:-/}')"

# --- 3, 4. checks and indexes ---------------------------------------------------------------------
cd /app/backend
if ! as_app node dist/cli/preflight.js; then
  echo "[entrypoint] start-up checks failed: fix the settings above (MONGODB_URI, STORAGE_*/MINIO_*, SMTP_*, LOG_DIR)" >&2
  exit 1
fi
if [ "${RUN_DB_INDEXES:-true}" = "true" ]; then
  if ! as_app node dist/cli/db-indexes.js; then
    echo "[entrypoint] building the database indexes failed: see the message above" >&2
    exit 1
  fi
fi
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if ! as_app node dist/cli/migrate.js up; then
    echo "[entrypoint] migrations failed: see the message above" >&2
    exit 1
  fi
fi

# --- 5. run ---------------------------------------------------------------------------------------
mkdir -p /tmp/supervisor.d
rm -f /tmp/supervisor.d/agent.conf
if [ "${BACKUP_AGENT:-}" = "embedded" ]; then
  prepare_agent 127.0.0.1 "http://127.0.0.1:${PORT}${BASE_PATH:-/api/v1}"
  agent_token=$(sed -n 's/^BACKUP_AGENT_TOKEN=//p' "$AGENT_ENV" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")
  if [ -z "${BACKUP_AGENT_TOKEN:-}" ] || [ "$agent_token" != "$BACKUP_AGENT_TOKEN" ]; then
    echo "[entrypoint] BACKUP_AGENT_TOKEN in .env.prod and in backup.env must be the same" >&2
    exit 1
  fi
  export BACKUP_AGENT_URL="${BACKUP_AGENT_URL:-http://127.0.0.1:8090}"
  cat >/tmp/supervisor.d/agent.conf <<CONF
[program:agent]
command=$AGENT_CMD
directory=/app/backend
user=backup
priority=30
autorestart=true
startsecs=5
startretries=10
stopsignal=TERM
stopwaitsecs=15
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
CONF
  echo "[entrypoint] backup agent: embedded (127.0.0.1:8090)"
fi
# supervisord stays root (it writes to the container's stdout) and starts nginx and the API as $APP_USER
exec supervisord -n -c /etc/supervisord.conf
