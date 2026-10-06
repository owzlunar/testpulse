# TestPulse: the web app (nginx) and the API (Node) in one image, run by supervisor.
#   docker build -t testpulse .
# nginx :8080 serves the web app and forwards /api and /health to the API on 127.0.0.1:8081
# (not exposed). Settings come from the environment: docker-compose.yml passes backend/.env and
# backend/.env.prod; the image never contains an env file.

ARG NODE_VERSION=22
# the MinIO client the backup agent uses (a static binary, copied from its pinned image)
ARG MC_IMAGE=minio/mc:RELEASE.2025-08-13T08-35-41Z

FROM ${MC_IMAGE} AS mc

# --- frontend: static build (relative URLs: works under any public path) ------------------------
FROM node:${NODE_VERSION}-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- backend: compile TypeScript ----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS backend
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build

# --- backend: production dependencies only ------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS backend-deps
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# --- runtime ------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine
# bash, coreutils, mongodb-tools, mc: the backup agent runs scripts/ with the tools installed here
# (BACKUP_TOOLS=local, PRD 5.15); it runs as "backup", apart from the app's "testpulse"
RUN apk add --no-cache nginx supervisor tini su-exec bash coreutils mongodb-tools \
  && addgroup -S testpulse && adduser -S -G testpulse -h /app testpulse \
  && addgroup -S backup && adduser -S -G backup -h /var/lib/testpulse-backup backup \
  && mkdir -p /app/backend/storage/uploads /app/backend/logs /tmp/nginx /var/lib/testpulse-backup \
  && chown -R testpulse:testpulse /app /tmp/nginx /var/lib/nginx /var/log/nginx \
  && chown backup:backup /var/lib/testpulse-backup && chmod 700 /var/lib/testpulse-backup
COPY --from=mc /usr/bin/mc /usr/local/bin/mc

WORKDIR /app
COPY --from=frontend --chown=testpulse:testpulse /build/frontend/dist /app/frontend
# index.html is written from the template at start (BASE_URL's path in <base href>)
RUN mv /app/frontend/index.html /app/frontend/index.template.html
COPY --from=backend-deps --chown=testpulse:testpulse /build/backend/node_modules /app/backend/node_modules
COPY --from=backend --chown=testpulse:testpulse /build/backend/dist /app/backend/dist
COPY --chown=testpulse:testpulse backend/package.json /app/backend/package.json
# the backup scripts: the agent's, and the same files the command line uses on the server
COPY --chmod=755 scripts/ /app/scripts/
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisor.conf /etc/supervisord.conf
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --chmod=755 docker/exit-on-fatal.sh /usr/local/bin/exit-on-fatal.sh

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=8081 \
    STORAGE_LOCAL_ROOT=/app/backend/storage/uploads \
    LOG_DIR=/app/backend/logs \
    TRUST_PROXY=loopback

# only nginx; the API (8081) stays inside the container
EXPOSE 8080
# uploads (STORAGE_DRIVER=local) and log files: mount these to keep them on the host; the backup
# agent's state (settings, job history, logs) when it is on
VOLUME ["/app/backend/storage/uploads", "/app/backend/logs", "/var/lib/testpulse-backup"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health/ready || exit 1

# root only fixes the mounted folders' owner and runs supervisor; the checks, nginx and the API run
# as "testpulse". tini forwards SIGTERM to supervisor, which stops nginx and the API gracefully
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
