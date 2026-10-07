import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { type Db, MongoClient } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compareDatabases } from '../verify-db.js'

// Two databases on a server of this file's own (the shared test login may not create databases).
let server: MongoMemoryServer
let client: MongoClient
let live: Db
let restored: Db

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.0.4' } })
  client = await MongoClient.connect(server.getUri())
})
afterAll(async () => {
  await client.close()
  await server.stop()
})
beforeEach(async () => {
  live = client.db(`live_${Date.now()}`)
  restored = client.db(`restored_${Date.now()}`)
})

/** collections with string ids, like the app's */
const coll = (db: Db, name: string) => db.collection<{ _id: string } & Record<string, unknown>>(name)
const lineOf = (lines: string[], name: string) => lines.find((l) => l.slice(6).startsWith(name.padEnd(24)))

describe('compareDatabases (the Node twin of scripts/verify-db.js)', () => {
  it('passes a restored copy of live and writes the files it points at', async () => {
    const docs = [
      { _id: 'p1', name: 'A' },
      { _id: 'p2', name: 'B' },
    ]
    await coll(live, 'projects').insertMany(docs)
    await coll(restored, 'projects').insertMany(docs)
    await coll(live, 'files').insertOne({ _id: 'f1', key: 'avatar/f1.png', size: 10 })
    await coll(restored, 'files').insertOne({ _id: 'f1', key: 'avatar/f1.png', size: 10 })
    const keys = join(mkdtempSync(join(tmpdir(), 'verify-')), 'keys.tsv')

    const result = await compareDatabases(live, restored, 500, keys)

    expect(result.fails).toBe(0)
    expect(result.warns).toBe(0)
    expect(lineOf(result.lines, 'projects')).toBe(
      `ok    ${'projects'.padEnd(24)} live 2 / restored 2; 2 compared: 2 same, 0 changed since, 0 not in live`,
    )
    expect(result.lines.at(-1)).toBe('collections: 2, FAIL 0, WARN 0')
    expect(readFileSync(keys, 'utf8')).toBe('avatar/f1.png\t10\n')
  })

  it('warns about changes after the backup and fails what a backup can not explain', async () => {
    await coll(live, 'projects').insertMany([
      { _id: 'p1', name: 'A (edited)' },
      { _id: 'p2', name: 'B' },
      { _id: 'p3', name: 'new' },
    ])
    await coll(restored, 'projects').insertMany([
      { _id: 'p1', name: 'A' },
      { _id: 'p2', name: 'B' },
    ])
    await coll(live, 'users').insertOne({ _id: 'u1' })
    await coll(restored, 'users').insertOne({ _id: 'other' })
    await coll(live, 'teams').insertOne({ _id: 't1' })
    await coll(restored, 'leftover').insertOne({ _id: 'x' })
    await coll(live, 'notifications').insertOne({ _id: 'n1' })
    await coll(restored, 'notifications').insertOne({ _id: 'n2' })

    const result = await compareDatabases(live, restored, 500)

    expect(lineOf(result.lines, 'projects')).toMatch(/^WARN .*1 changed since.*changes after the backup\?$/)
    expect(lineOf(result.lines, 'users')).toMatch(/^FAIL .*nothing matches live/)
    expect(lineOf(result.lines, 'teams')).toMatch(/^FAIL .*missing in the restored database/)
    expect(lineOf(result.lines, 'leftover')).toMatch(/^WARN .*only in the restored database/)
    expect(lineOf(result.lines, 'notifications')).toMatch(/^ok .*written all the time: not compared/)
    expect(result).toMatchObject({ fails: 2, warns: 2 })
  })

  it('fails a collection that came back empty or with other indexes', async () => {
    await coll(live, 'test_cases').insertOne({ _id: 'c1' })
    await restored.createCollection('test_cases')
    await coll(live, 'runs').createIndex({ projectId: 1 })
    await restored.createCollection('runs')

    const result = await compareDatabases(live, restored, 500)

    expect(lineOf(result.lines, 'test_cases')).toMatch(/^FAIL .*came back empty$/)
    expect(lineOf(result.lines, 'runs')).toMatch(/^FAIL .*indexes differ \(live: _id_,projectId_1 \| restored: _id_\)$/)
  })
})
