import mongoose, { Schema } from 'mongoose'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { setAuditSink, type AuditEvent } from '../../audit/audit-sink.js'
import { blindIndex } from '../../crypto/blind-index.js'
import { encryption } from '../../crypto/encryption.js'
import { BaseRepository } from '../base.repository.js'
import { stringId } from '../ids.js'
import { auditTrailPlugin } from '../plugins/audit-trail.js'
import { fieldEncryptionPlugin } from '../plugins/field-encryption.js'
import { toJSONPlugin } from '../plugins/to-json.js'

interface Person {
  _id: string
  name: string
  email: string
  secretNote?: string
}

const schema = new Schema<Person>(
  {
    _id: stringId('p'),
    name: { type: String, required: true },
    email: { type: String, required: true, encrypted: true, blindIndex: 'people.email' },
    secretNote: { type: String, private: true },
  },
  { timestamps: true },
)
schema.plugin(fieldEncryptionPlugin)
schema.plugin(auditTrailPlugin, { targetType: 'PERSON', title: (d: Record<string, unknown>) => String(d.name) })
schema.plugin(toJSONPlugin)
const People = mongoose.model<Person>('PluginPerson', schema)
const repo = new BaseRepository<Person, Person & { id: string }>(People)

useTestDatabase()

const events: AuditEvent[] = []
beforeEach(() => setAuditSink({ record: async (e) => void events.push(e) }))
afterEach(() => {
  events.length = 0
  setAuditSink(null)
})

const raw = (id: string) => mongoose.connection.db!.collection('pluginpeople').findOne({ _id: id as never })

describe('field encryption + blind index', () => {
  it('stores ciphertext, returns plain text, and finds by blind index', async () => {
    const created = await repo.create({ name: 'Somchai', email: 'Somchai@Example.com' })
    expect(created.email).toBe('Somchai@Example.com')

    const stored = await raw(created.id)
    expect(encryption.isEncrypted(stored?.email)).toBe(true)
    expect(stored?.email_bidx).toBe(blindIndex('somchai@example.com', 'people.email'))

    const found = await repo.findOne({ email_bidx: blindIndex(' SOMCHAI@example.com ', 'people.email') } as never)
    expect(found?.id).toBe(created.id)
  })

  it('encrypts values set through findOneAndUpdate and keeps the index in step', async () => {
    const created = await repo.create({ name: 'A', email: 'a@x.dev' })
    const updated = await repo.updateById(created.id, { email: 'b@x.dev' })
    expect(updated?.email).toBe('b@x.dev')
    const stored = await raw(created.id)
    expect(encryption.decrypt(stored!.email)).toBe('b@x.dev')
    expect(stored?.email_bidx).toBe(blindIndex('b@x.dev', 'people.email'))
  })
})

describe('toJSON', () => {
  it('gives id instead of _id and hides private fields and blind indexes', async () => {
    const created = await repo.create({ name: 'A', email: 'a@x.dev', secretNote: 'hidden' })
    expect(created).toMatchObject({ id: expect.stringMatching(/^p-/), name: 'A' })
    expect(created).not.toHaveProperty('_id')
    expect(created).not.toHaveProperty('secretNote')
    expect(created).not.toHaveProperty('email_bidx')
    expect(created).not.toHaveProperty('__v')
  })
})

describe('audit trail', () => {
  it('records create, update (changed fields only, encrypted values masked) and delete', async () => {
    const created = await repo.create({ name: 'A', email: 'a@x.dev' })
    await repo.updateById(created.id, { name: 'B', email: 'b@x.dev' })
    await repo.updateById(created.id, { name: 'B' }) // nothing changed: no entry
    await repo.deleteById(created.id)

    expect(events.map((e) => e.action)).toEqual(['CREATE', 'UPDATE', 'DELETE'])
    expect(events[0]).toMatchObject({ targetType: 'PERSON', targetId: created.id, targetTitle: 'A' })
    expect(events[1]!.changes).toEqual([
      { field: 'name', oldValue: 'A', newValue: 'B' },
      { field: 'email', oldValue: '********', newValue: '********' },
    ])
    expect(events[2]).toMatchObject({ action: 'DELETE', targetTitle: 'B' })
  })

  it('records an update made through doc.save()', async () => {
    const created = await repo.create({ name: 'A', email: 'a@x.dev' })
    const doc = await People.findById(created.id)
    doc!.set('name', 'C')
    await doc!.save()
    expect(events.at(-1)).toMatchObject({ action: 'UPDATE', changes: [{ field: 'name', oldValue: 'A', newValue: 'C' }] })
  })
})

describe('pagination', () => {
  it('clamps the page size and ignores sort fields outside the whitelist', async () => {
    for (let i = 0; i < 5; i++) await repo.create({ name: `N${i}`, email: `${i}@x.dev` })
    const page = await repo.paginate({}, { page: 2, limit: 2, sort: 'email:asc' })
    expect(page).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 })
    expect(page.items).toHaveLength(2)
  })
})
