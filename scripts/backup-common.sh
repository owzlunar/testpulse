# shellcheck shell=bash
# Shared by backup.sh and restore.sh (sourced, not run). Reads backup.env and wraps the tools, which
# run in containers (BACKUP_TOOLS=docker, the default: mongodump / mongorestore from MONGO_TOOLS_IMAGE,
# mc from MC_IMAGE) or are installed where the scripts run (BACKUP_TOOLS=local: the backup agent in the
# TestPulse image, which has no docker).
#
# Passwords never go on a command line (other users of the machine could read them in `ps`):
# mc gets its servers through MC_HOST_<alias> variables, the Mongo tools through a config file
# (mode 600) in the work folder, removed on exit.

set -euo pipefail

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$SCRIPT_NAME" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# --- settings -------------------------------------------------------------------------------------
load_env() {
  local file=${BACKUP_ENV:-./backup.env}
  [ -f "$file" ] || die "no settings file $file (copy scripts/backup.env.example to backup.env, or set BACKUP_ENV)"
  # KEY=value lines taken as they are, like docker's env_file (not sourced: a MongoDB URI has `&`)
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in '' | \#*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] && [ "$key" != "$line" ] || die "$file: not a KEY=value line: ${line:0:40}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
    export "$key=$value"
  done <"$file"

  : "${MONGODB_URI:?MONGODB_URI is not set in $file}"
  : "${BACKUP_S3_URL:?BACKUP_S3_URL is not set in $file}"
  : "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is not set in $file}"
  : "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is not set in $file}"
  BACKUP_BUCKET=${BACKUP_BUCKET:-testpulse-backups}
  OFFSITE_S3_URL=${OFFSITE_S3_URL:-}
  STORAGE_DRIVER=${STORAGE_DRIVER:-local}
  UPLOADS_DIR=${UPLOADS_DIR:-./docker-data/uploads}
  UPLOADS_BUCKET=${UPLOADS_BUCKET:-testpulse}
  BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
  BACKUP_WORK_DIR=${BACKUP_WORK_DIR:-./docker-data/backup-work}
  MONGO_TOOLS_IMAGE=${MONGO_TOOLS_IMAGE:-mongo:8}
  MC_IMAGE=${MC_IMAGE:-minio/mc:RELEASE.2025-08-13T08-35-41Z}
  BACKUP_DOCKER_NETWORK=${BACKUP_DOCKER_NETWORK:-}
  BACKUP_TOOLS=${BACKUP_TOOLS:-docker}

  case "$STORAGE_DRIVER" in local | minio) ;; *) die "STORAGE_DRIVER must be local or minio, not '$STORAGE_DRIVER'" ;; esac
  [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_RETENTION_DAYS must be a whole number of days"
  if [ -n "$OFFSITE_S3_URL" ]; then
    : "${OFFSITE_S3_ACCESS_KEY:?OFFSITE_S3_ACCESS_KEY is not set in $file}"
    : "${OFFSITE_S3_SECRET_KEY:?OFFSITE_S3_SECRET_KEY is not set in $file}"
  fi
  case "$BACKUP_TOOLS" in
    docker) command -v docker >/dev/null || die "docker is not installed" ;;
    local)
      local tool
      for tool in mc mongodump mongorestore; do type -P "$tool" >/dev/null || die "BACKUP_TOOLS=local: $tool is not installed"; done
      ;;
    *) die "BACKUP_TOOLS must be docker or local, not '$BACKUP_TOOLS'" ;;
  esac

  # the tool containers join the compose network (to reach mongodb / minio by service name), or else
  # reach this machine as host.docker.internal
  DOCKER_NET_ARGS=(--add-host host.docker.internal:host-gateway)
  if [ "$BACKUP_TOOLS" = docker ] && [ -n "$BACKUP_DOCKER_NETWORK" ]; then
    docker network inspect "$BACKUP_DOCKER_NETWORK" >/dev/null 2>&1 ||
      die "BACKUP_DOCKER_NETWORK: no docker network '$BACKUP_DOCKER_NETWORK' (start the services first; \`docker network ls\`)"
    DOCKER_NET_ARGS+=(--network "$BACKUP_DOCKER_NETWORK")
  fi

  # mc reaches its servers through these: alias `src` (this side) and `off` (off-site)
  MC_HOST_src=$(mc_host_url "$BACKUP_S3_URL" "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY")
  export MC_HOST_src
  if [ -n "$OFFSITE_S3_URL" ]; then
    MC_HOST_off=$(mc_host_url "$OFFSITE_S3_URL" "$OFFSITE_S3_ACCESS_KEY" "$OFFSITE_S3_SECRET_KEY")
    export MC_HOST_off
  fi

  mkdir -p "$BACKUP_WORK_DIR"
  WORK_DIR=$(cd "$BACKUP_WORK_DIR" && pwd)
  trap cleanup EXIT
}

cleanup() {
  [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ] && find "$WORK_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  return 0
}

# --- MinIO / S3 -----------------------------------------------------------------------------------
urlencode() {
  local s=$1 out='' c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in [a-zA-Z0-9.~_-]) out+=$c ;; *) out+=$(printf '%%%02X' "'$c") ;; esac
  done
  printf '%s' "$out"
}

# http://host:9000 + keys -> http://key:secret@host:9000 (what MC_HOST_<alias> expects)
mc_host_url() {
  local url=$1 scheme rest
  scheme=${url%%://*}
  rest=${url#*://}
  [ "$scheme" != "$url" ] || die "S3 URL must start with http:// or https:// ($url)"
  printf '%s://%s:%s@%s' "$scheme" "$(urlencode "$2")" "$(urlencode "$3")" "${rest%/}"
}

# the tools see the work folder as /work (a container mount); installed tools get the real path
local_paths() {
  local arg
  LOCAL_ARGS=()
  for arg in "$@"; do
    case "$arg" in
      /work/*) LOCAL_ARGS+=("$WORK_DIR/${arg#/work/}") ;;
      --*=/work/*) LOCAL_ARGS+=("${arg%%=*}=$WORK_DIR/${arg#*=/work/}") ;;
      *) LOCAL_ARGS+=("$arg") ;;
    esac
  done
}

# mc in a container, with the work folder at /work. Pass -i first to give it stdin.
mc() {
  local stdin=()
  if [ "${1:-}" = "-i" ]; then stdin=(-i); shift; fi
  if [ "$BACKUP_TOOLS" = local ]; then
    local_paths "$@"
    command mc --config-dir "$WORK_DIR/.mc" --quiet --no-color "${LOCAL_ARGS[@]}"
    return
  fi
  # ${a[@]+...}: an empty array under `set -u` is an error in bash 3.2 (macOS)
  docker run --rm ${stdin[@]+"${stdin[@]}"} \
    -e MC_HOST_src -e MC_HOST_off \
    "${DOCKER_NET_ARGS[@]}" \
    -v "$WORK_DIR:/work" \
    "$MC_IMAGE" --quiet --no-color "$@"
}

# --- MongoDB --------------------------------------------------------------------------------------
# the database name in a mongodb:// URI (between the host list and the `?`)
uri_db() {
  local rest=${1#*://}
  rest=${rest#*/}
  rest=${rest%%\?*}
  [ -n "$rest" ] && [ "$rest" != "$1" ] || die "the MongoDB URI names no database"
  printf '%s' "$rest"
}

# mongodump / mongorestore in a container, logged in through a config file; the work folder is /work
mongo_tool() {
  local uri=$1 tool=$2
  shift 2
  local config="$WORK_DIR/.mongo-$$.yaml"
  (umask 077 && printf "uri: '%s'\n" "${uri//\'/\'\'}" >"$config")
  local status=0
  if [ "$BACKUP_TOOLS" = local ]; then
    local_paths "$@"
    "$tool" --config="$config" "${LOCAL_ARGS[@]}" || status=$?
    rm -f "$config"
    return "$status"
  fi
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    "${DOCKER_NET_ARGS[@]}" \
    -v "$WORK_DIR:/work" \
    "$MONGO_TOOLS_IMAGE" "$tool" --config="/work/$(basename "$config")" "$@" || status=$?
  rm -f "$config"
  return "$status"
}

# backup object names: <bucket>/db/<database>-<YYYYMMDD-HHMMSS>.archive.gz
#                      <bucket>/uploads/uploads-<YYYYMMDD-HHMMSS>.tar.gz (STORAGE_DRIVER=local)
# shellcheck disable=SC2034 # used by restore.sh
STAMP_PATTERN='[0-9]{8}-[0-9]{6}'
