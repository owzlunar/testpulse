# TestPulse: the web app (nginx) and the API (Node) in one image, run by supervisor.
#   docker build -t testpulse .
# nginx :8080 serves the web app and forwards /api and /health to the API on 127.0.0.1:8081
# (not exposed). Settings come from the environment: docker-compose.yml passes backend/.env and
# backend/.env.prod; the image never contains an env file.

ARG NODE_VERSION=22

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
RUN apk add --no-cache nginx supervisor tini su-exec \
  && addgroup -S testpulse && adduser -S -G testpulse -h /app testpulse \
  && mkdir -p /app/backend/storage/uploads /app/backend/logs /tmp/nginx \
  && chown -R testpulse:testpulse /app /tmp/nginx /var/lib/nginx /var/log/nginx

WORKDIR /app
COPY --from=frontend --chown=testpulse:testpulse /build/frontend/dist /app/frontend
# index.html is written from the template at start (BASE_URL's path in <base href>)
RUN mv /app/frontend/index.html /app/frontend/index.template.html
COPY --from=backend-deps --chown=testpulse:testpulse /build/backend/node_modules /app/backend/node_modules
COPY --from=backend --chown=testpulse:testpulse /build/backend/dist /app/backend/dist
COPY --chown=testpulse:testpulse backend/package.json /app/backend/package.json
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisor.conf /etc/supervisord.conf
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=8081 \
    STORAGE_LOCAL_ROOT=/app/backend/storage/uploads \
    LOG_DIR=/app/backend/logs \
    TRUST_PROXY=loopback

# only nginx; the API (8081) stays inside the container
EXPOSE 8080
# uploads (STORAGE_DRIVER=local) and log files: mount these to keep them on the host
VOLUME ["/app/backend/storage/uploads", "/app/backend/logs"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health/ready || exit 1

# root only fixes the mounted folders' owner and runs supervisor; the checks, nginx and the API run
# as "testpulse". tini forwards SIGTERM to supervisor, which stops nginx and the API gracefully
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
