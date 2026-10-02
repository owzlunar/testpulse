import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, inject } from 'vitest'

const emptyCollections = async () => {
  const collections = await mongoose.connection.db!.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
}

/**
 * Connects this test file to the test database and empties every collection after each test.
 * Shared database (TEST_MONGODB_URI): used as given, also emptied first (files run one at a time).
 * In-memory server: a database of this file's own, dropped at the end.
 */
export function useTestDatabase(): void {
  const shared = inject('sharedDatabase')
  beforeAll(async () => {
    const uri = new URL(inject('mongoUri'))
    if (!shared) uri.pathname = `/test_${randomBytes(4).toString('hex')}`
    await mongoose.connect(uri.toString(), { autoIndex: true })
    if (shared) await emptyCollections()
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()))
  })
  afterEach(emptyCollections)
  afterAll(async () => {
    if (shared) await emptyCollections()
    else await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })
}
