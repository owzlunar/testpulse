#!/bin/sh
# Container start:
#   1. (as root) give the mounted folders (uploads, logs) to the app user
#   2. serve the web app under BASE_URL's path (e.g. /testpulse): <base href> and nginx rewrites
#   3. preflight: MongoDB, storage, SMTP and the log folder must work, otherwise the container stops
#   4. build the database indexes (RUN_DB_INDEXES=false to skip)
#   5. supervisor runs nginx and the API (as the app user)
set -e

APP_USER=testpulse
as_app() { if [ "$(id -u)" = "0" ]; then su-exec "$APP_USER" "$@"; else "$@"; fi; }

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
  as_app node dist/cli/db-indexes.js
fi

# --- 5. run ---------------------------------------------------------------------------------------
# supervisord stays root (it writes to the container's stdout) and starts nginx and the API as $APP_USER
exec supervisord -n -c /etc/supervisord.conf
