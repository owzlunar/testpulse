import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, inject } from 'vitest'

/** connects this test file to its own database; every collection is emptied after each test */
export function useTestDatabase(): void {
  beforeAll(async () => {
    const uri = new URL(inject('mongoUri'))
    uri.pathname = `/test_${randomBytes(4).toString('hex')}`
    await mongoose.connect(uri.toString(), { autoIndex: true })
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()))
  })
  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections()
    await Promise.all(collections.map((c) => c.deleteMany({})))
  })
  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })
}
