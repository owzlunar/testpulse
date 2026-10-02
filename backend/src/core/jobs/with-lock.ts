import { hostname } from 'node:os'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { logger } from '../config/logger.js'

// Runs `fn` on one instance only: the first to take the lease in `job_locks` runs, the others skip.
// The lease expires (`ttlMs`) so a crashed instance never holds it forever; keep ttlMs above the
// job's longest run.

const owner = `${process.env.HOSTNAME ?? hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`
let indexReady = false

interface LockDoc {
  _id: string
  owner: string
  expiresAt: Date
}

export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const db = mongoose.connection.db
  if (!db || mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    logger.warn(`[lock] database not ready, skipping "${name}"`)
    return null
  }
  const locks = db.collection<LockDoc>('job_locks')
  if (!indexReady) {
    await locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    indexReady = true
  }

  const now = new Date()
  let acquired = false
  try {
    const lock = await locks.findOneAndUpdate(
      { _id: name, $or: [{ expiresAt: { $lt: now } }, { owner }] },
      { $set: { owner, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: 'after' },
    )
    acquired = lock?.owner === owner
  } catch (err) {
    // E11000: another instance holds an unexpired lease (the upsert lost the race)
    if ((err as { code?: number }).code !== 11000) throw err
  }
  if (!acquired) {
    logger.info(`[lock] "${name}" is running on another instance, skipped`)
    return null
  }
  try {
    return await fn()
  } finally {
    await locks.deleteOne({ _id: name, owner }).catch((err: Error) => logger.warn(`[lock] could not release "${name}": ${err.message}`))
  }
}
