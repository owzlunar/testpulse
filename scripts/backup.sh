#!/usr/bin/env bash
# Back up TestPulse: the MongoDB database and the uploaded files, into a MinIO / S3 bucket that
# nobody can delete from before BACKUP_RETENTION_DAYS, then mirrored off-site. Run by hand in the
# deploy folder (where backup.env is); README.md "สำรองและกู้คืนข้อมูล" has the steps.
#
#   scripts/backup.sh init   once: create the buckets (object lock, versioning, expiry); safe to re-run
#   scripts/backup.sh        back up now
#   scripts/backup.sh list   the backups on this side and off-site

SCRIPT_NAME=backup
# shellcheck source=backup-common.sh
. "$(dirname "$0")/backup-common.sh"

# lifecycle rules, imported whole so a re-run never stacks duplicates
#   backups: expire after N days; the expired version (its lock ran out) is removed a day later
#   uploaded files (STORAGE_DRIVER=minio): an overwritten or deleted file's old version is kept N days
backup_lifecycle() {
  printf '{"Rules":[{"ID":"testpulse-backup-expiry","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":%d},"NoncurrentVersionExpiration":{"NoncurrentDays":1}}]}' "$BACKUP_RETENTION_DAYS"
}
uploads_lifecycle() {
  printf '{"Rules":[{"ID":"testpulse-old-versions","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"ExpiredObjectDeleteMarker":true},"NoncurrentVersionExpiration":{"NoncurrentDays":%d}}]}' "$BACKUP_RETENTION_DAYS"
}

# the backup bucket on one side: locked, every new object kept N days, then expired
init_backup_bucket() {
  local target="$1/$BACKUP_BUCKET"
  mc mb --ignore-existing --with-lock "$target" >/dev/null
  # lock can only be turned on when a bucket is made: one made earlier without it can't take locked copies
  mc retention info --default "$target" >/dev/null 2>&1 ||
    die "$target exists without object lock: make it again with lock (move what is in it first)"
  mc retention set --default GOVERNANCE "${BACKUP_RETENTION_DAYS}d" "$target" >/dev/null
  backup_lifecycle | mc -i ilm import "$target" >/dev/null
  log "$target: object lock GOVERNANCE ${BACKUP_RETENTION_DAYS}d, expires after ${BACKUP_RETENTION_DAYS}d"
}

# the uploaded-files bucket on one side: versioned, old versions kept N days
init_uploads_bucket() {
  local target="$1/$UPLOADS_BUCKET"
  mc mb --ignore-existing "$target" >/dev/null
  mc version enable "$target" >/dev/null
  uploads_lifecycle | mc -i ilm import "$target" >/dev/null
  log "$target: versioning on, old versions kept ${BACKUP_RETENTION_DAYS}d"
}

cmd_init() {
  init_backup_bucket src
  [ "$STORAGE_DRIVER" = minio ] && init_uploads_bucket src
  if [ -n "$OFFSITE_S3_URL" ]; then
    init_backup_bucket off
    [ "$STORAGE_DRIVER" = minio ] && init_uploads_bucket off
  else
    log "OFFSITE_S3_URL is empty: no off-site copy"
  fi
  log "ready"
}

size_of() { wc -c <"$1" | tr -d ' '; }

# object names in a bucket, sorted (empty for an empty bucket)
keys_of() {
  mc ls --recursive --json "$1" | sed -nE 's/.*"key":"([^"]*)".*/\1/p' | sort
}

# The backup bucket goes off-site from files, never S3 to S3: a copy between servers carries the source's
# object lock, and setting that would need s3:PutObjectRetention, which also lets a login lift a lock.
# The off-site login has no such right (deploy/README.md); each file gets the off-site bucket's own lock.
# Also sends whatever is still missing there (e.g. a run when the off-site machine was down).
offsite_backups() {
  local here there key sent=0
  here=$(keys_of "src/$BACKUP_BUCKET") || return 1
  there=$(keys_of "off/$BACKUP_BUCKET") || return 1
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    mc cp "src/$BACKUP_BUCKET/$key" "/work/offsite.part" >/dev/null || return 1
    mc cp "/work/offsite.part" "off/$BACKUP_BUCKET/$key" >/dev/null || return 1
    rm -f "$WORK_DIR/offsite.part"
    sent=$((sent + 1))
  done < <(comm -23 <(printf '%s\n' "$here" | grep .) <(printf '%s\n' "$there" | grep .) || true)
  OFFSITE_SENT=$sent
}

cmd_run() {
  local stamp db dump tarball
  stamp=$(date '+%Y%m%d-%H%M%S')
  db=$(uri_db "$MONGODB_URI")

  # 1. the database: into a file first, so a failed dump never lands (locked) in the bucket
  dump="$db-$stamp.archive.gz"
  log "dumping database $db"
  mongo_tool "$MONGODB_URI" mongodump --quiet --archive="/work/$dump" --gzip || die "mongodump failed"
  [ -s "$WORK_DIR/$dump" ] || die "mongodump wrote nothing"
  gzip -t "$WORK_DIR/$dump" || die "the dump is not a valid gzip file"
  mc cp "/work/$dump" "src/$BACKUP_BUCKET/db/$dump" >/dev/null || die "could not upload the dump to $BACKUP_S3_URL"
  log "saved src/$BACKUP_BUCKET/db/$dump ($(size_of "$WORK_DIR/$dump") bytes)"
  if [ -n "$OFFSITE_S3_URL" ]; then
    mc cp "/work/$dump" "off/$BACKUP_BUCKET/db/$dump" >/dev/null || die "off-site copy of the dump failed (the backup itself is saved on this side)"
  fi

  # 2. uploaded files: on disk -> packed into the bucket; in MinIO -> already there, versioned
  if [ "$STORAGE_DRIVER" = local ]; then
    [ -d "$UPLOADS_DIR" ] || die "UPLOADS_DIR $UPLOADS_DIR does not exist"
    tarball="uploads-$stamp.tar.gz"
    tar -czf "$WORK_DIR/$tarball" -C "$UPLOADS_DIR" .
    mc cp "/work/$tarball" "src/$BACKUP_BUCKET/uploads/$tarball" >/dev/null || die "could not upload the files archive to $BACKUP_S3_URL"
    log "saved src/$BACKUP_BUCKET/uploads/$tarball ($(size_of "$WORK_DIR/$tarball") bytes)"
    if [ -n "$OFFSITE_S3_URL" ]; then
      mc cp "/work/$tarball" "off/$BACKUP_BUCKET/uploads/$tarball" >/dev/null || die "off-site copy of the files archive failed (the backup itself is saved on this side)"
    fi
  fi

  # 3. off-site: copy what is new (never removing: a deletion here must not reach the copy)
  if [ -n "$OFFSITE_S3_URL" ]; then
    offsite_backups || die "off-site copy of $BACKUP_BUCKET failed (the backup itself is saved on this side)"
    if [ "${OFFSITE_SENT:-0}" -gt 0 ]; then log "copied $BACKUP_BUCKET off-site (+$OFFSITE_SENT that were missing there)"; else log "copied $BACKUP_BUCKET off-site"; fi
    if [ "$STORAGE_DRIVER" = minio ]; then
      mc mirror --overwrite "src/$UPLOADS_BUCKET" "off/$UPLOADS_BUCKET" >/dev/null || die "off-site copy of $UPLOADS_BUCKET failed (the backup itself is saved on this side)"
      log "mirrored $UPLOADS_BUCKET off-site"
    fi
  else
    log "OFFSITE_S3_URL is empty: no off-site copy made"
  fi
  log "done ($stamp)"
}

cmd_list() {
  echo "== this side: src/$BACKUP_BUCKET"
  mc ls --recursive "src/$BACKUP_BUCKET"
  if [ -n "$OFFSITE_S3_URL" ]; then
    echo "== off-site: off/$BACKUP_BUCKET"
    mc ls --recursive "off/$BACKUP_BUCKET"
  fi
}

load_env
case "${1:-run}" in
  init) cmd_init ;;
  run) cmd_run ;;
  list) cmd_list ;;
  *) die "usage: $0 [init|run|list]" ;;
esac
