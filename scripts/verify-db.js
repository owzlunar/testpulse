// verify.sh restore: compare a restored database with the live one (mongosh --nodb --file).
// Reads only. Settings come from the environment (never the command line):
//   LIVE_URI / LIVE_DB, RESTORED_URI / RESTORED_DB, SAMPLE (documents compared per collection),
//   KEYS_OUT (file to write the restored `files` keys and sizes to, for the storage check)
//
// Prints one line per collection:
//   ok    counts, indexes and the sampled documents match
//   WARN  they differ the way the app changes data after a backup (new, edited or deleted documents)
//   FAIL  a collection or index is missing, a collection came back empty, or none of its compared
//         documents is in live as it was (the wrong backup or database)
// and exits 1 when any FAIL.

const fs = require('fs')

const live = new Mongo(process.env.LIVE_URI).getDB(process.env.LIVE_DB)
const restored = new Mongo(process.env.RESTORED_URI).getDB(process.env.RESTORED_DB)
const sample = parseInt(process.env.SAMPLE || '500', 10)

// written all the time by the app itself: differences there say nothing about the backup
const VOLATILE = new Set(['refresh_tokens', 'notifications', 'audit_logs', 'job_locks', 'preflight', 'invites'])

let fails = 0
let warns = 0
const report = (level, name, text) => {
  if (level === 'FAIL') fails++
  if (level === 'WARN') warns++
  print(`${level.padEnd(4)}  ${name.padEnd(24)} ${text}`)
}

const names = (db) => db.getCollectionNames().filter((n) => !n.startsWith('system.'))
const liveNames = new Set(names(live))
const restoredNames = new Set(names(restored))
const all = [...new Set([...liveNames, ...restoredNames])].sort()

const indexNames = (coll) =>
  coll
    .getIndexes()
    .map((i) => i.name)
    .sort()
    .join(',')

for (const name of all) {
  if (!restoredNames.has(name)) {
    report('FAIL', name, 'missing in the restored database (or made after the backup)')
    continue
  }
  if (!liveNames.has(name)) {
    report('WARN', name, 'only in the restored database: left there before the restore, or dropped from live since the backup')
    continue
  }
  const lc = live.getCollection(name)
  const rc = restored.getCollection(name)
  const liveCount = lc.countDocuments()
  const restoredCount = rc.countDocuments()

  // the restored documents, looked up in live by _id: same / changed since / gone from live
  let same = 0
  let changed = 0
  let gone = 0
  let checked = 0
  rc.find()
    .sort({ _id: 1 })
    .limit(sample)
    .forEach((doc) => {
      checked++
      const now = lc.findOne({ _id: doc._id })
      if (!now) gone++
      else if (EJSON.stringify(now, { relaxed: false }) === EJSON.stringify(doc, { relaxed: false })) same++
      else changed++
    })

  const text =
    `live ${liveCount} / restored ${restoredCount}` +
    (checked ? `; ${checked} compared: ${same} same, ${changed} changed since, ${gone} not in live` : '')

  if (indexNames(lc) !== indexNames(rc)) report('FAIL', name, `indexes differ (live: ${indexNames(lc)} | restored: ${indexNames(rc)})`)
  else if (VOLATILE.has(name)) report('ok', name, `${text} (written all the time: not compared)`)
  else if (restoredCount === 0 && liveCount > 0) report('FAIL', name, `${text}: came back empty`)
  else if (checked && !same) report('FAIL', name, `${text}: nothing matches live (another backup or database?)`)
  else if (liveCount !== restoredCount || changed || gone) report('WARN', name, `${text}: changes after the backup?`)
  else report('ok', name, text)
}

// the uploaded files the restored data points at, for verify.sh to look for in storage
if (process.env.KEYS_OUT) {
  const lines = restoredNames.has('files')
    ? restored.files.find({}, { key: 1, size: 1 }).toArray().map((f) => `${f.key}\t${f.size}`)
    : []
  fs.writeFileSync(process.env.KEYS_OUT, lines.length ? lines.join('\n') + '\n' : '')
}

print(`\ncollections: ${all.length}, FAIL ${fails}, WARN ${warns}`)
quit(fails ? 1 : 0)
