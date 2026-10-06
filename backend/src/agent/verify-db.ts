// verify.sh restore, where there is no mongosh (BACKUP_TOOLS=local, the backup agent): compare a restored
// database with the live one. The same checks and output as scripts/verify-db.js (keep them in step).
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

import { writeFileSync } from 'node:fs'
import { BSON, type Collection, type Db, type Document, MongoClient } from 'mongodb'

// written all the time by the app itself: differences there say nothing about the backup
const VOLATILE = new Set(['refresh_tokens', 'notifications', 'audit_logs', 'job_locks', 'preflight', 'invites'])

const ejson = (doc: unknown) => BSON.EJSON.stringify(doc, { relaxed: false })

export interface CheckResult {
  fails: number
  warns: number
  lines: string[]
}

async function names(db: Db): Promise<Set<string>> {
  const list = await db.listCollections({}, { nameOnly: true }).toArray()
  return new Set(list.map((c) => c.name).filter((n) => !n.startsWith('system.')))
}

async function indexNames(coll: Collection): Promise<string> {
  const list = await coll.indexes()
  return list
    .map((i) => String(i.name))
    .sort()
    .join(',')
}

/** compares the databases; writes the restored files' keys and sizes to keysOut when given */
export async function compareDatabases(live: Db, restored: Db, sample: number, keysOut?: string): Promise<CheckResult> {
  const result: CheckResult = { fails: 0, warns: 0, lines: [] }
  const report = (level: 'ok' | 'WARN' | 'FAIL', name: string, text: string) => {
    if (level === 'FAIL') result.fails++
    if (level === 'WARN') result.warns++
    result.lines.push(`${level.padEnd(4)}  ${name.padEnd(24)} ${text}`)
  }

  const liveNames = await names(live)
  const restoredNames = await names(restored)
  const all = [...new Set([...liveNames, ...restoredNames])].sort()

  for (const name of all) {
    if (!restoredNames.has(name)) {
      report('FAIL', name, 'missing in the restored database (or made after the backup)')
      continue
    }
    if (!liveNames.has(name)) {
      report('WARN', name, 'only in the restored database: left there before the restore, or dropped from live since the backup')
      continue
    }
    const lc = live.collection(name)
    const rc = restored.collection(name)
    const liveCount = await lc.countDocuments()
    const restoredCount = await rc.countDocuments()

    // the restored documents, looked up in live by _id: same / changed since / gone from live
    let same = 0
    let changed = 0
    let gone = 0
    let checked = 0
    for await (const doc of rc.find().sort({ _id: 1 }).limit(sample)) {
      checked++
      const now = await lc.findOne({ _id: doc._id })
      if (!now) gone++
      else if (ejson(now) === ejson(doc)) same++
      else changed++
    }

    const text =
      `live ${liveCount} / restored ${restoredCount}` +
      (checked ? `; ${checked} compared: ${same} same, ${changed} changed since, ${gone} not in live` : '')

    const liveIndexes = await indexNames(lc)
    const restoredIndexes = await indexNames(rc)
    if (liveIndexes !== restoredIndexes) report('FAIL', name, `indexes differ (live: ${liveIndexes} | restored: ${restoredIndexes})`)
    else if (VOLATILE.has(name)) report('ok', name, `${text} (written all the time: not compared)`)
    else if (restoredCount === 0 && liveCount > 0) report('FAIL', name, `${text}: came back empty`)
    else if (checked && !same) report('FAIL', name, `${text}: nothing matches live (another backup or database?)`)
    else if (liveCount !== restoredCount || changed || gone) report('WARN', name, `${text}: changes after the backup?`)
    else report('ok', name, text)
  }

  // the uploaded files the restored data points at, for verify.sh to look for in storage
  if (keysOut) {
    const files: Document[] = restoredNames.has('files')
      ? await restored
          .collection('files')
          .find({}, { projection: { key: 1, size: 1 } })
          .toArray()
      : []
    const lines = files.map((f) => `${f.key}\t${f.size}`)
    writeFileSync(keysOut, lines.length ? lines.join('\n') + '\n' : '')
  }

  result.lines.push('', `collections: ${all.length}, FAIL ${result.fails}, WARN ${result.warns}`)
  return result
}

async function main(): Promise<number> {
  const env = (key: string) => {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set`)
    return value
  }
  const liveClient = new MongoClient(env('LIVE_URI'))
  const restoredClient = new MongoClient(env('RESTORED_URI'))
  try {
    const result = await compareDatabases(
      liveClient.db(env('LIVE_DB')),
      restoredClient.db(env('RESTORED_DB')),
      parseInt(process.env.SAMPLE || '500', 10),
      process.env.KEYS_OUT || undefined,
    )
    process.stdout.write(result.lines.join('\n') + '\n')
    return result.fails ? 1 : 0
  } finally {
    await Promise.all([liveClient.close(), restoredClient.close()])
  }
}

// run as a script (verify.sh), not when imported (tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (err: Error) => {
      process.stderr.write(`verify-db: ${err.message}\n`)
      process.exit(2)
    },
  )
}
