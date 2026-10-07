#!/usr/bin/env bash
# Restore a TestPulse backup made by backup.sh. Run by hand in the deploy folder (where backup.env is).
#
#   scripts/restore.sh list
#   scripts/restore.sh --to-db <name> [--file <dump name>|latest] [--from src|off] [--uploads-to <dir>]
#                      [--uploads-from-off] [--overwrite-live]
#
#   --to-db        the database to restore into; its collections that are in the dump are replaced
#   --file         a dump name from `list` (e.g. testpulse-20261005-020000.archive.gz); default latest
#   --from         src = this side (default), off = the off-site copy
#   --uploads-to   STORAGE_DRIVER=local: also unpack the uploaded files of the same backup into this
#                  folder (empty or new). With minio the files stay in their versioned bucket.
#   --uploads-from-off  STORAGE_DRIVER=minio, with --from off: also copy the off-site files bucket
#                  into this side's (empty or new), e.g. on a new machine after the old one is lost
#   --overwrite-live  needed when --to-db is the live database (MONGODB_URI's); the app must be stopped
#
# Try a restore into a scratch database first, e.g. --to-db testpulse-test.

SCRIPT_NAME=restore
# shellcheck source=backup-common.sh
. "$(dirname "$0")/backup-common.sh"

APP_CONTAINER=${APP_CONTAINER:-testpulse}

usage() { sed -n '4,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

# the newest dump on one side (names sort by their stamp)
latest_dump() {
  mc find "$1/$BACKUP_BUCKET/db" --name '*.archive.gz' |
    sed -E "s#.*/##" | grep -E -- "-$STAMP_PATTERN\.archive\.gz$" |
    sed -E "s#^(.*)-($STAMP_PATTERN)\.archive\.gz\$#\2 &#" | sort | tail -n 1 | cut -d' ' -f2
}

# a login for restoring: no database in the path (namespaces come from --nsFrom / --nsTo), and the
# login database kept as authSource
restore_uri() {
  local uri=$1 db head query
  db=$(uri_db "$uri")
  head=${uri%%\?*}
  head=${head%/"$db"}
  query=''
  [[ "$uri" == *\?* ]] && query=${uri#*\?}
  [[ "&$query" == *"&authSource="* ]] || query="${query:+$query&}authSource=$db"
  printf '%s/?%s' "$head" "$query"
}

cmd_restore() {
  local to_db='' file=latest from=src uploads_to='' uploads_from_off=false overwrite_live=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --to-db) to_db=${2:-}; shift 2 ;;
      --file) file=${2:-}; shift 2 ;;
      --from) from=${2:-}; shift 2 ;;
      --uploads-to) uploads_to=${2:-}; shift 2 ;;
      --uploads-from-off) uploads_from_off=true; shift ;;
      --overwrite-live) overwrite_live=true; shift ;;
      -h | --help) usage ;;
      *) die "unknown option $1 (see --help)" ;;
    esac
  done
  [ -n "$to_db" ] || usage
  case "$from" in
    src) ;;
    off) [ -n "$OFFSITE_S3_URL" ] || die "--from off but OFFSITE_S3_URL is empty" ;;
    *) die "--from must be src or off" ;;
  esac
  if [ -n "$uploads_to" ]; then
    [ "$STORAGE_DRIVER" = local ] || die "--uploads-to is for STORAGE_DRIVER=local; with minio the files are in the bucket $UPLOADS_BUCKET"
    if [ -d "$uploads_to" ] && [ -n "$(ls -A "$uploads_to")" ]; then
      die "$uploads_to is not empty: unpack into a new folder, then swap it in"
    fi
  fi
  if $uploads_from_off; then
    [ "$STORAGE_DRIVER" = minio ] || die "--uploads-from-off is for STORAGE_DRIVER=minio; with local use --uploads-to"
    [ "$from" = off ] || die "--uploads-from-off needs --from off"
    # never over live files: a bucket that holds anything is someone's data
    if [ -n "$(mc ls "src/$UPLOADS_BUCKET" 2>/dev/null | head -n 1)" ]; then
      die "src/$UPLOADS_BUCKET is not empty: --uploads-from-off only fills a new or empty bucket"
    fi
  fi

  # the live database: only on purpose, with the app stopped
  local live_db
  live_db=$(uri_db "$MONGODB_URI")
  if [ "$to_db" = "$live_db" ]; then
    $overwrite_live || die "$to_db is the live database: add --overwrite-live (or restore into another database)"
    # the backup agent (BACKUP_TOOLS=local) restores the live database its own way (the app is put into maintenance)
    [ "$BACKUP_TOOLS" = docker ] || die "--overwrite-live runs on the server's command line (BACKUP_TOOLS=docker)"
    if docker ps --format '{{.Names}}' | grep -qx "$APP_CONTAINER"; then
      die "stop the app first: docker compose -f docker-compose.server.yml stop $APP_CONTAINER"
    fi
    [ -t 0 ] || die "--overwrite-live needs a terminal to confirm"
    local answer
    read -r -p "Replace the data in the live database '$to_db'? Type its name to go on: " answer
    [ "$answer" = "$to_db" ] || die "not confirmed, nothing changed"
  fi

  if [ "$file" = latest ]; then
    file=$(latest_dump "$from")
    [ -n "$file" ] || die "no backups in $from/$BACKUP_BUCKET/db"
  fi
  [[ "$file" =~ ^(.+)-($STAMP_PATTERN)\.archive\.gz$ ]] || die "not a dump name: $file"
  local from_db=${BASH_REMATCH[1]} stamp=${BASH_REMATCH[2]} tarball="uploads-${BASH_REMATCH[2]}.tar.gz"

  # fetch everything first: nothing changes unless the whole backup is there and readable
  log "fetching $from/$BACKUP_BUCKET/db/$file"
  mc cp "$from/$BACKUP_BUCKET/db/$file" "/work/$file" >/dev/null
  gzip -t "$WORK_DIR/$file" || die "the dump is damaged (not a valid gzip file)"
  if [ -n "$uploads_to" ]; then
    mc cp "$from/$BACKUP_BUCKET/uploads/$tarball" "/work/$tarball" >/dev/null
    gzip -t "$WORK_DIR/$tarball" || die "the uploaded files archive is damaged"
  fi

  # mongorestore logs every collection and index: keep that in a file, show the summary
  log "restoring $from_db -> $to_db"
  local restore_log="$WORK_DIR/mongorestore.log"
  if ! mongo_tool "$(restore_uri "${RESTORE_MONGODB_URI:-$MONGODB_URI}")" mongorestore \
    --archive="/work/$file" --gzip --drop \
    --nsInclude="$from_db.*" --nsFrom="$from_db.*" --nsTo="$to_db.*" 2>"$restore_log"; then
    tail -n 20 "$restore_log" >&2
    die "mongorestore failed"
  fi
  log "$(grep -E 'document\(s\) restored' "$restore_log" | tail -n 1 | sed -E 's/^[^[:space:]]+[[:space:]]+//')"

  if [ -n "$uploads_to" ]; then
    mkdir -p "$uploads_to"
    tar -xzf "$WORK_DIR/$tarball" -C "$uploads_to"
    log "uploaded files of $stamp unpacked into $uploads_to"
  fi
  if $uploads_from_off; then
    # the newest version of every file; `backup.sh init` turns versioning on afterwards
    log "copying off/$UPLOADS_BUCKET -> src/$UPLOADS_BUCKET"
    mc mb --ignore-existing "src/$UPLOADS_BUCKET" >/dev/null
    mc mirror "off/$UPLOADS_BUCKET" "src/$UPLOADS_BUCKET" >/dev/null || die "copying the uploaded files failed (the database is restored; run again with an empty bucket)"
    log "uploaded files copied into src/$UPLOADS_BUCKET ($(mc ls --recursive "src/$UPLOADS_BUCKET" | wc -l | tr -d ' ') files)"
  fi
  log "done: $file restored into $to_db"
}

case "${1:-}" in
  '' | -h | --help) usage ;;
  list) exec "$(dirname "$0")/backup.sh" list ;;
esac
load_env
cmd_restore "$@"
