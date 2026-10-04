import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useTestDatabase } from '../../../tests/helpers/database.js'
import { setMailer, type Mailer } from '../mail/mailer.js'
import { runPreflight } from '../preflight.js'
import { setStorage } from '../storage/index.js'
import { LocalStorageAdapter } from '../storage/local.adapter.js'

useTestDatabase()

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tp-preflight-'))
})
afterAll(() => rm(dir, { recursive: true, force: true }))
afterEach(() => {
  setStorage(null)
  setMailer(null)
  vi.restoreAllMocks()
})

const byName = async () => Object.fromEntries((await runPreflight()).map((r) => [r.name.split(' ')[0], r]))

describe('preflight', () => {
  it('passes when the database, storage and mail work', async () => {
    setStorage(new LocalStorageAdapter(join(dir, 'ok')))
    const results = await runPreflight()
    expect(results.every((r) => r.ok)).toBe(true)
    expect(results.map((r) => r.name)).toEqual(['database', 'storage (local)', 'mail (log)'])
  })

  it('fails when the mail server does not answer', async () => {
    setStorage(new LocalStorageAdapter(join(dir, 'ok')))
    setMailer({ send: async () => undefined, verify: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:1')) } satisfies Mailer)
    const { mail } = await byName()
    expect(mail).toMatchObject({ ok: false, detail: expect.stringContaining('ECONNREFUSED') })
  })

  it('fails when files cannot be written', async () => {
    const locked = join(dir, 'locked')
    const store = new LocalStorageAdapter(locked)
    await store.init()
    await chmod(locked, 0o500)
    setStorage(store)
    const { storage } = await byName()
    await chmod(locked, 0o700)
    expect(storage!.ok).toBe(false)
  })

  it('fails when the database login may not write (indexes and migrations would fail next)', async () => {
    setStorage(new LocalStorageAdapter(join(dir, 'ok')))
    const db = mongoose.connection.db!
    const real = db.collection.bind(db)
    vi.spyOn(db, 'collection').mockImplementation(((name: string) => {
      const collection = real(name)
      if (name === 'preflight')
        vi.spyOn(collection, 'insertOne').mockRejectedValue(new Error('not authorized on testpulse to execute command insert'))
      return collection
    }) as typeof db.collection)
    const { database } = await byName()
    expect(database).toMatchObject({ ok: false, detail: expect.stringContaining('cannot write (the MongoDB user needs readWrite') })
  })
})
