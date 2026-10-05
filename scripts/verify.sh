#!/usr/bin/env bash
# Check the backups. Reads only: changes nothing in MongoDB or MinIO. Run in the deploy folder.
#
#   scripts/verify.sh [storage]
#       the backup buckets on both sides: object lock / versioning on, every object on this side also
#       off-site with the same size, the newest dump recent and readable (fetched from off-site)
#   scripts/verify.sh restore --db <restored database> [--sample N] [--from src|off] [--uploads-dir DIR]
#       after restore.sh: compare that database with the live one (collections, indexes, counts and
#       up to N documents per collection, default 500), then look for every uploaded file it points
#       at: STORAGE_DRIVER=minio in the uploads bucket on --from (default off), local in --uploads-dir
#       (the folder restore.sh --uploads-to filled)
#
# Lines start with ok / WARN / FAIL; exit 1 when anything FAILs. WARN is what changes after a backup
# (new or edited data) or a backup older than VERIFY_MAX_AGE_HOURS (backup.env, default 26).

SCRIPT_NAME=verify
# byte order for sort / comm / join, whatever the locale
export LC_ALL=C
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=backup-common.sh
. "$SCRIPT_DIR/backup-common.sh"

FAILS=0
WARNS=0
report() {
  case "$1" in FAIL) FAILS=$((FAILS + 1)) ;; WARN) WARNS=$((WARNS + 1)) ;; esac
  printf '%-4s  %s\n' "$1" "$2"
}
usage() { sed -n '4,15p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

# "<key>\t<size>" for every current object in a bucket, sorted (empty when the bucket is empty)
object_list() {
  mc ls --recursive --json "$1" |
    sed -nE 's/.*"size":([0-9]+).*"key":"([^"]*)".*/\2\t\1/p' | sort
}

# every object on this side must be off-site with the same size (off-site may hold more: it keeps
# what expired here a little longer)
compare_sides() {
  local bucket=$1 here there missing differ count
  here=$(object_list "src/$bucket") || { report FAIL "src/$bucket: cannot list"; return; }
  there=$(object_list "off/$bucket") || { report FAIL "off/$bucket: cannot list"; return; }
  count=$(printf '%s' "$here" | grep -c . || true)
  missing=$(comm -23 <(printf '%s\n' "$here" | cut -f1) <(printf '%s\n' "$there" | cut -f1) | grep . || true)
  differ=$(join -t $'\t' <(printf '%s\n' "$here") <(printf '%s\n' "$there") | awk -F'\t' '$2 != $3 { print $1 }')
  if [ -n "$missing" ]; then
    report FAIL "$bucket: $(printf '%s\n' "$missing" | wc -l | tr -d ' ') object(s) not off-site, e.g. $(printf '%s\n' "$missing" | head -n 3 | tr '\n' ' ')(run backup.sh)"
  elif [ -n "$differ" ]; then
    report FAIL "$bucket: size differs off-site: $(printf '%s\n' "$differ" | head -n 3 | tr '\n' ' ')"
  else
    report ok "$bucket: all $count object(s) off-site, same sizes"
  fi
}

check_lock() {
  if mc retention info --default "$1/$BACKUP_BUCKET" >/dev/null 2>&1; then
    report ok "$1/$BACKUP_BUCKET: object lock on"
  else
    report FAIL "$1/$BACKUP_BUCKET: no object lock (missing bucket? run backup.sh init)"
  fi
}

check_versioning() {
  if mc version info "$1/$UPLOADS_BUCKET" 2>/dev/null | grep -qi 'enabled'; then
    report ok "$1/$UPLOADS_BUCKET: versioning on"
  else
    report FAIL "$1/$UPLOADS_BUCKET: versioning off (run backup.sh init)"
  fi
}

# seconds since a YYYYMMDD-HHMMSS stamp (local time), on GNU and BSD date
stamp_age() {
  local epoch
  epoch=$(date -d "${1:0:8} ${1:9:2}:${1:11:2}:${1:13:2}" +%s 2>/dev/null ||
    date -j -f '%Y%m%d-%H%M%S' "$1" +%s 2>/dev/null) || return 1
  echo $(($(date +%s) - epoch))
}

cmd_storage() {
  local max_hours=${VERIFY_MAX_AGE_HOURS:-26} newest stamp age side=src
  check_lock src
  [ "$STORAGE_DRIVER" = minio ] && check_versioning src
  if [ -n "$OFFSITE_S3_URL" ]; then
    side=off
    check_lock off
    [ "$STORAGE_DRIVER" = minio ] && check_versioning off
    compare_sides "$BACKUP_BUCKET"
    [ "$STORAGE_DRIVER" = minio ] && compare_sides "$UPLOADS_BUCKET"
  else
    report WARN "OFFSITE_S3_URL is empty: no off-site copy to check"
  fi

  # the newest dump: recent enough, and a whole gzip file where it matters (off-site when there is one)
  newest=$(object_list "$side/$BACKUP_BUCKET" | cut -f1 | grep -E "^db/.+-$STAMP_PATTERN\.archive\.gz$" |
    sed -E "s#^db/(.*)-($STAMP_PATTERN)\.archive\.gz\$#\2 &#" | sort | tail -n 1 | cut -d' ' -f2 || true)
  if [ -z "$newest" ]; then
    report FAIL "$side/$BACKUP_BUCKET: no database dump at all"
    return
  fi
  [[ "$newest" =~ ($STAMP_PATTERN)\.archive\.gz$ ]] && stamp=${BASH_REMATCH[1]}
  if age=$(stamp_age "$stamp"); then
    if [ "$age" -gt $((max_hours * 3600)) ]; then
      report WARN "newest dump $newest is $((age / 3600)) hours old (more than $max_hours)"
    else
      report ok "newest dump $newest is $((age / 3600)) hours old"
    fi
  fi
  mc cp "$side/$BACKUP_BUCKET/$newest" "/work/newest.archive.gz" >/dev/null || { report FAIL "cannot fetch $side/$BACKUP_BUCKET/$newest"; return; }
  if gzip -t "$WORK_DIR/newest.archive.gz" 2>/dev/null; then
    report ok "$side/$BACKUP_BUCKET/$newest: readable ($(wc -c <"$WORK_DIR/newest.archive.gz" | tr -d ' ') bytes)"
  else
    report FAIL "$side/$BACKUP_BUCKET/$newest: damaged (not a valid gzip file)"
  fi
}

cmd_restore() {
  local db='' sample=500 from=off uploads_dir=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --db) db=${2:-}; shift 2 ;;
      --sample) sample=${2:-}; shift 2 ;;
      --from) from=${2:-}; shift 2 ;;
      --uploads-dir) uploads_dir=${2:-}; shift 2 ;;
      -h | --help) usage ;;
      *) die "unknown option $1 (see --help)" ;;
    esac
  done
  [ -n "$db" ] || usage
  [[ "$sample" =~ ^[0-9]+$ ]] || die "--sample must be a number"
  [ "$from" = off ] && [ -z "$OFFSITE_S3_URL" ] && from=src
  case "$from" in src | off) ;; *) die "--from must be src or off" ;; esac

  local live_db
  live_db=$(uri_db "$MONGODB_URI")
  [ "$db" != "$live_db" ] || die "--db is the live database: give the database restore.sh restored into"

  # 1. the database, compared in mongosh (logins passed as environment, never as arguments)
  echo "== database: $db compared with the live $live_db"
  local keys="$WORK_DIR/file-keys.tsv" status=0
  LIVE_URI=$MONGODB_URI LIVE_DB=$live_db RESTORED_URI=${RESTORE_MONGODB_URI:-$MONGODB_URI} RESTORED_DB=$db \
    SAMPLE=$sample KEYS_OUT=/work/file-keys.tsv \
    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e LIVE_URI -e LIVE_DB -e RESTORED_URI -e RESTORED_DB -e SAMPLE -e KEYS_OUT \
    "${DOCKER_NET_ARGS[@]}" \
    -v "$SCRIPT_DIR:/scripts:ro" -v "$WORK_DIR:/work" \
    "$MONGO_TOOLS_IMAGE" mongosh --quiet --nodb --file /scripts/verify-db.js | tee "$WORK_DIR/db-check.txt" || status=$?
  # count its ok / WARN / FAIL lines with ours
  local db_fails db_warns
  db_fails=$(grep -c '^FAIL' "$WORK_DIR/db-check.txt" || true)
  db_warns=$(grep -c '^WARN' "$WORK_DIR/db-check.txt" || true)
  FAILS=$((FAILS + db_fails))
  WARNS=$((WARNS + db_warns))
  if [ "$status" -ne 0 ] && [ "$db_fails" -eq 0 ] || [ ! -f "$keys" ]; then
    report FAIL "the database check did not finish"
    return
  fi

  # 2. every uploaded file the restored data points at must be in storage, with the same size
  echo "== uploaded files the restored data points at"
  local total missing=0 wrong=0 key size found examples=''
  total=$(grep -c . "$keys" || true)
  if [ "$total" -eq 0 ]; then
    report ok "no uploaded files in the restored data"
    return
  fi
  if [ "$STORAGE_DRIVER" = minio ]; then
    local listing
    listing=$(object_list "$from/$UPLOADS_BUCKET") || { report FAIL "$from/$UPLOADS_BUCKET: cannot list"; return; }
    while IFS=$'\t' read -r key size; do
      found=$(printf '%s\n' "$listing" | awk -F'\t' -v k="$key" '$1 == k { print $2; exit }')
      if [ -z "$found" ]; then missing=$((missing + 1)); examples+="$key "
      elif [ "$found" != "$size" ]; then wrong=$((wrong + 1)); examples+="$key "; fi
    done <"$keys"
    local where="$from/$UPLOADS_BUCKET"
  else
    [ -n "$uploads_dir" ] || { report WARN "STORAGE_DRIVER=local: give --uploads-dir (the folder restore.sh --uploads-to filled) to check $total file(s)"; return; }
    [ -d "$uploads_dir" ] || die "--uploads-dir $uploads_dir does not exist"
    while IFS=$'\t' read -r key size; do
      if [ ! -f "$uploads_dir/$key" ]; then missing=$((missing + 1)); examples+="$key "
      elif [ "$(wc -c <"$uploads_dir/$key" | tr -d ' ')" != "$size" ]; then wrong=$((wrong + 1)); examples+="$key "; fi
    done <"$keys"
    local where="$uploads_dir"
  fi
  if [ $((missing + wrong)) -eq 0 ]; then
    report ok "all $total file(s) are in $where with the right size"
  else
    report FAIL "$where: $missing of $total file(s) missing, $wrong with another size, e.g. $(printf '%s' "$examples" | cut -d' ' -f1-3)"
  fi
}

case "${1:-storage}" in
  -h | --help) usage ;;
esac
load_env
case "${1:-storage}" in
  storage) cmd_storage ;;
  restore) shift; cmd_restore "$@" ;;
  *) usage ;;
esac
echo
if [ "$FAILS" -gt 0 ]; then
  log "FAILED ($FAILS failing check(s), $WARNS warning(s))"
  exit 1
fi
log "passed ($WARNS warning(s))"
