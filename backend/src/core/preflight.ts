import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { config } from './config/env.js'
import { logger } from './config/logger.js'
import { getMailer } from './mail/mailer.js'
import { storage } from './storage/index.js'

// Start-up checks: every outside service the API needs must answer before it takes traffic, so a
// wrong MONGODB_URI, storage or SMTP setting stops the start with a clear reason instead of failing
// on the first user request. Expects the database connection to be open.

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what}: no answer within ${ms / 1000} s`)), ms).unref()),
  ])

async function check(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await fn() }
  } catch (err) {
    return { name, ok: false, detail: (err as Error).message }
  }
}

const readAll = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

export async function runPreflight(): Promise<CheckResult[]> {
  return Promise.all([
    check('database', async () => {
      const db = mongoose.connection.db
      if (!db) throw new Error('not connected')
      await withTimeout(db.admin().ping(), 5000, 'ping')
      // a write round trip: a login that may only read (or another database) passes a ping, then the
      // indexes and migrations fail
      const probe = db.collection('preflight')
      const _id = randomBytes(6).toString('hex')
      try {
        await withTimeout(probe.insertOne({ _id, at: new Date() } as never), 5000, 'write')
        await probe.deleteOne({ _id } as never)
      } catch (err) {
        throw new Error(`${mongoose.connection.name}: cannot write (the MongoDB user needs readWrite on this database): ${(err as Error).message}`, {
          cause: err,
        })
      }
      return mongoose.connection.name
    }),
    check(`storage (${config.storage.driver})`, async () => {
      // a real round trip: create the bucket / folder, write, read back, delete
      const store = storage()
      await withTimeout(store.init(), 10_000, 'init')
      const key = `.preflight/${randomBytes(6).toString('hex')}`
      const body = Buffer.from('preflight')
      await store.put({ key, body, contentType: 'text/plain' })
      const read = await readAll(await store.get(key))
      await store.delete(key)
      if (!read.equals(body)) throw new Error('read back something else than was written')
      return config.storage.driver === 'minio' ? `${config.minio.endPoint}:${config.minio.port}/${config.minio.bucket}` : config.storage.localRoot
    }),
    check(`mail (${config.mail.driver})`, async () => {
      await withTimeout(getMailer().verify(), 15_000, 'SMTP')
      return config.mail.driver === 'smtp' ? `${config.mail.smtp.host}:${config.mail.smtp.port}` : 'written to the log'
    }),
    ...(config.logs.dir
      ? [
          check('log files', async () => {
            await mkdir(config.logs.dir!, { recursive: true })
            const probe = join(config.logs.dir!, `.preflight-${randomBytes(4).toString('hex')}`)
            await writeFile(probe, '')
            await rm(probe)
            return config.logs.dir!
          }),
        ]
      : []),
  ])
}

/** logs every result; throws when one failed */
export async function assertPreflight(): Promise<void> {
  const results = await runPreflight()
  for (const r of results)
    (r.ok ? logger.info.bind(logger) : logger.error.bind(logger))(`[preflight] ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.detail}`)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) throw new Error(`Start-up checks failed: ${failed.map((r) => r.name).join(', ')}`)
}
