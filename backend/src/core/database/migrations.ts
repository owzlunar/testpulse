import mongoose from 'mongoose'
import { logger } from '../config/logger.js'
import { withLock } from '../jobs/with-lock.js'

// Data migrations: changes to existing data (or data the app needs before its first request, like the
// first Admin) that run once per database, in order. Applied ones are recorded in `migrations`.
// Indexes are not migrations: `db-indexes` builds them from the schemas.
//
// A migration's id starts with its date and the module it belongs to, e.g.
// "20261002-01-user-initial-admin"; the list in src/migrations/index.ts is the order they run in.
// There is no "down": to undo, write a new migration (and test it on a copy of the data first).

export interface Migration {
  id: string
  description: string
  up(): Promise<void>
}

interface MigrationRecord {
  _id: string
  description: string
  appliedAt: Date
  durationMs: number
}

const LOCK_MS = 30 * 60 * 1000

const records = () => {
  if (!mongoose.connection.db) throw new Error('Migrations need an open database connection')
  return mongoose.connection.db.collection<MigrationRecord>('migrations')
}

function assertWellFormed(migrations: Migration[]): void {
  const ids = migrations.map((m) => m.id)
  if (new Set(ids).size !== ids.length) throw new Error('Two migrations share an id')
  if (ids.some((id, i) => i > 0 && id < ids[i - 1]!)) throw new Error('Migrations must be listed in id order')
}

export async function migrationStatus(migrations: Migration[]): Promise<{ id: string; description: string; appliedAt: Date | null }[]> {
  const applied = new Map((await records().find().toArray()).map((r) => [r._id, r.appliedAt]))
  return migrations.map((m) => ({ id: m.id, description: m.description, appliedAt: applied.get(m.id) ?? null }))
}

/** runs the pending migrations in order (one instance at a time); returns the ids it applied */
export async function migrate(migrations: Migration[]): Promise<string[]> {
  assertWellFormed(migrations)
  const ran = await withLock('migrations', LOCK_MS, async () => {
    const applied = new Set(
      (
        await records()
          .find({}, { projection: { _id: 1 } })
          .toArray()
      ).map((r) => r._id),
    )
    const done: string[] = []
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue
      const started = Date.now()
      logger.info(`[migrate] ${migration.id}: ${migration.description}`)
      // stops at the first failure: later migrations may depend on this one
      await migration.up()
      await records().insertOne({ _id: migration.id, description: migration.description, appliedAt: new Date(), durationMs: Date.now() - started })
      done.push(migration.id)
    }
    return done
  })
  if (ran === null) throw new Error('Another instance is running the migrations; try again when it has finished')
  return ran
}
